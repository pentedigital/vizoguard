'use strict';

const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// ── Mock stripe before requiring the route ──────────────────────────────────
// stripe(key) returns an object; we mock the constructor to return a
// controllable instance.
const mockStripeSession = { retrieve: mock.fn() };
const mockStripe = mock.fn(() => ({
  checkout: { sessions: mockStripeSession },
}));
require.cache[require.resolve('stripe')] = {
  id: require.resolve('stripe'),
  filename: require.resolve('stripe'),
  loaded: true,
  exports: mockStripe,
};

// ── Mock db before requiring the route ─────────────────────────────────────
const mockStmts = {
  findByKey:          { get: mock.fn() },
  bindDevice:         { run: mock.fn() },
  updateLastCheck:    { run: mock.fn() },
  findBySubscription: { get: mock.fn() },
  findByCustomer:     { get: mock.fn() },
};
const dbModulePath = require.resolve('../db');
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { stmts: mockStmts },
};

// ── Now load the route (deps already cached as mocks) ───────────────────────
const express  = require('express');
const router   = require('./license');

// ── Minimal Express app helper ───────────────────────────────────────────────
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/', router);
  return app;
}

// ── HTTP helper (no extra dep — uses built-in http) ─────────────────────────
const http = require('http');

function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const payload = body ? JSON.stringify(body) : null;
      const opts = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

// ── Reset all mock call histories before each test ──────────────────────────
function resetMocks() {
  mockStmts.findByKey.get.mock.resetCalls();
  mockStmts.bindDevice.run.mock.resetCalls();
  mockStmts.updateLastCheck.run.mock.resetCalls();
  mockStmts.findBySubscription.get.mock.resetCalls();
  mockStmts.findByCustomer.get.mock.resetCalls();
  mockStripeSession.retrieve.mock.resetCalls();
}

// ── Shared valid inputs ──────────────────────────────────────────────────────
const VALID_KEY       = 'VIZO-ABCD-1234-EF56-7890';
const VALID_DEVICE_ID = 'device-abc123def456ghi';

