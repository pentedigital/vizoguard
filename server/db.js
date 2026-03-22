const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "vizoguard.db");

// Ensure data directory exists before opening DB
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
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
    last_check              TEXT,
    outline_access_key      TEXT,
    outline_key_id          TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(key);
  CREATE INDEX IF NOT EXISTS idx_licenses_subscription ON licenses(stripe_subscription_id);
  CREATE INDEX IF NOT EXISTS idx_licenses_customer ON licenses(stripe_customer_id);
  CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);

  CREATE TABLE IF NOT EXISTS vpn_nodes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    region      TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    host        TEXT    NOT NULL,
    api_url     TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'active',
    max_keys    INTEGER NOT NULL DEFAULT 1000,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_vpn_nodes_region ON vpn_nodes(region);
  CREATE INDEX IF NOT EXISTS idx_vpn_nodes_status ON vpn_nodes(status);
`);

// Migrate existing DB: add columns if missing
const cols = db.prepare("PRAGMA table_info(licenses)").all().map((c) => c.name);
if (!cols.includes("outline_access_key")) {
  db.exec("ALTER TABLE licenses ADD COLUMN outline_access_key TEXT");
}
if (!cols.includes("outline_key_id")) {
  db.exec("ALTER TABLE licenses ADD COLUMN outline_key_id TEXT");
}
if (!cols.includes("vpn_node_id")) {
  db.exec("ALTER TABLE licenses ADD COLUMN vpn_node_id INTEGER");
}

// Performance indexes for hot-path queries
db.exec("CREATE INDEX IF NOT EXISTS idx_licenses_vpn_node ON licenses(vpn_node_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status)");

// Add processed_events table for webhook idempotency
db.exec(`
  CREATE TABLE IF NOT EXISTS processed_events (
    event_id    TEXT PRIMARY KEY,
    event_type  TEXT NOT NULL,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Prune processed events older than 7 days (beyond Stripe's 72h retry window)
db.prepare("DELETE FROM processed_events WHERE processed_at < datetime('now', '-7 days')").run();

// Add composite index for bestNode query performance
db.exec("CREATE INDEX IF NOT EXISTS idx_licenses_node_status ON licenses(vpn_node_id, status)");

const stmts = {
  insert: db.prepare(`
    INSERT INTO licenses (key, email, plan, stripe_customer_id, stripe_subscription_id, status, expires_at)
    VALUES (@key, @email, @plan, @customer, @subscription, 'active', @expires_at)
  `),
  findByKey: db.prepare("SELECT * FROM licenses WHERE key = ?"),
  findBySubscription: db.prepare("SELECT * FROM licenses WHERE stripe_subscription_id = ?"),
  findByCustomer: db.prepare("SELECT * FROM licenses WHERE stripe_customer_id = ? ORDER BY created_at DESC LIMIT 1"),
  bindDevice: db.prepare("UPDATE licenses SET device_id = ? WHERE id = ? AND device_id IS NULL"),
  updateExpiry: db.prepare("UPDATE licenses SET expires_at = ? WHERE stripe_subscription_id = ?"),
  updateStatus: db.prepare("UPDATE licenses SET status = ? WHERE stripe_subscription_id = ?"),
  updateLastCheck: db.prepare("UPDATE licenses SET last_check = datetime('now') WHERE id = ?"),
  clearDevice: db.prepare("UPDATE licenses SET device_id = NULL WHERE id = ?"),
  setOutlineKey: db.prepare("UPDATE licenses SET outline_access_key = ?, outline_key_id = ? WHERE id = ?"),
  clearOutlineKey: db.prepare("UPDATE licenses SET outline_access_key = NULL, outline_key_id = NULL, vpn_node_id = NULL WHERE id = ?"),
  setLicenseNode: db.prepare("UPDATE licenses SET vpn_node_id = ? WHERE id = ?"),
  claimOutlineSlot: db.prepare("UPDATE licenses SET outline_key_id = 'pending' WHERE id = ? AND outline_key_id IS NULL"),
  resetOutlineClaim: db.prepare("UPDATE licenses SET outline_key_id = NULL WHERE id = ? AND outline_key_id = 'pending'"),

  // Webhook idempotency
  insertEvent: db.prepare("INSERT OR IGNORE INTO processed_events (event_id, event_type) VALUES (?, ?)"),
  eventExists: db.prepare("SELECT 1 FROM processed_events WHERE event_id = ?"),

  // Plan update (subscription upgrade/downgrade)
  updatePlan: db.prepare("UPDATE licenses SET plan = ? WHERE stripe_subscription_id = ?"),

  // Guarded status updates — prevent invalid transitions
  reactivateStatus: db.prepare("UPDATE licenses SET status = ? WHERE stripe_subscription_id = ? AND status NOT IN ('expired')"),

  // Stale pending cleanup
  resetStalePending: db.prepare("UPDATE licenses SET outline_key_id = NULL WHERE outline_key_id = 'pending' AND (last_check < datetime('now', '-5 minutes') OR (last_check IS NULL AND created_at < datetime('now', '-5 minutes')))"),

  // VPN nodes
  insertNode: db.prepare("INSERT INTO vpn_nodes (region, name, host, api_url, max_keys) VALUES (@region, @name, @host, @api_url, @max_keys)"),
  findNodeById: db.prepare("SELECT * FROM vpn_nodes WHERE id = ?"),
  listActiveNodes: db.prepare("SELECT * FROM vpn_nodes WHERE status = 'active'"),
  bestNode: db.prepare(`
    SELECT n.*, COUNT(l.id) AS active_keys
    FROM vpn_nodes n
    LEFT JOIN licenses l ON l.vpn_node_id = n.id AND l.status IN ('active', 'cancelled')
    WHERE n.status = 'active' AND n.max_keys > 0
    GROUP BY n.id
    HAVING active_keys < n.max_keys
    ORDER BY active_keys ASC
    LIMIT 1
  `),
  updateNodeStatus: db.prepare("UPDATE vpn_nodes SET status = ? WHERE id = ?"),
  nodeKeyCount: db.prepare("SELECT COUNT(*) AS count FROM licenses WHERE vpn_node_id = ? AND status IN ('active', 'cancelled')"),
};

module.exports = { db, stmts };
