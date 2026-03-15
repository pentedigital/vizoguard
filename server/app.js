require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const webhookRouter = require("./routes/webhook");
const licenseRouter = require("./routes/license");
const vpnRouter = require("./routes/vpn");

const app = express();
const PORT = process.env.PORT || 3000;

// Trust nginx reverse proxy (needed for rate limiting with X-Forwarded-For)
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Stripe webhook MUST come before express.json() — needs raw body
app.use("/api/webhook", webhookRouter);

// Global middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [
    "https://vizoguard.com",
    "https://www.vizoguard.com",
  ],
}));
app.use(express.json({ limit: "16kb" }));

// Request logging (no secrets)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api/")) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    }
  });
  next();
});

// Rate limiting
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
  const priceMap = {
    vpn: process.env.STRIPE_PRICE_VPN,
    security_vpn: process.env.STRIPE_PRICE_SECURITY_VPN,
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
  } catch (err) {
    console.error("Checkout error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Catch-all: hide framework fingerprint
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Vizoguard API listening on 127.0.0.1:${PORT}`);
});
