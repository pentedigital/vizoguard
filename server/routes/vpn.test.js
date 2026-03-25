"use strict";

const { describe, it, before, afterEach } = require("node:test");
const assert = require("node:assert/strict");

// ─── Module mocks ────────────────────────────────────────────────────────────
// Must be set up before requiring vpn.js (which requires db and outline at
// module-load time).  We replace the module cache entries so that vpn.js picks
// up our fakes.

// Fake stmts – each property is overwritten per-test as needed.
const stmts = {
  findByKey: { get: () => null },
  claimOutlineSlot: { run: () => ({ changes: 1 }) },
  resetStalePending: { run: () => {} },
  setOutlineKey: { run: () => {} },
  setLicenseNode: { run: () => {} },
  clearOutlineKey: { run: () => {} },
  resetOutlineClaim: { run: () => {} },
  findNodeById: { get: () => null },
  bestNode: { get: () => null },
  listActiveNodes: { all: () => [] },
};

// Fake metrics module — vpn.js uses vpnKeysCreatedTotal.inc()
require.cache[require.resolve("../metrics")] = {
  id: require.resolve("../metrics"),
  filename: require.resolve("../metrics"),
  loaded: true,
  exports: {
    vpnKeysCreatedTotal: { inc: () => {} },
    httpRequestsTotal: { inc: () => {} },
    httpRequestDuration: { observe: () => {} },
    licenseValidationsTotal: { inc: () => {} },
    webhookEventsTotal: { inc: () => {} },
    stripeCheckoutTotal: { inc: () => {} },
    register: {},
    metricsMiddleware: (_req, _res, next) => next(),
  },
};

// Inject fake db module before vpn.js is loaded
require.cache[require.resolve("../db")] = {
  id: require.resolve("../db"),
  filename: require.resolve("../db"),
  loaded: true,
  exports: { db: {}, stmts },
};

// Fake outline module
const outline = {
  createAccessKey: async () => ({ id: "42", accessUrl: "ss://fakekeyurl" }),
  deleteAccessKey: async () => null,
  setDataLimit: async () => null,
  getServer: async () => ({ name: "test-server" }),
};

require.cache[require.resolve("../outline")] = {
  id: require.resolve("../outline"),
  filename: require.resolve("../outline"),
  loaded: true,
  exports: outline,
};

// Now load the router (it will use our injected modules)
const vpnRouter = require("./vpn");

// ─── Mini Express-compatible test harness ────────────────────────────────────
function makeReqRes(body = {}, params = {}) {
  const req = { body, params, license: undefined };
  const res = {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(data) { this._body = data; return this; },
  };
  return { req, res };
}

/**
 * Find a layer in the router's stack by method + path and run it.
 * Runs all middleware in order (requireVpnLicense, then the handler).
 */
