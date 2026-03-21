# Phase 1: SEO Traffic Engine — Design Spec

**Date**: 2026-03-21
**Phase**: 1 of 4 (Traffic → Conversion → International → Engineering)
**Goal**: Build English SEO content foundation to drive organic traffic
**Deliverables**: 19 pages (5 core SEO + 9 blog posts + 3 new comparisons = 17 new pages, + 2 expanded existing comparisons)

---

## 4-Phase Roadmap Context

| Phase | Focus | Goal |
|-------|-------|------|
| **1 (this spec)** | English SEO content | Traffic |
| 2 | Conversion & authority pages | Revenue |
| 3 | International SEO (6 languages) | Scale |
| 4 | Backend tests + Prometheus metrics | Stability |

---

## URL Structure

All pages use clean URLs (nginx `try_files` handles `.html` extension).

### New Pages (Phase 1)

```
/free-vpn                           ← core SEO
/best-vpn-2026                      ← core SEO
/vpn-download                       ← core SEO
/secure-vpn                         ← core SEO
/vpn-for-privacy                    ← core SEO
/blog/how-does-vpn-work             ← blog
/blog/vpn-vs-proxy                  ← blog
/blog/vpn-vs-antivirus              ← blog
/blog/public-wifi-security          ← blog
/blog/what-is-malware               ← blog
/blog/how-to-block-phishing         ← blog
/blog/do-you-need-a-vpn             ← blog
/blog/is-vpn-safe                   ← blog
/blog/hide-ip-address               ← blog
/compare/vizoguard-vs-protonvpn     ← comparison
/compare/vizoguard-vs-surfshark     ← comparison
/compare/vizoguard-vs-cyberghost    ← comparison
```

### Modified Pages (Phase 1)

```
/compare/vizoguard-vs-nordvpn       ← expand 2500 → 3500 words
/compare/vizoguard-vs-expressvpn    ← expand 2500 → 3500 words
```

### Translation-Ready Structure (for Phase 3)

```
/ar/free-vpn, /ar/blog/what-is-vpn, /ar/compare/vizoguard-vs-nordvpn
/fr/free-vpn, /fr/blog/what-is-vpn, etc.
```

Pages built in Phase 1 must not hardcode English text in ways that block Phase 3 translation. Structural HTML and CSS should be reusable across languages.

**`/download` vs `/vpn-download` distinction**: `/download` (existing, `download.html`) is a short conversion page with direct download links. `/vpn-download` (new) is a long-form SEO page (2500-3000 words) targeting the "vpn download" keyword — it educates users on VPN setup, platform options, and troubleshooting before linking to `/download` for the actual files. No redirect between them; they serve different intents (informational vs transactional).

---

## Page Templates

### Shared Elements (All Page Types)

- **Header**: Logo + nav (Features, Pricing, FAQ, Contact) — identical to existing pages
- **Footer**: Copyright + Privacy + Terms + support email — identical to existing pages
- **CSS**: `/css/style.css?v=19` (bump from v=18 after adding new page-type styles)
- **JS**: `/js/main.js?v=19` (FAQ accordion, analytics events)
- **Google Fonts**: Inter (400, 500, 600, 700)
- **Analytics**: gtag.js with AW-18020160060 (Google Ads) + GT-NGJF3VBT (GA4)
- **Favicons**: Same set as existing pages
- **Manifest**: `/manifest.json`
- **Canonical**: `<link rel="canonical" href="https://vizoguard.com/{path}">` on every page. No hreflang tags in Phase 1 — added in Phase 3 when translations exist.
- **Open Graph**: `og:title`, `og:description`, `og:url`, `og:type` ("article" for all), `og:site_name` ("Vizoguard"), `og:image` (icon). Blog posts additionally include `article:published_time`, `article:author`, `article:section`, `article:tag`, `og:locale` ("en_US").
- **Twitter Card**: `twitter:card` ("summary"), `twitter:title`, `twitter:description`
- **Meta description**: Unique per page, 150-160 chars, includes target keyword. Formula: "[Topic explanation] — [value prop]. [Call to action or differentiator]."
- **`<title>` tag format**: `{H1} | Vizoguard` (e.g., "Free VPN: Are Free VPNs Safe in 2026? | Vizoguard")
- **Responsive breakpoints**: Follow existing patterns — 1024px (tablet landscape), 768px (tablet/mobile), 480px (small phone). All inline CSS must include responsive overrides at these breakpoints.

