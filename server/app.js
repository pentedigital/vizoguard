require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const webhookRouter = require("./routes/webhook");
const licenseRouter = require("./routes/license");
const vpnRouter = require("./routes/vpn");

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.json());

// License API
app.use("/api/license", licenseRouter);

// VPN API
app.use("/api/vpn", vpnRouter);

// Checkout session creation (server-side so we can set metadata.plan)
app.post("/api/checkout", async (req, res) => {
  const plan = req.body?.plan;
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

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Vizoguard API listening on 127.0.0.1:${PORT}`);
});
