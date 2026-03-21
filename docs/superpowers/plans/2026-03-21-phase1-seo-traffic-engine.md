# Phase 1: SEO Traffic Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 17 new English SEO pages + expand 2 existing comparison pages to create the organic traffic foundation for Vizoguard.

**Architecture:** Static HTML pages served by nginx, following existing template patterns (inline CSS, shared style.css/main.js, 3 JSON-LD schemas per page). No backend changes. Pages use clean URLs via `try_files`.

**Tech Stack:** HTML, CSS, vanilla JS, JSON-LD structured data, Google Analytics (gtag.js)

**Spec:** `docs/superpowers/specs/2026-03-21-phase1-seo-traffic-engine-design.md`

---

## File Map

### New Files (17)

| File | Type | Template Source |
|------|------|----------------|
| `public/free-vpn.html` | Core SEO | comparison page layout (900px) |
| `public/best-vpn-2026.html` | Core SEO | comparison page layout (900px) |
| `public/vpn-download.html` | Core SEO | comparison page layout (900px) |
| `public/secure-vpn.html` | Core SEO | comparison page layout (900px) |
| `public/vpn-for-privacy.html` | Core SEO | comparison page layout (900px) |
| `public/blog/how-does-vpn-work.html` | Blog | `blog/what-is-vpn.html` layout (720px) |
| `public/blog/vpn-vs-proxy.html` | Blog | `blog/what-is-vpn.html` layout (720px) |
| `public/blog/vpn-vs-antivirus.html` | Blog | `blog/what-is-vpn.html` layout (720px) |
| `public/blog/public-wifi-security.html` | Blog | `blog/what-is-vpn.html` layout (720px) |
| `public/blog/what-is-malware.html` | Blog | `blog/what-is-vpn.html` layout (720px) |
| `public/blog/how-to-block-phishing.html` | Blog | `blog/what-is-vpn.html` layout (720px) |
| `public/blog/do-you-need-a-vpn.html` | Blog | `blog/what-is-vpn.html` layout (720px) |
| `public/blog/is-vpn-safe.html` | Blog | `blog/what-is-vpn.html` layout (720px) |
| `public/blog/hide-ip-address.html` | Blog | `blog/what-is-vpn.html` layout (720px) |
| `public/compare/vizoguard-vs-protonvpn.html` | Comparison | `compare/vizoguard-vs-nordvpn.html` (900px) |
| `public/compare/vizoguard-vs-surfshark.html` | Comparison | `compare/vizoguard-vs-nordvpn.html` (900px) |
| `public/compare/vizoguard-vs-cyberghost.html` | Comparison | `compare/vizoguard-vs-nordvpn.html` (900px) |

### Modified Files (6)

| File | Change |
|------|--------|
| `public/compare/vizoguard-vs-nordvpn.html` | Expand from ~2500 to ~3500 words (add 5 new sections) |
| `public/compare/vizoguard-vs-expressvpn.html` | Expand from ~2500 to ~3500 words (add 5 new sections) |
| `public/blog/what-is-vpn.html` | Add Table of Contents, update Related Articles |
| `public/sitemap.xml` | Add 17 new URLs (15→32 total) |
| `public/sw.js` | Bump CACHE_NAME, add new pages to APP_SHELL |
| `public/css/style.css` | Add `.seo-page` styles for core SEO page type |

---

## Reference: HTML Template Skeletons

### Head Block (all pages share this pattern)

Every page starts with this exact structure. Replace bracketed values per page.

```html
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=AW-18020160060"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'AW-18020160060');
    gtag('config', 'GT-NGJF3VBT');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[H1] | Vizoguard</title>
  <meta name="description" content="[150-160 chars, includes target keyword]">
  <meta name="keywords" content="[target keyword, 5-8 related terms]">
  <meta name="author" content="Vizoguard">
  <link rel="canonical" href="https://vizoguard.com/[path]">

  <!-- Open Graph -->
  <meta property="og:title" content="[title]">
  <meta property="og:description" content="[same as meta description]">
  <meta property="og:url" content="https://vizoguard.com/[path]">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Vizoguard">
  <meta property="og:image" content="https://vizoguard.com/icons/icon-512.png">
  <!-- Blog posts add these extra OG tags: -->
  <!-- <meta property="og:image:width" content="512"> -->
  <!-- <meta property="og:image:height" content="512"> -->
  <!-- <meta property="og:locale" content="en_US"> -->
  <!-- <meta property="article:published_time" content="2026-03-21"> -->
  <!-- <meta property="article:author" content="Vizoguard Team"> -->
  <!-- <meta property="article:section" content="Technology"> -->
  <!-- <meta property="article:tag" content="[tag1]"> -->
  <!-- Use 3-5 article:tag values per blog post. Derive from target keyword + topic: -->
  <!-- e.g., for "vpn-vs-proxy": "VPN", "Proxy", "Privacy", "Cybersecurity" -->
  <!-- e.g., for "what-is-malware": "Malware", "Cybersecurity", "Virus", "Ransomware" -->

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="[title]">
  <meta name="twitter:description" content="[short description]">
  <meta name="twitter:image" content="https://vizoguard.com/icons/icon-512.png">

  <!-- JSON-LD schemas go here (Article + FAQPage + BreadcrumbList) -->

  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#00e5a0">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="/css/style.css?v=19">
  <style>
    /* Page-specific inline styles */
  </style>
</head>
```

### Header + Footer (identical on all pages)

```html
<header>
  <a href="/" class="logo">Vizo<span>guard</span></a>
  <nav>
    <a href="/#features">Features</a>
    <a href="/pricing">Pricing</a>
    <a href="/#faq">FAQ</a>
    <a href="mailto:support@vizoguard.com">Contact</a>
  </nav>
</header>

<!-- ... page content ... -->

<footer>
  <p>&copy; 2026 Vizoguard &nbsp;&middot;&nbsp; <a href="/privacy.html">Privacy</a> &nbsp;&middot;&nbsp; <a href="/terms.html">Terms</a> &nbsp;&middot;&nbsp; <a href="mailto:support@vizoguard.com">support@vizoguard.com</a></p>
</footer>

<script src="/js/main.js?v=19"></script>
</body>
</html>
```

