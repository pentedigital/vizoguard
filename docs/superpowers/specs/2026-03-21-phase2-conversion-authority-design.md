# Phase 2: Conversion & Authority Pages — Design Spec

**Date**: 2026-03-21
**Phase**: 2 of 4 (Traffic → **Conversion** → International → Engineering)
**Goal**: Increase conversion rate on existing traffic + add 4 commercial-intent authority pages
**Deliverables**: 3 optimized pages + 4 new pages = 7 total

---

## 4-Phase Roadmap Context

| Phase | Focus | Goal |
|-------|-------|------|
| 1 (done) | English SEO content (20 pages) | Traffic |
| **2 (this spec)** | Conversion optimization + authority pages | Revenue |
| 3 | International SEO (6 languages) | Scale |
| 4 | Backend tests + Prometheus metrics | Stability |

---

## Workstream A: Conversion Optimization (3 Existing Pages)

### A1. Pricing Page (`pricing.html`)

**Current state**: 1,879 words, urgency countdown, pricing cards, feature comparison table, 7 FAQ questions, 30-day guarantee badge, sticky mobile CTA. Missing: testimonials, trust badges, objection handling, post-discount state.

**Modifications:**

#### 1. Testimonials Section
Add after the feature comparison table, before FAQ. Three placeholder review cards:

| Name | Role | Plan | Quote Focus |
|------|------|------|-------------|
| Sarah K. | Remote Worker | Basic | Public WiFi safety, peace of mind at coffee shops |
| Marcus D. | Privacy Advocate | Pro | Switched from NordVPN, AI threat detection catches what blocklists miss |
| Rina P. | Digital Nomad | Basic | Works across 4 countries, Shadowsocks bypasses censorship |

**Card styling**: Surface background, border, rounded corners (matching verdict-box pattern). Star rating (5 stars), quote in italics, name + role below. Mark with `<!-- PLACEHOLDER: Replace with real testimonials -->` comment.

#### 2. Trust Badges Row
Add after testimonials section. Horizontal row of 5 badge items:

- AES-256 Encryption (lock icon)
- Zero-Log Policy (eye-slash icon)
- Secure Payments via Stripe (shield icon)
- 30-Day Money-Back Guarantee (refresh icon)
- GDPR Compliant (checkmark icon)

Styled as inline flex row with icon + label, muted text color, centered. Use CSS-only icons (Unicode or inline SVG) — no external icon libraries.

#### 3. Expanded FAQ (4 New Questions)
Add to existing FAQ section and FAQPage JSON-LD schema:

1. **"Will Vizoguard slow down my device?"** — No noticeable impact. Vizoguard's AI runs lightweight analysis on URLs, not deep packet inspection. VPN encryption adds <5% latency on modern hardware.
2. **"Why is Vizoguard so much cheaper than NordVPN?"** — Vizoguard focuses on security + VPN rather than maintaining 6,000+ servers worldwide. Lower infrastructure costs = lower price. You get more security features for less.
3. **"Can I try before I buy?"** — No free trial, but every plan comes with a 30-day money-back guarantee. Try it risk-free — if it's not for you, email support for a full refund.
4. **"What happens if I'm not satisfied?"** — Email support@vizoguard.com within 30 days for a full refund. No questions asked. Your VPN access will remain active until the refund processes.

FAQ text must match FAQPage schema text exactly.

#### 4. Post-Discount Pricing State
After April 4, 2026, the page must automatically:

- **Hide**: Urgency banner, countdown timer, strikethrough regular prices, discount badges ("50% OFF", "33% OFF")
- **Show**: Regular prices ($49.99/yr Basic, $149.99/yr Pro) without discount messaging
- **Keep**: All other elements (testimonials, trust badges, FAQ, guarantee, feature comparison, CTAs)
- **Update**: Per-month anchoring to "$4.17/month" and "$12.50/month"

**Implementation**: JavaScript date check at page load (same pattern as existing countdown script). If `new Date() > new Date('2026-04-04T23:59:59Z')`, toggle CSS classes to show/hide discount elements. No server-side logic needed.

**Also update**: The four Offer schemas in SoftwareApplication JSON-LD on index.html have `priceValidUntil: "2026-04-04"`. After that date, prices in schema should reflect $49.99/$149.99. Since schema is static HTML, add a comment: `<!-- UPDATE PRICES AFTER 2026-04-04: Basic $49.99, Pro $149.99 -->`.