### A. Core SEO Pages

| Property | Value |
|----------|-------|
| Layout | `max-width: 900px`, centered |
| Word count | 2500-3000 words |
| Schemas | Article + FAQPage + BreadcrumbList |
| FAQ count | 8-10 questions |
| CTA placements | After intro (subtle), after recommendation section (primary), after FAQ (closing) |
| Inline CSS | Page-specific styles in `<style>` block (same pattern as comparison pages) |
| Analytics event | `gtag('event','seo_cta',{page:'<slug>',plan:'basic\|pro'})` |

**Content formula:**

1. H1 (contains target keyword)
2. Introduction (problem statement)
3. Education (2-3 H2 sections explaining the topic)
4. Options / comparisons (table or list)
5. Risks / mistakes (what to avoid)
6. How to choose (criteria)
7. Recommendation (Vizoguard positioning)
8. FAQ (8-10 collapsible questions)
9. CTA (two buttons: Basic + Pro)

### B. Blog Posts

| Property | Value |
|----------|-------|
| Layout | `max-width: 720px`, centered |
| Word count | 2000-2500 words |
| Schemas | Article (with `wordCount`, `keywords`, `articleSection`) + FAQPage + BreadcrumbList |
| FAQ count | 6-8 questions |
| CTA placements | Mid-article (after key insight), end-of-article CTA box |
| Metadata | Author ("Vizoguard Team"), date, read time estimate |
| Analytics event | `gtag('event','blog_cta',{article:'<slug>',plan:'basic\|pro'})` |

**Content formula:**

1. H1 (contains target keyword)
2. Article metadata (author, date, read time)
3. Table of Contents (anchor links to H2 sections) — new standard for all blog posts; existing `what-is-vpn` to be updated with ToC in this phase
4. Educational sections (H2 every 200-300 words)
5. FAQ (6-8 collapsible questions)
6. Article CTA box (heading + description + two buttons)
7. Related Articles section (3-5 links)

### C. Comparison Pages (New + Expanded)

| Property | Value |
|----------|-------|
| Layout | `max-width: 900px`, centered |
| Word count | 3200-3500 words |
| Schemas | Article + FAQPage + BreadcrumbList |
| FAQ count | 7-10 questions |
| CTA placements | After quick verdict (subtle), after pricing comparison (primary), after FAQ (closing) — 3 placements total |
| Analytics event | `gtag('event','compare_cta',{competitor:'<name>',plan:'basic\|pro'})` |

**Content formula:**

1. H1 ("Vizoguard vs [Competitor] — Full Comparison for 2026")
2. Quick Verdict Box
3. Feature Comparison Table (Basic/Pro vs Competitor columns, teal highlight)
4. Speed Comparison
5. Security & Encryption
6. Logging & Privacy Policy
7. Streaming Support
8. Torrenting Support
9. Pricing Comparison
10. Server Locations
11. Apps & Platform Support
12. Who Should Choose Which
13. FAQ (7-10 collapsible questions)
14. CTA row (Basic + Pro buttons)

---

## Content Outlines

### Core SEO Pages

#### `/free-vpn` — "Free VPN: Are Free VPNs Safe in 2026?"
- **Target keyword**: `free vpn`
- H2: What Is a Free VPN?
- H2: How Free VPNs Make Money (ads, data selling, bandwidth resale)
- H2: 7 Risks of Using a Free VPN
- H2: When a Free VPN Is Acceptable
- H2: Free VPN vs Paid VPN (comparison table)
- H2: What to Look for in a Safe VPN
- H2: Affordable Alternative to Free VPNs (Vizoguard Basic at $2.08/mo)
- H2: FAQ (8-10 questions)