### CTA Row Pattern (reused 2-3 times per page)

```html
<div class="cta-row">
  <a href="/pricing" class="btn" onclick="gtag('event','[event_name]',{[params],'plan':'pro'})">Get Pro — $99.99/yr</a>
  <a href="/pricing" class="btn btn-outline" onclick="gtag('event','[event_name]',{[params],'plan':'basic'})">Get Basic — $24.99/yr</a>
</div>
```

### FAQ Section Pattern

```html
<h2>Frequently Asked Questions</h2>
<div class="faq">
  <div class="faq-item">
    <button class="faq-question" aria-expanded="false">[Question text]</button>
    <div class="faq-answer"><p>[Answer text]</p></div>
  </div>
  <!-- repeat for each question -->
</div>
```

### Related Section Pattern

```html
<div style="margin-top:3em; padding-top:2em; border-top:1px solid var(--border,#2a2a3e);">
  <h3>Related</h3>
  <ul style="list-style:none; padding:0;">
    <li style="margin-bottom:0.5em;"><a href="/[path]" style="color:var(--teal);">[Link text]</a></li>
    <!-- 3-5 related links per spec's internal linking map -->
  </ul>
</div>
```

### BreadcrumbList Schema Pattern

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Vizoguard", "item": "https://vizoguard.com/" },
    { "@type": "ListItem", "position": 2, "name": "[Section]", "item": "https://vizoguard.com/[section]/" },
    { "@type": "ListItem", "position": 3, "name": "[Page Title]", "item": "https://vizoguard.com/[full-path]" }
  ]
}
```

Core SEO pages use breadcrumb: Home → [Page Title] (2 items, no section).
Blog posts: Home → Blog → [Title] (3 items).
Comparison pages: Home → Compare → [Title] (3 items).

---

## Content Tone & SEO Rules

- **Tone**: Expert, honest, security-focused. Never "free VPN bad, buy ours" — explain objectively, then position Vizoguard.
- **H1**: Must contain the target keyword.
- **H2**: Every 200-300 words.
- **Internal links**: Woven naturally into prose + Related section at bottom. Follow the linking map in the spec.
- **CTA buttons**: 2-3 per page (see CTA Row Pattern above).
- **FAQ**: Collapsible, using `.faq` pattern. Answers must match FAQPage schema text exactly.
- **Competitor mentions**: Acknowledge strengths honestly ("NordVPN has 6,000+ servers"), then differentiate ("Vizoguard combines security + VPN").

---

## Tasks

### Task 1: Add `.seo-page` CSS class to style.css

**Files:**
- Modify: `public/css/style.css`

Core SEO pages need their own layout class (like `.compare-page` and `.article-body`). Add `.seo-page` styles.

- [ ] **Step 1: Add `.seo-page` styles to the end of style.css (before media queries)**

```css
/* SEO Pages */
.seo-page { max-width: 900px; margin: 0 auto; padding: 100px 24px 60px; }
.seo-page h1 { color: var(--text); font-size: 2rem; font-weight: 700; margin-bottom: 16px; letter-spacing: -0.02em; }
.seo-page h2 { color: var(--text); font-size: 1.4rem; font-weight: 600; margin: 48px 0 16px; letter-spacing: -0.01em; }
.seo-page h3 { color: var(--text); font-size: 1.1rem; font-weight: 600; margin: 32px 0 12px; }
.seo-page p, .seo-page li { color: var(--text-2); font-size: 0.95rem; line-height: 1.7; }
.seo-page ul, .seo-page ol { padding-left: 20px; margin: 12px 0; }
.seo-page li { margin-bottom: 6px; }
```

Also add responsive overrides inside the existing media query blocks. Find them by searching for `@media (max-width: 768px)` and `@media (max-width: 480px)` in the file — append the new rules at the end of each block, before the closing `}`.

At `@media (max-width: 768px)`:
```css
.seo-page { padding: 80px 16px 40px; }
.seo-page h1 { font-size: 1.5rem; }
.seo-page h2 { font-size: 1.2rem; margin-top: 36px; }
```

At `@media (max-width: 480px)`:
```css
.seo-page { padding: 70px 12px 32px; }
.seo-page h1 { font-size: 1.3rem; }
```

- [ ] **Step 2: Verify style.css is valid**

Run: `node -e "require('fs').readFileSync('/root/vizoguard/public/css/style.css','utf8')"`
Expected: No error (file readable, not corrupted)

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard && git add public/css/style.css
git commit -m "style: add .seo-page CSS class for core SEO pages"
```

---

### Task 2: Create `/free-vpn` page

**Files:**
- Create: `public/free-vpn.html`

**Content spec:**
- **H1**: "Free VPN: Are Free VPNs Safe in 2026?"
- **Target keyword**: `free vpn`
- **Meta description**: "Are free VPNs safe? Learn how free VPNs make money, the risks of using them, and why an affordable paid VPN is the safer choice in 2026."
- **Word count**: 2500-3000 words
- **Layout**: `<main class="seo-page">`
- **Breadcrumb**: Home → Free VPN (2 items)
- **Analytics event**: `gtag('event','seo_cta',{page:'free-vpn',plan:'basic|pro'})`
- **Internal links to**: `/pricing`, `/best-vpn-2026`, `/blog/is-vpn-safe`, `/compare/vizoguard-vs-protonvpn`, `/download`

