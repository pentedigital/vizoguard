# Phase 2: Conversion & Authority Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase conversion rate on existing traffic (pricing/download/thank-you optimization) + add 4 commercial-intent authority pages.

**Architecture:** Modify 3 existing HTML pages to add CRO elements (testimonials, trust badges, objection FAQ, post-discount state). Create 4 new SEO pages following Phase 1 template patterns. Bump CSS/JS cache version from v=19 to v=20.

**Tech Stack:** HTML, CSS, vanilla JS (date-check for post-discount), JSON-LD structured data, Google Analytics (gtag.js)

**Note:** CLAUDE.md currently shows `vg-v30` and `32 URLs` — these are stale. Actual values are `vg-v31` and `34 URLs` (verified). Will be corrected in Task 12.

**Spec:** `docs/superpowers/specs/2026-03-21-phase2-conversion-authority-design.md`

---

## File Map

### Modified Files (3 existing pages + infrastructure)

| File | Changes |
|------|---------|
| `public/pricing.html` | Add testimonials section, trust badges row, 4 new FAQ questions, post-discount JS state |
| `public/download.html` | Add "What You'll See" preview, trust badges, 3 new FAQ questions, post-download CTA |
| `public/thank-you.html` | Add onboarding box, stronger upsell copy, support reassurance, post-discount price swap |

### New Files (4 authority pages)

| File | Type | Word Count |
|------|------|-----------|
| `public/features.html` | Authority/Product | 2500-3000 |
| `public/ai-threat-protection.html` | Authority/Differentiator | 2500-3000 |
| `public/vpn-for-streaming.html` | Authority/Commercial SEO | 2500-3000 |
| `public/vpn-for-torrenting.html` | Authority/Commercial SEO | 2500-3000 |

### Infrastructure Updates

| File | Change |
|------|--------|
| `public/sitemap.xml` | Add 4 new URLs (34→38) |
| `public/sw.js` | Bump vg-v31→vg-v32, add 4 pages to APP_SHELL |
| All HTML files | Bump ?v=19 → ?v=20 |
| `public/css/style.css` | Add testimonial card + trust badge CSS |

---

## Reference: New CSS Components

These styles need to be added to `style.css` before page modifications. All page tasks reference these classes.

**Testimonial cards:**
```css
.testimonials { margin: 48px 0; }
.testimonials h2 { text-align: center; }
.testimonial-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 24px; }
.testimonial-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
.testimonial-stars { color: #f5a623; font-size: 1rem; margin-bottom: 12px; }
.testimonial-quote { color: var(--text-2); font-size: 0.9rem; line-height: 1.6; font-style: italic; margin-bottom: 16px; }
.testimonial-author { color: var(--text); font-weight: 600; font-size: 0.85rem; }
.testimonial-role { color: var(--text-3); font-size: 0.8rem; }
@media (max-width: 768px) { .testimonial-grid { grid-template-columns: 1fr; } }
```

**Trust badges:**
```css
.trust-badges { display: flex; justify-content: center; gap: 32px; flex-wrap: wrap; margin: 40px 0; padding: 24px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.trust-badge { text-align: center; color: var(--text-3); font-size: 0.75rem; }
.trust-badge-icon { font-size: 1.5rem; display: block; margin-bottom: 6px; color: var(--teal); }
@media (max-width: 480px) { .trust-badges { gap: 20px; } .trust-badge { font-size: 0.7rem; } }
```

**Preview cards (download page):**
```css
.preview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 24px 0 40px; }
.preview-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
.preview-card h3 { color: var(--teal); font-size: 1rem; margin-bottom: 12px; }
.preview-card p { color: var(--text-2); font-size: 0.9rem; line-height: 1.6; }
.preview-card .benefit { color: var(--text); font-weight: 500; margin-top: 12px; font-size: 0.85rem; }
@media (max-width: 768px) { .preview-grid { grid-template-columns: 1fr; } }
```

---

## Tasks

### Task 1: Add new CSS components to style.css

**Files:**
- Modify: `public/css/style.css`

- [ ] **Step 1: Add testimonial, trust badge, and preview card CSS**

