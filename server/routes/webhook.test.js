"use strict";

/**
 * Webhook route unit tests — 11 tests
 * Node v20: mock.module not available, so we inject mocks via require.cache
 * before loading webhook.js.
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");

// ---------------------------------------------------------------------------
// Mock state — mutated per-test
// ---------------------------------------------------------------------------

const mockConstructEvent = { impl: null };

const mockStmts = {
  findBySubscription: { get: null },
  findByCustomer:     { get: null },
  findByKey:          { get: null },
  bestNode:           { get: null },
  insert:             { run: null },
  updateExpiry:       { run: null },
  updateStatus:       { run: null },
  setOutlineKey:      { run: null },
  setLicenseNode:     { run: null },
  clearOutlineKey:    { run: null },
  resetOutlineClaim:  { run: null },
  findNodeById:       { get: null },
};

const mockOutline = {
  createAccessKey: null,
  setDataLimit:    null,
  deleteAccessKey: null,
};

const mockEmail = {
  sendLicenseEmail: null,
};

// Tracking calls
const calls = {
  constructEvent:    [],
  insert:            [],
  findBySubscription:[],
  findByCustomer:    [],
  findByKey:         [],
  bestNode:          [],
  updateExpiry:      [],
  updateStatus:      [],
  setOutlineKey:     [],
  setLicenseNode:    [],
  clearOutlineKey:   [],
  resetOutlineClaim: [],
  findNodeById:      [],
  createAccessKey:   [],
  setDataLimit:      [],
  deleteAccessKey:   [],
  sendLicenseEmail:  [],
};

function resetCalls() {
  Object.keys(calls).forEach((k) => (calls[k] = []));
}

// ---------------------------------------------------------------------------
// Inject mocks into require.cache before webhook.js is loaded
// ---------------------------------------------------------------------------

function makeFakeModule(id, exports) {
  const m = new Module(id);
  m.exports = exports;
  m.loaded = true;
  require.cache[id] = m;
}

// stripe — webhook.js does: require("stripe")(process.env.STRIPE_SECRET_KEY)
const stripeModId = require.resolve("stripe");
makeFakeModule(stripeModId, function stripeFactory() {
  return {
    webhooks: {
      constructEvent(...args) {
        calls.constructEvent.push(args);
        return mockConstructEvent.impl(...args);
      },
    },
  };
});

// ../db — resolved as webhook.js sees it (from server/routes/ looking at server/db.js)
const dbModId = require.resolve("../db", { paths: [__dirname] });
// Build proxy objects so mutations to mockStmts propagate
const stmtsProxy = {};
[
  "findBySubscription", "findByCustomer", "findByKey", "bestNode",
  "insert", "updateExpiry", "updateStatus", "setOutlineKey", "setLicenseNode",
  "clearOutlineKey", "resetOutlineClaim", "findNodeById",
].forEach((name) => {
  stmtsProxy[name] = {
    get: (...args) => { calls[name].push(args); return mockStmts[name].get(...args); },
    run: (...args) => { calls[name].push(args); return mockStmts[name].run(...args); },
  };
});
makeFakeModule(dbModId, { stmts: stmtsProxy, db: {} });

// ../outline
const outlineModId = require.resolve("../outline", { paths: [__dirname] });
makeFakeModule(outlineModId, {
  createAccessKey: (...args) => { calls.createAccessKey.push(args); return mockOutline.createAccessKey(...args); },
  setDataLimit:    (...args) => { calls.setDataLimit.push(args);    return mockOutline.setDataLimit(...args); },
  deleteAccessKey: (...args) => { calls.deleteAccessKey.push(args); return mockOutline.deleteAccessKey(...args); },
});

// ../email
const emailModId = require.resolve("../email", { paths: [__dirname] });
makeFakeModule(emailModId, {
  sendLicenseEmail: (...args) => { calls.sendLicenseEmail.push(args); return mockEmail.sendLicenseEmail(...args); },
});

// Now load webhook.js (mocks already in cache)
const webhookRouter = require("./webhook");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(sig = "valid-sig") {
  return {
    headers: { "stripe-signature": sig },
    body: Buffer.from("{}"),
  };
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    headersSent: false,
    status(code) { this._status = code; return this; },
    json(body)   { this._body = body; this.headersSent = true; return this; },
    send(body)   { this._body = body; this.headersSent = true; return this; },
  };
  return res;
}

// Invoke the route handler directly (skip express.raw() middleware)
async function invoke(req, res) {
  const layer = webhookRouter.stack.find((l) => l.route);
  const handlers = layer.route.stack.map((s) => s.handle);
  await handlers[handlers.length - 1](req, res, () => {});
}

function resetAll() {
  resetCalls();

  // Defaults
  mockConstructEvent.impl = () => { throw new Error("not set"); };

  mockStmts.findBySubscription.get = () => null;
  mockStmts.findByCustomer.get     = () => null;
  mockStmts.findByKey.get          = () => ({ id: 1, outline_key_id: null, vpn_node_id: null });
  mockStmts.bestNode.get           = () => null;
  mockStmts.insert.run             = () => ({ lastInsertRowid: 1 });
  mockStmts.updateExpiry.run       = () => ({ changes: 1 });
  mockStmts.updateStatus.run       = () => ({ changes: 1 });
  mockStmts.setOutlineKey.run      = () => ({});
  mockStmts.setLicenseNode.run     = () => ({});
  mockStmts.clearOutlineKey.run    = () => ({});
  mockStmts.resetOutlineClaim.run  = () => ({});
  mockStmts.findNodeById.get       = () => null;

  mockOutline.createAccessKey = async () => ({ id: "42", accessUrl: "ss://fake" });
  mockOutline.setDataLimit    = async () => null;
  mockOutline.deleteAccessKey = async () => null;

  mockEmail.sendLicenseEmail = async () => null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /webhook", () => {
  beforeEach(() => resetAll());

  // 1. checkout.session.completed → creates license (stmts.insert called), returns 200
  it("checkout.session.completed → creates license and returns 200", async () => {
    mockConstructEvent.impl = () => ({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          customer_details: { email: "user@example.com" },
          customer: "cus_1",
          subscription: "sub_1",
          metadata: { plan: "vpn" },
        },
      },
    });

    const res = makeRes();
    await invoke(makeReq(), res);

    assert.equal(res._status, 200);
    assert.deepEqual(res._body, { received: true });
    assert.equal(calls.insert.length, 1, "stmts.insert.run should be called once");
    const arg = calls.insert[0][0];
    assert.equal(arg.email, "user@example.com");
    assert.equal(arg.plan, "vpn");
    assert.equal(arg.subscription, "sub_1");
  });

  // 2. checkout.session.completed idempotent → duplicate subscription_id → skips, returns 200
  it("checkout.session.completed idempotent → duplicate subscription skips insert, returns 200", async () => {
    mockConstructEvent.impl = () => ({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_2",
          customer_details: { email: "user@example.com" },
          customer: "cus_2",
          subscription: "sub_existing",
          metadata: { plan: "vpn" },
        },
      },
    });
    mockStmts.findBySubscription.get = () => ({ id: 99, key: "VIZO-EXISTING" });

    const res = makeRes();
    await invoke(makeReq(), res);

    assert.equal(res._status, 200);
    assert.deepEqual(res._body, { received: true });
    assert.equal(calls.insert.length, 0, "stmts.insert.run must NOT be called");
  });

  // 3. checkout.session.completed early response → res.json called before outline.createAccessKey
  it("checkout.session.completed → res.json called before outline.createAccessKey", async () => {
    const order = [];

    mockConstructEvent.impl = () => ({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_3",
          customer_details: { email: "early@example.com" },
          customer: "cus_3",
          subscription: "sub_3",
          metadata: { plan: "vpn" },
        },
      },
    });

    mockOutline.createAccessKey = async () => {
      order.push("outline.createAccessKey");
      return { id: "7", accessUrl: "ss://url" };
    };

    const req = makeReq();
    const res = makeRes();
    const origJson = res.json.bind(res);
    res.json = function (body) {
      order.push("res.json");
      return origJson(body);
    };

    await invoke(req, res);

    const jsonIdx    = order.indexOf("res.json");
    const outlineIdx = order.indexOf("outline.createAccessKey");
    assert.ok(jsonIdx !== -1,    "res.json must be called");
    assert.ok(outlineIdx !== -1, "outline.createAccessKey must be called");
    assert.ok(
      jsonIdx < outlineIdx,
      `res.json (pos ${jsonIdx}) must precede outline.createAccessKey (pos ${outlineIdx})`
    );
  });

  // 4. invoice.payment_succeeded → updates expiry, reactivates suspended
  it("invoice.payment_succeeded → updates expiry and reactivates license", async () => {
    const periodEnd = 1800000000; // ~2027
    mockConstructEvent.impl = () => ({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          subscription: "sub_renew",
          billing_reason: "subscription_cycle",
          lines: { data: [{ period: { end: periodEnd } }] },
        },
      },
    });

    const res = makeRes();
    await invoke(makeReq(), res);

    assert.equal(res._status, 200);
    assert.equal(calls.updateExpiry.length, 1, "updateExpiry should be called");
    const [expiryIso, subId] = calls.updateExpiry[0];
    assert.equal(subId, "sub_renew");
    assert.ok(expiryIso.startsWith("2027"), `expected 2027 expiry, got ${expiryIso}`);

    assert.equal(calls.updateStatus.length, 1, "updateStatus should be called");
    assert.equal(calls.updateStatus[0][0], "active");
    assert.equal(calls.updateStatus[0][1], "sub_renew");
  });

  // 5. invoice.payment_failed → sets status suspended, revokes Outline key
  it("invoice.payment_failed → suspends license and revokes Outline key", async () => {
    mockConstructEvent.impl = () => ({
      type: "invoice.payment_failed",
      data: { object: { subscription: "sub_fail" } },
    });
    mockStmts.findBySubscription.get = () => ({
      id: 5,
      outline_key_id: "99",
      vpn_node_id: null,
    });

    const res = makeRes();
    await invoke(makeReq(), res);

    assert.equal(res._status, 200);
    assert.equal(calls.updateStatus[0][0], "suspended");
    assert.equal(calls.deleteAccessKey.length, 1, "deleteAccessKey must be called");
    assert.equal(calls.deleteAccessKey[0][0], "99");
    assert.equal(calls.clearOutlineKey.length, 1, "clearOutlineKey must be called");
  });

  // 6. customer.subscription.deleted → sets status expired, revokes key
  it("customer.subscription.deleted → expires license and revokes Outline key", async () => {
    mockConstructEvent.impl = () => ({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_del" } },
    });
    mockStmts.findBySubscription.get = () => ({
      id: 8,
      outline_key_id: "55",
      vpn_node_id: null,
    });

    const res = makeRes();
    await invoke(makeReq(), res);

    assert.equal(res._status, 200);
    assert.equal(calls.updateStatus[0][0], "expired");
    assert.equal(calls.deleteAccessKey.length, 1);
    assert.equal(calls.deleteAccessKey[0][0], "55");
    assert.equal(calls.clearOutlineKey.length, 1);
  });

  // 7. customer.subscription.updated → handles cancel_at_period_end, past_due, unpaid, active
  it("customer.subscription.updated → maps all status transitions correctly", async () => {
    async function runUpdated(subObj) {
      resetAll();
      mockConstructEvent.impl = () => ({
        type: "customer.subscription.updated",
        data: { object: subObj },
      });
      await invoke(makeReq(), makeRes());
      return calls.updateStatus[0] ? calls.updateStatus[0][0] : null;
    }

    assert.equal(
      await runUpdated({ id: "s1", cancel_at_period_end: true,  status: "active" }),
      "cancelled",
      "cancel_at_period_end should map to cancelled"
    );
    assert.equal(
      await runUpdated({ id: "s2", cancel_at_period_end: false, status: "active" }),
      "active",
      "active status should map to active"
    );
    assert.equal(
      await runUpdated({ id: "s3", cancel_at_period_end: false, status: "past_due" }),
      "suspended",
      "past_due should map to suspended"
    );
    assert.equal(
      await runUpdated({ id: "s4", cancel_at_period_end: false, status: "unpaid" }),
      "suspended",
      "unpaid should map to suspended"
    );
  });

  // 8. customer.subscription.updated → unhandled status → no crash, returns 200
  it("customer.subscription.updated → unhandled status does not crash, returns 200", async () => {
    mockConstructEvent.impl = () => ({
      type: "customer.subscription.updated",
      data: {
        object: { id: "sub_tri", cancel_at_period_end: false, status: "trialing" },
      },
    });

    const res = makeRes();
    await invoke(makeReq(), res);

    assert.equal(res._status, 200);
    assert.deepEqual(res._body, { received: true });
    assert.equal(calls.updateStatus.length, 0, "updateStatus must not be called for unhandled status");
  });

  // 9. Invalid event type → returns 200 (don't trigger Stripe retries)
  it("unknown event type → returns 200 without crashing", async () => {
    mockConstructEvent.impl = () => ({
      type: "payment_intent.created",
      data: { object: {} },
    });

    const res = makeRes();
    await invoke(makeReq(), res);

    assert.equal(res._status, 200);
    assert.deepEqual(res._body, { received: true });
  });

  // 10. Invalid Stripe signature → returns 400
  it("invalid Stripe signature → returns 400", async () => {
    mockConstructEvent.impl = () => {
      throw new Error("No signatures found matching the expected signature for payload");
    };

    const res = makeRes();
    await invoke(makeReq("bad-sig"), res);

    assert.equal(res._status, 400);
  });

  // 11. Outline provisioning failure → rolls back pending claim (resetOutlineClaim called)
  it("Outline provisioning failure → resetOutlineClaim called to roll back", async () => {
    mockConstructEvent.impl = () => ({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_err",
          customer_details: { email: "fail@example.com" },
          customer: "cus_err",
          subscription: "sub_err",
          metadata: { plan: "vpn" },
        },
      },
    });
    mockStmts.findByKey.get = () => ({ id: 77, outline_key_id: null, vpn_node_id: null });
    mockOutline.createAccessKey = async () => {
      throw new Error("Outline server unreachable");
    };

    const res = makeRes();
    await invoke(makeReq(), res);

    // Already responded 200 before outline attempt
    assert.equal(res._status, 200);
    assert.deepEqual(res._body, { received: true });

    assert.equal(
      calls.resetOutlineClaim.length,
      1,
      "resetOutlineClaim must be called to roll back pending claim"
    );
    assert.equal(calls.resetOutlineClaim[0][0], 77);
  });
});