#### `/best-vpn-2026` — "Best VPN Services in 2026: Expert Comparison"
- **Target keyword**: `best vpn 2026`
- H2: How We Evaluated the Best VPNs
- H2: Best VPN for Privacy (ProtonVPN)
- H2: Best VPN for Speed (ExpressVPN)
- H2: Best VPN for Budget (Surfshark)
- H2: Best VPN for Servers (NordVPN)
- H2: Best VPN for Security + Privacy Combined (Vizoguard)
- H2: Full VPN Comparison Table (all 6 providers)
- H2: How to Choose the Right VPN
- H2: FAQ

#### `/vpn-download` — "VPN Download: How to Set Up a VPN in Minutes"
- **Target keyword**: `vpn download`
- H2: What You Need Before Downloading a VPN
- H2: How to Download a VPN (step-by-step)
- H2: VPN Apps by Platform (Windows, Mac, Android, iOS)
- H2: What to Do After Installing a VPN
- H2: Common VPN Download Problems and Fixes
- H2: Free vs Paid VPN Downloads
- H2: Download Vizoguard (direct links to DMG/EXE/APK)
- H2: FAQ

#### `/secure-vpn` — "Secure VPN: What Makes a VPN Truly Secure?"
- **Target keyword**: `secure vpn`
- H2: What Does "Secure VPN" Actually Mean?
- H2: Encryption Standards Explained (AES-256, ChaCha20)
- H2: VPN Protocols Compared (WireGuard, OpenVPN, Shadowsocks)
- H2: Kill Switch, DNS Leak Protection, and Split Tunneling
- H2: Logging Policies — What to Watch For
- H2: How Hackers Exploit Insecure VPNs
- H2: Vizoguard's Security Architecture (AI threat detection + VPN)
- H2: FAQ

#### `/vpn-for-privacy` — "VPN for Privacy: How a VPN Protects Your Online Privacy"
- **Target keyword**: `vpn for privacy`
- H2: Why Online Privacy Matters in 2026
- H2: What Data Your ISP, Apps, and Websites Collect
- H2: How a VPN Protects Your Privacy
- H2: What a VPN Does NOT Protect
- H2: VPN vs Tor vs Proxy for Privacy
- H2: No-Log VPN Policies Explained
- H2: How Vizoguard Protects Privacy (zero-logging + device-bound keys)
- H2: FAQ

### Blog Posts

| Slug | H1 | Target Keyword | Key H2 Sections |
|------|----|---------------|-----------------|
| `how-does-vpn-work` | How Does a VPN Work? A Simple Guide | how does vpn work | Tunneling explained, encryption, protocols, what ISP sees, what changes, limitations |
| `vpn-vs-proxy` | VPN vs Proxy: What's the Difference? | vpn vs proxy | How each works, comparison table, security differences, speed, when to use which |
| `vpn-vs-antivirus` | VPN vs Antivirus: Do You Need Both? | vpn vs antivirus | What each protects, overlap, gaps, combined protection, Vizoguard as both |
| `public-wifi-security` | Public WiFi Security: How to Stay Safe | public wifi security | Risks (MITM, evil twin, sniffing), how VPN helps, 7 safety tips, hotel/airport/cafe |
| `what-is-malware` | What Is Malware? Types, Risks, and Protection | what is malware | Types (virus, trojan, ransomware, spyware), how it spreads, signs, prevention |
| `how-to-block-phishing` | How to Block Phishing: Detect and Prevent Attacks | how to block phishing | How phishing works, examples, detection tips, tools, AI-based detection |
| `do-you-need-a-vpn` | Do You Need a VPN? Honest Answer for 2026 | do you need a vpn | Who needs one, who doesn't, use cases, cost vs benefit, recommendation |
| `is-vpn-safe` | Is a VPN Safe? What You Need to Know | is vpn safe | VPN safety explained, trustworthy vs shady providers, risks, how to verify |
| `hide-ip-address` | How to Hide Your IP Address (5 Methods) | hide ip address | VPN, proxy, Tor, mobile data, public WiFi — pros/cons of each, recommendation |