Add the three CSS component blocks (testimonials, trust badges, preview cards) shown in the Reference section above. Insert before the responsive media queries section. Also add responsive overrides inside the existing 768px and 480px media query blocks.

- [ ] **Step 2: Verify CSS is valid**

Run: `node -e "require('fs').readFileSync('/root/vizoguard/public/css/style.css','utf8'); console.log('OK')"`

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard && git add public/css/style.css
git commit -m "style: add testimonial cards, trust badges, and preview card CSS"
```

---

### Task 2: Optimize pricing.html — add testimonials, trust badges, FAQ, post-discount

**Files:**
- Modify: `public/pricing.html`

Read the file first to understand its full structure. Then make these 4 additions:

- [ ] **Step 1: Add testimonials section**

Insert after the feature comparison table and before the FAQ section. Use this structure:

```html
<!-- PLACEHOLDER: Replace with real testimonials -->
<section class="testimonials">
  <h2>What Our Users Say</h2>
  <div class="testimonial-grid">
    <div class="testimonial-card">
      <div class="testimonial-stars">★★★★★</div>
      <p class="testimonial-quote">"I work from coffee shops every day. Vizoguard Basic gives me peace of mind that my traffic is encrypted — for less than a latte per month."</p>
      <div class="testimonial-author">Sarah K.</div>
      <div class="testimonial-role">Remote Worker</div>
    </div>
    <div class="testimonial-card">
      <div class="testimonial-stars">★★★★★</div>
      <p class="testimonial-quote">"Switched from NordVPN to Vizoguard Pro. The AI threat detection catches phishing domains that my old VPN never blocked. Worth every penny."</p>
      <div class="testimonial-author">Marcus D.</div>
      <div class="testimonial-role">Privacy Advocate</div>
    </div>
    <div class="testimonial-card">
      <div class="testimonial-stars">★★★★★</div>
      <p class="testimonial-quote">"I travel between 4 countries for work. Vizoguard's Shadowsocks protocol bypasses every firewall I've hit. Basic plan, $24.99 for the whole year."</p>
      <div class="testimonial-author">Rina P.</div>
      <div class="testimonial-role">Digital Nomad</div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Add trust badges row**

Insert after testimonials section:

```html
<div class="trust-badges">
  <div class="trust-badge"><span class="trust-badge-icon">🔒</span>AES-256 Encryption</div>
  <div class="trust-badge"><span class="trust-badge-icon">👁‍🗨</span>Zero-Log Policy</div>
  <div class="trust-badge"><span class="trust-badge-icon">🛡</span>Secure Payments via Stripe</div>
  <div class="trust-badge"><span class="trust-badge-icon">↩</span>30-Day Guarantee</div>
  <div class="trust-badge"><span class="trust-badge-icon">✓</span>GDPR Compliant</div>
</div>
```

- [ ] **Step 3: Add 4 new FAQ questions**

Add these to both the HTML FAQ accordion AND the FAQPage JSON-LD schema. FAQ text must match schema exactly.

Questions to add:
1. "Will Vizoguard slow down my device?" — No noticeable impact. Lightweight URL analysis, not deep packet inspection. VPN adds <5% latency.
2. "Why is Vizoguard so much cheaper than NordVPN?" — Focus on security + VPN, not 6,000+ servers. Lower infrastructure = lower price. More security features for less.
3. "Can I try before I buy?" — No free trial, but 30-day money-back guarantee. Try risk-free.
4. "What happens if I'm not satisfied?" — Email support within 30 days for full refund. No questions asked.

- [ ] **Step 4: Add post-discount JavaScript**

Add a script at the bottom (before `</body>`) that checks the date and toggles discount elements:

```javascript
// Post-discount state: hide urgency elements after April 4, 2026
(function() {
  if (new Date() > new Date('2026-04-04T23:59:59Z')) {
    // Hide discount elements
    document.querySelectorAll('.urgency-banner, .discount-badge, .price-regular').forEach(function(el) {
      el.style.display = 'none';
    });
    // Update prices to regular
    document.querySelectorAll('[data-regular-price]').forEach(function(el) {
      el.textContent = el.getAttribute('data-regular-price');
    });
  }
})();
```