**H2 sections to write:**
1. What Is a Free VPN?
2. How Free VPNs Make Money (ads, data selling, bandwidth resale)
3. 7 Risks of Using a Free VPN (data logging, malware, slow speeds, limited servers, ad injection, IP leaks, no support)
4. When a Free VPN Is Acceptable (brief, low-risk browsing)
5. Free VPN vs Paid VPN (comparison table with columns: Feature | Free VPN | Paid VPN)
6. What to Look for in a Safe VPN (encryption, no-logs, speed, support)
7. Affordable Alternative to Free VPNs — Vizoguard Basic at $2.08/mo (position as safer alternative, not "free VPN bad")
8. FAQ (8-10 questions)

**CTA placements**: After section 2 (subtle), after section 7 (primary), after FAQ (closing)

**FAQ questions** (must match FAQPage schema):
1. Are free VPNs really free?
2. Can a free VPN steal my data?
3. What is the safest free VPN?
4. Why are free VPNs slow?
5. Is it better to use no VPN or a free VPN?
6. How much does a good VPN cost?
7. Can I use a free VPN for streaming?
8. What is the cheapest safe VPN?

- [ ] **Step 1: Create `public/free-vpn.html`**

Follow the head block template, using the meta description, keywords, and title above. Include all 3 JSON-LD schemas (Article, FAQPage with the 8 questions above, BreadcrumbList). Use `<main class="seo-page">`. Add breadcrumb nav, all 8 H2 sections with 2500-3000 words of content following the content tone rules. Include comparison table in section 5. Place CTA rows at 3 points. Add Related section with the 5 internal links. Use page-specific inline CSS for verdict box and comparison table (copy patterns from `compare/vizoguard-vs-nordvpn.html`).

- [ ] **Step 2: Verify HTML is well-formed**

Run: `python3 -c "import html.parser,sys; p=html.parser.HTMLParser(); p.feed(open(sys.argv[1]).read()); print('OK')" /root/vizoguard/public/free-vpn.html`
Expected: "OK"

- [ ] **Step 3: Verify word count is in range**

Run: `cat /root/vizoguard/public/free-vpn.html | sed 's/<[^>]*>//g' | wc -w`
Expected: 2500-3000

- [ ] **Step 4: Verify all internal links are valid paths**

Run: `grep -oP 'href="/[^"]*"' /root/vizoguard/public/free-vpn.html | sort -u`
Verify: Each path corresponds to an existing or planned page.

- [ ] **Step 5: Commit**

```bash
cd /root/vizoguard && git add public/free-vpn.html
git commit -m "content: add /free-vpn SEO page (2500-3000 words)"
```

---

### Task 3: Create `/best-vpn-2026` page

**Files:**
- Create: `public/best-vpn-2026.html`

**Content spec:**
- **H1**: "Best VPN Services in 2026: Expert Comparison"
- **Target keyword**: `best vpn 2026`
- **Meta description**: "Compare the best VPN services in 2026. Expert analysis of NordVPN, ExpressVPN, Surfshark, ProtonVPN, CyberGhost, and Vizoguard — pricing, speed, and security."
- **Word count**: 2500-3000 words
- **Layout**: `<main class="seo-page">`
- **Breadcrumb**: Home → Best VPN 2026 (2 items)
- **Analytics event**: `gtag('event','seo_cta',{page:'best-vpn-2026',plan:'basic|pro'})`
- **Internal links to**: `/compare/vizoguard-vs-nordvpn`, `/compare/vizoguard-vs-expressvpn`, `/compare/vizoguard-vs-surfshark`, `/pricing`, `/free-vpn`

**H2 sections to write:**
1. How We Evaluated the Best VPNs (criteria: speed, security, privacy, pricing, ease of use)
2. Best VPN for Privacy — ProtonVPN (Swiss, open-source, free tier)
3. Best VPN for Speed — ExpressVPN (Lightway protocol, consistent speeds)
4. Best VPN for Budget — Surfshark (unlimited devices, low price)
5. Best VPN for Servers — NordVPN (6,000+ servers, 111 countries)
6. Best VPN for Security + Privacy Combined — Vizoguard (AI threat detection + VPN, Shadowsocks, phishing protection)
7. Full VPN Comparison Table (6 providers × features: price, servers, protocol, logging, security extras, platforms)
8. How to Choose the Right VPN (use case matching)
9. FAQ (8-10 questions — generate relevant questions about choosing, comparing, and pricing VPNs; FAQ HTML text must match FAQPage schema text exactly)

**CTA placements**: After section 6 (primary), after table (secondary), after FAQ (closing)

Follow same structure as Task 2. Use comparison table with highlight column on Vizoguard. Acknowledge each competitor's genuine strength. Position Vizoguard's unique value = security + VPN combined.

- [ ] **Step 1: Create `public/best-vpn-2026.html`** (full page, same verification pattern as Task 2)
- [ ] **Step 2: Verify HTML well-formed**
- [ ] **Step 3: Verify word count 2500-3000**
- [ ] **Step 4: Verify internal links**
- [ ] **Step 5: Commit**

```bash
cd /root/vizoguard && git add public/best-vpn-2026.html
git commit -m "content: add /best-vpn-2026 SEO page"
```

---

### Task 4: Create `/vpn-download` page

**Files:**
- Create: `public/vpn-download.html`

**Content spec:**
- **H1**: "VPN Download: How to Set Up a VPN in Minutes"
- **Target keyword**: `vpn download`
- **Meta description**: "Download a VPN and set it up in minutes. Step-by-step guide for Windows, Mac, Android, and iOS — plus common setup problems and fixes."
- **Word count**: 2500-3000 words
- **Layout**: `<main class="seo-page">`
- **Internal links to**: `/download`, `/pricing`, `/blog/what-is-vpn`, `/secure-vpn`, `/blog/do-you-need-a-vpn`

**Note**: This is an educational long-form page about VPN setup. `/download` (existing) is the short conversion page with direct download links. `/vpn-download` links TO `/download` for actual files.

