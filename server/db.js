const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "vizoguard.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    key                     TEXT    UNIQUE NOT NULL,
    email                   TEXT    NOT NULL,
    plan                    TEXT    NOT NULL DEFAULT 'security_vpn',
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT    UNIQUE,
    device_id               TEXT,
    status                  TEXT    NOT NULL DEFAULT 'active',
    created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at              TEXT    NOT NULL,
    last_check              TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(key);
  CREATE INDEX IF NOT EXISTS idx_licenses_subscription ON licenses(stripe_subscription_id);

  CREATE TABLE IF NOT EXISTS vpn_peers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id      INTEGER NOT NULL REFERENCES licenses(id),
    peer_name       TEXT    NOT NULL,
    public_key      TEXT    UNIQUE NOT NULL,
    private_key     TEXT    NOT NULL,
    preshared_key   TEXT    NOT NULL,
    assigned_ip     TEXT    UNIQUE NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    last_handshake  TEXT,
    UNIQUE(license_id, peer_name)
  );

  CREATE INDEX IF NOT EXISTS idx_vpn_peers_license ON vpn_peers(license_id);
  CREATE INDEX IF NOT EXISTS idx_vpn_peers_pubkey ON vpn_peers(public_key);
`);

const stmts = {
  // License statements
  insert: db.prepare(`
    INSERT INTO licenses (key, email, plan, stripe_customer_id, stripe_subscription_id, status, expires_at)
    VALUES (@key, @email, @plan, @customer, @subscription, 'active', @expires_at)
  `),
  findByKey: db.prepare("SELECT * FROM licenses WHERE key = ?"),
  findBySubscription: db.prepare("SELECT * FROM licenses WHERE stripe_subscription_id = ?"),
  findByCustomer: db.prepare("SELECT * FROM licenses WHERE stripe_customer_id = ? ORDER BY created_at DESC LIMIT 1"),
  bindDevice: db.prepare("UPDATE licenses SET device_id = ? WHERE id = ?"),
  updateExpiry: db.prepare("UPDATE licenses SET expires_at = ?, status = 'active' WHERE stripe_subscription_id = ?"),
  updateStatus: db.prepare("UPDATE licenses SET status = ? WHERE stripe_subscription_id = ?"),
  updateLastCheck: db.prepare("UPDATE licenses SET last_check = datetime('now') WHERE id = ?"),
  clearDevice: db.prepare("UPDATE licenses SET device_id = NULL WHERE id = ?"),

  // VPN peer statements
  insertPeer: db.prepare(`
    INSERT INTO vpn_peers (license_id, peer_name, public_key, private_key, preshared_key, assigned_ip)
    VALUES (@license_id, @peer_name, @public_key, @private_key, @preshared_key, @assigned_ip)
  `),
  findPeersByLicense: db.prepare("SELECT * FROM vpn_peers WHERE license_id = ?"),
  findPeerByKey: db.prepare("SELECT * FROM vpn_peers WHERE public_key = ?"),
  findPeerByIp: db.prepare("SELECT * FROM vpn_peers WHERE assigned_ip = ?"),
  getMaxIp: db.prepare("SELECT assigned_ip FROM vpn_peers ORDER BY CAST(REPLACE(assigned_ip, '10.66.66.', '') AS INTEGER) DESC LIMIT 1"),
  deactivatePeer: db.prepare("UPDATE vpn_peers SET is_active = 0 WHERE id = ?"),
  activatePeer: db.prepare("UPDATE vpn_peers SET is_active = 1 WHERE id = ?"),
  deletePeer: db.prepare("DELETE FROM vpn_peers WHERE id = ? AND license_id = ?"),
  countActivePeers: db.prepare("SELECT COUNT(*) AS cnt FROM vpn_peers WHERE license_id = ? AND is_active = 1"),
};

module.exports = { db, stmts };
