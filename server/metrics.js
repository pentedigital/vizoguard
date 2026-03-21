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

// Middleware to track HTTP requests
function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
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
};