**H2 sections**: What You Need Before Downloading → How to Download a VPN (step-by-step) → VPN Apps by Platform → What to Do After Installing → Common Problems and Fixes → Free vs Paid VPN Downloads → Download Vizoguard (links to `/download` for DMG/EXE/APK) → FAQ

- [ ] **Steps 1-5**: Same pattern as Task 2 (create, verify HTML, verify word count, verify links, commit)

---

### Task 5: Create `/secure-vpn` page

**Files:**
- Create: `public/secure-vpn.html`

**Content spec:**
- **H1**: "Secure VPN: What Makes a VPN Truly Secure?"
- **Target keyword**: `secure vpn`
- **Meta description**: "What makes a VPN truly secure? Learn about encryption standards, VPN protocols, kill switches, and logging policies — and how to verify your VPN's security."
- **Word count**: 2500-3000 words
- **Internal links to**: `/vpn-for-privacy`, `/blog/public-wifi-security`, `/blog/what-is-malware`, `/pricing`, `/compare/vizoguard-vs-nordvpn`

**H2 sections**: What "Secure VPN" Means → Encryption Standards (AES-256, ChaCha20) → Protocols Compared (WireGuard, OpenVPN, Shadowsocks) → Kill Switch, DNS Leak, Split Tunneling → Logging Policies → How Hackers Exploit Insecure VPNs → Vizoguard Security Architecture (AI threat detection + VPN) → FAQ

- [ ] **Steps 1-5**: Same pattern as Task 2

---

### Task 6: Create `/vpn-for-privacy` page

**Files:**
- Create: `public/vpn-for-privacy.html`

**Content spec:**
- **H1**: "VPN for Privacy: How a VPN Protects Your Online Privacy"
- **Target keyword**: `vpn for privacy`
- **Meta description**: "How does a VPN protect your privacy online? Learn what data ISPs collect, what a VPN hides, its limitations, and how to choose a privacy-focused VPN."
- **Word count**: 2500-3000 words
- **Internal links to**: `/secure-vpn`, `/blog/hide-ip-address`, `/compare/vizoguard-vs-protonvpn`, `/pricing`, `/blog/is-vpn-safe`

**H2 sections**: Why Privacy Matters in 2026 → What Data ISPs/Apps/Websites Collect → How a VPN Protects Privacy → What a VPN Does NOT Protect → VPN vs Tor vs Proxy → No-Log Policies Explained → Vizoguard Privacy (zero-logging + device-bound keys) → FAQ

- [ ] **Steps 1-5**: Same pattern as Task 2

---

### Task 7: Create blog post `/blog/how-does-vpn-work`

**Files:**
- Create: `public/blog/how-does-vpn-work.html`

**Content spec:**
- **H1**: "How Does a VPN Work? A Simple Guide"
- **Target keyword**: `how does vpn work`
- **Meta description**: "How does a VPN work? A simple guide to VPN tunneling, encryption, and protocols — learn what happens to your data when you connect to a VPN."
- **Word count**: 2000-2500 words
- **Layout**: `<article class="article-body">` (720px max-width, matching `what-is-vpn.html`)
- **Breadcrumb**: Home → Blog → How Does a VPN Work? (3 items)
- **Analytics event**: `gtag('event','blog_cta',{article:'how-does-vpn-work',plan:'basic|pro'})`
- **Internal links to**: `/blog/what-is-vpn`, `/blog/vpn-vs-proxy`, `/secure-vpn`, `/pricing`

**Blog-specific elements:**
- Article metadata: `<div class="article-meta">By Vizoguard Team · March 21, 2026 · 8 min read</div>`
- Table of Contents (ordered list with anchor links to each H2)
- Article schema with `wordCount`, `keywords`, `articleSection: "Technology"`, `inLanguage: "en"`
- Blog OG tags (`article:published_time`, `article:author`, `article:section`, `article:tag`)
- Article CTA box after main content
- Related Articles section (3-5 links)

**H2 sections**: What Is a VPN? (brief recap) → VPN Tunneling Explained → How VPN Encryption Works → VPN Protocols (WireGuard, OpenVPN, Shadowsocks, IKEv2) → What Your ISP Sees vs Doesn't See → What Changes When You Connect → VPN Limitations → FAQ (6-8 questions) → Related Articles

- [ ] **Step 1: Create `public/blog/how-does-vpn-work.html`**

Use `blog/what-is-vpn.html` as the structural template. Copy the exact head structure (with blog-specific OG tags), `<article class="article-body">`, article-meta, inline styles. Write 2000-2500 words following the H2 outline. Include Table of Contents with anchor links. Include Article CTA box and Related Articles.

- [ ] **Step 2: Verify HTML well-formed**
- [ ] **Step 3: Verify word count 2000-2500**
- [ ] **Step 4: Verify internal links**
- [ ] **Step 5: Commit**

```bash
cd /root/vizoguard && git add public/blog/how-does-vpn-work.html
git commit -m "content: add /blog/how-does-vpn-work post"
```

---

### Task 8: Create blog post `/blog/vpn-vs-proxy`

**Files:** Create: `public/blog/vpn-vs-proxy.html`

- **H1**: "VPN vs Proxy: What's the Difference?"
- **Target keyword**: `vpn vs proxy`
- **Meta description**: "VPN vs proxy — what's the difference? Compare encryption, speed, privacy, and use cases to decide which is right for you."
- **Word count**: 2000-2500
- **Internal links to**: `/blog/how-does-vpn-work`, `/blog/hide-ip-address`, `/free-vpn`, `/pricing`
- **H2 sections**: What Is a Proxy? → What Is a VPN? → VPN vs Proxy Comparison Table → Encryption & Security → Speed & Performance → Privacy Differences → When to Use a Proxy → When to Use a VPN → FAQ

