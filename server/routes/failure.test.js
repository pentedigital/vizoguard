"use strict";

/**
 * Failure scenario tests — chaos engineering for production resilience
 *
 * Tests what happens when things go wrong: API crashes, DB locks, Outline
 * timeouts, concurrent operations, and partial failures. These simulate
 * the failure modes that break real production systems.
 *
 * 16 tests across 6 failure categories.
 */

const { describe, it, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");

// ── Mock stripe ─────────────────────────────────────────────────────────────
const mockStripe = mock.fn(() => ({
  checkout: { sessions: { retrieve: mock.fn() } },
  webhooks: { constructEvent: mock.fn() },
  invoices: { retrieve: mock.fn() },
  subscriptions: { retrieve: mock.fn(async () => ({ status: "active" })) },
}));
require.cache[require.resolve("stripe")] = {
  id: require.resolve("stripe"),
  filename: require.resolve("stripe"),
  loaded: true,
  exports: mockStripe,
};

// ── Mock db ─────────────────────────────────────────────────────────────────
const mockStmts = {
  findByKey:           { get: mock.fn() },
  findBySubscription:  { get: mock.fn() },
  findByCustomer:      { get: mock.fn() },
  bindDevice:          { run: mock.fn() },
  updateLastCheck:     { run: mock.fn() },
  transferDevice:      { run: mock.fn() },
  clearOutlineKey:     { run: mock.fn() },
  insertAudit:         { run: mock.fn() },
  findNodeById:        { get: mock.fn() },
  upsertDevice:        { run: mock.fn() },
  setTransferTime:     { run: mock.fn() },
  claimOutlineSlot:    { run: mock.fn() },
  resetStalePending:   { run: mock.fn() },
  setOutlineKey:       { run: mock.fn() },
  setLicenseNode:      { run: mock.fn() },
  resetOutlineClaim:   { run: mock.fn() },
  listActiveNodes:     { all: mock.fn() },
  bestNode:            { get: mock.fn() },
};
require.cache[require.resolve("../db")] = {
  id: require.resolve("../db"),
  filename: require.resolve("../db"),
  loaded: true,
  exports: { db: {}, stmts: mockStmts },
};

// ── Mock outline ────────────────────────────────────────────────────────────
const mockOutline = {
  createAccessKey: mock.fn(async () => ({ id: "42", accessUrl: "ss://fakekey" })),
  deleteAccessKey: mock.fn(async () => null),
  setDataLimit:    mock.fn(async () => null),
};
require.cache[require.resolve("../outline")] = {
  id: require.resolve("../outline"),
  filename: require.resolve("../outline"),
  loaded: true,
  exports: mockOutline,
};

// ── Mock metrics ────────────────────────────────────────────────────────────
require.cache[require.resolve("../metrics")] = {
  id: require.resolve("../metrics"),
  filename: require.resolve("../metrics"),
  loaded: true,
  exports: {
    vpnKeysCreatedTotal: { inc: () => {} },
    licenseValidationsTotal: { inc: () => {} },
    httpRequestsTotal: { inc: () => {} },
    httpRequestDuration: { observe: () => {} },
    webhookEventsTotal: { inc: () => {} },
    stripeCheckoutTotal: { inc: () => {} },
    register: {},
    metricsMiddleware: (_r, _s, n) => n(),
  },
};

// ── Load routes ─────────────────────────────────────────────────────────────
const express = require("express");
const licenseRouter = require("./license");
const vpnRouter = require("./vpn");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/license", licenseRouter);
  app.use("/vpn", vpnRouter);
  return app;
}

