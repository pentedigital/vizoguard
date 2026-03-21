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
- https://vizoguard.com/ar/ — Arabic landing page (full Arabic SEO: meta, OG, JSON-LD)
- https://vizoguard.com/hi/ — Hindi landing page (full Hindi SEO)
- https://vizoguard.com/fr/ — French landing page (full French SEO)
- https://vizoguard.com/es/ — Spanish landing page (full Spanish SEO)
- Pricing: Basic ($24.99/yr, VPN only) and Pro ($99.99/yr, VPN + threat detection)
- Legal entity: PRIME360 HOLDING LTD (Malta)
- Pages: index, ar/index, hi/index, fr/index, es/index, setup, privacy, terms, thank-you (security page removed)
- Analytics: Google Ads (AW-18020160060) + GA4 (GT-NGJF3VBT) on all pages; begin_checkout fires on CTA click (with language), purchase + enhanced conversions (user email) fire on thank-you page

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
- `GET /api/license/lookup?session_id=` — retrieve license + VPN URL after checkout (gated by Stripe session_id, not device_id)
- `POST /api/vpn/create` — create Outline access key (params: `key`, `device_id`)
- `POST /api/vpn/get` — retrieve existing VPN key (params: `key`, `device_id` — 403 on mismatch)
- `POST /api/vpn/delete` — revoke VPN key (params: `key`)
- `GET /api/vpn/status` — health only (`{"status":"online|offline"}` — no node details)
- `GET /api/health` — API health check

## Stripe Integration
- Checkout: `POST /api/checkout` — creates Stripe Checkout session with plan metadata
- Webhook events handled: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`
- Webhook route MUST be before `express.json()` middleware (needs raw body for signature verification)
- Webhook returns 500 on processing errors (Stripe retries with exponential backoff up to 72h)
- `invoice.payment_failed` revokes Outline VPN key on suspension (not just on deletion)

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

## i18n (Multilingual)
- Engine: `public/js/i18n.js` — client-side, loads JSON translations via `data-i18n` attributes
- Translations: `public/locales/en.json`, `ar.json`, `hi.json`, `fr.json`, `es.json`
- RTL styles: `public/css/rtl.css` (loaded dynamically when Arabic is active)
- Language pages: `public/ar/index.html`, `public/hi/index.html`, `public/fr/index.html`, `public/es/index.html` — each standalone with localized meta/OG/JSON-LD for SEO
- Language switcher: dropdown in nav (EN, العربية, हिन्दी, FR, ES) — redirects to `/<code>/`
- hreflang tags on all 5 pages cross-link for Google (en, ar, hi, fr, es, x-default)
- Each page has 5 JSON-LD schemas: SoftwareApplication, Organization, FAQPage (6 Q&A), HowTo (3 steps), BreadcrumbList
- Adding a new language: create `locales/<code>.json`, add code to `SUPPORTED`+`LANG_PATHS`+`LANG_LABELS` in `i18n.js`, create `/public/<code>/index.html`, update hreflang+og:locale:alternate+switcher on ALL existing pages, add to sw.js APP_SHELL

## CRO (Conversion Optimization)
- Urgency banner: countdown timer (ends March 25, 2026) — update `end` date in inline script on ALL 5 language pages
- Urgency date lives in FIVE inline `<script>` blocks (one per language page) — must update all or countdown is inconsistent
- Social proof bar: rating + guarantee + zero-logs — below hero on all language pages
- Per-day price anchoring: "$2.08/month" / "$8.33/month" on pricing cards
- 30-day money-back guarantee badge under pricing section
- Sticky mobile CTA: appears after scrolling past pricing — only on ≤768px via JS `innerWidth` check; CSS `display:none` is the default
- Checkout loading state: prevents double-click, shows "Redirecting..." spinner; `pageshow` event resets on bfcache Back
- Thank-you page: Basic→Pro upsell box + referral sharing (Twitter/X, WhatsApp, copy link)
- VPN deep-link on thank-you page uses `window.blur` to cancel the download fallback if Outline opens successfully
- All CRO elements exist on all 5 language pages with full responsive overrides at 1024/768/480px

## Gotchas
- When adding/editing translatable text in HTML, use `data-i18n="section.key"` and add the key to ALL locale files (`en.json`, `ar.json`, `hi.json`, `fr.json`, `es.json`)
- FAQ answers use `data-i18n-html` attribute for safe HTML rendering (only `<strong>`, `<em>`, `<a>`, `<br>` allowed)
- GitHub Actions SSH deploy fails (Hostinger blocks GitHub runner IPs) — use `gh run download` + manual copy to `/var/www/vizoguard/downloads/`
- Docker host network mode bypasses UFW — use iptables directly for Outline port restrictions
- nginx `add_header` in a `location` block replaces parent headers — use `include /etc/nginx/snippets/security-headers.conf` in every location
- Service worker must skip external-origin fetches (fonts, CDN) or CSP causes TypeError crash
- Always run `pm2 restart vizoguard-api` after editing `.env` or server JS files
- `server_tokens off` in `/etc/nginx/conf.d/hide-version.conf`
- Bump `CACHE_NAME` version in `public/sw.js` after changing CSS/JS/HTML — otherwise returning visitors get stale cached content
- CSS/JS have `max-age=86400` (24h) in nginx — bump the `?v=` query string on all `<link>` and `<script>` tags across all 5 HTML pages when updating CSS/JS
- Switching PM2 from fork→cluster requires `pm2 delete` then `pm2 start` — restart alone won't change exec_mode
- `/etc/letsencrypt/options-ssl-nginx.conf` overrides `ssl_protocols` in nginx.conf — check both when changing TLS settings
- Grafana (Docker) reaches Prometheus via `host.docker.internal:9090`, not `localhost`
- CSP lives in `/etc/nginx/snippets/security-headers.conf` — `script-src` and `connect-src` locked to specific domains; `img-src` lists explicit Google country TLDs for Ads tracking pixels (CSP can't wildcard across TLDs like google.ae, google.co.uk)
- Stripe Checkout iframe generates CSP "report-only" warnings in console — these are Stripe's internal policy, not ours, but monitor if Stripe changes from report-only to enforced
- `<link rel=preload>` warnings from Stripe Checkout are from their iframe, not our HTML — verify with `grep -r "preload" public/` if unsure
- Lang-switcher is a dropdown (`nav.lang-switcher` in `style.css`) — `rtl.css` has RTL overrides for dropdown position and padding
- Responsive breakpoints: 1024px (tablet landscape), 768px (tablet/phone + sticky CTA), 480px (small phone) — all CRO elements have overrides at each breakpoint

## nginx Config (Version Controlled)
- Source of truth: `nginx/security-headers.conf` and `nginx/vizoguard.conf` in this repo
- Deploy: `cp nginx/security-headers.conf /etc/nginx/snippets/ && cp nginx/vizoguard.conf /etc/nginx/sites-available/vizoguard && nginx -t && systemctl reload nginx`
- **Before any CSP change**: test with Google Ads + GTM + Stripe Checkout in browser DevTools console — CSP errors break conversion tracking silently
- Automated CSP validation: use `/csp-validate` skill after nginx config changes — checks all required domains for Google Ads, GA4, GTM, Stripe

## Related Repos
- Desktop app: `pentedigital/vizoguard-app` (Electron client, lives at `/root/vizoguard-app`)
- Android app: `pentedigital/vizoguard-android` (Kotlin + Compose, lives at `/root/vizoguard-android`)