### Comparison Pages (New)

| Slug | Competitor Positioning |
|------|----------------------|
| `vs-protonvpn` | ProtonVPN = privacy-focused, Swiss jurisdiction, free tier. Vizoguard = security + VPN combined, AI threat detection |
| `vs-surfshark` | Surfshark = budget leader, unlimited devices. Vizoguard = fewer devices but deeper security layer |
| `vs-cyberghost` | CyberGhost = streaming-optimized, huge server network. Vizoguard = security-first approach, leaner |

All three follow the 14-section comparison template above.

### Expanded Existing Comparisons

Add these sections to both `vs-nordvpn` and `vs-expressvpn` (currently ~2500 words → target 3500):
- Speed Comparison
- Streaming Support
- Torrenting Support
- Server Locations
- Apps & Platform Support

---

## Internal Linking Map

### Core SEO Pages

| Page | Links To |
|------|----------|
| `/free-vpn` | `/pricing`, `/best-vpn-2026`, `/blog/is-vpn-safe`, `/compare/vizoguard-vs-protonvpn`, `/download` |
| `/best-vpn-2026` | `/compare/vizoguard-vs-nordvpn`, `/compare/vizoguard-vs-expressvpn`, `/compare/vizoguard-vs-surfshark`, `/pricing`, `/free-vpn` |
| `/vpn-download` | `/download`, `/pricing`, `/blog/what-is-vpn`, `/secure-vpn`, `/blog/do-you-need-a-vpn` |
| `/secure-vpn` | `/vpn-for-privacy`, `/blog/public-wifi-security`, `/blog/what-is-malware`, `/pricing`, `/compare/vizoguard-vs-nordvpn` |
| `/vpn-for-privacy` | `/secure-vpn`, `/blog/hide-ip-address`, `/compare/vizoguard-vs-protonvpn`, `/pricing`, `/blog/is-vpn-safe` |

### Blog Posts

| Post | Links To |
|------|----------|
| `how-does-vpn-work` | `/blog/what-is-vpn`, `/blog/vpn-vs-proxy`, `/secure-vpn`, `/pricing` |
| `vpn-vs-proxy` | `/blog/how-does-vpn-work`, `/blog/hide-ip-address`, `/free-vpn`, `/pricing` |
| `vpn-vs-antivirus` | `/blog/what-is-malware`, `/secure-vpn`, `/blog/what-is-vpn`, `/pricing` |
| `public-wifi-security` | `/secure-vpn`, `/blog/is-vpn-safe`, `/vpn-for-privacy`, `/pricing` |
| `what-is-malware` | `/blog/how-to-block-phishing`, `/secure-vpn`, `/blog/vpn-vs-antivirus`, `/pricing` |
| `how-to-block-phishing` | `/blog/what-is-malware`, `/blog/public-wifi-security`, `/secure-vpn`, `/pricing` |
| `do-you-need-a-vpn` | `/free-vpn`, `/blog/what-is-vpn`, `/best-vpn-2026`, `/pricing` |
| `is-vpn-safe` | `/blog/how-does-vpn-work`, `/vpn-for-privacy`, `/blog/public-wifi-security`, `/pricing` |
| `hide-ip-address` | `/blog/vpn-vs-proxy`, `/vpn-for-privacy`, `/blog/is-vpn-safe`, `/pricing` |

### Comparison Pages

