# VizoGuard Backend

## Stack
- Node.js server (`server/app.js` entry point)
- PM2 for process management (`ecosystem.config.js`)
- Routes: `server/routes/` — vpn, license, webhook
- Database: `server/db.js` — SQLite (better-sqlite3), WAL mode, at `data/vizoguard.db`
- Email: `server/email.js` — nodemailer via Hostinger SMTP
- Outline VPN: `server/outline.js` — manages access keys via Outline Server API (self-signed cert)
- Public site: `public/` — landing page, setup guide, privacy/terms

## Live Site
- https://vizoguard.com/ — landing page, setup guide, privacy/terms
- Pricing: Basic ($19.99/yr, VPN only) and Pro ($99.99/yr, VPN + threat detection)

## Database
- Single table: `licenses` (key, email, plan, stripe IDs, device_id, status, expires_at, outline keys)
- Plans: `vpn` (Basic) and `security_vpn` (Pro)
- Statuses: `active`, `cancelled`, `expired`, `suspended`

## Commands
- `cd server && node app.js` — start server (dev)
- `pm2 start ecosystem.config.js` — start in production
- `pm2 restart vizoguard-api` — restart after changes
- `pm2 logs vizoguard-api --lines 50` — view recent logs
- Production path: `/var/www/vizoguard/`
- Logs: `data/logs/error.log`, `data/logs/out.log`

## API Routes
- `POST /api/checkout` — create Stripe Checkout session (params: `plan`)
- `POST /api/license` — validate + bind device (params: `key`, `device_id`)
- `GET /api/license/lookup?session_id=` — retrieve license after checkout
- `POST /api/vpn/create` — create Outline access key (params: `key`)
- `POST /api/vpn/get` — retrieve existing VPN key (params: `key`)
- `POST /api/vpn/delete` — revoke VPN key (params: `key`)
- `GET /api/vpn/status` — Outline server health
- `GET /api/health` — API health check

## Stripe Integration
- Checkout: `POST /api/checkout` — creates Stripe Checkout session with plan metadata
- Webhook events handled: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`, `customer.subscription.updated`
- Webhook route MUST be before `express.json()` middleware (needs raw body for signature verification)

## Security Rules
- Never log license keys, VPN access URLs, or Stripe secrets
- Outline API uses `rejectUnauthorized: false` — scoped to self-signed Outline server only
- All API routes are rate-limited

## Environment
- Copy `server/.env.example` to `server/.env` before running
- Required env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_VPN`, `STRIPE_PRICE_SECURITY_VPN`, `SMTP_PASS`, `OUTLINE_API_URL`
- Optional: `PORT` (default 3000), `DB_PATH` (default `data/vizoguard.db`), `APP_URL` (default `https://vizoguard.com`)
- Server host: srv1450871 (187.77.131.31), Ubuntu
- Git credentials stored in `/root/.git-credentials`
- `gh` CLI must be installed manually (`apt install gh`) and authed via `gh auth login`

## Related Repos
- Desktop app: `pentedigital/vizoguard-app` (Electron client, lives at `/root/vizoguard-app`)
