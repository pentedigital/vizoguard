const { Router } = require("express");
const { db, stmts } = require("../db");
const outline = require("../outline");
const { vpnKeysCreatedTotal } = require('../metrics');

const router = Router();
const INSTANCE = process.env.NODE_APP_INSTANCE || '0';
const KEY_REGEX = /^VIZO-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;
const DEVICE_ID_REGEX = /^[a-zA-Z0-9\-]{16,64}$/;

const DATA_LIMIT_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB

// vpnStatus cache (10s TTL)
let vpnStatusCache = null;
let vpnStatusCacheTime = 0;
const VPN_STATUS_TTL = 10000;

// bestNode cache (30s TTL)
let bestNodeCache = null;
let bestNodeCacheTime = 0;
const BEST_NODE_TTL = 30000;

// Get the API URL for a license's assigned node, or pick the best node
function getNodeApiUrl(license) {
  if (license.vpn_node_id) {
    const node = stmts.findNodeById.get(license.vpn_node_id);
    if (node && node.status === "active") return { apiUrl: node.api_url, nodeId: node.id };
  }
  // Pick least-loaded active node (cached for 30s)
  const now = Date.now();
  if (bestNodeCache && (now - bestNodeCacheTime) < BEST_NODE_TTL) {
    return { apiUrl: bestNodeCache.api_url, nodeId: bestNodeCache.id };
  }
  const best = stmts.bestNode.get();
  if (best) {
    bestNodeCache = best;
    bestNodeCacheTime = now;
    return { apiUrl: best.api_url, nodeId: best.id };
  }
  // Fallback to default (env var)
  console.warn(`[i${INSTANCE}] VPN: no active nodes, falling back to DEFAULT_API_URL`);
  return { apiUrl: null, nodeId: null };
}

// Middleware: validate license has VPN access
function requireVpnLicense(req, res, next) {
  try {
    const { key } = req.body;
    if (!key || typeof key !== "string" || key.length > 24) return res.status(400).json({ error: "Missing or invalid license key" });
    if (!KEY_REGEX.test(key)) return res.status(400).json({ error: "Invalid key format" });

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
  } catch (err) {
    console.error(`[i${INSTANCE}] VPN middleware error:`, err.stack || err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// POST /api/vpn/create — create or return existing Outline access key
router.post("/create", requireVpnLicense, async (req, res) => {
  const { license } = req;

  // Clean up stale pending claims from crashed processes
  stmts.resetStalePending.run();

  // Device verification — same check as /vpn/get (#11)
  const { device_id } = req.body;
  if (license.device_id && (!device_id || device_id !== license.device_id)) {
    return res.status(403).json({ error: "Device mismatch" });
  }

  // Re-fetch license for fresh status — prevents TOCTOU race with concurrent webhooks (#15)
  const freshLicense = stmts.findByKey.get(req.body.key);
  if (!freshLicense || (freshLicense.status !== "active" && freshLicense.status !== "cancelled")) {
    return res.status(403).json({ error: "License is " + (freshLicense?.status || "not found") });
  }

  // Only active licenses can create new keys (#13)
  if (freshLicense.status !== "active") {
    return res.status(403).json({ error: "Only active licenses can create VPN keys" });
  }

  // Idempotent: return existing key if already provisioned
  if (freshLicense.outline_access_key && freshLicense.outline_access_key !== 'pending') {
    return res.json({ access_url: freshLicense.outline_access_key });
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

  let result, apiUrl, nodeId;
  try {
    ({ apiUrl, nodeId } = getNodeApiUrl(license));
    result = await outline.createAccessKey(license.email, apiUrl);

    try {
      stmts.setOutlineKey.run(result.accessUrl, result.id, license.id);
      outline.setDataLimit(result.id, DATA_LIMIT_BYTES, apiUrl).catch(err => {
        console.error(`[i${INSTANCE}] Failed to set data limit for key ${result.id}:`, err.message);
      });
      if (nodeId) {
        stmts.setLicenseNode.run(nodeId, license.id);
        // Invalidate bestNode cache since node load changed
        bestNodeCache = null;
        bestNodeCacheTime = 0;
      }
    } catch (dbErr) {
      // Compensate: revoke the key we just created to avoid orphan (#4)
      await outline.deleteAccessKey(result.id, apiUrl).catch(() => {});
      result = undefined; // prevent outer catch from double-deleting
      throw dbErr;
    }

    console.log(`[i${INSTANCE}] VPN key created via API: licenseId=${license.id} nodeId=${nodeId || 'default'}`);
    res.json({ access_url: result.accessUrl });
    vpnKeysCreatedTotal.inc({ plan: license.plan });
  } catch (err) {
    // Clean up orphaned Outline key if one was created
    if (typeof result !== 'undefined' && result?.id) {
      await outline.deleteAccessKey(result.id, apiUrl).catch(() => {});
    }
    stmts.resetOutlineClaim.run(license.id);
    console.error(`[i${INSTANCE}] VPN create error:`, err.message);
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

  if (!license.outline_access_key || license.outline_access_key === 'pending') {
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
    try {
      await outline.deleteAccessKey(license.outline_key_id, apiUrl);
    } catch (delErr) {
      console.error(`[i${INSTANCE}] Outline delete failed:`, delErr.message);
    } finally {
      stmts.clearOutlineKey.run(license.id);
    }

    console.log(`[i${INSTANCE}] VPN key deleted via API: licenseId=${license.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[i${INSTANCE}] VPN delete error:`, err);
    res.status(500).json({ error: "Failed to delete VPN key" });
  }
});

// GET /api/vpn/status — public health check (no infrastructure details)
router.get("/status", async (_req, res) => {
  const now = Date.now();
  if (vpnStatusCache && (now - vpnStatusCacheTime) < VPN_STATUS_TTL) {
    return res.json(vpnStatusCache);
  }

  try {
    const nodes = stmts.listActiveNodes.all();
    let result;
    if (nodes.length === 0) {
      await outline.getServer();
      result = { status: "online" };
    } else {
      const results = await Promise.allSettled(
        nodes.map((n) => outline.getServer(n.api_url))
      );
      const onlineCount = results.filter((r) => r.status === "fulfilled").length;
      result = { status: onlineCount > 0 ? "online" : "offline" };
    }

    vpnStatusCache = result;
    vpnStatusCacheTime = Date.now();
    res.json(result);
  } catch {
    const result = { status: "offline" };
    vpnStatusCache = result;
    vpnStatusCacheTime = Date.now();
    res.json(result);
  }
});

module.exports = router;
