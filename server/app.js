require("dotenv").config();

// Fail fast on missing critical env vars (#6)
const REQUIRED_ENV = ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_VPN','STRIPE_PRICE_SECURITY_VPN','OUTLINE_API_URL','APP_URL','SMTP_PASS'];
const LAUNCH_DISCOUNT_END = process.env.LAUNCH_DISCOUNT_END ? new Date(process.env.LAUNCH_DISCOUNT_END) : null;
for (const v of REQUIRED_ENV) { if (!process.env[v]) { console.error('FATAL: missing env var ' + v); process.exit(1); } }

// Warn if regular prices not configured and discount will expire
if (LAUNCH_DISCOUNT_END && !process.env.STRIPE_PRICE_VPN_REGULAR) {
  console.warn('WARNING: STRIPE_PRICE_VPN_REGULAR not set — will fall back to discount price after ' + LAUNCH_DISCOUNT_END.toISOString());
}
if (LAUNCH_DISCOUNT_END && !process.env.STRIPE_PRICE_SECURITY_VPN_REGULAR) {
  console.warn('WARNING: STRIPE_PRICE_SECURITY_VPN_REGULAR not set — will fall back to discount price after ' + LAUNCH_DISCOUNT_END.toISOString());
}

const express = require("express");
const { exec } = require("child_process");
const crypto = require("crypto");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { db, stmts } = require('./db');
const outline = require("./outline");
const webhookRouter = require("./routes/webhook");
const licenseRouter = require("./routes/license");
const vpnRouter = require("./routes/vpn");

const { register, metricsMiddleware, stripeCheckoutTotal } = require('./metrics');

const app = express();
const PORT = process.env.PORT || 3000;
const INSTANCE = process.env.NODE_APP_INSTANCE || '0';

// Cached disk usage (updated every 60s, non-blocking)
let cachedDiskOk = true;
function updateDiskUsage() {
  exec("df --output=pcent / | tail -1", (err, stdout) => {
    if (err) return;
    const usedPct = parseInt(stdout.trim());
    cachedDiskOk = isNaN(usedPct) || usedPct <= 90;
  });
}
updateDiskUsage();
const diskCheckInterval = setInterval(updateDiskUsage, 60000);
diskCheckInterval.unref();

// Revoke Outline keys for expired licenses (runs hourly, instance 0 only)
async function cleanupExpiredKeys() {
  if (INSTANCE !== '0') return; // Only one worker runs cleanup
  try {
    const expired = stmts.findExpiredWithKeys.all();
    for (const lic of expired) {
      try {
        let apiUrl = null;
        if (lic.vpn_node_id) {
          const node = stmts.findNodeById.get(lic.vpn_node_id);
          if (node && node.status === 'active') apiUrl = node.api_url;
        }
        await outline.deleteAccessKey(lic.outline_key_id, apiUrl);
        stmts.clearOutlineKey.run(lic.id);
        stmts.insertAudit.run('expired_key_cleanup', 'license', String(lic.id), `outline_key=${lic.outline_key_id}`, 'system');
        console.log(`[i${INSTANCE}] Cleanup: revoked expired Outline key ${lic.outline_key_id} for licenseId=${lic.id}`);
      } catch (err) {
        console.error(`[i${INSTANCE}] Cleanup: failed to revoke key for licenseId=${lic.id}:`, err.message);
      }
    }
    if (expired.length > 0) console.log(`[i${INSTANCE}] Cleanup: processed ${expired.length} expired license(s)`);
  } catch (err) {
    console.error(`[i${INSTANCE}] Cleanup error:`, err.message);
  }
}
const cleanupInterval = setInterval(cleanupExpiredKeys, 3600000); // Every hour
cleanupInterval.unref();
setTimeout(cleanupExpiredKeys, 30000); // First run 30s after startup