| Page | Links To |
|------|----------|
| `vs-protonvpn` | `/compare/vizoguard-vs-nordvpn`, `/compare/vizoguard-vs-surfshark`, `/vpn-for-privacy`, `/pricing` |
| `vs-surfshark` | `/compare/vizoguard-vs-cyberghost`, `/compare/vizoguard-vs-protonvpn`, `/free-vpn`, `/pricing` |
| `vs-cyberghost` | `/compare/vizoguard-vs-surfshark`, `/compare/vizoguard-vs-expressvpn`, `/best-vpn-2026`, `/pricing` |
| `vs-nordvpn` (expanded) | `/compare/vizoguard-vs-expressvpn`, `/compare/vizoguard-vs-protonvpn`, `/best-vpn-2026`, `/pricing` |
| `vs-expressvpn` (expanded) | `/compare/vizoguard-vs-nordvpn`, `/compare/vizoguard-vs-surfshark`, `/best-vpn-2026`, `/pricing` |

### Linking Rules

- Every page links to `/pricing` (conversion path)
- Blog posts link to at least 1 comparison or core SEO page
- Comparison pages cross-link to 2 other comparisons
- Links appear naturally in prose + Related section at bottom
- No orphan pages — every new page receives at least 2 inbound links

---

## SEO Writing Rules

- H1 must contain the main target keyword
- Use H2 every 200-300 words
- Article length per type (see templates above)
- FAQ section on every page (collapsible, same `.faq` pattern as existing pages)
- Internal links woven naturally into prose (not forced)
- Comparison tables where applicable
- Bullet lists for scanability
- CTA buttons 2-3 times per page
- Three JSON-LD schemas per page (Article + FAQPage + BreadcrumbList)

---

## Tone Guide

| Section Type | Tone |
|-------------|------|
| Education | Neutral, expert |
| Comparisons | Honest (acknowledge competitor strengths) |
| Risks | Authoritative |
| Recommendations | Confident, not salesy |
| CTA | Simple, direct |

Overall voice: expert, honest, security-focused. Never "free VPN bad, buy ours" — explain objectively, then position.

---

## Sitemap & Technical Updates

After Phase 1 completion:
- Update `public/sitemap.xml` with all new URLs (15 current + 17 new = 32 URLs total)
- New pages: priority 0.8 (SEO pages), 0.7 (blog), 0.8 (comparisons), changefreq monthly
- Bump CSS/JS cache version to `?v=19` across all HTML pages
- Bump `CACHE_NAME` in `public/sw.js`
- Add new pages to `sw.js` APP_SHELL cache list
- Update existing blog post (`what-is-vpn`) Related Articles section to link to new blog posts
- Add Table of Contents to existing `what-is-vpn` blog post (matching new blog template)
- No nginx changes needed — existing `try_files $uri $uri/ $uri.html =404` handles all new pages including root-level SEO pages. New `.html` files at root don't conflict with existing routes (verified: no `/free-vpn`, `/best-vpn-2026`, `/secure-vpn`, `/vpn-for-privacy`, `/vpn-download` routes in Express)

---

## Analytics Events

| Page Type | Event Name | Parameters |
|-----------|-----------|------------|
| Core SEO | `seo_cta` | `{page: '<slug>', plan: 'basic\|pro'}` |
| Blog | `blog_cta` | `{article: '<slug>', plan: 'basic\|pro'}` |
| Comparison | `compare_cta` | `{competitor: '<name>', plan: 'basic\|pro'}` |

All events fire on CTA button click. Conversion tracking (begin_checkout, purchase) handled on pricing/thank-you pages — not on content pages.

---

## Success Criteria

- All 19 deliverables live and accessible via clean URLs (17 new + 2 expanded)
- All pages pass HTML validation (PostToolUse hook)
- All JSON-LD schemas validate (test with Google Rich Results Test)
- Internal links verified — no broken links, no orphan pages
- Sitemap updated with all new URLs
- CSS/JS cache versions bumped
- Service worker cache updated
- Google Search Console: pages indexed within 2-4 weeks
