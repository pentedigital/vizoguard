# Phase 4: Backend Tests + Prometheus Metrics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~40 unit tests for critical backend paths + app-level Prometheus metrics with Grafana dashboard.

**Architecture:** Tests use `node:test` (built-in) + `node:assert/strict` with mocked externals (Stripe, Outline, SMTP). Metrics use `prom-client` with Express middleware + Prometheus scrape target + Grafana provisioning.

**Tech Stack:** Node.js `node:test`, `node:assert/strict`, `prom-client`, Prometheus, Grafana

**Spec:** `docs/superpowers/specs/2026-03-21-phase4-tests-metrics-design.md`

---

## File Map

### New Files (Tests)
| File | Tests | Source |
|------|-------|--------|
| `server/routes/license.test.js` | 9 | `routes/license.js` |
| `server/routes/webhook.test.js` | 11 | `routes/webhook.js` |
| `server/routes/vpn.test.js` | 10 | `routes/vpn.js` |
| `server/outline.test.js` | 6 | `outline.js` |
| `server/app.test.js` | 4 | `app.js` checkout route |

### New Files (Metrics)
| File | Purpose |
|------|---------|
| `server/metrics.js` | prom-client registry, metric definitions, HTTP middleware |

### Modified Files
| File | Change |
|------|--------|
| `server/package.json` | Add `prom-client`, add `test` script |
| `server/app.js` | Add metrics middleware + `/metrics` endpoint |
| `server/routes/webhook.js` | Increment webhook counter |
| `server/routes/license.js` | Increment license validation counter |
| `server/routes/vpn.js` | Increment VPN key counter |
| `/etc/nginx/sites-available/vizoguard` | Block external `/metrics` access |
| `/opt/outline/persisted-state/prometheus/config.yml` | Add vizoguard-api scrape target |

---

## Tasks

### Task 1: Install prom-client + add test script to package.json

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install prom-client**

```bash
cd /root/vizoguard/server && npm install prom-client
```

- [ ] **Step 2: Add test script**

Add to `scripts` in package.json:
```json
"test": "node --test **/*.test.js"
```

- [ ] **Step 3: Verify**

```bash
node -e "require('prom-client'); console.log('OK')"
```

- [ ] **Step 4: Commit**

```bash
cd /root/vizoguard && git add server/package.json server/package-lock.json
git commit -m "chore: install prom-client, add test script"
```

---

### Task 2: Create metrics.js module

**Files:**
- Create: `server/metrics.js`

- [ ] **Step 1: Create the metrics module**

Read the spec section on metrics. Create `server/metrics.js` with:

```javascript
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
```

- [ ] **Step 2: Verify module loads**

```bash
cd /root/vizoguard/server && node -e "require('./metrics'); console.log('OK')"
```

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard && git add server/metrics.js
git commit -m "feat: add prom-client metrics module with HTTP + business counters"
```

---

### Task 3: Wire metrics into app.js + add /metrics endpoint

**Files:**
- Modify: `server/app.js`

- [ ] **Step 1: Read app.js, then add metrics**

Add after the `require` statements at the top of `app.js`:
```javascript
const { register, metricsMiddleware, stripeCheckoutTotal } = require('./metrics');
```

Add the metrics middleware BEFORE the request logging middleware:
```javascript
app.use(metricsMiddleware);
```

Add the `/metrics` endpoint BEFORE the health check:
```javascript
// Prometheus metrics endpoint (blocked externally by nginx)
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

In the checkout route, after `res.json({ url: session.url })`, add:
```javascript
stripeCheckoutTotal.inc({ plan });
```

- [ ] **Step 2: Add business metric increments to routes**

In `server/routes/license.js`, add at top:
```javascript
const { licenseValidationsTotal } = require('../metrics');
```

Then increment at each return point:
- After successful validation: `licenseValidationsTotal.inc({ result: 'valid' });`
- After expired: `licenseValidationsTotal.inc({ result: 'expired' });`
- After suspended: `licenseValidationsTotal.inc({ result: 'suspended' });`
- After not found/invalid: `licenseValidationsTotal.inc({ result: 'invalid' });`

In `server/routes/vpn.js`, add at top:
```javascript
const { vpnKeysCreatedTotal } = require('../metrics');
```