Add `data-regular-price` attributes to price elements: `data-regular-price="$49.99"` on Basic price, `data-regular-price="$149.99"` on Pro price, `data-regular-price="$4.17/month"` and `data-regular-price="$12.50/month"` on per-month text.

- [ ] **Step 5: Verify HTML is well-formed and FAQ count is 11**

Run: `python3 -c "import html.parser,sys; p=html.parser.HTMLParser(); p.feed(open(sys.argv[1]).read()); print('OK')" /root/vizoguard/public/pricing.html`
Run: `grep -c 'faq-question' /root/vizoguard/public/pricing.html` → should be 11
Run: `grep -c '"Question"' /root/vizoguard/public/pricing.html` → should be 11

- [ ] **Step 6: Commit**

```bash
cd /root/vizoguard && git add public/pricing.html
git commit -m "cro: add testimonials, trust badges, objection FAQ, post-discount state to pricing page"
```

---

### Task 3: Optimize download.html — add preview, trust badges, FAQ

**Files:**
- Modify: `public/download.html`

Read the file first. Then:

- [ ] **Step 1: Add "What You'll See" preview section**

Insert after the download buttons and before the "Set up in 60 seconds" section:

```html
<h2>What You'll See After Download</h2>
<div class="preview-grid">
  <div class="preview-card">
    <h3>Basic: Connect in 10 Seconds</h3>
    <p>Open the Outline app → tap <strong>Connect</strong> → you're protected. That's it. Your traffic is encrypted from the moment you connect.</p>
    <p class="benefit">✓ All traffic encrypted instantly</p>
  </div>
  <div class="preview-card">
    <h3>Pro: Full Security Dashboard</h3>
    <p>Launch Vizoguard → enter your license key → the dashboard shows real-time threat monitoring, connection activity, and VPN status in one view.</p>
    <p class="benefit">✓ AI threat detection starts immediately</p>
  </div>
</div>
```

- [ ] **Step 2: Add trust badges row**

Same trust badges HTML as pricing page. Insert after the preview section.

- [ ] **Step 3: Add 3 new FAQ questions**

Add to both HTML and FAQPage schema:
1. "Is the download safe? How do I verify?" — HTTPS, code-signed macOS, official Outline app from App Store/Google Play.
2. "Can I install on multiple devices?" — Basic: any device via Outline. Pro: one desktop license + Outline on other devices.
3. "What's the difference between Outline and Vizoguard app?" — Outline = VPN client (all plans). Vizoguard app = AI security + VPN (Pro, desktop only).

- [ ] **Step 4: Add post-download CTA**

After FAQ, before footer:

```html
<div class="verdict-box" style="text-align:center; margin-top:48px;">
  <h3>Don't have a license yet?</h3>
  <p>Get started with Vizoguard Basic for $24.99/yr — that's just $2.08/month for encrypted VPN protection on every device.</p>
  <div class="cta-row" style="justify-content:center; margin-top:16px;">
    <a href="/pricing" class="btn">See Pricing Plans</a>
  </div>
</div>
```

- [ ] **Step 5: Verify HTML and FAQ count (9)**

- [ ] **Step 6: Commit**

```bash
cd /root/vizoguard && git add public/download.html
git commit -m "cro: add preview cards, trust badges, expanded FAQ to download page"
```

---

### Task 4: Optimize thank-you.html — onboarding, upsell, support

**Files:**
- Modify: `public/thank-you.html`

Read the file first. This page has dynamic JS that shows different states (loading/success/pending/error). Modifications go inside the success state HTML.

- [ ] **Step 1: Add onboarding box**

Inside the success state, after the license key display and VPN connection button, before the existing upsell box, add:

```html
<div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px 24px; margin:24px 0; text-align:left; max-width:400px; margin-left:auto; margin-right:auto;">
  <h4 style="color:var(--text); font-size:0.95rem; margin-bottom:12px;">3 Things to Do Now</h4>
  <ol style="color:var(--text-2); font-size:0.85rem; line-height:1.8; padding-left:20px; margin:0;">
    <li><strong style="color:var(--text)">Connect your VPN</strong> — tap the button above</li>
    <li><strong style="color:var(--text)">Browse normally</strong> — your traffic is now encrypted</li>
    <li><strong style="color:var(--text)">Learn more</strong> — check our <a href="/setup" style="color:var(--teal)">setup guide</a> for tips</li>
  </ol>
</div>
```