- [ ] **Steps 1-5**: Same pattern as Task 7

---

### Task 9: Create blog post `/blog/vpn-vs-antivirus`

**Files:** Create: `public/blog/vpn-vs-antivirus.html`

- **H1**: "VPN vs Antivirus: Do You Need Both?"
- **Target keyword**: `vpn vs antivirus`
- **Meta description**: "VPN vs antivirus — do you need both? Learn what each protects, where they overlap, and why combining them gives you the best security."
- **Word count**: 2000-2500
- **Internal links to**: `/blog/what-is-malware`, `/secure-vpn`, `/blog/what-is-vpn`, `/pricing`
- **H2 sections**: What Does a VPN Protect? → What Does an Antivirus Protect? → Where They Overlap → Security Gaps → Why You Need Both → Vizoguard: Security + VPN Combined → FAQ

- [ ] **Steps 1-5**: Same pattern as Task 7

---

### Task 10: Create blog post `/blog/public-wifi-security`

**Files:** Create: `public/blog/public-wifi-security.html`

- **H1**: "Public WiFi Security: How to Stay Safe"
- **Target keyword**: `public wifi security`
- **Meta description**: "Is public WiFi safe? Learn the real risks of hotel, airport, and cafe WiFi — and 7 practical tips to protect yourself, including using a VPN."
- **Internal links to**: `/secure-vpn`, `/blog/is-vpn-safe`, `/vpn-for-privacy`, `/pricing`
- **H2 sections**: Why Public WiFi Is Risky → Common Attacks (MITM, evil twin, packet sniffing) → How a VPN Protects on Public WiFi → 7 Public WiFi Safety Tips → Hotel, Airport, and Cafe WiFi Specifics → FAQ

- [ ] **Steps 1-5**: Same pattern as Task 7

---

### Task 11: Create blog post `/blog/what-is-malware`

**Files:** Create: `public/blog/what-is-malware.html`

- **H1**: "What Is Malware? Types, Risks, and Protection"
- **Target keyword**: `what is malware`
- **Meta description**: "What is malware and how does it infect your devices? Learn about viruses, trojans, ransomware, spyware — and how to protect yourself."
- **Internal links to**: `/blog/how-to-block-phishing`, `/secure-vpn`, `/blog/vpn-vs-antivirus`, `/pricing`
- **H2 sections**: What Is Malware? → Types (virus, trojan, ransomware, spyware, adware, worm) → How Malware Spreads → Signs Your Device Is Infected → How to Remove Malware → How to Prevent Malware → FAQ

- [ ] **Steps 1-5**: Same pattern as Task 7

---

### Task 12: Create blog post `/blog/how-to-block-phishing`

**Files:** Create: `public/blog/how-to-block-phishing.html`

- **H1**: "How to Block Phishing: Detect and Prevent Attacks"
- **Target keyword**: `how to block phishing`
- **Meta description**: "Learn how to detect and block phishing attacks. Recognize fake emails, spoofed websites, and social engineering — plus tools that protect you automatically."
- **Internal links to**: `/blog/what-is-malware`, `/blog/public-wifi-security`, `/secure-vpn`, `/pricing`
- **H2 sections**: What Is Phishing? → Types of Phishing (email, spear, smishing, vishing) → How to Recognize Phishing → Real-World Examples → 7 Ways to Block Phishing → AI-Based Phishing Detection → FAQ

- [ ] **Steps 1-5**: Same pattern as Task 7

---

### Task 13: Create blog post `/blog/do-you-need-a-vpn`

**Files:** Create: `public/blog/do-you-need-a-vpn.html`

- **H1**: "Do You Need a VPN? Honest Answer for 2026"
- **Target keyword**: `do you need a vpn`
- **Meta description**: "Do you really need a VPN in 2026? An honest look at who benefits from a VPN, who doesn't, and whether the cost is worth it."
- **Internal links to**: `/free-vpn`, `/blog/what-is-vpn`, `/best-vpn-2026`, `/pricing`
- **H2 sections**: Who Needs a VPN → Who Doesn't Need a VPN → Common Use Cases → Cost vs Benefit → VPN Myths Debunked → Recommendation → FAQ

- [ ] **Steps 1-5**: Same pattern as Task 7

---

### Task 14: Create blog post `/blog/is-vpn-safe`

**Files:** Create: `public/blog/is-vpn-safe.html`

- **H1**: "Is a VPN Safe? What You Need to Know"
- **Target keyword**: `is vpn safe`
- **Meta description**: "Is using a VPN safe? Learn which VPN providers you can trust, what risks exist, and how to verify your VPN actually protects you."
- **Internal links to**: `/blog/how-does-vpn-work`, `/vpn-for-privacy`, `/blog/public-wifi-security`, `/pricing`
- **H2 sections**: Is a VPN Safe to Use? → Trustworthy vs Shady Providers → What Makes a VPN Unsafe → How to Verify VPN Security → VPN Logging — How to Check → Can a VPN Be Hacked? → FAQ

- [ ] **Steps 1-5**: Same pattern as Task 7

---

### Task 15: Create blog post `/blog/hide-ip-address`

**Files:** Create: `public/blog/hide-ip-address.html`

- **H1**: "How to Hide Your IP Address (5 Methods)"
- **Target keyword**: `hide ip address`
- **Meta description**: "5 ways to hide your IP address — VPN, proxy, Tor, mobile data, and public WiFi. Compare pros, cons, and which method is best for privacy."
- **Internal links to**: `/blog/vpn-vs-proxy`, `/vpn-for-privacy`, `/blog/is-vpn-safe`, `/pricing`
- **H2 sections**: Why Hide Your IP? → Method 1: VPN → Method 2: Proxy Server → Method 3: Tor Browser → Method 4: Mobile Data → Method 5: Public WiFi → Comparison Table → Which Method Should You Use? → FAQ