After successful VPN key creation: `vpnKeysCreatedTotal.inc({ plan: license.plan });`

In `server/routes/webhook.js`, add at top:
```javascript
const { webhookEventsTotal } = require('../metrics');
```

After each event handler: `webhookEventsTotal.inc({ event_type: event.type, result: 'success' });`
In catch blocks: `webhookEventsTotal.inc({ event_type: event.type, result: 'error' });`

- [ ] **Step 3: Test metrics endpoint locally**

```bash
cd /root/vizoguard/server && node -e "
const app = require('./app');
// If app.listen is at module level, just check the metrics module loads
const { register } = require('./metrics');
register.metrics().then(m => { console.log(m.substring(0, 200)); process.exit(0); });
"
```

- [ ] **Step 4: Commit**

```bash
cd /root/vizoguard && git add server/app.js server/routes/license.js server/routes/vpn.js server/routes/webhook.js server/metrics.js
git commit -m "feat: wire Prometheus metrics into API routes + /metrics endpoint"
```

---

### Task 4: Write license.test.js (9 tests)

**Files:**
- Create: `server/routes/license.test.js`

- [ ] **Step 1: Create the test file**

Read `server/routes/license.js` fully. Create `server/routes/license.test.js` with 9 tests using `node:test` + `node:assert/strict`. Mock `stmts` (findByKey, bindDevice, updateLastCheck, findBySubscription, findByCustomer) and `stripe.checkout.sessions.retrieve`.

Tests:
1. Valid key + no device → binds device, returns `{valid: true}`
2. Valid key + same device → returns `{valid: true}`
3. Valid key + different device → 403 device_mismatch
4. Status `expired` → 403
5. Status `active` but `expires_at` in past → 403
6. Status `suspended` → 403
7. Invalid key format / missing fields → 400
8. Nonexistent key → 404
9. `GET /lookup?session_id=cs_xxx` → returns license data

Use Express test pattern: create a minimal Express app with the router mounted, use `http` to send requests.

- [ ] **Step 2: Run tests**

```bash
cd /root/vizoguard/server && node --test routes/license.test.js
```
Expected: All 9 pass

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard && git add server/routes/license.test.js
git commit -m "test: add 9 license route tests (binding, expiry, device mismatch)"
```

---

### Task 5: Write webhook.test.js (11 tests)

**Files:**
- Create: `server/routes/webhook.test.js`

- [ ] **Step 1: Create the test file**

Read `server/routes/webhook.js` fully. Create 11 tests. Mock `stripe.webhooks.constructEvent`, `db.stmts.*`, `outline.*`, `email.sendLicenseEmail`.

Tests:
1. `checkout.session.completed` → creates license, returns 200
2. `checkout.session.completed` → idempotent (duplicate sub_id → skip)
3. `checkout.session.completed` → early response before Outline
4. `invoice.payment_succeeded` → updates expiry, reactivates suspended
5. `invoice.payment_failed` → suspends, revokes Outline key
6. `customer.subscription.deleted` → expires, revokes key
7. `customer.subscription.updated` → handles cancel_at_period_end, past_due, unpaid, active
8. `customer.subscription.updated` → unhandled status → no crash
9. Invalid event type → returns 200
10. Invalid Stripe signature → returns 400
11. Outline failure → rolls back pending claim

- [ ] **Step 2: Run tests**

```bash
cd /root/vizoguard/server && node --test routes/webhook.test.js
```
Expected: All 11 pass

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard && git add server/routes/webhook.test.js
git commit -m "test: add 11 webhook route tests (5 event types, idempotency, rollback)"
```

---

### Task 6: Write vpn.test.js (10 tests)

**Files:**
- Create: `server/routes/vpn.test.js`

- [ ] **Step 1: Create the test file**

Read `server/routes/vpn.js` fully. Create 10 tests. Mock `db.stmts.*`, `outline.*`.

Tests:
1. `POST /create` → provisions key, returns `{access_url}`
2. `POST /create` → idempotent (key exists → returns existing)
3. `POST /create` → CAS race (claim fails, no completed key → 409 "provisioning in progress")
4. `POST /create` → Outline failure → rollback pending
5. `POST /create` → device_id mismatch → 403
6. `POST /get` → returns access URL
7. `POST /get` → wrong device → 403
8. `POST /delete` → revokes key
9. `GET /status` → returns `{status: "online"}`
10. `requireVpnLicense` → rejects expired, rejects unbound security_vpn

