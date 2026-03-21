require("dotenv").config();

// Fail fast on missing critical env vars (#6)
const REQUIRED_ENV = ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_VPN','STRIPE_PRICE_SECURITY_VPN','OUTLINE_API_URL','APP_URL'];
const LAUNCH_DISCOUNT_END = process.env.LAUNCH_DISCOUNT_END ? new Date(process.env.LAUNCH_DISCOUNT_END) : null;
for (const v of REQUIRED_ENV) { if (!process.env[v]) { console.error('FATAL: missing env var ' + v); process.exit(1); } }

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { db } = require('./db');
const webhookRouter = require("./routes/webhook");
const licenseRouter = require("./routes/license");
const vpnRouter = require("./routes/vpn");

const { register, metricsMiddleware, stripeCheckoutTotal } = require('./metrics');

const app = express();
const PORT = process.env.PORT || 3000;
const INSTANCE = process.env.NODE_APP_INSTANCE || '0';

// Trust nginx reverse proxy (needed for rate limiting with X-Forwarded-For)
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Stripe webhook MUST come before express.json() — needs raw body
app.use("/api/webhook", webhookRouter);

// Global middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    // Allow vizoguard.com origins + requests with no Origin header (Electron app, server-to-server)
    const allowed = ["https://vizoguard.com", "https://www.vizoguard.com"];
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
}));
app.use(express.json({ limit: "16kb" }));

app.use(metricsMiddleware);

// Request logging (no secrets)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api/")) {
      console.log(`[i${INSTANCE}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms ip=${req.ip}`);
    }
  });
  next();
});

// Rate limiting — NOTE: in-memory store means each PM2 cluster instance has its own counter.
// Effective limits are max * instance_count. Use nginx limit_req_zone for strict enforcement.
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const checkoutLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
const licenseLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// License API
app.use("/api/license", licenseLimiter, licenseRouter);

// VPN API
app.use("/api/vpn", apiLimiter, vpnRouter);

// Checkout session creation (server-side so we can set metadata.plan)
app.post("/api/checkout", checkoutLimiter, async (req, res) => {
  const plan = typeof req.body?.plan === "string" ? req.body.plan : null;

  // Use regular prices after launch discount expires
  const isDiscountActive = LAUNCH_DISCOUNT_END && Date.now() < LAUNCH_DISCOUNT_END.getTime();
  const priceMap = isDiscountActive ? {
    vpn: process.env.STRIPE_PRICE_VPN,
    security_vpn: process.env.STRIPE_PRICE_SECURITY_VPN,
  } : {
    vpn: process.env.STRIPE_PRICE_VPN_REGULAR || process.env.STRIPE_PRICE_VPN,
    security_vpn: process.env.STRIPE_PRICE_SECURITY_VPN_REGULAR || process.env.STRIPE_PRICE_SECURITY_VPN,
  };
  const priceId = priceMap[plan];
  if (!priceId) return res.status(400).json({ error: "Invalid plan" });

  try {
    const sessionOpts = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { plan },
      subscription_data: { metadata: { plan } },
      allow_promotion_codes: true,
      payment_method_collection: "if_required",
      success_url: `${process.env.APP_URL}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/#pricing`,
    };
    const session = await stripe.checkout.sessions.create(sessionOpts);
    res.json({ url: session.url });
    stripeCheckoutTotal.inc({ plan });
  } catch (err) {
    console.error("Checkout error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// Pricing info (frontend uses this to show/hide discount UI)
app.get("/api/pricing", (_req, res) => {
  const isDiscountActive = LAUNCH_DISCOUNT_END && Date.now() < LAUNCH_DISCOUNT_END.getTime();
  res.json({
    discount: isDiscountActive,
    discountEnd: LAUNCH_DISCOUNT_END ? LAUNCH_DISCOUNT_END.toISOString() : null,
    basic: { price: isDiscountActive ? 24.99 : 49.99, regular: 49.99 },
    pro: { price: isDiscountActive ? 99.99 : 149.99, regular: 149.99 },
  });
});

// Prometheus metrics endpoint (blocked externally by nginx)
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Health check with DB verification
app.get("/api/health", (_req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Health check DB failure:", err.message);
    res.status(503).json({ status: "error", reason: "db_unavailable" });
  }
});

// Catch-all: hide framework fingerprint
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

if (require.main === module) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Vizoguard API listening on 127.0.0.1:${PORT}`);
  });
}

module.exports = app;