- [ ] **Step 2: Replace upsell box copy (Basic users only)**

Find the existing upsell box (contains "Want AI threat protection too?") and replace with:

**Headline**: "You're protected from tracking. Want to be protected from threats too?"
**Bullets**: AI phishing detection, real-time malware blocking, connection monitoring
**CTA**: `<span class="upsell-price">$99.99/yr</span>` (with data attribute for post-discount swap)

- [ ] **Step 3: Add post-discount price swap**

Add JS at the bottom:
```javascript
if (new Date() > new Date('2026-04-04T23:59:59Z')) {
  document.querySelectorAll('.upsell-price').forEach(function(el) { el.textContent = '$149.99/yr'; });
}
```

- [ ] **Step 4: Add support reassurance**

At the bottom of the page, before footer:
```html
<p style="color:var(--text-3); font-size:0.75rem; text-align:center; margin-top:32px;">Questions? Email <a href="mailto:support@vizoguard.com" style="color:var(--teal)">support@vizoguard.com</a> — we typically respond within 24 hours</p>
```

- [ ] **Step 5: Verify HTML well-formed**

- [ ] **Step 6: Commit**

```bash
cd /root/vizoguard && git add public/thank-you.html
git commit -m "cro: add onboarding tips, stronger upsell, support reassurance to thank-you page"
```

---

### Task 5: Create `/features` authority page

**Files:**
- Create: `public/features.html`

**Content spec:**
- **H1**: "Vizoguard Features: AI Security + VPN in One App"
- **Title**: "Vizoguard Features: AI Security + VPN in One App | Vizoguard"
- **Target keyword**: `vizoguard features`
- **Meta description**: "Explore Vizoguard's features — AI threat detection, phishing protection, connection monitoring, self-healing security, and encrypted VPN in one app."
- **Canonical**: `https://vizoguard.com/features`
- **Word count**: 2500-3000
- **Layout**: `<main class="seo-page">`, Breadcrumb: Home → Features (2 items)
- **Analytics**: `gtag('event','seo_cta',{page:'features',plan:'basic|pro'})`
- **Author in schema**: Organization (Vizoguard), NOT personal author
- **CSS/JS**: `?v=20`

**Template**: Read `public/free-vpn.html` for the exact HTML structure. Follow it precisely.

**H2 sections**: AI Threat Detection → Phishing Protection → Connection Monitoring → Self-Healing Protection → Encrypted VPN → Zero-Logging Policy → Platform Support → Pricing Overview → FAQ (8-10 questions)

**CTA placements**: After section 2, after section 5, after section 8, after FAQ
**Internal links**: `/pricing`, `/ai-threat-protection`, `/secure-vpn`, `/download`, `/blog/vpn-vs-antivirus`
**Tone**: Product-focused, clear, not salesy. "Here's what it does" with explanations.

3 JSON-LD schemas (Article + FAQPage + BreadcrumbList). Verify then commit:
```bash
cd /root/vizoguard && git add public/features.html
git commit -m "content: add /features authority page (2500-3000 words)"
```

---

### Task 6: Create `/ai-threat-protection` authority page

**Files:**
- Create: `public/ai-threat-protection.html`

**Content spec:**
- **H1**: "AI Threat Protection: How Vizoguard Blocks Threats in Real Time"
- **Title**: "AI Threat Protection: How Vizoguard Blocks Threats in Real Time | Vizoguard"
- **Target keyword**: `ai threat protection`
- **Meta description**: "How does AI threat protection work? Learn how Vizoguard's 8 analysis vectors detect phishing, malware, and zero-day threats before your browser loads them."
- **Canonical**: `https://vizoguard.com/ai-threat-protection`
- **Word count**: 2500-3000
- **Layout**: `<main class="seo-page">`, Breadcrumb: Home → AI Threat Protection (2 items)
- **Analytics**: `gtag('event','seo_cta',{page:'ai-threat-protection',plan:'basic|pro'})`
- **Author in schema**: Organization (Vizoguard)
- **CSS/JS**: `?v=20`