- [ ] **Step 2: Run tests**

```bash
cd /root/vizoguard/server && node --test routes/vpn.test.js
```
Expected: All 10 pass

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard && git add server/routes/vpn.test.js
git commit -m "test: add 10 VPN route tests (CAS, idempotency, device mismatch, middleware)"
```

---

### Task 7: Write outline.test.js (6 tests)

**Files:**
- Create: `server/outline.test.js`

- [ ] **Step 1: Create the test file**

Read `server/outline.js`. Create 6 tests. Mock `https.request`.

Tests:
1. `createAccessKey` → returns `{id, accessUrl}`
2. `deleteAccessKey` → valid numeric ID succeeds
3. `deleteAccessKey` → non-numeric ID throws
4. `setDataLimit` → calls correct endpoint
5. Timeout → rejects after 10s
6. No API URL → throws immediately

- [ ] **Step 2: Run tests**

```bash
cd /root/vizoguard/server && node --test outline.test.js
```
Expected: All 6 pass

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard && git add server/outline.test.js
git commit -m "test: add 6 outline client tests (create, delete, timeout, validation)"
```

---

### Task 8: Write app.test.js (4 tests)

**Files:**
- Create: `server/app.test.js`

- [ ] **Step 1: Create the test file**

Read the checkout route in `server/app.js` (lines 67-99). Create 4 tests. Mock `stripe.checkout.sessions.create`.

Tests:
1. Valid plan `vpn` → creates session, returns `{url}`
2. Valid plan `security_vpn` → creates session with correct price
3. Invalid/missing plan → 400
4. Discount expiry — when `LAUNCH_DISCOUNT_END` is in the past, uses regular price IDs (`STRIPE_PRICE_VPN_REGULAR`, `STRIPE_PRICE_SECURITY_VPN_REGULAR`)

- [ ] **Step 2: Run tests**

```bash
cd /root/vizoguard/server && node --test app.test.js
```
Expected: All 4 pass

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard && git add server/app.test.js
git commit -m "test: add 4 checkout route tests (valid plans, invalid plan, missing plan)"
```

---

### Task 9: Configure Prometheus scrape target + block /metrics externally

**Files:**
- Modify: `/opt/outline/persisted-state/prometheus/config.yml`
- Modify: `/etc/nginx/sites-available/vizoguard`

- [ ] **Step 1: Add Prometheus scrape target**

Add to `/opt/outline/persisted-state/prometheus/config.yml` at the end of `scrape_configs`:

```yaml
- job_name: vizoguard-api
  scrape_interval: 15s
  static_configs:
  - targets:
    - 127.0.0.1:3000
  metrics_path: /metrics
```

- [ ] **Step 2: Block external /metrics access in nginx**

Add to `/etc/nginx/sites-available/vizoguard` BEFORE the `location /api/` block:

```nginx
    # Block external access to Prometheus metrics
    location /metrics {
        deny all;
        return 404;
    }
```

- [ ] **Step 3: Reload Prometheus and nginx**

```bash
# Prometheus picks up config changes automatically, but can force:
kill -HUP $(pgrep prometheus) 2>/dev/null || true
nginx -t && systemctl reload nginx
```

- [ ] **Step 4: Verify Prometheus scrapes successfully**

```bash
# Wait a few seconds, then check
sleep 10 && curl -sf 'http://localhost:9090/api/v1/targets' | python3 -c "import json,sys; targets=json.load(sys.stdin)['data']['activeTargets']; [print(t['labels']['job'], t['health']) for t in targets]"
```
Expected: `vizoguard-api up`

- [ ] **Step 5: Commit**

```bash
cd /root/vizoguard && git add /etc/nginx/sites-available/vizoguard
git commit -m "infra: add Prometheus scrape target for API, block external /metrics"
```

---

### Task 10: Provision Grafana datasource + dashboard

**Files:**
- Create: Grafana provisioning files

- [ ] **Step 1: Create Prometheus datasource provisioning**

```bash
cat > /tmp/prometheus-ds.yaml << 'EOF'
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://host.docker.internal:9090
    isDefault: true
    editable: false
EOF

