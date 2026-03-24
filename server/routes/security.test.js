"use strict";

/**
 * Security & state machine tests — validates enforcement boundaries
 * Tests: transfer auth, state transitions, input sanitization, cleanup job, rate limiting
 */

const { describe, it, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");

// ── Mock stripe ─────────────────────────────────────────────────────────────
const mockStripe = mock.fn(() => ({
  checkout: { sessions: { retrieve: mock.fn() } },
}));
require.cache[require.resolve("stripe")] = {
  id: require.resolve("stripe"),
  filename: require.resolve("stripe"),
  loaded: true,
  exports: mockStripe,
};

// ── Mock db ─────────────────────────────────────────────────────────────────
const mockStmts = {
  findByKey: { get: mock.fn() },
  bindDevice: { run: mock.fn() },
  updateLastCheck: { run: mock.fn() },
  findBySubscription: { get: mock.fn() },
  findByCustomer: { get: mock.fn() },
  transferDevice: { run: mock.fn() },
  clearOutlineKey: { run: mock.fn() },
  insertAudit: { run: mock.fn() },
  findNodeById: { get: mock.fn() },
  upsertDevice: { run: mock.fn() },
  setTransferTime: { run: mock.fn() },
  getTransferCooldown: { get: mock.fn() },
};
require.cache[require.resolve("../db")] = {
  id: require.resolve("../db"),
  filename: require.resolve("../db"),
  loaded: true,
  exports: { stmts: mockStmts },
};

// ── Mock outline ────────────────────────────────────────────────────────────
const mockOutline = {
  deleteAccessKey: mock.fn(async () => null),
};
require.cache[require.resolve("../outline")] = {
  id: require.resolve("../outline"),
  filename: require.resolve("../outline"),
  loaded: true,
  exports: mockOutline,
};

// ── Load router ─────────────────────────────────────────────────────────────
const express = require("express");
const router = require("./license");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/", router);
  return app;
}

const http = require("http");