**H2 sections**: What Is AI Threat Protection? → The 8 Analysis Vectors (blocklist, suspicious TLDs, brand impersonation, IP-in-URL, excessive subdomains, dangerous downloads, homoglyphs, phishing keywords) → How It Works (intercepts URL before browser loads) → What It Catches That Blocklists Miss → AI vs Traditional Antivirus (comparison table) → Who Needs AI Threat Protection → FAQ (8-10 questions)

**CTA placements**: After section 3, after section 5, after FAQ
**Internal links**: `/features`, `/blog/what-is-malware`, `/blog/how-to-block-phishing`, `/pricing`
**Tone**: Technical authority. This is the differentiator — explain deeply.

3 JSON-LD schemas. Verify then commit:
```bash
cd /root/vizoguard && git add public/ai-threat-protection.html
git commit -m "content: add /ai-threat-protection authority page (2500-3000 words)"
```

---

### Task 7: Create `/vpn-for-streaming` authority page

**Files:**
- Create: `public/vpn-for-streaming.html`

**Content spec:**
- **H1**: "VPN for Streaming: Unblock Netflix, YouTube, and More"
- **Title**: "VPN for Streaming: Unblock Netflix, YouTube, and More | Vizoguard"
- **Target keyword**: `vpn for streaming`
- **Meta description**: "Can you use a VPN for streaming? Learn which VPNs unblock Netflix, Disney+, and YouTube — and which ones actually work in 2026."
- **Canonical**: `https://vizoguard.com/vpn-for-streaming`
- **Word count**: 2500-3000
- **Layout**: `<main class="seo-page">`, Breadcrumb: Home → VPN for Streaming (2 items)
- **Analytics**: `gtag('event','seo_cta',{page:'vpn-for-streaming',plan:'basic|pro'})`
- **Author in schema**: Organization (Vizoguard)
- **CSS/JS**: `?v=20`

**H2 sections**: Why You Need a VPN for Streaming → What a Streaming VPN Unblocks → Best VPNs for Streaming (honest — NordVPN best, ExpressVPN fast, Surfshark budget, CyberGhost dedicated) → Does Vizoguard Work for Streaming? (HONEST: basic streaming yes, geo-unblocking limited with 1 region) → How to Set Up VPN for Streaming → Common Streaming VPN Problems → FAQ (8-10 questions)

**CTA placements**: After section 4 (honest positioning builds trust → CTA), after FAQ
**Internal links**: `/compare/vizoguard-vs-nordvpn`, `/compare/vizoguard-vs-expressvpn`, `/best-vpn-2026`, `/pricing`
**Tone**: Honest. Acknowledge competitors are better for streaming. Trust builds conversions.

3 JSON-LD schemas. Verify then commit:
```bash
cd /root/vizoguard && git add public/vpn-for-streaming.html
git commit -m "content: add /vpn-for-streaming authority page (2500-3000 words)"
```

---

### Task 8: Create `/vpn-for-torrenting` authority page

**Files:**
- Create: `public/vpn-for-torrenting.html`

**Content spec:**
- **H1**: "VPN for Torrenting: How to Torrent Safely in 2026"
- **Title**: "VPN for Torrenting: How to Torrent Safely in 2026 | Vizoguard"
- **Target keyword**: `vpn for torrenting`
- **Meta description**: "How to torrent safely with a VPN in 2026. Learn which VPNs support P2P, what to look for, and how to protect your privacy while downloading."
- **Canonical**: `https://vizoguard.com/vpn-for-torrenting`
- **Word count**: 2500-3000
- **Layout**: `<main class="seo-page">`, Breadcrumb: Home → VPN for Torrenting (2 items)
- **Analytics**: `gtag('event','seo_cta',{page:'vpn-for-torrenting',plan:'basic|pro'})`
- **Author in schema**: Organization (Vizoguard)
- **CSS/JS**: `?v=20`

**H2 sections**: Is Torrenting Legal? → Why You Need a VPN for Torrenting → What to Look for in a Torrenting VPN → Best VPNs for Torrenting (honest — NordVPN P2P servers, Surfshark unlimited devices, ExpressVPN speed) → Does Vizoguard Support Torrenting? (HONEST: encrypted + zero-logging = safe for P2P, 1 region limits options, no port forwarding) → How to Torrent Safely → FAQ (8-10 questions)

