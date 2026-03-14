const { Router } = require("express");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const { stmts } = require("../db");

const execFileAsync = promisify(execFile);
const router = Router();

const SERVER_PUBLIC_KEY = fs.readFileSync("/etc/wireguard/server_public.key", "utf8").trim();
const SERVER_ENDPOINT = process.env.VPN_ENDPOINT || "187.77.129.43:51820";
const VPN_DNS = process.env.VPN_DNS || "1.1.1.1, 1.0.0.1";
const VPN_SUBNET = "10.66.66";
const MAX_PEERS_PER_LICENSE = 3;

// Generate WireGuard keys using wg command
async function generateKeys() {
  const { stdout: privateKey } = await execFileAsync("wg", ["genkey"]);
  const { stdout: publicKey } = await execFileAsync("wg", ["pubkey"], {
    input: privateKey.trim(),
  });
  // For pubkey via stdin, use spawn approach
  return { privateKey: privateKey.trim(), publicKey: publicKey.trim() };
}

// Generate keys properly (wg pubkey reads from stdin)
async function generateWgKeys() {
  const { stdout: privateKey } = await execFileAsync("wg", ["genkey"]);
  const privKey = privateKey.trim();

  // Generate public key from private
  const pubKeyResult = await new Promise((resolve, reject) => {
    const { execFile: ef } = require("child_process");
    const proc = ef("wg", ["pubkey"], (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
    proc.stdin.write(privKey);
    proc.stdin.end();
  });

  // Generate preshared key
  const { stdout: psk } = await execFileAsync("wg", ["genpsk"]);

  return { privateKey: privKey, publicKey: pubKeyResult, presharedKey: psk.trim() };
}

// Find next available IP in the subnet
function getNextIp() {
  const lastPeer = stmts.getMaxIp.get();
  if (!lastPeer) return `${VPN_SUBNET}.2`;

  const lastOctet = parseInt(lastPeer.assigned_ip.split(".")[3], 10);
  const next = lastOctet + 1;
  if (next > 254) throw new Error("VPN subnet exhausted");
  return `${VPN_SUBNET}.${next}`;
}

// Add peer to live WireGuard interface
async function addPeerToWg(publicKey, presharedKey, assignedIp) {
  // Write preshared key to temp file (wg set reads it from file)
  const pskPath = `/tmp/wg_psk_${Date.now()}`;
  fs.writeFileSync(pskPath, presharedKey + "\n", { mode: 0o600 });

  try {
    await execFileAsync("wg", [
      "set", "wg0",
      "peer", publicKey,
      "preshared-key", pskPath,
      "allowed-ips", `${assignedIp}/32`,
    ]);
  } finally {
    fs.unlinkSync(pskPath);
  }
}

// Remove peer from live WireGuard interface
async function removePeerFromWg(publicKey) {
  await execFileAsync("wg", ["set", "wg0", "peer", publicKey, "remove"]);
}

// Sync wg0.conf with current peers from DB
async function syncWgConfig() {
  // Save current runtime config to file
  await execFileAsync("bash", ["-c", "wg-quick save wg0"]);
}

// Middleware: validate license and check VPN access
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

  // Both plans include VPN
  if (license.plan !== "vpn" && license.plan !== "security_vpn") {
    return res.status(403).json({ error: "Your plan does not include VPN access" });
  }

  req.license = license;
  next();
}

// POST /api/vpn/create — generate a new VPN peer config
router.post("/create", requireVpnLicense, async (req, res) => {
  try {
    const { license } = req;
    const peerName = req.body.device_name || `device-${Date.now()}`;

    // Check peer limit
    const { cnt } = stmts.countActivePeers.get(license.id);
    if (cnt >= MAX_PEERS_PER_LICENSE) {
      return res.status(403).json({
        error: `Maximum ${MAX_PEERS_PER_LICENSE} VPN devices allowed. Remove one first.`,
      });
    }

    // Generate keys and assign IP
    const keys = await generateWgKeys();
    const assignedIp = getNextIp();

    // Save to DB
    stmts.insertPeer.run({
      license_id: license.id,
      peer_name: peerName,
      public_key: keys.publicKey,
      private_key: keys.privateKey,
      preshared_key: keys.presharedKey,
      assigned_ip: assignedIp,
    });

    // Add to live WireGuard
    await addPeerToWg(keys.publicKey, keys.presharedKey, assignedIp);
    await syncWgConfig();

    // Build client config
    const clientConfig = [
      "[Interface]",
      `PrivateKey = ${keys.privateKey}`,
      `Address = ${assignedIp}/32`,
      `DNS = ${VPN_DNS}`,
      "",
      "[Peer]",
      `PublicKey = ${SERVER_PUBLIC_KEY}`,
      `PresharedKey = ${keys.presharedKey}`,
      `Endpoint = ${SERVER_ENDPOINT}`,
      `AllowedIPs = 0.0.0.0/0, ::/0`,
      `PersistentKeepalive = 25`,
    ].join("\n");

    res.json({
      peer_name: peerName,
      assigned_ip: assignedIp,
      config: clientConfig,
    });
  } catch (err) {
    console.error("VPN create error:", err);
    res.status(500).json({ error: "Failed to create VPN config" });
  }
});

// POST /api/vpn/list — list VPN peers for a license
router.post("/list", requireVpnLicense, (req, res) => {
  const peers = stmts.findPeersByLicense.all(req.license.id);
  res.json({
    peers: peers.map((p) => ({
      id: p.id,
      name: p.peer_name,
      ip: p.assigned_ip,
      active: !!p.is_active,
      created: p.created_at,
    })),
  });
});

// POST /api/vpn/config — get full config for an existing peer
router.post("/config", requireVpnLicense, (req, res) => {
  const { peer_id } = req.body;
  if (!peer_id) return res.status(400).json({ error: "Missing peer_id" });

  const peers = stmts.findPeersByLicense.all(req.license.id);
  const peer = peers.find((p) => p.id === peer_id);
  if (!peer) return res.status(404).json({ error: "Peer not found" });

  const clientConfig = [
    "[Interface]",
    `PrivateKey = ${peer.private_key}`,
    `Address = ${peer.assigned_ip}/32`,
    `DNS = ${VPN_DNS}`,
    "",
    "[Peer]",
    `PublicKey = ${SERVER_PUBLIC_KEY}`,
    `PresharedKey = ${peer.preshared_key}`,
    `Endpoint = ${SERVER_ENDPOINT}`,
    `AllowedIPs = 0.0.0.0/0, ::/0`,
    `PersistentKeepalive = 25`,
  ].join("\n");

  res.json({
    peer_name: peer.peer_name,
    assigned_ip: peer.assigned_ip,
    config: clientConfig,
  });
});

// POST /api/vpn/delete — remove a VPN peer
router.post("/delete", requireVpnLicense, async (req, res) => {
  try {
    const { peer_id } = req.body;
    if (!peer_id) return res.status(400).json({ error: "Missing peer_id" });

    const peers = stmts.findPeersByLicense.all(req.license.id);
    const peer = peers.find((p) => p.id === peer_id);
    if (!peer) return res.status(404).json({ error: "Peer not found" });

    // Remove from WireGuard
    await removePeerFromWg(peer.public_key);
    await syncWgConfig();

    // Remove from DB
    stmts.deletePeer.run(peer.id, req.license.id);

    res.json({ success: true });
  } catch (err) {
    console.error("VPN delete error:", err);
    res.status(500).json({ error: "Failed to delete peer" });
  }
});

// GET /api/vpn/status — public endpoint showing VPN server status
router.get("/status", async (_req, res) => {
  try {
    const { stdout } = await execFileAsync("wg", ["show", "wg0", "latest-handshakes"]);
    const activePeers = stdout.trim().split("\n").filter((l) => {
      if (!l.trim()) return false;
      const ts = parseInt(l.split("\t")[1], 10);
      // Active if handshake within last 3 minutes
      return ts > 0 && Date.now() / 1000 - ts < 180;
    }).length;

    res.json({ status: "online", active_connections: activePeers });
  } catch {
    res.json({ status: "online", active_connections: 0 });
  }
});

module.exports = router;
