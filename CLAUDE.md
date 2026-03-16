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
- Pricing: Basic ($24.99/yr, VPN only) and Pro ($99.99/yr, VPN + threat detection)
- Legal entity: PRIME360 HOLDING LTD (Malta)
- Pages: index, setup, privacy, terms, thank-you (security page removed)
- Analytics: Google Ads conversion tracking (gtag.js, ID: AW-18020160060) on all pages; purchase conversion fires on thank-you page

## Database
- `licenses` table: key, email, plan, stripe IDs, device_id, status, expires_at, outline keys, vpn_node_id
- `vpn_nodes` table: multi-node VPN (region, host, api_url, status, max_keys)
- Plans: `vpn` (Basic) and `security_vpn` (Pro)
- Statuses: `active`, `cancelled`, `expired`, `suspended`

## Commands
- `nginx -t` — validate nginx config before restart
- `systemctl reload nginx` — apply nginx changes (zero-downtime)
- `sqlite3 data/vizoguard.db` — open database (use `.tables`, `.schema licenses`)
- `cd server && node app.js` — start server (dev)
- `pm2 start ecosystem.config.js` — start in production
- `pm2 reload vizoguard-api` — zero-downtime reload (cluster mode)
- `pm2 logs vizoguard-api --lines 50` — view recent logs
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
- Webhook events handled: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`
- Webhook route MUST be before `express.json()` middleware (needs raw body for signature verification)

## Security Rules
- Never log license keys, VPN access URLs, or Stripe secrets
- Outline API uses `rejectUnauthorized: false` — scoped to self-signed Outline server only
- All API routes are rate-limited

## Infrastructure
- Production path: `/var/www/vizoguard/` — `public/` and `server/` are symlinks to `/root/vizoguard/`
- VPS: 4 vCPU (AMD EPYC 9355P) / 16 GB RAM / 200 GB NVMe / 16 TB bandwidth
- PM2: cluster mode, 2 instances (uses 2 of 4 cores)
- nginx reverse proxy: `/etc/nginx/sites-available/vizoguard` → static site + API proxy + downloads
- SSL: Let's Encrypt via certbot (auto-renew)
- Outline VPN: Docker containers `shadowbox` + `watchtower` on ports 41298 (mgmt) + 19285 (access keys)
- Shadowbox memory limit: 2 GB
- Monitoring: Prometheus (localhost:9090) + Grafana (localhost:3001, default admin/admin)
- Security: fail2ban (sshd + 3 nginx jails), Monarx malware scanner, UFW firewall
- DB backups: daily at 3am via `/root/backup-db.sh`, 30-day retention in `/root/backups/`
- VPN healthcheck: every 5min via cron (`/root/vpn-healthcheck.sh`)
- PM2 log rotation: `pm2-logrotate` (10MB max, 7-day retention)

## Scripts
- `python3 setup-env.py` — auto-creates Stripe products/prices/webhook, tests SMTP, validates Outline

## Environment
- Copy `server/.env.example` to `server/.env` before running
- Required env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_VPN`, `STRIPE_PRICE_SECURITY_VPN`, `SMTP_PASS`, `OUTLINE_API_URL`
- Optional: `PORT` (default 3000), `DB_PATH` (default `data/vizoguard.db`), `APP_URL` (default `https://vizoguard.com`)
- Server host: srv1450871 (187.77.131.31), Ubuntu
- Git credentials stored in `/root/.git-credentials`
- `gh` CLI must be installed manually (`apt install gh`) and authed via `gh auth login`

## Gotchas
- GitHub Actions SSH deploy fails (Hostinger blocks GitHub runner IPs) — use `gh run download` + manual copy to `/var/www/vizoguard/downloads/`
- Docker host network mode bypasses UFW — use iptables directly for Outline port restrictions
- nginx `add_header` in a `location` block replaces parent headers — use `include /etc/nginx/snippets/security-headers.conf` in every location
- Service worker must skip external-origin fetches (fonts, CDN) or CSP causes TypeError crash
- Always run `pm2 restart vizoguard-api` after editing `.env` or server JS files
- `server_tokens off` in `/etc/nginx/conf.d/hide-version.conf`
- Bump `CACHE_NAME` version in `public/sw.js` after changing CSS/JS/HTML — otherwise returning visitors get stale cached content
- Switching PM2 from fork→cluster requires `pm2 delete` then `pm2 start` — restart alone won't change exec_mode
- `/etc/letsencrypt/options-ssl-nginx.conf` overrides `ssl_protocols` in nginx.conf — check both when changing TLS settings
- Grafana (Docker) reaches Prometheus via `host.docker.internal:9090`, not `localhost`

## Related Repos
- Desktop app: `pentedigital/vizoguard-app` (Electron client, lives at `/root/vizoguard-app`)
