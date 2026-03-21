const { Router } = require("express");
const { db, stmts } = require("../db");
const outline = require("../outline");
const { vpnKeysCreatedTotal } = require('../metrics');

const router = Router();
const INSTANCE = process.env.NODE_APP_INSTANCE || '0';

const DATA_LIMIT_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB

// Get the API URL for a license's assigned node, or pick the best node
function getNodeApiUrl(license) {
  if (license.vpn_node_id) {
    const node = stmts.findNodeById.get(license.vpn_node_id);
    if (node && node.status === "active") return { apiUrl: node.api_url, nodeId: node.id };
  }
  // Pick least-loaded active node
  const best = stmts.bestNode.get();
  if (best) return { apiUrl: best.api_url, nodeId: best.id };
  // Fallback to default (env var)
  console.warn(`[i${INSTANCE}] VPN: no active nodes, falling back to DEFAULT_API_URL`);
  return { apiUrl: null, nodeId: null };
}

// Middleware: validate license has VPN access
function requireVpnLicense(req, res, next) {
  const { key } = req.body;
  if (!key || typeof key !== "string" || key.length > 24) return res.status(400).json({ error: "Missing or invalid license key" });

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

    // Device verification — same check as /vpn/get (#11)
    const { device_id } = req.body;
    if (license.device_id && (!device_id || device_id !== license.device_id)) {
      return res.status(403).json({ error: "Device mismatch" });
    }

    // Only active licenses can create new keys (#13)
    if (license.status !== "active") {
      return res.status(403).json({ error: "Only active licenses can create VPN keys" });
    }

    // Idempotent: return existing key if already provisioned
    if (license.outline_access_key && license.outline_access_key !== 'pending') {
      return res.json({ access_url: license.outline_access_key });
    }

    // Atomic CAS to prevent race condition — only one request wins (#2)
    const claim = stmts.claimOutlineSlot.run(license.id);
    if (claim.changes === 0) {
      const updated = stmts.findByKey.get(req.body.key);
      if (updated && updated.outline_access_key && updated.outline_access_key !== 'pending') {
        return res.json({ access_url: updated.outline_access_key });
      }
      return res.status(409).json({ error: "VPN key provisioning in progress" });
    }

    const { apiUrl, nodeId } = getNodeApiUrl(license);
    const result = await outline.createAccessKey(license.email, apiUrl);
    await outline.setDataLimit(result.id, DATA_LIMIT_BYTES, apiUrl);

    try {
      stmts.setOutlineKey.run(result.accessUrl, result.id, license.id);
      if (nodeId) stmts.setLicenseNode.run(nodeId, license.id);
    } catch (dbErr) {
      // Compensate: revoke the key we just created to avoid orphan (#4)
      await outline.deleteAccessKey(result.id, apiUrl).catch(() => {});
      throw dbErr;
    }

    console.log(`[i${INSTANCE}] VPN key created via API: licenseId=${license.id} nodeId=${nodeId || 'default'}`);
    res.json({ access_url: result.accessUrl });
    vpnKeysCreatedTotal.inc({ plan: license.plan });
  } catch (err) {
    // Roll back CAS sentinel so user can retry (C1 fix)
    stmts.resetOutlineClaim.run(license.id);
    console.error(`[i${INSTANCE}] VPN create error:`, err);
    res.status(500).json({ error: "Failed to create VPN access key" });
  }
});

// POST /api/vpn/get — retrieve existing access key (requires device binding)
router.post("/get", requireVpnLicense, (req, res) => {
  const { license } = req;
  const { device_id } = req.body;

  // Require device_id verification before returning VPN credentials
  if (license.device_id && (!device_id || device_id !== license.device_id)) {
    return res.status(403).json({ error: "Device mismatch" });
  }

  if (!license.outline_access_key) {
    return res.status(404).json({ error: "No VPN key provisioned. Call /api/vpn/create first." });
  }
  res.json({ access_url: license.outline_access_key });
});

// POST /api/vpn/delete — revoke access key
router.post("/delete", requireVpnLicense, async (req, res) => {
  try {
    const { license } = req;

    // Only active licenses can delete keys (#13)
    if (license.status !== "active") {
      return res.status(403).json({ error: "Only active licenses can delete VPN keys" });
    }

    if (!license.outline_key_id) {
      return res.status(404).json({ error: "No VPN key to delete" });
    }

    const { apiUrl } = getNodeApiUrl(license);
    await outline.deleteAccessKey(license.outline_key_id, apiUrl);
    stmts.clearOutlineKey.run(license.id);

    console.log(`[i${INSTANCE}] VPN key deleted via API: licenseId=${license.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[i${INSTANCE}] VPN delete error:`, err);
    res.status(500).json({ error: "Failed to delete VPN key" });
  }
});

// GET /api/vpn/status — public health check (no infrastructure details)
router.get("/status", async (_req, res) => {
  try {
    const nodes = stmts.listActiveNodes.all();
    if (nodes.length === 0) {
      await outline.getServer();
      return res.json({ status: "online" });
    }

    const results = await Promise.allSettled(
      nodes.map((n) => outline.getServer(n.api_url))
    );

    const onlineCount = results.filter((r) => r.status === "fulfilled").length;
    res.json({ status: onlineCount > 0 ? "online" : "offline" });
  } catch {
    res.json({ status: "offline" });
  }
});

module.exports = router;
