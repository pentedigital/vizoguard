const client = require('prom-client');

// Use default registry
const register = client.register;

// Collect default Node.js metrics (CPU, memory, event loop, GC)
client.collectDefaultMetrics({ register });

// HTTP metrics
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// Business metrics
const licenseValidationsTotal = new client.Counter({
  name: 'license_validations_total',
  help: 'License validation outcomes',
  labelNames: ['result'],
});

const vpnKeysCreatedTotal = new client.Counter({
  name: 'vpn_keys_created_total',
  help: 'VPN keys provisioned',
  labelNames: ['plan'],
});

const webhookEventsTotal = new client.Counter({
  name: 'webhook_events_total',
  help: 'Stripe webhook events processed',
  labelNames: ['event_type', 'result'],
});

const stripeCheckoutTotal = new client.Counter({
  name: 'stripe_checkout_sessions_total',
  help: 'Stripe checkout sessions created',
  labelNames: ['plan'],
});

// Outline API metrics
const outlineApiDuration = new client.Histogram({
  name: 'outline_api_duration_seconds',
  help: 'Outline API call duration in seconds',
  labelNames: ['method', 'operation'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const outlineApiTotal = new client.Counter({
  name: 'outline_api_calls_total',
  help: 'Outline API calls',
  labelNames: ['operation', 'result'],
});

// Email metrics
const emailSendsTotal = new client.Counter({
  name: 'email_sends_total',
  help: 'Email send attempts',
  labelNames: ['result'],
});

// License/key drift gauges — detect orphaned Outline keys
const activeLicensesGauge = new client.Gauge({
  name: 'active_licenses',
  help: 'Licenses with valid status and future expiry',
  collect() {
    try {
      const { stmts } = require('./db');
      const row = stmts.countActiveLicenses.get();
      this.set(row ? row.count : 0);
    } catch { this.set(0); }
  },
});

const activeOutlineKeysGauge = new client.Gauge({
  name: 'active_outline_keys',
  help: 'Licenses with a provisioned Outline key in DB',
  collect() {
    try {
      const { stmts } = require('./db');
      const row = stmts.countActiveOutlineKeys.get();
      this.set(row ? row.count : 0);
    } catch { this.set(0); }
  },
});

const stalePendingClaimsGauge = new client.Gauge({
  name: 'stale_pending_claims',
  help: 'Licenses stuck in outline_key_id=pending for more than 5 minutes',
  collect() {
    try {
      const { stmts } = require('./db');
      const row = stmts.countStalePendingClaims.get();
      this.set(row ? row.count : 0);
    } catch { this.set(0); }
  },
});

const emailRetryQueueDepth = new client.Gauge({
  name: 'email_retry_queue_depth',
  help: 'Number of emails pending retry (attempts < 3)',
  collect() {
    try {
      const { stmts } = require('./db');
      const row = stmts.countPendingEmailRetries.get();
      this.set(row ? row.count : 0);
    } catch { this.set(0); }
  },
});

// Middleware to track HTTP requests
function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const route = req.route ? req.route.path : 'unmatched';
    const normalizedRoute = route.replace(/\?.*$/, '');
    httpRequestsTotal.inc({ method: req.method, route: normalizedRoute, status: res.statusCode });
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequestDuration.observe({ method: req.method, route: normalizedRoute }, duration);
  });
  next();
}

module.exports = {
  register,
  metricsMiddleware,
  licenseValidationsTotal,
  vpnKeysCreatedTotal,
  webhookEventsTotal,
  stripeCheckoutTotal,
  outlineApiDuration,
  outlineApiTotal,
  emailSendsTotal,
};