// Retry failed email sends (runs every 5min, instance 0 only)
async function processEmailRetryQueue() {
  if (INSTANCE !== '0') return;
  const { sendLicenseEmail } = require('./email');
  const { emailSendsTotal } = require('./metrics');
  try {
    const pending = stmts.pendingEmailRetries.all();
    for (const item of pending) {
      try {
        await sendLicenseEmail(item.email, item.license_key, item.plan, item.access_url);
        stmts.deleteEmailRetry.run(item.id);
        emailSendsTotal.inc({ result: 'success' });
        stmts.insertAudit.run('email_retry_success', 'email_retry', String(item.id), `attempts=${item.attempts + 1}`, 'system');
        console.log(`[i${INSTANCE}] Email retry succeeded for id=${item.id}`);
      } catch (err) {
        const backoffMinutes = [15, 60][item.attempts] || 60;
        stmts.updateEmailRetry.run(err.message, String(backoffMinutes), item.id);
        console.error(`[i${INSTANCE}] Email retry #${item.attempts + 1} failed for id=${item.id}:`, err.message);
        if (item.attempts + 1 >= 3) {
          stmts.insertAudit.run('email_retry_exhausted', 'email_retry', String(item.id), `email=${item.email.replace(/^.+@/, '***@')}`, 'system');
        }
      }
    }
  } catch (err) {
    console.error(`[i${INSTANCE}] Email retry queue error:`, err.message);
  }
}
const emailRetryInterval = setInterval(processEmailRetryQueue, 300000);
emailRetryInterval.unref();
setTimeout(processEmailRetryQueue, 60000);

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

// Request ID for correlation
app.use((req, res, next) => {
  req.id = crypto.randomUUID().slice(0, 8);
  next();
});

// Request logging (no secrets)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api/")) {
      console.log(`[i${INSTANCE}] [${req.id}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms ip=${req.ip}`);
    }
  });
  next();
});

// Rate limiting — NOTE: in-memory store means each PM2 cluster instance has its own counter.
// Effective limits are max * instance_count. Use nginx limit_req_zone for strict enforcement.
//
// OPTIONAL REDIS BACKEND:
// For strict cluster-wide rate limiting, set REDIS_URL env variable:
//   REDIS_URL=redis://localhost:6379 node app.js
//
// The Redis store provides:
// - Shared counters across all PM2 instances
// - Persistence across restarts
// - Configurable TTL for rate limit windows

let RedisStore;
try {
  if (process.env.REDIS_URL) {
    const { Redis } = require('ioredis');
    const RedisStoreModule = require('rate-limit-redis');
    RedisStore = RedisStoreModule.default || RedisStoreModule;
    console.log(`[i${INSTANCE}] Using Redis-backed rate limiting: ${process.env.REDIS_URL}`);
  }
} catch (err) {
  console.warn(`[i${INSTANCE}] Redis modules not available, using memory store. Install: npm i ioredis rate-limit-redis`);
}

function createRateLimiter(windowMs, max, name) {
  const config = { windowMs, max, standardHeaders: true, legacyHeaders: false };
  
  // Use Redis store if available for cluster-wide rate limiting
  if (RedisStore && process.env.REDIS_URL) {
    try {
      const { Redis } = require('ioredis');
      config.store = new RedisStore({
        sendCommand: (...args) => new Redis(process.env.REDIS_URL).call(...args),
        prefix: `rl:${name}:`,
      });
      console.log(`[i${INSTANCE}] Rate limiter '${name}' using Redis store (max=${max}, window=${windowMs}ms)`);
    } catch (err) {
      console.error(`[i${INSTANCE}] Failed to create Redis store for '${name}', falling back to memory:`, err.message);
    }
  }
  
  return rateLimit(config);
}

const apiLimiter = createRateLimiter(60 * 1000, 30, 'api');
const checkoutLimiter = createRateLimiter(60 * 1000, 5, 'checkout');
const licenseLimiter = createRateLimiter(60 * 1000, 10, 'license');

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
    console.error(`[i${INSTANCE}] Checkout error:`, err.stack || err);
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

// Health check with DB + VPN node verification
app.get("/api/health", async (_req, res) => {
  try {
    db.prepare("SELECT 1").get();
  } catch (err) {
    console.error(`[i${INSTANCE}] Health check DB failure:`, err.stack || err);
    return res.status(503).json({ status: "error", reason: "db_unavailable" });
  }
  // Check VPN availability (best-effort, non-blocking)
  let vpnStatus = "unknown";
  try {
    await outline.getServer();
    vpnStatus = "online";
  } catch {
    vpnStatus = "offline";
  }
  // Check disk space (cached, updated every 60s)
  const diskOk = cachedDiskOk;
  const overallStatus = vpnStatus === "online" && diskOk ? "ok" : "degraded";
  const httpCode = overallStatus === "ok" ? 200 : 503;
  res.status(httpCode).json({ status: overallStatus, vpn: vpnStatus, disk: diskOk ? "ok" : "low", timestamp: new Date().toISOString() });
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
