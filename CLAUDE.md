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
- Pricing: Basic $24.99/yr (regular $49.99, 50% launch discount) and Pro $99.99/yr (regular $149.99, 33% launch discount)
- Launch discount countdown ends April 4, 2026 — update date in ALL 7 landing page inline scripts + schema priceValidUntil
- Legal entity: PRIME360 HOLDING LTD (Malta)
- Pages: 100+ HTML pages — 7 landing pages (en, ar, hi, fr, es, tr, ru), 5 core SEO, 4 authority, 11 blog, 5 comparisons, 60 international translations, plus setup/privacy/terms/thank-you/pricing/download/press
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
- `GET /metrics` — Prometheus metrics (blocked externally by nginx)

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
- Optional: `PORT` (default 3000), `DB_PATH` (default `data/vizoguard.db`), `APP_URL` (default `https://vizoguard.com`), `LAUNCH_DISCOUNT_END` (ISO date for discount expiry, e.g., `2026-04-04`), `STRIPE_PRICE_VPN_REGULAR`, `STRIPE_PRICE_SECURITY_VPN_REGULAR`
- Server host: srv1450871 (187.77.131.31), Ubuntu
- Git credentials stored in `/root/.git-credentials`
- `gh` CLI must be installed manually (`apt install gh`) and authed via `gh auth login`

## i18n (Multilingual)
- Engine: `public/js/i18n.js` — client-side, loads JSON translations via `data-i18n` attributes
- Translations: `public/locales/en.json`, `ar.json`, `hi.json`, `fr.json`, `es.json`, `tr.json`, `ru.json`
- RTL styles: `public/css/rtl.css` (loaded dynamically when Arabic is active)
- Language pages: `public/ar/`, `public/hi/`, `public/fr/`, `public/es/`, `public/tr/`, `public/ru/` — each standalone with localized meta/OG/JSON-LD for SEO
- Language switcher: dropdown in nav (EN, العربية, हिन्दी, Français, Español, Türkçe, Русский) — redirects to `/<code>/`
- i18n detection: URL path is the source of truth — no localStorage redirect. Root `/` is always English. Language detected from path prefix only
- hreflang tags on all 7 pages cross-link for Google (en, ar, hi, fr, es, tr, ru, x-default)
- Each page has 5 JSON-LD schemas: SoftwareApplication, Organization, FAQPage (6 Q&A), HowTo (3 steps), BreadcrumbList
- Adding a new language: create `locales/<code>.json`, add code to `SUPPORTED`+`LANG_PATHS`+`LANG_LABELS` in `i18n.js`, create `/public/<code>/index.html`, update hreflang+og:locale:alternate+switcher on ALL existing pages, add to sw.js APP_SHELL
- Tier 1 translated pages: free-vpn, best-vpn-2026, vpn-download, secure-vpn, vpn-for-privacy, 3 comparisons, features, ai-threat-protection (10 pages × 6 langs = 60 pages)
- Translated SEO pages do NOT have language switcher — deferred to future optimization
- Internal links in translated pages: use `/<lang>/` prefix for Tier 1 pages, English URLs for untranslated pages (blog, pricing, download)
- Each translated page needs: correct `lang`/`dir`, canonical to self, `og:locale`, 8 hreflang tags, translated JSON-LD schemas with `inLanguage`

## CRO (Conversion Optimization)
- Urgency banner: countdown timer (ends April 4, 2026) — update `end` date in ALL 7 language page inline scripts
- Urgency date lives in SEVEN inline `<script>` blocks (one per language page) — must update all or countdown is inconsistent
- Strikethrough pricing: regular price with line-through + discount badge (`.price-regular` + `.discount-badge` in CSS)
- Social proof bar: rating + guarantee + zero-logs — below hero on all language pages
- Per-day price anchoring: "$2.08/month" / "$8.33/month" on pricing cards
- 30-day money-back guarantee badge under pricing section
- Sticky mobile CTA: appears after scrolling past pricing — only on ≤768px via JS `innerWidth` check; CSS `display:none` is the default
- Checkout loading state: prevents double-click, shows "Redirecting..." spinner; `pageshow` event resets on bfcache Back
- Thank-you page: Basic→Pro upsell box + referral sharing (Twitter/X, WhatsApp, copy link)
- VPN deep-link on thank-you page uses `window.blur` to cancel the download fallback if Outline opens successfully
- All CRO elements exist on all 7 language pages with full responsive overrides at 1024/768/480px