**CTA placements**: After section 5, after FAQ
**Internal links**: `/compare/vizoguard-vs-surfshark`, `/vpn-for-privacy`, `/secure-vpn`, `/pricing`
**Tone**: Honest, educational. Position accurately — security-first with torrenting support, not "best torrenting VPN."

3 JSON-LD schemas. Verify then commit:
```bash
cd /root/vizoguard && git add public/vpn-for-torrenting.html
git commit -m "content: add /vpn-for-torrenting authority page (2500-3000 words)"
```

---

### Task 9: Add post-discount logic to all 7 landing pages

**Files:**
- Modify: `public/index.html`, `public/ar/index.html`, `public/hi/index.html`, `public/fr/index.html`, `public/es/index.html`, `public/tr/index.html`, `public/ru/index.html`

Each landing page has an inline countdown script and urgency banner. Add the same post-discount toggle pattern used in pricing.html.

- [ ] **Step 1: Read each file to find the countdown script location**

- [ ] **Step 2: Add post-discount logic to each page**

After the existing countdown script in each page, add:
```javascript
// Post-discount: hide urgency elements after April 4, 2026
if (new Date() > new Date('2026-04-04T23:59:59Z')) {
  document.querySelectorAll('.urgency-banner, .discount-badge, .price-regular').forEach(function(el) {
    el.style.display = 'none';
  });
  document.querySelectorAll('[data-regular-price]').forEach(function(el) {
    el.textContent = el.getAttribute('data-regular-price');
  });
}
```

Add `data-regular-price` attributes to price elements in each page (Basic: "$49.99", Pro: "$149.99", and per-month: "$4.17/month", "$12.50/month").

Also on `index.html` only: add comment `<!-- UPDATE PRICES AFTER 2026-04-04: Basic $49.99, Pro $149.99 -->` next to the four `priceValidUntil` entries in the SoftwareApplication JSON-LD schema.

- [ ] **Step 3: Test by temporarily setting date forward** (optional manual test)

- [ ] **Step 4: Commit**

```bash
cd /root/vizoguard && git add public/index.html public/ar/index.html public/hi/index.html public/fr/index.html public/es/index.html public/tr/index.html public/ru/index.html
git commit -m "cro: add post-discount price toggle to all 7 landing pages"
```

---

### Task 10: Update internal links on existing pages

**Files:**
- Modify: `public/index.html` (features section)
- Modify: `public/pricing.html` (add link to /features)
- Modify: `public/blog/vpn-vs-antivirus.html` (add link to /ai-threat-protection)
- Modify: `public/blog/what-is-malware.html` (add link to /ai-threat-protection)
- Modify: `public/best-vpn-2026.html` (add links to /vpn-for-streaming, /vpn-for-torrenting)
- Modify: `public/compare/vizoguard-vs-nordvpn.html` (add links to /vpn-for-streaming, /vpn-for-torrenting)
- Modify: `public/compare/vizoguard-vs-expressvpn.html` (add links to /vpn-for-streaming, /vpn-for-torrenting)

- [ ] **Step 1: Add "Learn more" links in index.html features section**

In the features grid on index.html, add links to `/features` and `/ai-threat-protection` on relevant feature cards.

- [ ] **Step 2: Add /features link to pricing.html**

In the feature comparison table or "What's included" area, add a link: `<a href="/features" style="color:var(--teal)">See all features</a>`

- [ ] **Step 3: Add /ai-threat-protection link to vpn-vs-antivirus blog**

Find a natural place in the content to add: `<a href="/ai-threat-protection" style="color:var(--teal)">AI threat protection</a>`

- [ ] **Step 4: Add /ai-threat-protection link to what-is-malware blog**

Same approach — natural inline link.

- [ ] **Step 5: Add streaming/torrenting links to best-vpn-2026**

Add links to `/vpn-for-streaming` and `/vpn-for-torrenting` in relevant sections.

- [ ] **Step 6: Add streaming/torrenting links to comparison pages**

In the Streaming Support and Torrenting Support sections of `vizoguard-vs-nordvpn.html` and `vizoguard-vs-expressvpn.html`, add inline links to `/vpn-for-streaming` and `/vpn-for-torrenting`.

