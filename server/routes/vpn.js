const { Router } = require("express");
const { stmts } = require("../db");
const outline = require("../outline");

const router = Router();

// Middleware: validate license has VPN access
function requireVpnLicense(req, res, next) {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: "Missing license key" });

  const license = stmts.findByKey.get(key);
  if (!license) return res.status(404).json({ error: "License not found" });

  if (license.status !== "active" && license.status !== "cancelled") {
    return res.status(403).json({ error: "License is " + license.status });
  }

  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return res.status(403).json({ error: "License expired" });
  }

  if (license.plan !== "vpn" && license.plan !== "security_vpn") {
    return res.status(403).json({ error: "Your plan does not include VPN access" });
  }

  // 1-device enforcement for Pro (security_vpn) plan:
  // Pro users must activate the desktop app first, which binds their device_id.
  // The VPN key is only issued to a license that already has a bound device,
  // ensuring 1 license = 1 device = 1 VPN key.
  // Basic (vpn) plan skips this check since Basic users don't have the desktop app.
  if (license.plan === "security_vpn" && !license.device_id) {
    return res.status(403).json({
      error: "Please activate your desktop app first to bind your device before using VPN",
    });
  }

  req.license = license;
  next();
}

// POST /api/vpn/create — create or return existing Outline access key
router.post("/create", requireVpnLicense, async (req, res) => {
  try {
    const { license } = req;

    // Idempotent: return existing key if already provisioned
    if (license.outline_access_key) {
      return res.json({ access_url: license.outline_access_key });
    }

    const result = await outline.createAccessKey(license.email);

    // Set a 100 GB/month data transfer limit to prevent abuse if the ss:// URL
    // is shared. The primary 1-device enforcement is that each license binds to
    // one device and only one Outline key is created per license. The data cap
    // is a secondary safeguard.
    const DATA_LIMIT_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB
    await outline.setDataLimit(result.id, DATA_LIMIT_BYTES);

    stmts.setOutlineKey.run(result.accessUrl, result.id, license.id);

    res.json({ access_url: result.accessUrl });
  } catch (err) {
    console.error("VPN create error:", err);
    res.status(500).json({ error: "Failed to create VPN access key" });
  }
});

// POST /api/vpn/get — retrieve existing access key
router.post("/get", requireVpnLicense, (req, res) => {
  const { license } = req;
  if (!license.outline_access_key) {
    return res.status(404).json({ error: "No VPN key provisioned. Call /api/vpn/create first." });
  }
  res.json({ access_url: license.outline_access_key });
});

// POST /api/vpn/delete — revoke access key
router.post("/delete", requireVpnLicense, async (req, res) => {
  try {
    const { license } = req;
    if (!license.outline_key_id) {
      return res.status(404).json({ error: "No VPN key to delete" });
    }

    await outline.deleteAccessKey(license.outline_key_id);
    stmts.clearOutlineKey.run(license.id);

    res.json({ success: true });
  } catch (err) {
    console.error("VPN delete error:", err);
    res.status(500).json({ error: "Failed to delete VPN key" });
  }
});

// GET /api/vpn/status — public server status
router.get("/status", async (_req, res) => {
  try {
    const server = await outline.getServer();
    res.json({ status: "online", name: server.name, version: server.version });
  } catch {
    res.json({ status: "offline" });
  }
});

module.exports = router;