- [ ] **Steps 1-5**: Same pattern as Task 7

---

### Task 16: Create comparison page `/compare/vizoguard-vs-protonvpn`

**Files:**
- Create: `public/compare/vizoguard-vs-protonvpn.html`

**Content spec:**
- **H1**: "Vizoguard vs ProtonVPN — Full Comparison for 2026"
- **Target keyword**: `vizoguard vs protonvpn`
- **Meta description**: "Vizoguard vs ProtonVPN: AI security + VPN from $24.99/yr vs privacy-focused VPN from $47.88/yr. Compare features, pricing, and security."
- **Word count**: 3200-3500 words
- **Layout**: `<main class="compare-page">` (copy inline CSS from `vizoguard-vs-nordvpn.html`)
- **Breadcrumb**: Home → Compare → Vizoguard vs ProtonVPN (3 items)
- **Analytics event**: `gtag('event','compare_cta',{competitor:'protonvpn',plan:'basic|pro'})`
- **Internal links to**: `/compare/vizoguard-vs-nordvpn`, `/compare/vizoguard-vs-surfshark`, `/vpn-for-privacy`, `/pricing`

**Competitor positioning**: ProtonVPN = Swiss privacy jurisdiction, open-source apps, free tier, Secure Core (multi-hop). Vizoguard = AI threat detection + VPN combined, Shadowsocks anti-censorship, phishing protection.

**14 sections** (per spec template):
1. Quick Verdict Box
2. Feature Comparison Table (Vizoguard Basic | Vizoguard Pro | ProtonVPN Plus — highlight Vizoguard columns)
3. Speed Comparison
4. Security & Encryption
5. Logging & Privacy Policy
6. Streaming Support
7. Torrenting Support
8. Pricing Comparison
9. Server Locations
10. Apps & Platform Support
11. Who Should Choose Which
12. FAQ (8-10 questions)
13. CTA row
14. Related section

**CTA placements**: After quick verdict (subtle), after pricing comparison (primary), after FAQ (closing)

- [ ] **Step 1: Create `public/compare/vizoguard-vs-protonvpn.html`**

Use `compare/vizoguard-vs-nordvpn.html` as the structural template. Copy the exact head block structure, inline CSS, header/footer. Replace all content with ProtonVPN comparison. Write 3200-3500 words following the 14-section template. Include comparison table with teal highlight on Vizoguard columns. Include all 3 JSON-LD schemas.

- [ ] **Step 2: Verify HTML well-formed**
- [ ] **Step 3: Verify word count 3200-3500**
- [ ] **Step 4: Verify internal links**
- [ ] **Step 5: Commit**

```bash
cd /root/vizoguard && git add public/compare/vizoguard-vs-protonvpn.html
git commit -m "content: add /compare/vizoguard-vs-protonvpn (3200-3500 words)"
```

---

### Task 17: Create comparison page `/compare/vizoguard-vs-surfshark`

**Files:** Create: `public/compare/vizoguard-vs-surfshark.html`

- **H1**: "Vizoguard vs Surfshark — Full Comparison for 2026"
- **Target keyword**: `vizoguard vs surfshark`
- **Meta description**: "Vizoguard vs Surfshark: AI security + VPN from $24.99/yr vs budget VPN with unlimited devices from $27.48/yr. Compare features and security."
- **Competitor positioning**: Surfshark = budget leader, unlimited simultaneous devices, CleanWeb ad blocker. Vizoguard = deeper security layer (AI threat detection, phishing, connection monitoring).
- **Internal links to**: `/compare/vizoguard-vs-cyberghost`, `/compare/vizoguard-vs-protonvpn`, `/free-vpn`, `/pricing`

- [ ] **Steps 1-5**: Same pattern as Task 16

---

### Task 18: Create comparison page `/compare/vizoguard-vs-cyberghost`

**Files:** Create: `public/compare/vizoguard-vs-cyberghost.html`

- **H1**: "Vizoguard vs CyberGhost — Full Comparison for 2026"
- **Target keyword**: `vizoguard vs cyberghost`
- **Meta description**: "Vizoguard vs CyberGhost: AI security + VPN from $24.99/yr vs streaming-optimized VPN from $26.28/yr. Compare speed, security, and features."
- **Competitor positioning**: CyberGhost = streaming-optimized servers, huge network (11,000+ servers), 45-day refund. Vizoguard = security-first (AI threat detection, anti-phishing, Shadowsocks anti-censorship).
- **Internal links to**: `/compare/vizoguard-vs-surfshark`, `/compare/vizoguard-vs-expressvpn`, `/best-vpn-2026`, `/pricing`

- [ ] **Steps 1-5**: Same pattern as Task 16

---

### Task 19: Expand existing comparison pages to 3500 words

**Files:**
- Modify: `public/compare/vizoguard-vs-nordvpn.html`
- Modify: `public/compare/vizoguard-vs-expressvpn.html`

Add 5 new H2 sections to each page (currently ~2500 words → target ~3500):

1. **Speed Comparison** — real-world speed estimates, protocol impact on speed
2. **Streaming Support** — Netflix, YouTube, Disney+, regional content unblocking
3. **Torrenting Support** — P2P policies, port forwarding, DMCA handling
4. **Server Locations** — network size, geographic coverage, specialty servers
5. **Apps & Platform Support** — Windows, Mac, Android, iOS, Linux, routers, browser extensions

Insert these sections after the existing "VPN Performance" section and before "Privacy" section.

Also add 3 new FAQ questions to each page's FAQPage schema and HTML:
- "Which is faster, Vizoguard or [Competitor]?"
- "Can I use [Competitor] for streaming?"
- "Does [Competitor] support torrenting?"

Update the Article schema `dateModified` to today's date.

Add CTA row after the new Pricing Comparison section (bringing total CTAs from 1 to 3 per page, matching new comparison template).