**Post-discount on all 7 landing pages**: The urgency countdown and discount pricing exist on all 7 landing pages (root `/` + `/ar/`, `/hi/`, `/fr/`, `/es/`, `/tr/`, `/ru/`). Each page already has an inline countdown script that auto-hides the urgency banner after the deadline. The discount badge CSS and strikethrough pricing should use the same JS date-check pattern to toggle visibility after April 4. Apply the same hide/show logic as pricing.html to all 7 pages.

**CSS/JS version**: Since Phase 2 adds new CSS rules (testimonial cards, trust badges, preview cards), bump CSS/JS version from `?v=19` to `?v=20` across ALL HTML pages after all modifications are complete. This prevents stale cached styles for returning visitors.

---

### A2. Download Page (`download.html`)

**Current state**: 1,678 words, 4 platform download cards, HowTo schema, plan disambiguation. Missing: first-launch preview, trust reinforcement, expanded FAQ.

**Modifications:**

#### 1. "What You'll See" Preview Section
Add after download buttons, before existing "Set up in 60 seconds" section. Two-column card layout:

**Basic Plan Card**:
- Title: "Basic: Connect in 10 Seconds"
- Steps: Open Outline → Tap Connect → You're protected
- Key benefit: "All traffic encrypted instantly"

**Pro Plan Card**:
- Title: "Pro: Full Security Dashboard"
- Steps: Launch Vizoguard → Enter license key → Dashboard shows real-time threat monitoring
- Key benefit: "AI threat detection starts immediately"

Styled like the existing plan note box — surface background, border, side-by-side on desktop, stacked on mobile.

#### 2. Trust Reinforcement Row
Same 5 trust badges as pricing page (AES-256, Zero-Log, Secure Payments, 30-Day Guarantee, GDPR). Consistent trust messaging across conversion pages.

#### 3. Expanded FAQ (3 New Questions)
Add to existing FAQ section and FAQPage schema:

1. **"Is the download safe? How do I verify?"** — All downloads are served over HTTPS from vizoguard.com. The desktop app is code-signed (macOS notarized). Mobile VPN uses the official Outline app from App Store / Google Play.
2. **"Can I install on multiple devices?"** — Basic: Use your VPN access key on any device via the Outline app. Pro: One license binds to one desktop device on first activation. VPN works on additional devices via Outline.
3. **"What's the difference between the Outline app and Vizoguard app?"** — Outline is the VPN client (all plans, all platforms). The Vizoguard desktop app (Pro only, Mac/Windows) adds AI threat detection, phishing protection, and connection monitoring on top of the VPN.

#### 4. Post-Download CTA
After FAQ, add: "Don't have a license yet?" box with link to `/pricing` and brief value prop.

---

### A3. Thank-You Page (`thank-you.html`)

**Current state**: Post-purchase flow with license key, VPN deep-link, Basic→Pro upsell, referral sharing, conversion tracking. Missing: onboarding guidance, stronger upsell.

**Modifications:**

#### 1. "3 Things to Do Now" Onboarding Box
Add after license key display, before upsell box. Numbered checklist:

1. **Connect your VPN** — tap the button above (already covered by existing flow)
2. **Browse normally** — visit a site you use daily. Your traffic is now encrypted.
3. **Learn more** — check our [setup guide](/setup) for advanced tips

Styled as a compact numbered list with checkmark icons. Not a separate section — integrated into the success state flow.

#### 2. Stronger Pro Upsell (Basic Users Only)
Replace existing "Want AI threat protection too?" box with:

**Headline**: "You're protected from tracking. Want to be protected from threats too?"
**Three bullet points**:
- AI phishing detection — catches brand-new scam domains
- Real-time malware blocking — stops threats before they load
- Connection monitoring — see every app talking to the internet

**CTA button**: "Upgrade to Pro — $99.99/yr" (update to $149.99/yr after April 4, 2026). **Implementation**: Use the same JS date-check pattern as pricing.html — `if (new Date() > new Date('2026-04-04T23:59:59Z'))` swap the price text in the button.

#### 3. Support Reassurance
Add small text at bottom of page: "Questions? Email support@vizoguard.com — we typically respond within 24 hours"

---

## Workstream B: Authority Pages (4 New Pages)