// Future expiry date
const FUTURE_DATE = new Date(Date.now() + 86400 * 365 * 1000).toISOString();
// Past expiry date
const PAST_DATE   = new Date(Date.now() - 86400 * 1000).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/license', () => {

  beforeEach(resetMocks);

  // ── Test 1: valid key, no device bound → binds device, returns valid:true ──
  it('valid key + no device bound → binds device and returns {valid:true}', async () => {
    const license = {
      id: 1, key: VALID_KEY, status: 'active',
      expires_at: FUTURE_DATE, device_id: null, plan: 'security_vpn',
      email: 'test@example.com',
    };
    // findByKey called twice: initial lookup + re-fetch after bind
    mockStmts.findByKey.get.mock.mockImplementation(() => license);
    mockStmts.bindDevice.run.mock.mockImplementation(() => ({ changes: 1 }));
    mockStmts.updateLastCheck.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, 'POST', '/', { key: VALID_KEY, device_id: VALID_DEVICE_ID });

    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
    assert.equal(mockStmts.bindDevice.run.mock.calls.length, 1);
    const [boundDeviceId, licenseId] = mockStmts.bindDevice.run.mock.calls[0].arguments;
    assert.equal(boundDeviceId, VALID_DEVICE_ID);
    assert.equal(licenseId, 1);
  });

  // ── Test 2: valid key + same device already bound → valid:true, no rebind ─
  it('valid key + same device already bound → returns {valid:true} without rebinding', async () => {
    const license = {
      id: 2, key: VALID_KEY, status: 'active',
      expires_at: FUTURE_DATE, device_id: VALID_DEVICE_ID, plan: 'security_vpn',
      email: 'test@example.com',
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);
    mockStmts.updateLastCheck.run.mock.mockImplementation(() => {});

    const app = makeApp();
    const res = await request(app, 'POST', '/', { key: VALID_KEY, device_id: VALID_DEVICE_ID });

    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
    // bindDevice must NOT be called when device already matches
    assert.equal(mockStmts.bindDevice.run.mock.calls.length, 0);
  });

  // ── Test 3: valid key + different device → 403 device_mismatch ─────────────
  it('valid key + different device bound → returns 403 with device_mismatch', async () => {
    const license = {
      id: 3, key: VALID_KEY, status: 'active',
      expires_at: FUTURE_DATE, device_id: 'other-device-aaabbbcccddd111',
      plan: 'security_vpn', email: 'test@example.com',
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);

    const app = makeApp();
    const res = await request(app, 'POST', '/', { key: VALID_KEY, device_id: VALID_DEVICE_ID });

    assert.equal(res.status, 403);
    assert.equal(res.body.valid, false);
    assert.equal(res.body.status, 'device_mismatch');
  });

  // ── Test 4: status "expired" → 403 ─────────────────────────────────────────
  it('license with status "expired" → returns 403', async () => {
    const license = {
      id: 4, key: VALID_KEY, status: 'expired',
      expires_at: PAST_DATE, device_id: null, plan: 'security_vpn',
      email: 'test@example.com',
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);

    const app = makeApp();
    const res = await request(app, 'POST', '/', { key: VALID_KEY, device_id: VALID_DEVICE_ID });

    assert.equal(res.status, 403);
    assert.equal(res.body.valid, false);
    assert.equal(res.body.status, 'expired');
  });

  // ── Test 5: status "active" but expires_at in past → 403 ───────────────────
  it('status "active" but expires_at in past → returns 403 (date-based expiry)', async () => {
    const license = {
      id: 5, key: VALID_KEY, status: 'active',
      expires_at: PAST_DATE, device_id: null, plan: 'security_vpn',
      email: 'test@example.com',
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);

    const app = makeApp();
    const res = await request(app, 'POST', '/', { key: VALID_KEY, device_id: VALID_DEVICE_ID });

    assert.equal(res.status, 403);
    assert.equal(res.body.valid, false);
    assert.equal(res.body.status, 'expired');
  });

  // ── Test 6: status "suspended" → 403 ───────────────────────────────────────
  it('license with status "suspended" → returns 403', async () => {
    const license = {
      id: 6, key: VALID_KEY, status: 'suspended',
      expires_at: FUTURE_DATE, device_id: null, plan: 'security_vpn',
      email: 'test@example.com',
    };
    mockStmts.findByKey.get.mock.mockImplementation(() => license);

    const app = makeApp();
    const res = await request(app, 'POST', '/', { key: VALID_KEY, device_id: VALID_DEVICE_ID });

    assert.equal(res.status, 403);
    assert.equal(res.body.valid, false);
    assert.equal(res.body.status, 'suspended');
  });

  // ── Test 7: invalid/missing fields → 400 ───────────────────────────────────
  it('missing key or device_id → returns 400', async () => {
    const app = makeApp();

    // Missing device_id
    const res1 = await request(app, 'POST', '/', { key: VALID_KEY });
    assert.equal(res1.status, 400);
    assert.equal(res1.body.valid, false);

    // Missing key
    const res2 = await request(app, 'POST', '/', { device_id: VALID_DEVICE_ID });
    assert.equal(res2.status, 400);
    assert.equal(res2.body.valid, false);

    // Both missing
    const res3 = await request(app, 'POST', '/', {});
    assert.equal(res3.status, 400);
    assert.equal(res3.body.valid, false);

    // findByKey should never be called for invalid input
    assert.equal(mockStmts.findByKey.get.mock.calls.length, 0);
  });

  // ── Test 8: nonexistent key → 404 ──────────────────────────────────────────
  it('nonexistent key → returns 404', async () => {
    mockStmts.findByKey.get.mock.mockImplementation(() => null);

    const app = makeApp();
    const res = await request(app, 'POST', '/', { key: VALID_KEY, device_id: VALID_DEVICE_ID });

    assert.equal(res.status, 404);
    assert.equal(res.body.valid, false);
    assert.match(res.body.error, /not found/i);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /lookup', () => {

  beforeEach(resetMocks);

  // ── Test 9: GET /lookup?session_id=cs_xxx → returns license data ──────────
  it('GET /lookup with valid paid session → returns license key/email/plan/expires', async () => {
    const fakeLicense = {
      id: 9, key: 'TEST-KEY-FOR-LOOKUP-1234',
      email: 'user@example.com', plan: 'security_vpn',
      expires_at: FUTURE_DATE,
    };

    mockStripeSession.retrieve.mock.mockImplementation(async () => ({
      payment_status: 'paid',
      subscription: 'sub_test123',
      customer: 'cus_test456',
    }));

    mockStmts.findBySubscription.get.mock.mockImplementation(() => fakeLicense);

    const app = makeApp();
    const res = await request(app, 'GET', '/lookup?session_id=cs_test_valid_session', null);

    assert.equal(res.status, 200);
    // Key and email are masked for security — full key sent via email
    assert.equal(res.body.key,   'TEST-****-****-****-1234');
    assert.equal(res.body.email, 'u***@example.com');
    assert.equal(res.body.plan,  fakeLicense.plan);
    assert.equal(res.body.expires, fakeLicense.expires_at);
    assert.equal(mockStripeSession.retrieve.mock.calls.length, 1);
    assert.equal(mockStripeSession.retrieve.mock.calls[0].arguments[0], 'cs_test_valid_session');
  });

});
