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
    plan                    TEXT    NOT NULL DEFAULT 'pro',
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
`);

// Migrate existing DB: add columns if missing
const cols = db.prepare("PRAGMA table_info(licenses)").all().map((c) => c.name);
if (!cols.includes("outline_access_key")) {
  db.exec("ALTER TABLE licenses ADD COLUMN outline_access_key TEXT");
}
if (!cols.includes("outline_key_id")) {
  db.exec("ALTER TABLE licenses ADD COLUMN outline_key_id TEXT");
}

// Drop old vpn_peers table if it exists
db.exec("DROP TABLE IF EXISTS vpn_peers");

const stmts = {
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
  setOutlineKey: db.prepare("UPDATE licenses SET outline_access_key = ?, outline_key_id = ? WHERE id = ?"),
  clearOutlineKey: db.prepare("UPDATE licenses SET outline_access_key = NULL, outline_key_id = NULL WHERE id = ?"),
};

module.exports = { db, stmts };