function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const payload = body ? JSON.stringify(body) : null;
      const opts = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      };
      const req = http.request(opts, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          server.close();
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on("error", (err) => { server.close(); reject(err); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

// ── Shared ───────────────────────────────────────────────────────────────────
const VALID_KEY = "VIZO-ABCD-1234-EF56-7890";
const VALID_DEVICE = "device-abc123def456ghi";
const OTHER_DEVICE = "device-xyz789uvw012stu";
const FUTURE = new Date(Date.now() + 86400 * 365 * 1000).toISOString();
const PAST = new Date(Date.now() - 86400 * 1000).toISOString();

function resetAll() {
  for (const key of Object.keys(mockStmts)) {
    const s = mockStmts[key];
    if (s.get && s.get.mock) s.get.mock.resetCalls();
    if (s.run && s.run.mock) s.run.mock.resetCalls();
  }
  mockOutline.deleteAccessKey.mock.resetCalls();
}

// ═════════════════════════════════════════════════════════════════════════════
// TRANSFER SECURITY TESTS
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /transfer — security", () => {
  beforeEach(resetAll);

  it("rejects transfer when current_device_id does not match license binding", async () => {
    const license = {
      id: 1, key: VALID_KEY, status: "active",
      expires_at: FUTURE, device_id: VALID_DEVICE,
      outline_key_id: "5", vpn_node_id: null,
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);

    const app = makeApp();
    const res = await request(app, "POST", "/transfer", {
      key: VALID_KEY,
      device_id: "newdevice-0000000000000000",
      current_device_id: OTHER_DEVICE, // wrong device
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /match/i);
    // Outline key must NOT be deleted
    assert.equal(mockOutline.deleteAccessKey.mock.calls.length, 0);
  });

  it("rejects transfer for suspended license", async () => {
    const license = {
      id: 2, key: VALID_KEY, status: "suspended",
      expires_at: FUTURE, device_id: VALID_DEVICE,
      outline_key_id: "5", vpn_node_id: null,
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);

    const app = makeApp();
    const res = await request(app, "POST", "/transfer", {
      key: VALID_KEY,
      device_id: "newdevice-0000000000000000",
      current_device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /not active/i);
  });

  it("rejects transfer for expired license", async () => {
    const license = {
      id: 3, key: VALID_KEY, status: "expired",
      expires_at: PAST, device_id: VALID_DEVICE,
      outline_key_id: "5", vpn_node_id: null,
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);

    const app = makeApp();
    const res = await request(app, "POST", "/transfer", {
      key: VALID_KEY,
      device_id: "newdevice-0000000000000000",
      current_device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /not active/i);
  });

  it("successful transfer deletes old Outline key and clears DB", async () => {
    const license = {
      id: 4, key: VALID_KEY, status: "active",
      expires_at: FUTURE, device_id: VALID_DEVICE,
      outline_key_id: "99", outline_access_key: "ss://old",
      vpn_node_id: null,
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);
    mockStmts.transferDevice.run.mock.mockImplementation(() => ({ changes: 1 }));
    mockStmts.clearOutlineKey.run.mock.mockImplementation(() => {});
    mockStmts.insertAudit.run.mock.mockImplementation(() => {});
    mockOutline.deleteAccessKey.mock.mockImplementation(async () => null);

    const app = makeApp();
    const res = await request(app, "POST", "/transfer", {
      key: VALID_KEY,
      device_id: "newdevice-0000000000000000",
      current_device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    // Outline key deleted
    assert.equal(mockOutline.deleteAccessKey.mock.calls.length, 1);
    assert.equal(mockOutline.deleteAccessKey.mock.calls[0].arguments[0], "99");
    // DB cleared
    assert.equal(mockStmts.clearOutlineKey.run.mock.calls.length, 1);
    // Audit logged
    assert.equal(mockStmts.insertAudit.run.mock.calls.length, 1);
  });

  it("transfer continues if Outline delete fails — DB still cleared", async () => {
    const license = {
      id: 5, key: VALID_KEY, status: "active",
      expires_at: FUTURE, device_id: VALID_DEVICE,
      outline_key_id: "101", outline_access_key: "ss://torevoke",
      vpn_node_id: null,
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);
    mockStmts.transferDevice.run.mock.mockImplementation(() => ({ changes: 1 }));
    mockStmts.clearOutlineKey.run.mock.mockImplementation(() => {});
    mockStmts.insertAudit.run.mock.mockImplementation(() => {});
    // Outline delete throws
    mockOutline.deleteAccessKey.mock.mockImplementation(async () => {
      throw new Error("Outline unreachable");
    });

    const app = makeApp();
    const res = await request(app, "POST", "/transfer", {
      key: VALID_KEY,
      device_id: "newdevice-0000000000000000",
      current_device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 200);
    // DB still cleared even though Outline failed
    assert.equal(mockStmts.clearOutlineKey.run.mock.calls.length, 1);
  });

  it("skips Outline delete when no key exists (pending or null)", async () => {
    const license = {
      id: 6, key: VALID_KEY, status: "active",
      expires_at: FUTURE, device_id: VALID_DEVICE,
      outline_key_id: null, outline_access_key: null,
      vpn_node_id: null,
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);
    mockStmts.transferDevice.run.mock.mockImplementation(() => ({ changes: 1 }));
    mockStmts.insertAudit.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, "POST", "/transfer", {
      key: VALID_KEY,
      device_id: "newdevice-0000000000000000",
      current_device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 200);
    assert.equal(mockOutline.deleteAccessKey.mock.calls.length, 0);
    assert.equal(mockStmts.clearOutlineKey.run.mock.calls.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INPUT VALIDATION / INJECTION TESTS
// ═════════════════════════════════════════════════════════════════════════════
describe("Input validation — injection prevention", () => {
  beforeEach(resetAll);

  it("rejects key with SQL injection attempt", async () => {
    const app = makeApp();
    const res = await request(app, "POST", "/", {
      key: "VIZO-'; DROP TABLE licenses;--",
      device_id: VALID_DEVICE,
    });
    assert.equal(res.status, 400);
  });

  it("rejects key with XSS payload", async () => {
    const app = makeApp();
    const res = await request(app, "POST", "/", {
      key: '<script>alert("xss")</script>',
      device_id: VALID_DEVICE,
    });
    assert.equal(res.status, 400);
  });

  it("rejects device_id with shell injection", async () => {
    const app = makeApp();
    const res = await request(app, "POST", "/", {
      key: VALID_KEY,
      device_id: "$(rm -rf /)",
    });
    assert.equal(res.status, 400);
  });

  it("rejects device_id that is too short", async () => {
    const app = makeApp();
    const res = await request(app, "POST", "/", {
      key: VALID_KEY,
      device_id: "abc",
    });
    assert.equal(res.status, 400);
  });

  it("rejects transfer with non-string fields", async () => {
    const app = makeApp();
    const res = await request(app, "POST", "/transfer", {
      key: 12345,
      device_id: VALID_DEVICE,
      current_device_id: VALID_DEVICE,
    });
    assert.equal(res.status, 400);
  });

  it("rejects transfer with shell metacharacters in device_id", async () => {
    const app = makeApp();
    const res = await request(app, "POST", "/transfer", {
      key: VALID_KEY,
      device_id: "device; rm -rf /",
      current_device_id: VALID_DEVICE,
    });
    assert.equal(res.status, 400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LICENSE STATUS BOUNDARY TESTS
// ═════════════════════════════════════════════════════════════════════════════
describe("License status enforcement", () => {
  beforeEach(resetAll);

  it("cancelled license before expiry → valid:true (allowed to use until period ends)", async () => {
    const license = {
      id: 10, key: VALID_KEY, status: "cancelled",
      expires_at: FUTURE, device_id: VALID_DEVICE,
      plan: "vpn", email: "test@example.com",
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);
    mockStmts.updateLastCheck.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, "POST", "/", {
      key: VALID_KEY, device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
  });

  it("cancelled license after expiry → 403 expired", async () => {
    const license = {
      id: 11, key: VALID_KEY, status: "cancelled",
      expires_at: PAST, device_id: VALID_DEVICE,
      plan: "vpn", email: "test@example.com",
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);

    const app = makeApp();
    const res = await request(app, "POST", "/", {
      key: VALID_KEY, device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.valid, false);
  });

  it("active license with far-future expiry → valid", async () => {
    const farFuture = new Date(Date.now() + 86400 * 365 * 5 * 1000).toISOString();
    const license = {
      id: 12, key: VALID_KEY, status: "active",
      expires_at: farFuture, device_id: VALID_DEVICE,
      plan: "security_vpn", email: "test@example.com",
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);
    mockStmts.updateLastCheck.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, "POST", "/", {
      key: VALID_KEY, device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
    assert.equal(res.body.status, "active");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TOCTOU — webhook changes status between initial check and re-fetch
// ═════════════════════════════════════════════════════════════════════════════
describe("TOCTOU — status change during binding", () => {
  beforeEach(resetAll);

  it("returns 403 if status becomes suspended between checks", async () => {
    let callCount = 0;
    mockStmts.findByKey.get.mock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: active, unbound
        return {
          id: 40, key: VALID_KEY, status: "active",
          expires_at: FUTURE, device_id: null,
          plan: "vpn", email: "test@example.com",
        };
      }
      // Second call (re-fetch): webhook changed to suspended
      return {
        id: 40, key: VALID_KEY, status: "suspended",
        expires_at: FUTURE, device_id: VALID_DEVICE,
        plan: "vpn", email: "test@example.com",
      };
    });
    mockStmts.bindDevice.run.mock.mockImplementation(() => ({ changes: 1 }));

    const app = makeApp();
    const res = await request(app, "POST", "/", {
      key: VALID_KEY, device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.valid, false);
    assert.equal(res.body.status, "suspended");
  });

  it("returns 403 if license expires between checks", async () => {
    let callCount = 0;
    mockStmts.findByKey.get.mock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          id: 41, key: VALID_KEY, status: "active",
          expires_at: FUTURE, device_id: VALID_DEVICE,
          plan: "vpn", email: "test@example.com",
        };
      }
      // Re-fetch: expiry moved to past (webhook updated)
      return {
        id: 41, key: VALID_KEY, status: "active",
        expires_at: PAST, device_id: VALID_DEVICE,
        plan: "vpn", email: "test@example.com",
      };
    });
    mockStmts.updateLastCheck.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, "POST", "/", {
      key: VALID_KEY, device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.valid, false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TRANSFER COOLDOWN TESTS
// ═════════════════════════════════════════════════════════════════════════════
describe("Transfer cooldown — anti-sharing", () => {
  beforeEach(resetAll);

  it("rejects transfer within 3-day cooldown period", async () => {
    const recentTransfer = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
    const license = {
      id: 20, key: VALID_KEY, status: "active",
      expires_at: FUTURE, device_id: VALID_DEVICE,
      outline_key_id: "5", vpn_node_id: null,
      last_transfer_at: recentTransfer,
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);

    const app = makeApp();
    const res = await request(app, "POST", "/transfer", {
      key: VALID_KEY,
      device_id: "newdevice-0000000000000000",
      current_device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 429);
    assert.match(res.body.error, /cooldown/i);
    // Transfer should NOT proceed
    assert.equal(mockStmts.transferDevice.run.mock.calls.length, 0);
  });

  it("allows transfer after cooldown period", async () => {
    const oldTransfer = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(); // 4 days ago
    const license = {
      id: 21, key: VALID_KEY, status: "active",
      expires_at: FUTURE, device_id: VALID_DEVICE,
      outline_key_id: null, outline_access_key: null,
      vpn_node_id: null,
      last_transfer_at: oldTransfer,
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);
    mockStmts.transferDevice.run.mock.mockImplementation(() => ({ changes: 1 }));
    mockStmts.insertAudit.run.mock.mockImplementation(() => {});
    mockStmts.setTransferTime.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, "POST", "/transfer", {
      key: VALID_KEY,
      device_id: "newdevice-0000000000000000",
      current_device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    // setTransferTime should be called
    assert.equal(mockStmts.setTransferTime.run.mock.calls.length, 1);
  });

  it("allows first-ever transfer (no last_transfer_at)", async () => {
    const license = {
      id: 22, key: VALID_KEY, status: "active",
      expires_at: FUTURE, device_id: VALID_DEVICE,
      outline_key_id: null, outline_access_key: null,
      vpn_node_id: null,
      last_transfer_at: null,
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);
    mockStmts.transferDevice.run.mock.mockImplementation(() => ({ changes: 1 }));
    mockStmts.insertAudit.run.mock.mockImplementation(() => {});
    mockStmts.setTransferTime.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, "POST", "/transfer", {
      key: VALID_KEY,
      device_id: "newdevice-0000000000000000",
      current_device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEVICE TRACKING TESTS
// ═════════════════════════════════════════════════════════════════════════════
describe("Device tracking on validation", () => {
  beforeEach(resetAll);

  it("upsertDevice called on successful validation", async () => {
    const license = {
      id: 30, key: VALID_KEY, status: "active",
      expires_at: FUTURE, device_id: VALID_DEVICE,
      plan: "vpn", email: "test@example.com",
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);
    mockStmts.updateLastCheck.run.mock.mockImplementation(() => {});
    mockStmts.upsertDevice.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, "POST", "/", {
      key: VALID_KEY, device_id: VALID_DEVICE,
    });

    assert.equal(res.status, 200);
    assert.equal(mockStmts.upsertDevice.run.mock.calls.length, 1);
    const args = mockStmts.upsertDevice.run.mock.calls[0].arguments;
    assert.equal(args[0], VALID_DEVICE); // device_id
    assert.equal(args[1], 30);           // license_id
  });

  it("validation succeeds even if upsertDevice throws", async () => {
    const license = {
      id: 31, key: VALID_KEY, status: "active",
      expires_at: FUTURE, device_id: VALID_DEVICE,
      plan: "vpn", email: "test@example.com",
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);
    mockStmts.updateLastCheck.run.mock.mockImplementation(() => {});
    mockStmts.upsertDevice.run.mock.mockImplementation(() => {
      throw new Error("DB constraint violation");
    });

    const app = makeApp();
    const res = await request(app, "POST", "/", {
      key: VALID_KEY, device_id: VALID_DEVICE,
    });

    // Validation still succeeds — device tracking is non-critical
    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
  });
});