docker cp /tmp/prometheus-ds.yaml grafana:/etc/grafana/provisioning/datasources/prometheus.yaml
docker restart grafana
```

- [ ] **Step 2: Verify datasource**

```bash
sleep 5 && curl -sf -u admin:admin 'http://localhost:3001/api/datasources' | python3 -c "import json,sys; ds=json.load(sys.stdin); [print(d['name'], d['type']) for d in ds]"
```
Expected: `Prometheus prometheus`

- [ ] **Step 3: Create API dashboard via Grafana API**

```bash
curl -sf -u admin:admin -X POST 'http://localhost:3001/api/dashboards/db' \
  -H 'Content-Type: application/json' \
  -d '{
  "dashboard": {
    "title": "Vizoguard API",
    "panels": [
      {"title":"Request Rate","type":"timeseries","gridPos":{"h":8,"w":12,"x":0,"y":0},"targets":[{"expr":"rate(http_requests_total[5m])","legendFormat":"{{method}} {{route}} {{status}}"}]},
      {"title":"Response Time (p95)","type":"timeseries","gridPos":{"h":8,"w":12,"x":12,"y":0},"targets":[{"expr":"histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))","legendFormat":"p95"}]},
      {"title":"Webhook Events","type":"timeseries","gridPos":{"h":8,"w":12,"x":0,"y":8},"targets":[{"expr":"rate(webhook_events_total[5m])","legendFormat":"{{event_type}} {{result}}"}]},
      {"title":"License Validations","type":"stat","gridPos":{"h":8,"w":6,"x":12,"y":8},"targets":[{"expr":"sum(license_validations_total) by (result)","legendFormat":"{{result}}"}]},
      {"title":"VPN Keys Created","type":"stat","gridPos":{"h":8,"w":6,"x":18,"y":8},"targets":[{"expr":"sum(vpn_keys_created_total) by (plan)","legendFormat":"{{plan}}"}]}
    ],
    "refresh":"30s",
    "time":{"from":"now-1h","to":"now"}
  },
  "overwrite": true
}'
```

- [ ] **Step 4: Verify dashboard exists**

```bash
curl -sf -u admin:admin 'http://localhost:3001/api/search?type=dash-db' | python3 -c "import json,sys; [print(d['title']) for d in json.load(sys.stdin)]"
```
Expected: `Vizoguard API`

- [ ] **Step 5: Commit** (Grafana config is Docker-only, no repo files to stage)

```bash
cd /root/vizoguard && git commit --allow-empty -m "infra: provision Grafana Prometheus datasource + API dashboard"
```

---

### Task 11: Reload API, run full test suite, final verification

- [ ] **Step 1: Reload PM2 to pick up metrics changes**

```bash
cd /root/vizoguard && pm2 reload vizoguard-api
```

- [ ] **Step 2: Run full test suite**

```bash
cd /root/vizoguard/server && node --test **/*.test.js
```
Expected: ~40 tests, all pass

- [ ] **Step 3: Verify /metrics endpoint**

```bash
curl -sf http://localhost:3000/metrics | head -20
```
Expected: Prometheus format output with `http_requests_total`, `nodejs_*` metrics

- [ ] **Step 4: Verify external /metrics is blocked**

```bash
curl -sf -o /dev/null -w '%{http_code}' https://vizoguard.com/metrics
```
Expected: 404

- [ ] **Step 5: Verify Prometheus target is up**

```bash
curl -sf 'http://localhost:9090/api/v1/targets' | python3 -c "
import json,sys
targets = json.load(sys.stdin)['data']['activeTargets']
for t in targets:
    if t['labels']['job'] == 'vizoguard-api':
        print(f\"vizoguard-api: {t['health']}\")
"
```
Expected: `vizoguard-api: up`

- [ ] **Step 6: Update CLAUDE.md**

Add to relevant sections:
```
- Backend tests: `node --test server/**/*.test.js` (~40 tests across 5 files: license, webhook, vpn, outline, app)
- Metrics: `prom-client` on `/metrics` endpoint (blocked externally by nginx), scraped by Prometheus every 15s
- Grafana: Prometheus datasource provisioned at `host.docker.internal:9090`
```

- [ ] **Step 7: Commit and push**

```bash
cd /root/vizoguard && git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Phase 4 test + metrics inventory"
git push origin main
```
