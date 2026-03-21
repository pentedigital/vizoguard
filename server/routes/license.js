const { Router } = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { stmts } = require("../db");
const { licenseValidationsTotal } = require('../metrics');

const router = Router();
const INSTANCE = process.env.NODE_APP_INSTANCE || '0';

// POST /api/license — validate + bind device
router.post("/", (req, res) => {
  const { key, device_id } = req.body;

  if (!key || !device_id || typeof key !== "string" || typeof device_id !== "string") {
    return res.status(400).json({ valid: false, error: "Missing key or device_id" });
  }
  if (key.length > 24 || device_id.length > 255) {
    return res.status(400).json({ valid: false, error: "Invalid input" });
  }
  if (!/^[a-zA-Z0-9\-]{16,64}$/.test(device_id)) {
    return res.status(400).json({ valid: false, error: "Invalid device_id format" });
  }

  if (!/^VIZO-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(key)) {
    return res.status(400).json({ valid: false, error: "Invalid key format" });
  }

  const license = stmts.findByKey.get(key);
  if (!license) {
    licenseValidationsTotal.inc({ result: 'invalid' });
    return res.status(404).json({ valid: false, error: "License not found" });
  }

  if (license.status === "expired") {
    licenseValidationsTotal.inc({ result: 'expired' });
    return res.status(403).json({ valid: false, error: "License expired", status: "expired" });
  }

  if (license.status === "suspended") {
    licenseValidationsTotal.inc({ result: 'suspended' });
    return res.status(403).json({ valid: false, error: "Payment failed — please update your payment method at vizoguard.com", status: "suspended" });
  }

  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    licenseValidationsTotal.inc({ result: 'expired' });
    return res.status(403).json({ valid: false, error: "License expired", status: "expired" });
  }

  // Device binding (atomic — WHERE device_id IS NULL prevents race conditions)
  if (!license.device_id) {
    const result = stmts.bindDevice.run(device_id, license.id);
    if (result.changes === 0) {
      const updated = stmts.findByKey.get(key);
      if (updated && updated.device_id !== device_id) {
        console.warn(`[i${INSTANCE}] Device mismatch: licenseId=${license.id}`);
        return res.status(403).json({
          valid: false,
          error: "License is bound to a different device. Contact support@vizoguard.com to transfer.",
          status: "device_mismatch",
        });
      }
    } else {
      console.log(`[i${INSTANCE}] Device bound: licenseId=${license.id} plan=${license.plan}`);
    }
  } else if (license.device_id !== device_id) {
    console.warn(`[i${INSTANCE}] Device mismatch: licenseId=${license.id}`);
    return res.status(403).json({
      valid: false,
      error: "License is bound to a different device. Contact support@vizoguard.com to transfer.",
      status: "device_mismatch",
    });
  }

  // Re-fetch for fresh state after potential concurrent webhook updates (#17)
  const fresh = stmts.findByKey.get(key);
  if (!fresh) return res.status(404).json({ valid: false, error: "License not found" });
  stmts.updateLastCheck.run(fresh.id);

  licenseValidationsTotal.inc({ result: 'valid' });
  res.json({
    valid: true,
    status: fresh.status,
    expires: fresh.expires_at,
  });
});

// GET /api/license/lookup?session_id=xxx — for thank-you page
router.get("/lookup", async (req, res) => {
  const { session_id } = req.query;
  if (!session_id || typeof session_id !== "string" || !session_id.startsWith("cs_") || session_id.length > 128) {
    return res.status(400).json({ error: "Missing or invalid session_id" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      return res.json({ pending: true });
    }

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

    if (!session.subscription) {
      console.warn(`Lookup: session ${session_id} has no subscription ID — using customer fallback`);
    }

    res.json({
      key: license.key,
      email: license.email,
      plan: license.plan,
      expires: license.expires_at,
    });
  } catch (err) {
    console.error("License lookup error:", err.message);
    res.status(500).json({ error: "Lookup failed" });
  }
});

module.exports = router;