const http = require("http");
function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: "127.0.0.1", port, path, method,
        headers: { "Content-Type": "application/json", ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) },
      }, (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          server.close();
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on("error", (e) => { server.close(); reject(e); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

// ── Shared ───────────────────────────────────────────────────────────────────
const KEY = "VIZO-ABCD-1234-EF56-7890";
const DEV = "device-abc123def456ghi";
const FUTURE = new Date(Date.now() + 86400 * 365 * 1000).toISOString();
const PAST = new Date(Date.now() - 86400 * 1000).toISOString();

function resetAll() {
  for (const s of Object.values(mockStmts)) {
    if (s.get?.mock) s.get.mock.resetCalls();
    if (s.run?.mock) s.run.mock.resetCalls();
    if (s.all?.mock) s.all.mock.resetCalls();
  }
  mockOutline.createAccessKey.mock.resetCalls();
  mockOutline.deleteAccessKey.mock.resetCalls();
  mockOutline.setDataLimit.mock.resetCalls();
}

function activeLicense(overrides = {}) {
  return {
    id: 1, key: KEY, status: "active", email: "test@x.com", plan: "vpn",
    expires_at: FUTURE, device_id: DEV, outline_access_key: null,
    outline_key_id: null, vpn_node_id: null, last_transfer_at: null,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. OUTLINE API FAILURES DURING KEY CREATION
// ═════════════════════════════════════════════════════════════════════════════
describe("Failure: Outline API timeout during key creation", () => {
  beforeEach(resetAll);

  it("Outline.createAccessKey times out → resets claim, returns 500", async () => {
    let resetCalled = false;
    mockOutline.createAccessKey.mock.mockImplementation(async () => {
      throw new Error("Outline API timeout after 10s");
    });
    mockStmts.findByKey.get.mock.mockImplementation(() => activeLicense());
    mockStmts.claimOutlineSlot.run.mock.mockImplementation(() => ({ changes: 1 }));
    mockStmts.resetStalePending.run.mock.mockImplementation(() => {});
    mockStmts.resetOutlineClaim.run.mock.mockImplementation(() => { resetCalled = true; });
    mockStmts.listActiveNodes.all.mock.mockImplementation(() => []);
    mockStmts.bestNode.get.mock.mockImplementation(() => null);

    const app = makeApp();
    const res = await request(app, "POST", "/vpn/create", { key: KEY, device_id: DEV });

    assert.equal(res.status, 500);
    assert.ok(resetCalled, "resetOutlineClaim must be called to release pending slot");
    assert.equal(mockOutline.deleteAccessKey.mock.calls.length, 0, "No key to delete — creation failed");
  });

  it("Outline.createAccessKey succeeds but DB write fails → deletes orphaned key", async () => {
    let deletedKeyId = null;
    mockOutline.createAccessKey.mock.mockImplementation(async () => ({ id: "99", accessUrl: "ss://newkey" }));
    mockOutline.deleteAccessKey.mock.mockImplementation(async (id) => { deletedKeyId = id; });
    mockStmts.findByKey.get.mock.mockImplementation(() => activeLicense());
    mockStmts.claimOutlineSlot.run.mock.mockImplementation(() => ({ changes: 1 }));
    mockStmts.resetStalePending.run.mock.mockImplementation(() => {});
    mockStmts.listActiveNodes.all.mock.mockImplementation(() => []);
    mockStmts.bestNode.get.mock.mockImplementation(() => null);
    mockStmts.setOutlineKey.run.mock.mockImplementation(() => {
      throw new Error("SQLITE_BUSY: database is locked");
    });
    mockStmts.resetOutlineClaim.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, "POST", "/vpn/create", { key: KEY, device_id: DEV });

    assert.equal(res.status, 500);
    assert.equal(deletedKeyId, "99", "Must delete orphaned Outline key after DB failure");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. DATABASE LOCKED (SQLite busy)
// ═════════════════════════════════════════════════════════════════════════════
describe("Failure: SQLite database locked", () => {
  beforeEach(resetAll);

  it("bindDevice throws SQLITE_BUSY → returns 500, doesn't crash", async () => {
    mockStmts.findByKey.get.mock.mockImplementation(() => activeLicense({ device_id: null }));
    mockStmts.bindDevice.run.mock.mockImplementation(() => {
      throw new Error("SQLITE_BUSY: database is locked");
    });

    const app = makeApp();
    const res = await request(app, "POST", "/license/", { key: KEY, device_id: DEV });

    assert.equal(res.status, 500);
    assert.ok(res.body.error, "Should return error message");
  });

  it("transferDevice throws SQLITE_BUSY → returns 500, Outline key NOT deleted", async () => {
    mockStmts.findByKey.get.mock.mockImplementation(() => activeLicense({ outline_key_id: "55" }));
    mockStmts.transferDevice.run.mock.mockImplementation(() => {
      throw new Error("SQLITE_BUSY: database is locked");
    });

    const app = makeApp();
    const res = await request(app, "POST", "/license/transfer", {
      key: KEY, device_id: "newdevice-0000000000000000", current_device_id: DEV,
    });

    assert.equal(res.status, 500);
    // Outline key must NOT be deleted — transfer didn't complete
    assert.equal(mockOutline.deleteAccessKey.mock.calls.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. CONCURRENT TRANSFER + REFUND
// ═════════════════════════════════════════════════════════════════════════════
describe("Failure: Transfer while license is being suspended", () => {
  beforeEach(resetAll);

  it("transfer CAS fails because webhook suspended license → 403", async () => {
    // findByKey returns active (initial check), but transferDevice WHERE status='active' fails
    mockStmts.findByKey.get.mock.mockImplementation(() => activeLicense());
    mockStmts.transferDevice.run.mock.mockImplementation(() => ({ changes: 0 })); // CAS fail — status changed

    const app = makeApp();
    const res = await request(app, "POST", "/license/transfer", {
      key: KEY, device_id: "newdevice-0000000000000000", current_device_id: DEV,
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /no longer active/i);
    // No Outline key deletion — transfer was rejected
    assert.equal(mockOutline.deleteAccessKey.mock.calls.length, 0);
    assert.equal(mockStmts.clearOutlineKey.run.mock.calls.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. OUTLINE DELETE FAILS DURING TRANSFER
// ═════════════════════════════════════════════════════════════════════════════
describe("Failure: Outline unreachable during transfer key revocation", () => {
  beforeEach(resetAll);

  it("transfer succeeds even if Outline delete fails — DB still cleared", async () => {
    mockStmts.findByKey.get.mock.mockImplementation(() =>
      activeLicense({ outline_key_id: "77", outline_access_key: "ss://old" })
    );
    mockStmts.transferDevice.run.mock.mockImplementation(() => ({ changes: 1 }));
    mockStmts.clearOutlineKey.run.mock.mockImplementation(() => {});
    mockStmts.insertAudit.run.mock.mockImplementation(() => {});
    mockStmts.setTransferTime.run.mock.mockImplementation(() => {});
    mockOutline.deleteAccessKey.mock.mockImplementation(async () => {
      throw new Error("Connection refused");
    });

    const app = makeApp();
    const res = await request(app, "POST", "/license/transfer", {
      key: KEY, device_id: "newdevice-0000000000000000", current_device_id: DEV,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    // DB still cleared — new device will get fresh key
    assert.equal(mockStmts.clearOutlineKey.run.mock.calls.length, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. LICENSE EXPIRY DURING VALIDATION (race with expiry boundary)
// ═════════════════════════════════════════════════════════════════════════════
describe("Failure: License expires between initial check and re-fetch", () => {
  beforeEach(resetAll);

  it("license active on first fetch, expired on re-fetch → 403", async () => {
    let call = 0;
    mockStmts.findByKey.get.mock.mockImplementation(() => {
      call++;
      if (call === 1) return activeLicense(); // First check: active
      return activeLicense({ expires_at: PAST }); // Re-fetch: expired (webhook updated)
    });
    mockStmts.updateLastCheck.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, "POST", "/license/", { key: KEY, device_id: DEV });

    assert.equal(res.status, 403);
    assert.equal(res.body.valid, false);
  });

  it("license active on first fetch, suspended on re-fetch → 403", async () => {
    let call = 0;
    mockStmts.findByKey.get.mock.mockImplementation(() => {
      call++;
      if (call === 1) return activeLicense();
      return activeLicense({ status: "suspended" });
    });

    const app = makeApp();
    const res = await request(app, "POST", "/license/", { key: KEY, device_id: DEV });

    assert.equal(res.status, 403);
    assert.equal(res.body.status, "suspended");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. VPN KEY PROVISIONING RACE (CAS contention)
// ═════════════════════════════════════════════════════════════════════════════
describe("Failure: CAS contention on VPN key provisioning", () => {
  beforeEach(resetAll);

  it("claimOutlineSlot CAS fails (another request won) → 409 or returns existing key", async () => {
    // First findByKey: no key yet (middleware)
    // claimOutlineSlot: fails (another process claimed it)
    // Re-fetch: still no completed key → 409
    mockStmts.findByKey.get.mock.mockImplementation(() => activeLicense());
    mockStmts.claimOutlineSlot.run.mock.mockImplementation(() => ({ changes: 0 }));
    mockStmts.resetStalePending.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, "POST", "/vpn/create", { key: KEY, device_id: DEV });

    assert.equal(res.status, 409);
  });

  it("claimOutlineSlot CAS fails but re-fetch shows completed key → returns it", async () => {
    let call = 0;
    mockStmts.findByKey.get.mock.mockImplementation(() => {
      call++;
      if (call <= 1) return activeLicense(); // middleware: no key
      return activeLicense({ outline_access_key: "ss://racewinner", outline_key_id: "100" }); // re-fetch: other process finished
    });
    mockStmts.claimOutlineSlot.run.mock.mockImplementation(() => ({ changes: 0 }));
    mockStmts.resetStalePending.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, "POST", "/vpn/create", { key: KEY, device_id: DEV });

    assert.equal(res.status, 200);
    assert.equal(res.body.access_url, "ss://racewinner");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. VPN KEY DELETE WHEN KEY ALREADY GONE (idempotency)
// ═════════════════════════════════════════════════════════════════════════════
describe("Failure: VPN key delete when Outline key already revoked", () => {
  beforeEach(resetAll);

  it("delete succeeds even if Outline returns 404 (key already gone)", async () => {
    mockStmts.findByKey.get.mock.mockImplementation(() =>
      activeLicense({ outline_access_key: "ss://old", outline_key_id: "88" })
    );
    mockStmts.clearOutlineKey.run.mock.mockImplementation(() => {});
    mockStmts.listActiveNodes.all.mock.mockImplementation(() => []);
    mockOutline.deleteAccessKey.mock.mockImplementation(async () => null); // 404 treated as success

    const app = makeApp();
    const res = await request(app, "POST", "/vpn/delete", { key: KEY });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. CONCURRENT VALIDATION BINDING SAME LICENSE
// ═════════════════════════════════════════════════════════════════════════════
describe("Failure: Two devices try to bind same unbound license", () => {
  beforeEach(resetAll);

  it("second bind attempt gets device_mismatch after CAS loss", async () => {
    // First findByKey: unbound
    // bindDevice: CAS fails (changes=0 — another device already bound)
    // Re-fetch shows different device
    let call = 0;
    mockStmts.findByKey.get.mock.mockImplementation(() => {
      call++;
      if (call === 1) return activeLicense({ device_id: null });
      return activeLicense({ device_id: "other-device-won-the-race" });
    });
    mockStmts.bindDevice.run.mock.mockImplementation(() => ({ changes: 0 }));

    const app = makeApp();
    const res = await request(app, "POST", "/license/", { key: KEY, device_id: DEV });

    assert.equal(res.status, 403);
    assert.equal(res.body.status, "device_mismatch");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. CLEANUP JOB AND WEBHOOK RACE ON SAME KEY
// ═════════════════════════════════════════════════════════════════════════════
describe("Failure: Outline key deleted twice (cleanup + webhook)", () => {
  beforeEach(resetAll);

  it("VPN delete when key already cleared → 404 (idempotent, no crash)", async () => {
    // Simulate: cleanup job already cleared the key, user tries to delete
    mockStmts.findByKey.get.mock.mockImplementation(() =>
      activeLicense({ outline_access_key: null, outline_key_id: null }) // already cleared
    );

    const app = makeApp();
    const res = await request(app, "POST", "/vpn/delete", { key: KEY, device_id: DEV });

    assert.equal(res.status, 404); // No key to delete
    assert.equal(mockOutline.deleteAccessKey.mock.calls.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. TRANSFER DURING COOLDOWN WITH EDGE TIMING
// ═════════════════════════════════════════════════════════════════════════════
describe("Failure: Transfer at exact cooldown boundary", () => {
  beforeEach(resetAll);

  it("transfer at exactly 72h (3 days) boundary → allowed", async () => {
    const exactlyThreeDays = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    mockStmts.findByKey.get.mock.mockImplementation(() =>
      activeLicense({ last_transfer_at: exactlyThreeDays })
    );
    mockStmts.transferDevice.run.mock.mockImplementation(() => ({ changes: 1 }));
    mockStmts.insertAudit.run.mock.mockImplementation(() => {});
    mockStmts.setTransferTime.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, "POST", "/license/transfer", {
      key: KEY, device_id: "newdevice-0000000000000000", current_device_id: DEV,
    });

    assert.equal(res.status, 200);
  });

  it("transfer at 71h 59m → rejected with cooldown", async () => {
    const justUnder = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000 - 60000)).toISOString(); // 1 min short
    mockStmts.findByKey.get.mock.mockImplementation(() =>
      activeLicense({ last_transfer_at: justUnder })
    );

    const app = makeApp();
    const res = await request(app, "POST", "/license/transfer", {
      key: KEY, device_id: "newdevice-0000000000000000", current_device_id: DEV,
    });

    assert.equal(res.status, 429);
    assert.match(res.body.error, /cooldown/i);
  });
});