Update Related section links to include new comparison pages:
- `vs-nordvpn` Related links: `/compare/vizoguard-vs-expressvpn`, `/compare/vizoguard-vs-protonvpn`, `/best-vpn-2026`, `/pricing`
- `vs-expressvpn` Related links: `/compare/vizoguard-vs-nordvpn`, `/compare/vizoguard-vs-surfshark`, `/best-vpn-2026`, `/pricing`

Also update `<lastmod>` for both pages in `sitemap.xml` (Task 21) to today's date.

**Note**: The existing pages already have Quick Verdict Box, Feature Comparison Table, Pricing section, and Who Should Choose — they match the 14-section template except for the 5 new sections being added here.

- [ ] **Step 1: Expand `vizoguard-vs-nordvpn.html`** — add 5 H2 sections (~1000 additional words), 3 FAQ items, 2 additional CTA rows, update Related links to exact targets above
- [ ] **Step 2: Verify word count ~3500**

Run: `cat /root/vizoguard/public/compare/vizoguard-vs-nordvpn.html | sed 's/<[^>]*>//g' | wc -w`
Expected: 3200-3500

- [ ] **Step 3: Expand `vizoguard-vs-expressvpn.html`** — same changes as step 1
- [ ] **Step 4: Verify word count ~3500**
- [ ] **Step 5: Commit**

```bash
cd /root/vizoguard && git add public/compare/vizoguard-vs-nordvpn.html public/compare/vizoguard-vs-expressvpn.html
git commit -m "content: expand comparison pages to 3500 words (speed, streaming, torrenting, servers, apps)"
```

---

### Task 20: Update existing blog post `what-is-vpn`

**Files:**
- Modify: `public/blog/what-is-vpn.html`

- [ ] **Step 1: Add Table of Contents**

After the `<div class="article-meta">` and before the first H2, add a ToC box:

```html
<nav class="toc" aria-label="Table of Contents">
  <h3>Table of Contents</h3>
  <ol>
    <li><a href="#what-is-a-vpn">What Is a VPN?</a></li>
    <!-- ... one entry per H2, with matching id attributes -->
  </ol>
</nav>
```

Add `id` attributes to each existing `<h2>` tag (e.g., `<h2 id="what-is-a-vpn">`).

- [ ] **Step 2: Update Related Articles section**

Replace current Related links with expanded list including new blog posts:

```html
<li><a href="/blog/how-does-vpn-work" style="color:var(--teal);">How Does a VPN Work? A Simple Guide</a></li>
<li><a href="/blog/vpn-vs-proxy" style="color:var(--teal);">VPN vs Proxy: What's the Difference?</a></li>
<li><a href="/blog/vpn-vs-antivirus" style="color:var(--teal);">VPN vs Antivirus: Do You Need Both?</a></li>
<li><a href="/blog/do-you-need-a-vpn" style="color:var(--teal);">Do You Need a VPN? Honest Answer for 2026</a></li>
<li><a href="/compare/vizoguard-vs-nordvpn" style="color:var(--teal);">Vizoguard vs NordVPN — Full Comparison</a></li>
```

- [ ] **Step 3: Verify HTML well-formed**
- [ ] **Step 4: Commit**

```bash
cd /root/vizoguard && git add public/blog/what-is-vpn.html
git commit -m "content: add ToC and update related articles in what-is-vpn"
```

---

### Task 21: Update sitemap.xml

**Files:**
- Modify: `public/sitemap.xml`

- [ ] **Step 1: Add 17 new URL entries**

Add these entries after the existing blog entry and before `setup.html`:

```xml
  <!-- Core SEO Pages -->
  <url>
    <loc>https://vizoguard.com/free-vpn</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/best-vpn-2026</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/vpn-download</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/secure-vpn</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/vpn-for-privacy</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <!-- Blog Posts -->
  <url>
    <loc>https://vizoguard.com/blog/how-does-vpn-work</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/blog/vpn-vs-proxy</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/blog/vpn-vs-antivirus</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/blog/public-wifi-security</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/blog/what-is-malware</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/blog/how-to-block-phishing</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/blog/do-you-need-a-vpn</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/blog/is-vpn-safe</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/blog/hide-ip-address</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>

  <!-- New Comparison Pages -->
  <url>
    <loc>https://vizoguard.com/compare/vizoguard-vs-protonvpn</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/compare/vizoguard-vs-surfshark</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://vizoguard.com/compare/vizoguard-vs-cyberghost</loc>
    <lastmod>2026-03-21</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

- [ ] **Step 2: Verify sitemap has exactly 32 URLs**

Run: `grep -c '<loc>' /root/vizoguard/public/sitemap.xml`
Expected: 32

- [ ] **Step 3: Verify sitemap is valid XML**

Run: `python3 -c "import xml.etree.ElementTree as ET; ET.parse('/root/vizoguard/public/sitemap.xml'); print('Valid XML')"`
Expected: "Valid XML"

- [ ] **Step 4: Commit**

```bash
cd /root/vizoguard && git add public/sitemap.xml
git commit -m "seo: add 17 new URLs to sitemap (32 total)"
```

---

### Task 22: Update service worker and bump cache versions

**Files:**
- Modify: `public/sw.js`

- [ ] **Step 1: Bump CACHE_NAME from `vg-v29` to `vg-v30`**

- [ ] **Step 2: Add new pages to APP_SHELL array**

Add after existing entries:

```javascript
  '/free-vpn.html',
  '/best-vpn-2026.html',
  '/vpn-download.html',
  '/secure-vpn.html',
  '/vpn-for-privacy.html',
  '/blog/how-does-vpn-work.html',
  '/blog/vpn-vs-proxy.html',
  '/blog/vpn-vs-antivirus.html',
  '/blog/public-wifi-security.html',
  '/blog/what-is-malware.html',
  '/blog/how-to-block-phishing.html',
  '/blog/do-you-need-a-vpn.html',
  '/blog/is-vpn-safe.html',
  '/blog/hide-ip-address.html',
  '/compare/vizoguard-vs-protonvpn.html',
  '/compare/vizoguard-vs-surfshark.html',
  '/compare/vizoguard-vs-cyberghost.html',