## Gotchas
- When adding/editing translatable text in HTML, use `data-i18n="section.key"` and add the key to ALL locale files (`en.json`, `ar.json`, `hi.json`, `fr.json`, `es.json`, `tr.json`, `ru.json`)
- FAQ answers use `data-i18n-html` attribute for safe HTML rendering (only `<strong>`, `<em>`, `<a>`, `<br>` allowed)
- GitHub Actions SSH deploy fails (Hostinger blocks GitHub runner IPs) — use `gh run download` + manual copy to `/var/www/vizoguard/downloads/`
- Docker host network mode bypasses UFW — use iptables directly for Outline port restrictions
- nginx `add_header` in a `location` block replaces parent headers — use `include /etc/nginx/snippets/security-headers.conf` in every location
- Service worker must skip external-origin fetches (fonts, CDN) or CSP causes TypeError crash
- Always run `pm2 restart vizoguard-api` after editing `.env` or server JS files
- `server_tokens off` in `/etc/nginx/conf.d/hide-version.conf`
- Bump `CACHE_NAME` version in `public/sw.js` after changing CSS/JS/HTML — otherwise returning visitors get stale cached content
- CSS/JS have `max-age=31536000, immutable` (1 year) in nginx — safe because assets are versioned with `?v=XX`; bump the `?v=` query string across all HTML pages when updating CSS/JS
- Switching PM2 from fork→cluster requires `pm2 delete` then `pm2 start` — restart alone won't change exec_mode
- `/etc/letsencrypt/options-ssl-nginx.conf` overrides `ssl_protocols` in nginx.conf — check both when changing TLS settings
- Grafana (Docker) reaches Prometheus via `host.docker.internal:9090`, not `localhost`
- CSP lives in `/etc/nginx/snippets/security-headers.conf` — `script-src` and `connect-src` locked to specific domains; `img-src` lists explicit Google country TLDs for Ads tracking pixels (CSP can't wildcard across TLDs like google.ae, google.co.uk)
- Stripe Checkout iframe generates CSP "report-only" warnings in console — these are Stripe's internal policy, not ours, but monitor if Stripe changes from report-only to enforced
- `<link rel=preload>` warnings from Stripe Checkout are from their iframe, not our HTML — verify with `grep -r "preload" public/` if unsure
- Lang-switcher is `div.lang-switcher` (not `<nav>`) with `role="navigation"` — CSS selector is `.lang-switcher`; `rtl.css` has RTL overrides for dropdown position and padding
- Responsive breakpoints: 1024px (tablet landscape), 768px (tablet/phone + sticky CTA), 480px (small phone) — all CRO elements have overrides at each breakpoint
- VPN key creation uses CAS pattern (`UPDATE SET outline_key_id='pending' WHERE outline_key_id IS NULL`) to prevent race in PM2 cluster — always roll back 'pending' in catch block
- Webhook `checkout.session.completed` responds to Stripe immediately (`res.json`) then provisions Outline async — do NOT add blocking work before the response
- Webhook UNIQUE constraint on `stripe_subscription_id` is caught and returns 200 (not 500) to prevent Stripe retry loops in cluster mode
- `stmts` in db.js must include all prepared statements — never call `db.prepare()` inside route handlers (perf + consistency)
- PM2 cluster: rate limiters are per-process (in-memory store) — effective limit = max × instance count; nginx `limit_req_zone` is the authoritative limiter
- PM2 cluster: logs include `[i${INSTANCE}]` prefix from `process.env.NODE_APP_INSTANCE` — preserve this in all console.log/error calls
- `/api/license/lookup` intentionally does NOT return `access_url` — VPN credentials only via `/api/vpn/get` with device_id verification
- `device_id` format validation: `/^[a-zA-Z0-9\-]{16,64}$/` — enforced on POST /api/license only
- Adding a new language requires updating 7+ locations (see i18n section) — use `i18n-reviewer` subagent after changes
- Webhook outer `catch` uses `if (!res.headersSent)` guard — checkout.session.completed responds early, so the catch must not double-send
- Webhook Outline catch must call `stmts.resetOutlineClaim.run(newLicense.id)` — without this, failed provisioning permanently locks the license
- `invoice.payment_succeeded` also calls `updateStatus("active")` to reactivate suspended licenses after payment recovery
- Pricing changes touch 7 locale JSONs + 7 HTML pages + JSON-LD schemas (priceValidUntil) + sitemap — use `i18n-reviewer` + `seo-reviewer` subagents after changes
- Countdown date must use UTC (`Z` suffix) and match across ALL 7 landing page scripts — banner auto-hides after expiry via `urgency-banner style.display=none`
- Subagents need explicit `Write`, `Read`, `Edit`, `Bash` permissions in `settings.local.json` — descriptive text like "Allow subagents writing..." doesn't work, must use exact tool names
- When creating many pages via subagents, batch by page (6 languages per batch) not by language — avoids git conflicts
- Post-discount JS date check pattern: `if (new Date() > new Date('2026-04-04T23:59:59Z'))` — used on pricing.html, thank-you.html, and all 7 landing pages
- SEO page creation templates: `free-vpn.html` for core SEO, `what-is-vpn.html` for blog, `vizoguard-vs-nordvpn.html` for comparisons
- VPN route `license` variable was scoped inside `try{}` making it invisible in `catch{}` — found and fixed by test suite (Phase 4)

## SEO Pages
- Core SEO: `public/free-vpn.html`, `public/best-vpn-2026.html`, `public/vpn-download.html`, `public/secure-vpn.html`, `public/vpn-for-privacy.html` — 900px seo-page layout, 2500-3000 words each
- Comparison: `public/compare/vizoguard-vs-{nordvpn,expressvpn,protonvpn,surfshark,cyberghost}.html` — 900px compare-page layout, 3200-3500 words each
- Blog: `public/blog/{what-is-vpn,how-does-vpn-work,vpn-vs-proxy,vpn-vs-antivirus,public-wifi-security,what-is-malware,how-to-block-phishing,do-you-need-a-vpn,is-vpn-safe,hide-ip-address}.html` — 720px article-body layout, 2000-2500 words each
- Authority: `public/features.html`, `public/ai-threat-protection.html`, `public/vpn-for-streaming.html`, `public/vpn-for-torrenting.html` — 900px seo-page layout, 2500-3000 words each
- Blog authors: alternate between "Terry M Lisa" and "Marron J Washington"
- All SEO pages: Article + FAQPage + BreadcrumbList JSON-LD schemas, same header/footer/analytics as landing pages
- CRO: Pricing page has testimonials (placeholder), trust badges, 11 FAQ questions, post-discount state after April 4 2026
- Post-discount: JS date-check on pricing.html, thank-you.html, and all 7 landing pages auto-hides urgency/discount elements after April 4 2026, updates prices to $49.99/$149.99
- International: 10 Tier 1 pages translated into ar, hi, fr, es, tr, ru (60 pages) — hreflang cross-linked, localized meta/schemas
- Arabic pages load `/css/rtl.css` for RTL layout
- Sitemap: 98 URLs in `public/sitemap.xml` (clean URLs, hreflang cross-references)
- Cache: CSS/JS at `?v=20`, service worker `CACHE_NAME = 'vg-v33'`

## Backend Tests
- Framework: `node:test` + `node:assert/strict` (built-in, no install)
- Run: `cd server && npm test` or `node --test **/*.test.js`
- Test files: `routes/license.test.js` (9), `routes/webhook.test.js` (11), `routes/vpn.test.js` (10), `outline.test.js` (6), `app.test.js` (4) — 40 tests total
- All tests mock external APIs (Stripe, Outline, SMTP) — no real calls

## Monitoring
- Metrics: `prom-client` on `GET /metrics` (blocked externally by nginx `deny all`)
- Prometheus: scrapes `vizoguard-api` at `127.0.0.1:3000/metrics` every 15s
- Grafana: `localhost:3001`, Prometheus datasource at `host.docker.internal:9090`, "Vizoguard API" dashboard
- Counters: `http_requests_total`, `license_validations_total`, `vpn_keys_created_total`, `webhook_events_total`, `stripe_checkout_sessions_total`

## nginx Config (Version Controlled)
- Source of truth: `nginx/security-headers.conf` and `nginx/vizoguard.conf` in this repo
- Deploy: `cp nginx/security-headers.conf /etc/nginx/snippets/ && cp nginx/vizoguard.conf /etc/nginx/sites-available/vizoguard && nginx -t && systemctl reload nginx`
- **Before any CSP change**: test with Google Ads + GTM + Stripe Checkout in browser DevTools console — CSP errors break conversion tracking silently
- Automated CSP validation: use `/csp-validate` skill after nginx config changes — checks all required domains for Google Ads, GA4, GTM, Stripe
- nginx uses `try_files $uri $uri/ $uri.html =404` — enables clean URLs (/pricing → pricing.html). Without this, all .html pages 404 when accessed without extension

## Related Repos
- Desktop app: `pentedigital/vizoguard-app` (Electron client, lives at `/root/vizoguard-app`)
- Android app: `pentedigital/vizoguard-android` (Kotlin + Compose, lives at `/root/vizoguard-android`)