All follow Phase 1 SEO page patterns: `<main class="seo-page">`, 900px layout, 3 JSON-LD schemas (Article + FAQPage + BreadcrumbList), shared header/footer, CSS/JS `?v=20` (bumped in this phase), Google Analytics.

**Author attribution**: Authority pages are product pages, not blog posts. Use `"author": {"@type": "Organization", "name": "Vizoguard"}` in Article schema (matching the comparison page pattern), not personal author names. Personal authors (Terry M Lisa / Marron J Washington) are for blog posts only.

### B1. `/features` — "Vizoguard Features: AI Security + VPN in One App"

| Property | Value |
|----------|-------|
| Target keyword | `vizoguard features` |
| Meta description | "Explore Vizoguard's features — AI threat detection, phishing protection, connection monitoring, self-healing security, and encrypted VPN in one app." |
| Word count | 2500-3000 |
| Breadcrumb | Home → Features (2 items) |
| Analytics | `gtag('event','seo_cta',{page:'features',plan:'basic|pro'})` |

**H2 sections:**
1. AI Threat Detection — real-time URL analysis before browser loads
2. Phishing Protection — catches brand-new domains, not just blocklists
3. Connection Monitoring — see every app's network activity in real time
4. Self-Healing Protection — restores itself if tampered with
5. Encrypted VPN — Shadowsocks protocol, AES-256/ChaCha20, zero logging
6. Zero-Logging Policy — no traffic logs, no browsing history, device-bound keys
7. Platform Support — Mac, Windows, Android (iOS coming soon)
8. Pricing Overview — Basic vs Pro with quick comparison + CTA
9. FAQ (8-10 questions)

**CTA placements**: After section 2, after section 5, after section 8, after FAQ
**Internal links**: `/pricing`, `/ai-threat-protection`, `/secure-vpn`, `/download`, `/blog/vpn-vs-antivirus`
**Tone**: Product-focused but not salesy. "Here's what it does" with clear explanations.

---

### B2. `/ai-threat-protection` — "AI Threat Protection: How Vizoguard Blocks Threats in Real Time"

| Property | Value |
|----------|-------|
| Target keyword | `ai threat protection` |
| Meta description | "How does AI threat protection work? Learn how Vizoguard's 8 analysis vectors detect phishing, malware, and zero-day threats before your browser loads them." |
| Word count | 2500-3000 |
| Breadcrumb | Home → AI Threat Protection (2 items) |
| Analytics | `gtag('event','seo_cta',{page:'ai-threat-protection',plan:'basic|pro'})` |