```

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard && git add public/sw.js
git commit -m "chore: bump cache to vg-v30, add 17 new pages to sw.js APP_SHELL"
```

---

### Task 23: Bump CSS/JS cache version across all HTML pages

**Files:**
- Modify: All HTML pages in `public/` that reference `style.css?v=18` or `main.js?v=18`

- [ ] **Step 1: Replace `?v=18` with `?v=19` in all existing HTML files**

Files to update (16 existing files with `?v=18`):
- `public/index.html`
- `public/pricing.html`, `public/download.html`, `public/setup.html`
- `public/privacy.html`, `public/terms.html`, `public/thank-you.html`
- `public/ar/index.html`, `public/hi/index.html`, `public/fr/index.html`
- `public/es/index.html`, `public/tr/index.html`, `public/ru/index.html`
- `public/compare/vizoguard-vs-nordvpn.html`, `public/compare/vizoguard-vs-expressvpn.html`
- `public/blog/what-is-vpn.html`

**Important**: New pages created in Tasks 2-18 should already use `?v=19`. This task only covers the 16 existing files above.

- [ ] **Step 3: Verify no `?v=18` references remain**

Run: `grep -r '?v=18' /root/vizoguard/public/ --include='*.html' | wc -l`
Expected: 0

- [ ] **Step 4: Commit**

```bash
cd /root/vizoguard && git add -A public/
git commit -m "chore: bump CSS/JS cache version from v=18 to v=19 across all pages"
```

---

### Task 24: Final verification and deploy

- [ ] **Step 1: Verify all 17 new files exist**

Run: `ls -la /root/vizoguard/public/free-vpn.html /root/vizoguard/public/best-vpn-2026.html /root/vizoguard/public/vpn-download.html /root/vizoguard/public/secure-vpn.html /root/vizoguard/public/vpn-for-privacy.html /root/vizoguard/public/blog/how-does-vpn-work.html /root/vizoguard/public/blog/vpn-vs-proxy.html /root/vizoguard/public/blog/vpn-vs-antivirus.html /root/vizoguard/public/blog/public-wifi-security.html /root/vizoguard/public/blog/what-is-malware.html /root/vizoguard/public/blog/how-to-block-phishing.html /root/vizoguard/public/blog/do-you-need-a-vpn.html /root/vizoguard/public/blog/is-vpn-safe.html /root/vizoguard/public/blog/hide-ip-address.html /root/vizoguard/public/compare/vizoguard-vs-protonvpn.html /root/vizoguard/public/compare/vizoguard-vs-surfshark.html /root/vizoguard/public/compare/vizoguard-vs-cyberghost.html`
Expected: All 17 files present

- [ ] **Step 2: Verify all pages accessible via clean URLs**

Run for each new page:
```bash
curl -sf -o /dev/null -w '%{http_code}' https://vizoguard.com/free-vpn
curl -sf -o /dev/null -w '%{http_code}' https://vizoguard.com/best-vpn-2026
curl -sf -o /dev/null -w '%{http_code}' https://vizoguard.com/vpn-download
curl -sf -o /dev/null -w '%{http_code}' https://vizoguard.com/secure-vpn
curl -sf -o /dev/null -w '%{http_code}' https://vizoguard.com/vpn-for-privacy
curl -sf -o /dev/null -w '%{http_code}' https://vizoguard.com/blog/how-does-vpn-work
# ... etc for all 17
```
Expected: 200 for each

- [ ] **Step 3: Spot-check JSON-LD schemas**

Run: `grep -c 'application/ld+json' /root/vizoguard/public/free-vpn.html`
Expected: 3 (Article + FAQPage + BreadcrumbList)

Repeat for 2-3 other pages to verify.

- [ ] **Step 4: Verify sitemap count**

Run: `grep -c '<loc>' /root/vizoguard/public/sitemap.xml`
Expected: 32

- [ ] **Step 5: Verify no broken internal links**

Run: `grep -ohP 'href="/[^"#]*"' /root/vizoguard/public/free-vpn.html /root/vizoguard/public/best-vpn-2026.html /root/vizoguard/public/blog/how-does-vpn-work.html /root/vizoguard/public/compare/vizoguard-vs-protonvpn.html | sort -u | sed 's/href="//;s/"//' | while read p; do f="/root/vizoguard/public${p}"; [ -f "$f" ] || [ -f "${f}.html" ] || echo "BROKEN: $p"; done`
Expected: No output (no broken links)

- [ ] **Step 6: Update CLAUDE.md**

Update the SEO Pages section in `/root/vizoguard/CLAUDE.md` to reflect the new page inventory:

```markdown
## SEO Pages
- Core SEO: `public/free-vpn.html`, `public/best-vpn-2026.html`, `public/vpn-download.html`, `public/secure-vpn.html`, `public/vpn-for-privacy.html`
- Comparison: `public/compare/vizoguard-vs-{nordvpn,expressvpn,protonvpn,surfshark,cyberghost}.html` — Article + FAQPage + BreadcrumbList schemas, 3200-3500 words each
- Blog: `public/blog/{what-is-vpn,how-does-vpn-work,vpn-vs-proxy,vpn-vs-antivirus,public-wifi-security,what-is-malware,how-to-block-phishing,do-you-need-a-vpn,is-vpn-safe,hide-ip-address}.html`
- Sitemap: 32 URLs in `public/sitemap.xml`
```

- [ ] **Step 7: Commit CLAUDE.md update**

```bash
cd /root/vizoguard && git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Phase 1 SEO page inventory"
```
