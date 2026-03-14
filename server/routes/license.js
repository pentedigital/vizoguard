const { Router } = require("express");
const { stmts } = require("../db");

const router = Router();

// POST /api/license — validate + bind device
router.post("/", (req, res) => {
  const { key, device_id } = req.body;

  if (!key || !device_id) {
    return res.status(400).json({ valid: false, error: "Missing key or device_id" });
  }

  const license = stmts.findByKey.get(key);
  if (!license) {
    return res.status(404).json({ valid: false, error: "License not found" });
  }

  if (license.status === "expired") {
    return res.status(403).json({ valid: false, error: "License expired", status: "expired" });
  }

  if (license.status === "cancelled") {
    // Cancelled but still within paid period
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return res.status(403).json({ valid: false, error: "Subscription cancelled and expired", status: "expired" });
    }
  }

  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return res.status(403).json({ valid: false, error: "License expired", status: "expired" });
  }

  // Device binding
  if (!license.device_id) {
    // First activation — bind this device
    stmts.bindDevice.run(device_id, license.id);
  } else if (license.device_id !== device_id) {
    return res.status(403).json({
      valid: false,
      error: "License is bound to a different device. Contact support@vizoguard.com to transfer.",
      status: "device_mismatch",
    });
  }

  stmts.updateLastCheck.run(license.id);

  res.json({
    valid: true,
    status: license.status,
    expires: license.expires_at,
  });
});

// GET /api/license/lookup?session_id=xxx — for thank-you page
router.get("/lookup", async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) {
    return res.status(400).json({ error: "Missing session_id" });
  }

  try {
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (!session.subscription && !session.customer) {
      return res.json({ pending: true });
    }

    // Try finding by subscription first, then by customer
    let license = null;
    if (session.subscription) {
      license = stmts.findBySubscription.get(session.subscription);
    }
    if (!license && session.customer) {
      license = stmts.findByCustomer.get(session.customer);
    }

    if (!license) {
      return res.json({ pending: true });
    }

    res.json({
      key: license.key,
      email: license.email,
      expires: license.expires_at,
    });
  } catch (err) {
    console.error("License lookup error:", err.message);
    res.status(500).json({ error: "Lookup failed" });
  }
});

module.exports = router;