**H2 sections:**
1. What Is AI Threat Protection? — real-time URL analysis vs traditional blocklists
2. The 8 Analysis Vectors:
   - Blocklist matching (known threats)
   - Suspicious TLD detection (.xyz, .top, etc.)
   - Brand impersonation (paypa1.com → PayPal spoof)
   - IP-in-URL detection (http://192.168.1.1/login)
   - Excessive subdomain analysis (login.secure.bank.account.verify.com)
   - Dangerous download detection (.exe, .scr from unknown sources)
   - Homoglyph detection (using Cyrillic "а" in place of Latin "a")
   - Phishing keyword patterns (urgent, verify, suspended)
3. How It Works — intercepts URL before browser loads, analyzes in milliseconds
4. What It Catches That Blocklists Miss — zero-day domains, brand-new phishing sites
5. AI vs Traditional Antivirus — comparison table
6. Who Needs AI Threat Protection — use cases
7. FAQ (8-10 questions)

**CTA placements**: After section 3, after section 5, after FAQ
**Internal links**: `/features`, `/blog/what-is-malware`, `/blog/how-to-block-phishing`, `/pricing`
**Tone**: Technical authority. This is the differentiator — explain it deeply.

---

### B3. `/vpn-for-streaming` — "VPN for Streaming: Unblock Netflix, YouTube, and More"

| Property | Value |
|----------|-------|
| Target keyword | `vpn for streaming` |
| Meta description | "Can you use a VPN for streaming? Learn which VPNs unblock Netflix, Disney+, and YouTube — and which ones actually work in 2026." |
| Word count | 2500-3000 |
| Breadcrumb | Home → VPN for Streaming (2 items) |
| Analytics | `gtag('event','seo_cta',{page:'vpn-for-streaming',plan:'basic|pro'})` |

**H2 sections:**
1. Why You Need a VPN for Streaming — geo-restrictions, ISP throttling, privacy
2. What a Streaming VPN Unblocks — Netflix, Disney+, BBC iPlayer, YouTube, Hulu
3. Best VPNs for Streaming — honest comparison: NordVPN (best), ExpressVPN (fast), Surfshark (budget), CyberGhost (dedicated servers)
4. Does Vizoguard Work for Streaming? — **honest**: basic streaming and ISP throttle bypass yes, geo-unblocking is limited (1 server region). Position: "If streaming is your #1 priority, NordVPN or ExpressVPN are better. If security + basic streaming, Vizoguard."
5. How to Set Up a VPN for Streaming — step by step
6. Common Streaming VPN Problems — buffering, detection, speed loss
7. FAQ (8-10 questions)

**CTA placements**: After section 4 (honest positioning builds trust → CTA), after FAQ
**Internal links**: `/compare/vizoguard-vs-nordvpn`, `/compare/vizoguard-vs-expressvpn`, `/best-vpn-2026`, `/pricing`
**Tone**: Honest. Acknowledge competitors are better for streaming. Trust builds conversions.

---

### B4. `/vpn-for-torrenting` — "VPN for Torrenting: How to Torrent Safely in 2026"

| Property | Value |
|----------|-------|
| Target keyword | `vpn for torrenting` |
| Meta description | "How to torrent safely with a VPN in 2026. Learn which VPNs support P2P, what to look for, and how to protect your privacy while downloading." |
| Word count | 2500-3000 |
| Breadcrumb | Home → VPN for Torrenting (2 items) |
| Analytics | `gtag('event','seo_cta',{page:'vpn-for-torrenting',plan:'basic|pro'})` |

**H2 sections:**
1. Is Torrenting Legal? — legal vs illegal content, jurisdiction differences
2. Why You Need a VPN for Torrenting — ISP monitoring, DMCA notices, IP exposure
3. What to Look for in a Torrenting VPN — no-logs, kill switch, speed, P2P support
4. Best VPNs for Torrenting — honest: NordVPN (P2P servers), Surfshark (unlimited devices), ExpressVPN (speed)
5. Does Vizoguard Support Torrenting? — **honest**: encrypted traffic + zero-logging = safe for P2P. 1 server region limits speed options. No port forwarding. Position: "If torrenting is your primary use, Surfshark or NordVPN offer dedicated P2P. If you want security-first with torrenting support, Vizoguard works."
6. How to Torrent Safely — step-by-step guide
7. FAQ (8-10 questions)

**CTA placements**: After section 5, after FAQ
**Internal links**: `/compare/vizoguard-vs-surfshark`, `/vpn-for-privacy`, `/secure-vpn`, `/pricing`
**Tone**: Honest, educational. Don't promise "best torrenting VPN" — position accurately.

---

## Technical Updates (After All Pages)

- Update `sitemap.xml` with 4 new URLs (34 → 38 total)
- Bump `CACHE_NAME` in `sw.js` (`vg-v31` → `vg-v32`)
- Add 4 new pages to `sw.js` APP_SHELL
- Update `CLAUDE.md` with Phase 2 page inventory
- All new pages use CSS/JS `?v=20` (bumped in this phase)

---

## Internal Linking Updates

After Phase 2 pages exist, update these existing pages to link to new authority pages:

- `index.html` features section: add "Learn more" links to `/features` and `/ai-threat-protection`
- `pricing.html`: add link to `/features` in "What's included" context
- `blog/vpn-vs-antivirus.html`: add link to `/ai-threat-protection`
- `blog/what-is-malware.html`: add link to `/ai-threat-protection`
- `best-vpn-2026.html`: add links to `/vpn-for-streaming` and `/vpn-for-torrenting`
- Comparison pages: add links to `/vpn-for-streaming` and `/vpn-for-torrenting` in relevant sections

---

## Success Criteria

- Pricing page: testimonials visible, trust badges visible, 11 FAQ questions (7 existing + 4 new), post-discount state works after April 4
- Download page: "What You'll See" section present, trust badges, 9 FAQ questions (6 + 3 new)
- Thank-you page: onboarding box visible, stronger upsell copy, support reassurance
- 4 new authority pages: all live with clean URLs, 3 JSON-LD schemas each, word counts in range
- Sitemap: 38 URLs
- All internal links verified — no broken links
- Post-discount JS tested: manually set date past April 4, verify pricing shows $49.99/$149.99