- [ ] **Step 7: Commit**

```bash
cd /root/vizoguard && git add public/index.html public/pricing.html public/blog/vpn-vs-antivirus.html public/blog/what-is-malware.html public/best-vpn-2026.html public/compare/vizoguard-vs-nordvpn.html public/compare/vizoguard-vs-expressvpn.html
git commit -m "seo: add internal links to new Phase 2 authority pages"
```

---

### Task 11: Update sitemap, service worker, bump cache version

**Files:**
- Modify: `public/sitemap.xml`
- Modify: `public/sw.js`
- Modify: All HTML files (v=19 → v=20)

- [ ] **Step 1: Add 4 new URLs to sitemap**

```xml
<url>
  <loc>https://vizoguard.com/features</loc>
  <lastmod>2026-03-21</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.9</priority>
</url>
<url>
  <loc>https://vizoguard.com/ai-threat-protection</loc>
  <lastmod>2026-03-21</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
</url>
<url>
  <loc>https://vizoguard.com/vpn-for-streaming</loc>
  <lastmod>2026-03-21</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
</url>
<url>
  <loc>https://vizoguard.com/vpn-for-torrenting</loc>
  <lastmod>2026-03-21</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
</url>
```

- [ ] **Step 2: Verify sitemap count**

Run: `grep -c '<loc>' /root/vizoguard/public/sitemap.xml` → 38

- [ ] **Step 3: Bump sw.js cache and add pages**

Change `CACHE_NAME` from `vg-v31` to `vg-v32`. Add 4 new entries to APP_SHELL:
```javascript
'/features.html',
'/ai-threat-protection.html',
'/vpn-for-streaming.html',
'/vpn-for-torrenting.html',
```

- [ ] **Step 4: Bump CSS/JS version across all HTML files**

Run: `for f in $(grep -rl '?v=19' public/ --include='*.html'); do sed -i 's/?v=19/?v=20/g' "$f"; done`
Verify: `grep -rl '?v=19' public/ --include='*.html' | wc -l` → 0

- [ ] **Step 5: Commit**

```bash
cd /root/vizoguard && git add public/sitemap.xml public/sw.js && git add -A public/
git commit -m "chore: sitemap to 38 URLs, sw.js to vg-v32, bump CSS/JS to v=20"
```

---

### Task 12: Final verification and CLAUDE.md update

- [ ] **Step 1: Verify all 4 new files exist**

Run: `ls -la public/features.html public/ai-threat-protection.html public/vpn-for-streaming.html public/vpn-for-torrenting.html`

- [ ] **Step 2: Verify sitemap count is 38**

Run: `grep -c '<loc>' public/sitemap.xml` → 38

- [ ] **Step 3: Verify no broken internal links (spot check)**

Run: `grep -ohP 'href="/[^"#]*"' public/features.html public/ai-threat-protection.html public/pricing.html | sort -u | sed 's/href="//;s/"//' | grep -v -E '^/(css|js|icons|manifest|favicon)' | while read p; do [ -f "public${p}" ] || [ -f "public${p}.html" ] || [ -d "public${p}" ] || echo "BROKEN: $p"; done`

- [ ] **Step 4: Verify post-discount JS exists on all relevant pages**

Run: `grep -c '2026-04-04' public/pricing.html public/thank-you.html public/index.html public/ar/index.html` → each should be >= 1

- [ ] **Step 5: Verify testimonials on pricing page**

Run: `grep -c 'testimonial-card' public/pricing.html` → 3

- [ ] **Step 6: Update CLAUDE.md**

Add to the SEO Pages section:
```
- Authority: `public/features.html`, `public/ai-threat-protection.html`, `public/vpn-for-streaming.html`, `public/vpn-for-torrenting.html` — 900px seo-page layout, 2500-3000 words each
- CRO: Pricing page has testimonials (placeholder), trust badges, 11 FAQ questions, post-discount state after April 4 2026
- Cache: CSS/JS at `?v=20`, service worker `CACHE_NAME = 'vg-v32'`, sitemap: 38 URLs
```

- [ ] **Step 7: Commit**

```bash
cd /root/vizoguard && git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Phase 2 page inventory"
```
