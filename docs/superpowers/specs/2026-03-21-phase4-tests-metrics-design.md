# Phase 4: Backend Tests + Prometheus Metrics — Design Spec

**Date**: 2026-03-21
**Phase**: 4 of 4 (Traffic → Conversion → International → **Engineering**)
**Goal**: Add test coverage for critical backend paths + app-level Prometheus metrics for observability
**Deliverables**: ~40 unit tests across 5 test files + prom-client metrics endpoint + Grafana datasource

---

## 4-Phase Roadmap Context

| Phase | Focus | Goal | Status |
|-------|-------|------|--------|
| 1 | English SEO content | Traffic | Done |
| 2 | Conversion + authority pages | Revenue | Done |
| 3 | International SEO (6 languages) | Scale | Done |
| **4 (this spec)** | Backend tests + Prometheus metrics | Stability | |

---

## Workstream A: Backend Tests

### Framework

- **Test runner**: `node:test` (built-in, Node.js 18+, no install needed)
- **Assertions**: `node:assert/strict`
- **Mocking**: `node:test` built-in `mock` for Stripe, Outline, SMTP — never call real APIs
- **Test location**: colocated with source — `server/routes/license.test.js` alongside `license.js`
- **Run command**: `node --test server/**/*.test.js`

### Test Files

| File | Source | Lines | Tests | Priority |
|------|--------|-------|-------|----------|
| `server/routes/webhook.test.js` | `webhook.js` (245 lines) | 11 | 1 (HIGH) |
| `server/routes/license.test.js` | `license.js` (123 lines) | 9 | 1 (HIGH) |
| `server/routes/vpn.test.js` | `vpn.js` (170 lines) | 10 | 2 (HIGH) |
| `server/outline.test.js` | `outline.js` (90 lines) | 6 | 2 (HIGH) |
| `server/app.test.js` | `app.js` checkout route | 4 | 1 (HIGH) |

### Test Coverage

#### `webhook.test.js` — Stripe Webhook Handler

Test all 5 event types + edge cases:

