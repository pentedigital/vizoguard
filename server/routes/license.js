const { Router } = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { stmts } = require("../db");
const outline = require("../outline");
const { licenseValidationsTotal } = require('../metrics');

const router = Router();
const INSTANCE = process.env.NODE_APP_INSTANCE || '0';
const KEY_REGEX = /^VIZO-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;
const DEVICE_ID_REGEX = /^[a-zA-Z0-9\-]{16,64}$/;

// POST /api/license — validate + bind device
router.post("/", (req, res) => {
  try {
    const { key, device_id } = req.body;

    if (!key || !device_id || typeof key !== "string" || typeof device_id !== "string") {
      return res.status(400).json({ valid: false, error: "Missing key or device_id" });
    }
    if (key.length > 64 || device_id.length > 64) {
      return res.status(400).json({ valid: false, error: "Invalid input" });
    }
    if (!DEVICE_ID_REGEX.test(device_id)) {
      return res.status(400).json({ valid: false, error: "Invalid device_id format" });
    }

    if (!KEY_REGEX.test(key)) {
      return res.status(400).json({ valid: false, error: "Invalid key format" });
    }

    const license = stmts.findByKey.get(key);
    if (!license) {
      licenseValidationsTotal.inc({ result: 'invalid' });
      console.warn(`[i${INSTANCE}] Invalid key attempt from ip=${req.ip}`);
      return res.status(404).json({ valid: false, error: "License not found" });
    }

    if (license.status === "expired") {
      licenseValidationsTotal.inc({ result: 'expired' });
      console.warn(`[i${INSTANCE}] Expired license attempt: licenseId=${license.id} ip=${req.ip}`);
      return res.status(403).json({ valid: false, error: "License expired", status: "expired" });
    }

    if (license.status === "suspended") {
      licenseValidationsTotal.inc({ result: 'suspended' });
      console.warn(`[i${INSTANCE}] Suspended license attempt: licenseId=${license.id} ip=${req.ip}`);
      return res.status(403).json({ valid: false, error: "Payment failed — please update your payment method at vizoguard.com", status: "suspended" });
    }

    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      licenseValidationsTotal.inc({ result: 'expired' });
      console.warn(`[i${INSTANCE}] Expired license attempt: licenseId=${license.id} ip=${req.ip}`);
      return res.status(403).json({ valid: false, error: "License expired", status: "expired" });
    }

    // Device binding (atomic — WHERE device_id IS NULL prevents race conditions)
    if (!license.device_id) {
      const result = stmts.bindDevice.run(device_id, license.id);
      if (result.changes === 0) {
        const updated = stmts.findByKey.get(key);
        if (updated && updated.device_id !== device_id) {
          console.warn(`[i${INSTANCE}] Device mismatch: licenseId=${license.id} ip=${req.ip}`);
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

    // Re-validate status after re-fetch — webhook may have changed it during binding
    if (fresh.status === "expired" || fresh.status === "suspended") {
      licenseValidationsTotal.inc({ result: fresh.status });
      return res.status(403).json({ valid: false, error: `License ${fresh.status}`, status: fresh.status });
    }
    if (fresh.expires_at && new Date(fresh.expires_at) < new Date()) {
      licenseValidationsTotal.inc({ result: 'expired' });
      return res.status(403).json({ valid: false, error: "License expired", status: "expired" });
    }

    stmts.updateLastCheck.run(fresh.id);

    // Track device activity (platform from User-Agent)
    const ua = req.headers["user-agent"] || "";
    const platform = ua.includes("Electron") ? "desktop" : ua.includes("Android") ? "android" : "unknown";
    try { stmts.upsertDevice.run(device_id, fresh.id, platform, req.ip); } catch {}

    licenseValidationsTotal.inc({ result: 'valid' });
    res.json({
      valid: true,
      status: fresh.status,
      expires: fresh.expires_at,
    });
  } catch (err) {
    console.error(`[i${INSTANCE}] License validation error:`, err.stack || err);
    res.status(500).json({ valid: false, error: "Internal server error" });
  }
});

// GET /api/license/lookup?session_id=xxx — for thank-you page
router.get("/lookup", async (req, res) => {
  const { session_id } = req.query;
  if (!session_id || typeof session_id !== "string" || !session_id.startsWith("cs_") || session_id.length < 20 || session_id.length > 128) {
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
      console.warn(`[i${INSTANCE}] Lookup: session ${session_id} has no subscription ID — using customer fallback`);
    }

    // Mask sensitive data — full key is sent via email, not exposed here
    const maskedKey = license.key.slice(0, 5) + "****-****-****-" + license.key.slice(-4);
    const maskedEmail = license.email.replace(/^(.).+@/, '$1***@');
    res.json({
      key: maskedKey,
      email: maskedEmail,
      plan: license.plan,
      expires: license.expires_at,
    });
  } catch (err) {
    console.error(`[i${INSTANCE}] License lookup error:`, err.stack || err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

// POST /api/license/transfer — move license to a new device
router.post("/transfer", async (req, res) => {
  try {
    const { key, device_id, current_device_id } = req.body;

    if (!key || !device_id || !current_device_id || typeof key !== "string" || typeof device_id !== "string" || typeof current_device_id !== "string") {
      return res.status(400).json({ error: "Missing key, device_id, or current_device_id" });
    }
    if (!KEY_REGEX.test(key)) {
      return res.status(400).json({ error: "Invalid key format" });
    }
    if (!DEVICE_ID_REGEX.test(device_id)) {
      return res.status(400).json({ error: "Invalid device_id format" });
    }
    if (!DEVICE_ID_REGEX.test(current_device_id)) {
      return res.status(400).json({ error: "Invalid current_device_id format" });
    }

    const license = stmts.findByKey.get(key);
    if (!license) {
      return res.status(404).json({ error: "License not found" });
    }

    if (license.status !== "active") {
      return res.status(403).json({ error: "License is not active", status: license.status });
    }

    // Verify current device ownership — prevents unauthorized transfers
    if (!license.device_id || license.device_id !== current_device_id) {
      console.warn(`[i${INSTANCE}] Transfer denied: device mismatch licenseId=${license.id} ip=${req.ip}`);
      return res.status(403).json({ error: "Current device does not match license binding" });
    }

    // Transfer cooldown — 3 days between transfers to prevent license sharing
    const TRANSFER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
    if (license.last_transfer_at) {
      const elapsed = Date.now() - new Date(license.last_transfer_at).getTime();
      if (elapsed < TRANSFER_COOLDOWN_MS) {
        const hoursLeft = Math.ceil((TRANSFER_COOLDOWN_MS - elapsed) / 3600000);
        console.warn(`[i${INSTANCE}] Transfer denied: cooldown licenseId=${license.id} ip=${req.ip}`);
        return res.status(429).json({ error: `Transfer cooldown — try again in ${hoursLeft}h` });
      }
    }

    // Transfer device binding (atomic — WHERE status='active' prevents TOCTOU with webhooks)
    const oldDevice = license.device_id;
    const transferResult = stmts.transferDevice.run(device_id, license.id, key);
    if (transferResult.changes === 0) {
      // Status changed between findByKey and transferDevice (webhook race)
      return res.status(403).json({ error: "License is no longer active" });
    }

    // Delete Outline VPN key from server before clearing DB — prevents orphaned keys
    if (license.outline_key_id && license.outline_key_id !== 'pending') {
      try {
        let apiUrl = null;
        if (license.vpn_node_id) {
          const node = stmts.findNodeById.get(license.vpn_node_id);
          if (node && node.status === "active") apiUrl = node.api_url;
        }
        await outline.deleteAccessKey(license.outline_key_id, apiUrl);
        console.log(`[i${INSTANCE}] Transfer: Outline key ${license.outline_key_id} deleted for licenseId=${license.id}`);
      } catch (outlineErr) {
        console.error(`[i${INSTANCE}] Transfer: failed to delete Outline key ${license.outline_key_id} for licenseId=${license.id}:`, outlineErr.message);
        // Continue with transfer — DB clear still needed so new device gets a fresh key
      }
      stmts.clearOutlineKey.run(license.id);
    }

    stmts.setTransferTime.run(license.id);
    console.log(`[i${INSTANCE}] Device transferred: licenseId=${license.id} old=${oldDevice.slice(0, 8)}... new=${device_id.slice(0, 8)}...`);
    stmts.insertAudit.run("device_transfer", "license", String(license.id), `old=${oldDevice || 'none'}`, req.ip);

    res.json({ success: true, message: "License transferred to this device" });
  } catch (err) {
    console.error(`[i${INSTANCE}] Device transfer error:`, err.stack || err);
    res.status(500).json({ error: "Transfer failed" });
  }
});

module.exports = router;