async function callRoute(method, path, req, res) {
  const layers = vpnRouter.stack.filter(
    (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
  );
  if (layers.length === 0) throw new Error(`Route ${method} ${path} not found`);

  const handlers = layers[0].route.stack.map((s) => s.handle);

  let i = 0;
  function next(err) {
    if (err) { res._status = 500; res._body = { error: String(err) }; return; }
    const handler = handlers[i++];
    if (!handler) return;
    try {
      const ret = handler(req, res, next);
      if (ret && typeof ret.catch === "function") ret.catch((e) => next(e));
    } catch (e) {
      next(e);
    }
  }
  next();
  // Drain async work — a few ticks of the event loop is enough for any
  // single-hop async (Promise, setImmediate) handler.
  await new Promise((r) => setTimeout(r, 20));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function activeLicense(overrides = {}) {
  return {
    id: 1,
    key: "VIZO-ABCD-1234-EF56-7890",
    email: "test@example.com",
    plan: "vpn",
    status: "active",
    expires_at: new Date(Date.now() + 86400 * 1000).toISOString(), // tomorrow
    device_id: "test-device-1234567890",
    outline_access_key: null,
    outline_key_id: null,
    vpn_node_id: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /create", () => {
  it("1. provisions key — outline.createAccessKey called, returns access_url", async () => {
    let createCalled = false;
    outline.createAccessKey = async () => { createCalled = true; return { id: "1", accessUrl: "ss://newkey" }; };
    outline.setDataLimit = async () => null;
    stmts.claimOutlineSlot.run = () => ({ changes: 1 });
    stmts.setOutlineKey.run = () => {};
    stmts.setLicenseNode.run = () => {};
    stmts.listActiveNodes.all = () => [];
    stmts.bestNode.get = () => null;
    stmts.resetOutlineClaim = { run: () => {} };

    const license = activeLicense();
    stmts.findByKey.get = () => license;

    const { req, res } = makeReqRes({ key: license.key, device_id: license.device_id });
    await callRoute("post", "/create", req, res);

    assert.equal(res._status, 200);
    assert.equal(res._body.access_url, "ss://newkey");
    assert.ok(createCalled, "outline.createAccessKey must be called");
  });

  it("2. idempotent — existing key (not pending) returned without calling outline", async () => {
    let createCalled = false;
    outline.createAccessKey = async () => { createCalled = true; return { id: "2", accessUrl: "ss://shouldnotappear" }; };

    const license = activeLicense({ outline_access_key: "ss://existingkey", outline_key_id: "5" });
    stmts.findByKey.get = () => license;

    const { req, res } = makeReqRes({ key: license.key, device_id: license.device_id });
    await callRoute("post", "/create", req, res);

    assert.equal(res._status, 200);
    assert.equal(res._body.access_url, "ss://existingkey");
    assert.ok(!createCalled, "outline.createAccessKey must NOT be called for existing key");
  });

  it("3. CAS race — claim fails and no completed key available → 409", async () => {
    // First call returns the license (middleware), second call (after CAS fail) also
    // returns the same license but still without a completed key.
    const license = activeLicense();
    let callCount = 0;
    stmts.findByKey.get = () => { callCount++; return license; };
    stmts.claimOutlineSlot.run = () => ({ changes: 0 }); // CAS fails

    const { req, res } = makeReqRes({ key: license.key, device_id: license.device_id });
    await callRoute("post", "/create", req, res);

    assert.equal(res._status, 409);
    assert.ok(res._body.error.toLowerCase().includes("progress"), "should say provisioning in progress");
  });

  it("4. Outline failure — resetOutlineClaim called to roll back pending sentinel", async () => {
    let resetCalled = false;
    outline.createAccessKey = async () => { throw new Error("Outline network error"); };
    outline.setDataLimit = async () => null;
    stmts.claimOutlineSlot.run = () => ({ changes: 1 });
    stmts.resetOutlineClaim = { run: () => { resetCalled = true; } };
    stmts.listActiveNodes.all = () => [];
    stmts.bestNode.get = () => null;

    const license = activeLicense();
    stmts.findByKey.get = () => license;

    const { req, res } = makeReqRes({ key: license.key, device_id: license.device_id });
    await callRoute("post", "/create", req, res);

    assert.equal(res._status, 500);
    assert.ok(resetCalled, "resetOutlineClaim must be called on Outline failure");
  });

  it("5. device mismatch — license.device_id set, different device_id in request → 403", async () => {
    const license = activeLicense({ device_id: "device-AAAAAAAAAAAAAAAAAA" });
    stmts.findByKey.get = () => license;

    const { req, res } = makeReqRes({ key: license.key, device_id: "device-BBBBBBBBBBBBBBBBBB" });
    await callRoute("post", "/create", req, res);

    assert.equal(res._status, 403);
    assert.ok(res._body.error.toLowerCase().includes("mismatch"), "error should mention mismatch");
  });
});

describe("POST /get", () => {
  it("6. returns access URL for correct device", async () => {
    const license = activeLicense({
      device_id: "device-CORRECT0000000000",
      outline_access_key: "ss://correctkey",
      outline_key_id: "7",
    });
    stmts.findByKey.get = () => license;

    const { req, res } = makeReqRes({ key: license.key, device_id: "device-CORRECT0000000000" });
    await callRoute("post", "/get", req, res);

    assert.equal(res._status, 200);
    assert.equal(res._body.access_url, "ss://correctkey");
  });

  it("7. wrong device → 403", async () => {
    const license = activeLicense({
      device_id: "device-OWNER000000000000",
      outline_access_key: "ss://secretkey",
    });
    stmts.findByKey.get = () => license;

    const { req, res } = makeReqRes({ key: license.key, device_id: "device-ATTACKER00000000" });
    await callRoute("post", "/get", req, res);

    assert.equal(res._status, 403);
    assert.ok(res._body.error.toLowerCase().includes("mismatch"));
  });
});

describe("POST /delete", () => {
  it("8. revokes key — outline.deleteAccessKey called, stmts.clearOutlineKey called", async () => {
    let deleteCalled = false;
    let clearCalled = false;
    outline.deleteAccessKey = async () => { deleteCalled = true; return null; };
    stmts.clearOutlineKey.run = () => { clearCalled = true; };
    stmts.listActiveNodes.all = () => [];
    stmts.bestNode.get = () => null;

    const license = activeLicense({ outline_access_key: "ss://torevoke", outline_key_id: "99" });
    stmts.findByKey.get = () => license;

    const { req, res } = makeReqRes({ key: license.key });
    await callRoute("post", "/delete", req, res);

    assert.equal(res._status, 200);
    assert.equal(res._body.success, true);
    assert.ok(deleteCalled, "outline.deleteAccessKey must be called");
    assert.ok(clearCalled, "stmts.clearOutlineKey must be called");
  });
});

describe("GET /status", () => {
  it("9. returns { status: 'online' } when outline.getServer resolves", async () => {
    outline.getServer = async () => ({ name: "main-server" });
    stmts.listActiveNodes.all = () => [{ id: 1, api_url: "https://vpn.example.com:12345/secret" }];

    // GET /status has no body; use empty body
    const { req, res } = makeReqRes({});

    const layers = vpnRouter.stack.filter(
      (l) => l.route && l.route.path === "/status" && l.route.methods["get"]
    );
    assert.ok(layers.length > 0, "GET /status route must exist");

    const handler = layers[0].route.stack[0].handle;
    await handler(req, res, (err) => { if (err) throw err; });
    // Drain async work
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(res._status, 200);
    assert.equal(res._body.status, "online");
  });
});

describe("requireVpnLicense middleware", () => {
  it("10a. rejects expired license → 403", async () => {
    const license = activeLicense({
      expires_at: new Date(Date.now() - 86400 * 1000).toISOString(), // yesterday
    });
    stmts.findByKey.get = () => license;

    const { req, res } = makeReqRes({ key: license.key });
    await callRoute("post", "/get", req, res);

    assert.equal(res._status, 403);
    assert.ok(res._body.error.toLowerCase().includes("expired"));
  });

  it("10b. rejects security_vpn license with no device_id bound → 403", async () => {
    const license = activeLicense({
      plan: "security_vpn",
      device_id: null, // not yet bound
    });
    stmts.findByKey.get = () => license;

    const { req, res } = makeReqRes({ key: license.key });
    await callRoute("post", "/get", req, res);

    assert.equal(res._status, 403);
    assert.ok(
      res._body.error.toLowerCase().includes("desktop") ||
      res._body.error.toLowerCase().includes("bind") ||
      res._body.error.toLowerCase().includes("device"),
      "error should mention device binding"
    );
  });
});