1. `checkout.session.completed` — creates license, inserts into DB, returns 200
2. `checkout.session.completed` — idempotent (duplicate subscription_id → skip, return 200)
3. `checkout.session.completed` — responds early (before Outline provisioning)
4. `invoice.payment_succeeded` — updates expiry, reactivates suspended licenses
5. `invoice.payment_failed` — sets status to suspended, revokes Outline key
6. `customer.subscription.deleted` — sets status to expired, revokes Outline key
7. `customer.subscription.updated` — handles cancel_at_period_end, past_due, unpaid, active
8. `customer.subscription.updated` — unhandled status → logs warning, does not crash
9. Invalid/unknown event type — returns 200 (don't trigger Stripe retries)
10. Invalid Stripe signature — returns 400
11. Outline provisioning failure — rolls back `pending` claim, verifies `resetOutlineClaim` called

**Mocking**: Mock `stripe.webhooks.constructEvent`, `db.stmts.*`, `outline.*`, `email.sendLicenseEmail`

#### `license.test.js` — License Validation & Binding

1. Valid key + no device bound → binds device, returns `{valid: true}`
2. Valid key + already bound to same device → returns `{valid: true}`
3. Valid key + bound to different device → returns 403
4. Expired license (status=expired) → returns 403 with `{valid: false, status: 'expired'}`
5. Expired license (date-based: status=active but expires_at in past) → returns 403
6. Suspended license → returns 403 with `{valid: false, status: 'suspended'}`
7. Invalid key format → returns 400
8. Nonexistent key → returns 404
9. `GET /api/license/lookup?session_id=` — retrieves license by Stripe session

**Mocking**: Mock `db.stmts.*`, `stripe.checkout.sessions.retrieve`

#### `vpn.test.js` — VPN Key Management

1. `POST /api/vpn/create` — provisions Outline key, returns `{access_url}`
2. `POST /api/vpn/create` — idempotent (key already exists and not pending → returns existing key)
3. `POST /api/vpn/create` — CAS claim prevents race condition (already claimed → 409)
4. `POST /api/vpn/create` — Outline failure rolls back pending claim
5. `POST /api/vpn/create` — device_id mismatch in create handler → 403
6. `POST /api/vpn/get` — returns access URL for bound device
7. `POST /api/vpn/get` — wrong device_id → 403
8. `POST /api/vpn/delete` — revokes key, clears DB record
9. `GET /api/vpn/status` — returns `{status: "online"}` when healthy
10. `requireVpnLicense` middleware — rejects expired, invalid plan, unbound device (security_vpn only)

**Mocking**: Mock `db.stmts.*`, `outline.*`

#### `outline.test.js` — Outline VPN API Client

1. `createAccessKey` — returns key ID and access URL
2. `deleteAccessKey` — calls correct endpoint, validates key ID format
3. `deleteAccessKey` — rejects non-numeric key ID
4. `setDataLimit` — sets bandwidth limit
5. Timeout handling — rejects after 10 seconds
6. No API URL configured — throws error immediately

**Mocking**: Mock `https.request` or `fetch`

### Test Conventions

Per the existing `test-writer` subagent spec:
- `node:test` with `describe/it` blocks
- `node:assert/strict` for assertions
- Mock Stripe, Outline, vizoguard.com APIs (never real calls)
- No shared mutable state between tests
- Test edge cases: empty inputs, boundary conditions, malformed data
- Descriptive test names

#### `app.test.js` — Checkout Route (in app.js)

The `POST /api/checkout` route in `app.js` contains ~30 lines of revenue-critical logic:

1. Valid plan (`vpn`) → creates Stripe checkout session, returns session URL
2. Valid plan (`security_vpn`) → creates Stripe checkout session with correct price
3. Invalid/missing plan → returns 400
4. Discount expiry logic — after April 4 2026, uses regular prices

**Mocking**: Mock `stripe.checkout.sessions.create`

### Not Testing (Lower Priority, Defer)

- `db.js` — prepared statements are runtime-verified; integration testing only
- `email.js` — HTML/text template formatting; integration testing only
- `app.js` — middleware ordering; verified via e2e
- Rate limiters — per-process in-memory; nginx is authoritative

---

## Workstream B: Prometheus Metrics

### Package

Install `prom-client` (npm) in `server/`.

### Metrics to Expose

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `http_requests_total` | Counter | `method`, `route`, `status` | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | `method`, `route` | Request duration |
| `license_validations_total` | Counter | `result` (valid/expired/suspended/invalid) | License validation outcomes |
| `vpn_keys_created_total` | Counter | `plan` (vpn/security_vpn) | VPN keys provisioned |
| `webhook_events_total` | Counter | `event_type`, `result` (success/error) | Stripe webhook processing |
| `stripe_checkout_sessions_total` | Counter | `plan` | Checkout sessions created |

### Implementation

1. **New file**: `server/metrics.js` — creates and exports prom-client registry, metrics objects, and HTTP middleware
2. **Modify**: `server/app.js` — add metrics middleware (before routes), add `GET /metrics` endpoint
3. **Modify**: `server/routes/webhook.js` — increment `webhook_events_total` after processing each event
4. **Modify**: `server/routes/license.js` — increment `license_validations_total` on each validation
5. **Modify**: `server/routes/vpn.js` — increment `vpn_keys_created_total` on successful provisioning
6. **Modify**: `server/app.js` checkout route — increment `stripe_checkout_sessions_total`

### `/metrics` Endpoint

- Path: `GET /metrics`
- Response: Prometheus text format (Content-Type: `text/plain; version=0.0.4`)
- No rate limiting on `/metrics` (internal only, not exposed via nginx)
- Add to nginx: `location /metrics { deny all; }` to block external access

### Prometheus Configuration

Add scrape target to `/opt/outline/persisted-state/prometheus/config.yml`:

```yaml
- job_name: vizoguard-api
  static_configs:
  - targets:
    - 127.0.0.1:3000
  metrics_path: /metrics
  scrape_interval: 15s  # Intentionally faster than global 1m — API metrics need finer granularity than VPN metrics
```

### Grafana

- Add Prometheus datasource (`host.docker.internal:9090`, NOT `localhost` — Grafana runs in Docker) via provisioning YAML
- Create basic "Vizoguard API" dashboard with panels:
  - Request rate (requests/sec by route)
  - Response time (p50, p95, p99)
  - Webhook events (by type and result)
  - License validations (by result)
  - VPN keys created (rate)

---

## Package.json Updates

```json
{
  "scripts": {
    "start": "node app.js",
    "test": "node --test server/**/*.test.js"
  },
  "dependencies": {
    "prom-client": "^15.0.0"
  }
}
```

---

## Success Criteria

- All ~40 tests pass: `node --test server/**/*.test.js`
- No test calls real external APIs (Stripe, Outline, SMTP)
- `/metrics` endpoint returns valid Prometheus format
- Prometheus scrapes `vizoguard-api` target successfully
- Grafana shows API dashboard with live data
- `pm2 reload vizoguard-api` works without breaking metrics
- External access to `/metrics` blocked by nginx
