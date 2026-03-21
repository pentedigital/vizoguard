'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// --- Mock state ---
let mockCreateFn;

// --- Set required env vars BEFORE requiring app.js ---
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock';
process.env.STRIPE_PRICE_VPN = 'price_vpn_discount';
process.env.STRIPE_PRICE_SECURITY_VPN = 'price_security_vpn_discount';
process.env.STRIPE_PRICE_VPN_REGULAR = 'price_vpn_regular';
process.env.STRIPE_PRICE_SECURITY_VPN_REGULAR = 'price_security_vpn_regular';
process.env.OUTLINE_API_URL = 'https://mock-outline:12345/mock';
process.env.APP_URL = 'https://vizoguard.com';
// Discount active (future date)
process.env.LAUNCH_DISCOUNT_END = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

// --- Inject mock stripe into require cache BEFORE app.js loads ---
const stripeModulePath = require.resolve('stripe');
require.cache[stripeModulePath] = {
  id: stripeModulePath,
  filename: stripeModulePath,
  loaded: true,
  exports: function mockStripe(_key) {
    return {
      checkout: {
        sessions: {
          create: (...args) => mockCreateFn(...args),
        },
      },
      webhooks: {
        constructEvent: () => { throw new Error('mock webhook'); },
      },
    };
  },
};

// --- Load the app (with mocked stripe and env vars already set) ---
const expressApp = require('./app.js');

// --- Helper: make an HTTP POST request to a running server ---
function post(server, urlPath, body) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const port = addr.port;
    const data = JSON.stringify(body);
    const options = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// --- Helper: start a server and return it after it's listening ---
function startServer(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
}

// --- Helper: close a server ---
function closeServer(s) {
  return new Promise((resolve) => s.close(resolve));
}

describe('POST /api/checkout', () => {
  let server;

  before(async () => {
    server = await startServer(expressApp);
  });

  after(async () => {
    await closeServer(server);
  });

  it('valid plan "vpn" → creates session with discount VPN price and returns {url}', async () => {
    mockCreateFn = async (opts) => {
      assert.equal(opts.line_items[0].price, 'price_vpn_discount', 'should use discount VPN price');
      assert.equal(opts.metadata.plan, 'vpn');
      assert.equal(opts.mode, 'subscription');
      return { url: 'https://checkout.stripe.com/test' };
    };

    const res = await post(server, '/api/checkout', { plan: 'vpn' });
    assert.equal(res.status, 200);
    assert.equal(res.body.url, 'https://checkout.stripe.com/test');
  });

  it('valid plan "security_vpn" → creates session with Pro price and returns {url}', async () => {
    mockCreateFn = async (opts) => {
      assert.equal(opts.line_items[0].price, 'price_security_vpn_discount', 'should use Pro price');
      assert.equal(opts.metadata.plan, 'security_vpn');
      return { url: 'https://checkout.stripe.com/test' };
    };

    const res = await post(server, '/api/checkout', { plan: 'security_vpn' });
    assert.equal(res.status, 200);
    assert.equal(res.body.url, 'https://checkout.stripe.com/test');
  });

  it('invalid/missing plan → returns 400 with {error: "Invalid plan"}', async () => {
    mockCreateFn = async () => {
      throw new Error('stripe.checkout.sessions.create should not be called for invalid plan');
    };

    const res1 = await post(server, '/api/checkout', { plan: 'unknown_plan' });
    assert.equal(res1.status, 400);
    assert.equal(res1.body.error, 'Invalid plan');

    const res2 = await post(server, '/api/checkout', {});
    assert.equal(res2.status, 400);
    assert.equal(res2.body.error, 'Invalid plan');
  });

  it('discount expiry → when LAUNCH_DISCOUNT_END is in the past, uses STRIPE_PRICE_VPN_REGULAR', async () => {
    // app.js reads LAUNCH_DISCOUNT_END at require-time, so we need a fresh module instance.
    const appModulePath = require.resolve('./app.js');

    // Override env to simulate expired discount
    process.env.LAUNCH_DISCOUNT_END = '2000-01-01T00:00:00.000Z';
    process.env.STRIPE_PRICE_VPN_REGULAR = 'price_vpn_regular';

    // Reload app module with new env
    delete require.cache[appModulePath];
    const expiredApp = require('./app.js');

    let capturedPrice;
    mockCreateFn = async (opts) => {
      capturedPrice = opts.line_items[0].price;
      return { url: 'https://checkout.stripe.com/test' };
    };

    const expiredServer = await startServer(expiredApp);
    try {
      const res = await post(expiredServer, '/api/checkout', { plan: 'vpn' });
      assert.equal(res.status, 200);
      assert.equal(capturedPrice, 'price_vpn_regular',
        'should use regular (non-discount) price after discount expiry');
    } finally {
      await closeServer(expiredServer);
      // Restore env and reload original app module
      process.env.LAUNCH_DISCOUNT_END = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      delete require.cache[appModulePath];
      require('./app.js');
    }
  });
});
