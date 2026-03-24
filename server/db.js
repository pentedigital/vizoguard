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

// Circuit breaker state (shared across PM2 cluster instances)
db.exec(`
  CREATE TABLE IF NOT EXISTS circuit_breaker (
    name TEXT PRIMARY KEY,
    failures INTEGER DEFAULT 0,
    state TEXT DEFAULT 'closed',
    opened_at INTEGER DEFAULT 0
  );
  INSERT OR IGNORE INTO circuit_breaker (name) VALUES ('outline');
`);

// Add processed_events table for webhook idempotency
db.exec(`
  CREATE TABLE IF NOT EXISTS processed_events (
    event_id    TEXT PRIMARY KEY,
    event_type  TEXT NOT NULL,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Audit log for key events (no PII)
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    ip TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Devices table — tracks device activity per license for abuse detection
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id          TEXT    NOT NULL,
    license_id  INTEGER NOT NULL,
    platform    TEXT,
    first_seen  TEXT    NOT NULL DEFAULT (datetime('now')),
    last_seen   TEXT    NOT NULL DEFAULT (datetime('now')),
    last_ip     TEXT,
    PRIMARY KEY (id, license_id)
  );
  CREATE INDEX IF NOT EXISTS idx_devices_license ON devices(license_id);
`);

// Schema version tracking
db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)");

const currentVersion = db.prepare("SELECT MAX(version) as v FROM schema_version").get()?.v || 0;
if (currentVersion < 1) {
  db.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (1)").run();
}

// Migration v2: add last_transfer_at to licenses for transfer cooldown
if (currentVersion < 2) {
  const licCols = db.prepare("PRAGMA table_info(licenses)").all().map(c => c.name);
  if (!licCols.includes("last_transfer_at")) {
    db.exec("ALTER TABLE licenses ADD COLUMN last_transfer_at TEXT");
  }
  db.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (2)").run();
}

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
  transferDevice: db.prepare("UPDATE licenses SET device_id = ? WHERE id = ? AND key = ? AND status = 'active'"),
  setOutlineKey: db.prepare("UPDATE licenses SET outline_access_key = ?, outline_key_id = ? WHERE id = ?"),
  clearOutlineKey: db.prepare("UPDATE licenses SET outline_access_key = NULL, outline_key_id = NULL, vpn_node_id = NULL WHERE id = ?"),
  setLicenseNode: db.prepare("UPDATE licenses SET vpn_node_id = ? WHERE id = ?"),
  claimOutlineSlot: db.prepare("UPDATE licenses SET outline_key_id = 'pending' WHERE id = ? AND outline_key_id IS NULL"),
  resetOutlineClaim: db.prepare("UPDATE licenses SET outline_key_id = NULL WHERE id = ? AND outline_key_id = 'pending'"),

  // Circuit breaker
  getCB: db.prepare("SELECT * FROM circuit_breaker WHERE name = ?"),
  updateCB: db.prepare("UPDATE circuit_breaker SET failures = ?, state = ?, opened_at = ? WHERE name = ?"),

  // Audit log
  insertAudit: db.prepare("INSERT INTO audit_log (action, entity_type, entity_id, details, ip) VALUES (?, ?, ?, ?, ?)"),

  // Webhook idempotency
  insertEvent: db.prepare("INSERT OR IGNORE INTO processed_events (event_id, event_type) VALUES (?, ?)"),
  eventExists: db.prepare("SELECT 1 FROM processed_events WHERE event_id = ?"),

  // Plan update (subscription upgrade/downgrade)
  updatePlan: db.prepare("UPDATE licenses SET plan = ? WHERE stripe_subscription_id = ?"),

  // Guarded status updates — prevent invalid transitions
  // Note: 'cancelled' is excluded so late payment retries don't un-cancel explicit cancellations.
  // Legitimate reactivation (user re-subscribes) creates a new Stripe subscription, not a retry on the old one.
  reactivateStatus: db.prepare("UPDATE licenses SET status = ? WHERE stripe_subscription_id = ? AND status NOT IN ('expired', 'cancelled')"),
  // Suspend only non-terminal statuses — refunds arriving after expiry must not resurrect the license
  suspendStatus: db.prepare("UPDATE licenses SET status = 'suspended' WHERE stripe_subscription_id = ? AND status NOT IN ('expired')"),

  // Stale pending cleanup
  resetStalePending: db.prepare("UPDATE licenses SET outline_key_id = NULL WHERE outline_key_id = 'pending' AND (last_check < datetime('now', '-5 minutes') OR (last_check IS NULL AND created_at < datetime('now', '-5 minutes')))"),

  // Expired license cleanup — find licenses past expiry that still have Outline keys
  findExpiredWithKeys: db.prepare("SELECT id, outline_key_id, vpn_node_id FROM licenses WHERE expires_at < datetime('now') AND outline_key_id IS NOT NULL AND outline_key_id != 'pending' AND status IN ('expired', 'cancelled', 'suspended')"),

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

  // Devices — upsert on validation, query for abuse detection
  upsertDevice: db.prepare(`
    INSERT INTO devices (id, license_id, platform, last_ip)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id, license_id) DO UPDATE SET last_seen = datetime('now'), last_ip = excluded.last_ip
  `),
  getDevicesByLicense: db.prepare("SELECT * FROM devices WHERE license_id = ? ORDER BY last_seen DESC"),
  countDevicesByLicense: db.prepare("SELECT COUNT(*) AS count FROM devices WHERE license_id = ?"),

  // Transfer cooldown
  setTransferTime: db.prepare("UPDATE licenses SET last_transfer_at = datetime('now') WHERE id = ?"),
  getTransferCooldown: db.prepare("SELECT last_transfer_at FROM licenses WHERE id = ?"),

  // Gauge metrics — license/key counts for drift detection
  countActiveLicenses: db.prepare("SELECT COUNT(*) AS count FROM licenses WHERE status IN ('active', 'cancelled') AND expires_at > datetime('now')"),
  countActiveOutlineKeys: db.prepare("SELECT COUNT(*) AS count FROM licenses WHERE outline_key_id IS NOT NULL AND outline_key_id != 'pending'"),
};

module.exports = { db, stmts };
