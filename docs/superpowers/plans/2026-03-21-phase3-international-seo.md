# Phase 3: International SEO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate 10 high-value English pages into 6 languages (ar, hi, fr, es, tr, ru) = 60 new pages to multiply organic traffic 2-4x.

**Architecture:** Direct translation of English HTML pages. Each translated page is a standalone HTML file in `public/<lang>/` following the English original's exact structure. hreflang cross-references added to all versions (including English originals). Sitemap expanded with hreflang entries.

**Tech Stack:** HTML, JSON-LD structured data, hreflang tags, XML sitemap

**Spec:** `docs/superpowers/specs/2026-03-21-phase3-international-seo-design.md`

---

## Critical Reference: How to Translate a Page

Every subagent creating a translated page MUST follow this process:

### Step 1: Read the English original
Read the full English HTML file to understand structure, content, CRO elements, and internal links.

### Step 2: Create the translated file
Copy the entire English HTML and translate ALL visible text:
- Title tag, meta description, meta keywords
- All H1, H2, H3, paragraphs, list items, button text, CTA copy
- FAQ questions and answers (both HTML accordion AND JSON-LD FAQPage schema — must match)
- Article schema `headline` and `description`
- BreadcrumbList schema names
- Breadcrumb nav text

### Step 3: Update metadata
- `<html lang="XX" dir="ltr">` (or `dir="rtl"` for Arabic)
- `<link rel="canonical" href="https://vizoguard.com/XX/page-slug">`
- `og:url` → self URL
- `og:locale` → correct locale (ar_SA, hi_IN, fr_FR, es_ES, tr_TR, ru_RU)
- Article schema `inLanguage` → language code
- Author stays `{"@type": "Organization", "name": "Vizoguard"}` (English, don't translate)

### Step 4: Add hreflang block
Add this block in `<head>` (replace `PAGE` with the page path):
```html
<link rel="alternate" hreflang="en" href="https://vizoguard.com/PAGE">
<link rel="alternate" hreflang="ar" href="https://vizoguard.com/ar/PAGE">
<link rel="alternate" hreflang="hi" href="https://vizoguard.com/hi/PAGE">
<link rel="alternate" hreflang="fr" href="https://vizoguard.com/fr/PAGE">
<link rel="alternate" hreflang="es" href="https://vizoguard.com/es/PAGE">
<link rel="alternate" hreflang="tr" href="https://vizoguard.com/tr/PAGE">
<link rel="alternate" hreflang="ru" href="https://vizoguard.com/ru/PAGE">
<link rel="alternate" hreflang="x-default" href="https://vizoguard.com/PAGE">
```

### Step 5: Fix internal links
- Links to Tier 1 pages → use same-language version (e.g., `/ar/free-vpn` not `/free-vpn`)
- Links to non-translated pages (blog, pricing, download) → keep English URLs
- Related section links → same-language where available

### Step 6: Arabic-specific
- `<html lang="ar" dir="rtl">`
- Add `<link rel="stylesheet" href="/css/rtl.css">` after style.css

### Step 7: Keep unchanged
- All CRO elements (urgency banner, countdown, sticky CTA, discount badges)
- Post-discount JS (`2026-04-04` date check)
- Analytics gtag events (keep English event names)
- Header/footer structure (nav links to `/pricing`, `/download` in English)
- CSS/JS at `?v=20`
- No `noindex` or robots restrictions

### Step 8: Verify
```bash
python3 -c "import html.parser,sys; p=html.parser.HTMLParser(); p.feed(open(sys.argv[1]).read()); print('OK')" FILE
grep -c 'hreflang' FILE  # → 8
grep -c 'application/ld+json' FILE  # → 3
```

---

## Tier 1 Pages — Translation Map

| # | English Source | Page Path for hreflang |
|---|---------------|----------------------|
| 1 | `public/free-vpn.html` | `free-vpn` |
| 2 | `public/best-vpn-2026.html` | `best-vpn-2026` |
| 3 | `public/vpn-download.html` | `vpn-download` |
| 4 | `public/secure-vpn.html` | `secure-vpn` |
| 5 | `public/vpn-for-privacy.html` | `vpn-for-privacy` |
| 6 | `public/compare/vizoguard-vs-nordvpn.html` | `compare/vizoguard-vs-nordvpn` |
| 7 | `public/compare/vizoguard-vs-expressvpn.html` | `compare/vizoguard-vs-expressvpn` |
| 8 | `public/compare/vizoguard-vs-protonvpn.html` | `compare/vizoguard-vs-protonvpn` |
| 9 | `public/features.html` | `features` |
| 10 | `public/ai-threat-protection.html` | `ai-threat-protection` |

---

## Tasks

### Task 1: Create translation directories

**Files:**
- Create directories: `public/ar/compare/`, `public/fr/compare/`, `public/es/compare/`, `public/hi/compare/`, `public/tr/compare/`, `public/ru/compare/`

- [ ] **Step 1: Create directories**

```bash
mkdir -p public/ar/compare public/fr/compare public/es/compare public/hi/compare public/tr/compare public/ru/compare
```

- [ ] **Step 2: Verify**

```bash
ls -d public/*/compare/
```
Expected: 6 directories

No commit needed — empty directories aren't tracked by git.

---

### Task 2: Translate `/free-vpn` into 6 languages (PILOT)

**Files:**
- Create: `public/ar/free-vpn.html`
- Create: `public/hi/free-vpn.html`
- Create: `public/fr/free-vpn.html`
- Create: `public/es/free-vpn.html`
- Create: `public/tr/free-vpn.html`
- Create: `public/ru/free-vpn.html`
- Modify: `public/free-vpn.html` (add hreflang block to English original)

**Dispatch 6 parallel subagents**, one per language. Each subagent:
1. Reads `public/free-vpn.html` (English original)
2. Creates `public/<lang>/free-vpn.html` following the translation process above
3. Page path for hreflang: `free-vpn`
4. Internal links: `/pricing` (English), `/<lang>/best-vpn-2026`, `/<lang>/secure-vpn`, etc. where Tier 1 versions will exist
5. Verifies and commits

**After all 6 subagents complete:**
- Add hreflang block to English `public/free-vpn.html`
- Verify all 7 versions have identical hreflang blocks
- Commit English original update

- [ ] **Step 1: Dispatch 6 translation subagents in parallel**
- [ ] **Step 2: Add hreflang to English original**

Add this block in `<head>` of `public/free-vpn.html` (after canonical tag):
```html
<link rel="alternate" hreflang="en" href="https://vizoguard.com/free-vpn">
<link rel="alternate" hreflang="ar" href="https://vizoguard.com/ar/free-vpn">
<link rel="alternate" hreflang="hi" href="https://vizoguard.com/hi/free-vpn">
<link rel="alternate" hreflang="fr" href="https://vizoguard.com/fr/free-vpn">
<link rel="alternate" hreflang="es" href="https://vizoguard.com/es/free-vpn">
<link rel="alternate" hreflang="tr" href="https://vizoguard.com/tr/free-vpn">
<link rel="alternate" hreflang="ru" href="https://vizoguard.com/ru/free-vpn">
<link rel="alternate" hreflang="x-default" href="https://vizoguard.com/free-vpn">
```

- [ ] **Step 3: Verify pilot**

```bash
# All 7 files exist
ls public/free-vpn.html public/ar/free-vpn.html public/hi/free-vpn.html public/fr/free-vpn.html public/es/free-vpn.html public/tr/free-vpn.html public/ru/free-vpn.html

# All have 8 hreflang tags
for f in public/free-vpn.html public/ar/free-vpn.html public/hi/free-vpn.html public/fr/free-vpn.html public/es/free-vpn.html public/tr/free-vpn.html public/ru/free-vpn.html; do echo "$(basename $(dirname $f))/$(basename $f): $(grep -c 'hreflang' $f) hreflang tags"; done

# Arabic has RTL
grep -c 'dir="rtl"' public/ar/free-vpn.html  # → 1
grep -c 'rtl.css' public/ar/free-vpn.html  # → 1
```

- [ ] **Step 4: Commit**

```bash
cd /root/vizoguard && git add public/ar/free-vpn.html public/hi/free-vpn.html public/fr/free-vpn.html public/es/free-vpn.html public/tr/free-vpn.html public/ru/free-vpn.html public/free-vpn.html
git commit -m "i18n: translate /free-vpn into 6 languages (pilot) + add hreflang"
```

---

### Tasks 3-10: Translate remaining 8 pages (same pattern as Task 2)

Each task follows the EXACT same pattern as Task 2. Only the page name and internal links change.

### Task 3: Translate `/best-vpn-2026` × 6 languages

**Files:** Create `public/{ar,hi,fr,es,tr,ru}/best-vpn-2026.html`, Modify `public/best-vpn-2026.html`
**Page path:** `best-vpn-2026`
**Commit:** `git commit -m "i18n: translate /best-vpn-2026 into 6 languages + add hreflang"`

### Task 4: Translate `/vpn-download` × 6 languages

**Files:** Create `public/{ar,hi,fr,es,tr,ru}/vpn-download.html`, Modify `public/vpn-download.html`
**Page path:** `vpn-download`
**Commit:** `git commit -m "i18n: translate /vpn-download into 6 languages + add hreflang"`

### Task 5: Translate `/secure-vpn` × 6 languages

**Files:** Create `public/{ar,hi,fr,es,tr,ru}/secure-vpn.html`, Modify `public/secure-vpn.html`
**Page path:** `secure-vpn`
**Commit:** `git commit -m "i18n: translate /secure-vpn into 6 languages + add hreflang"`

### Task 6: Translate `/vpn-for-privacy` × 6 languages

**Files:** Create `public/{ar,hi,fr,es,tr,ru}/vpn-for-privacy.html`, Modify `public/vpn-for-privacy.html`
**Page path:** `vpn-for-privacy`
**Commit:** `git commit -m "i18n: translate /vpn-for-privacy into 6 languages + add hreflang"`

### Task 7: Translate `/compare/vizoguard-vs-nordvpn` × 6 languages

**Files:** Create `public/{ar,hi,fr,es,tr,ru}/compare/vizoguard-vs-nordvpn.html`, Modify `public/compare/vizoguard-vs-nordvpn.html`
**Page path:** `compare/vizoguard-vs-nordvpn`
**Note:** Comparison pages use `<main class="compare-page">` layout with inline CSS (verdict-box, compare-table, etc.) — NOT `seo-page`
**Commit:** `git commit -m "i18n: translate /compare/vizoguard-vs-nordvpn into 6 languages + add hreflang"`

### Task 8: Translate `/compare/vizoguard-vs-expressvpn` × 6 languages

**Files:** Create `public/{ar,hi,fr,es,tr,ru}/compare/vizoguard-vs-expressvpn.html`, Modify `public/compare/vizoguard-vs-expressvpn.html`
**Page path:** `compare/vizoguard-vs-expressvpn`
**Commit:** `git commit -m "i18n: translate /compare/vizoguard-vs-expressvpn into 6 languages + add hreflang"`

### Task 9: Translate `/compare/vizoguard-vs-protonvpn` × 6 languages

**Files:** Create `public/{ar,hi,fr,es,tr,ru}/compare/vizoguard-vs-protonvpn.html`, Modify `public/compare/vizoguard-vs-protonvpn.html`
**Page path:** `compare/vizoguard-vs-protonvpn`
**Commit:** `git commit -m "i18n: translate /compare/vizoguard-vs-protonvpn into 6 languages + add hreflang"`

### Task 10: Translate `/features` × 6 languages

**Files:** Create `public/{ar,hi,fr,es,tr,ru}/features.html`, Modify `public/features.html`
**Page path:** `features`
**Commit:** `git commit -m "i18n: translate /features into 6 languages + add hreflang"`

### Task 11: Translate `/ai-threat-protection` × 6 languages

**Files:** Create `public/{ar,hi,fr,es,tr,ru}/ai-threat-protection.html`, Modify `public/ai-threat-protection.html`
**Page path:** `ai-threat-protection`
**Commit:** `git commit -m "i18n: translate /ai-threat-protection into 6 languages + add hreflang"`

---

### Task 12: Update sitemap with 60 new URLs + hreflang

**Files:**
- Modify: `public/sitemap.xml`

- [ ] **Step 1: Add 60 new URL entries with hreflang**

For each of the 10 pages × 6 languages, add a `<url>` entry with 8 hreflang cross-references. Example for `/ar/free-vpn`:

```xml
<url>
  <loc>https://vizoguard.com/ar/free-vpn</loc>
  <lastmod>2026-03-21</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
  <xhtml:link rel="alternate" hreflang="en" href="https://vizoguard.com/free-vpn"/>
  <xhtml:link rel="alternate" hreflang="ar" href="https://vizoguard.com/ar/free-vpn"/>
  <xhtml:link rel="alternate" hreflang="hi" href="https://vizoguard.com/hi/free-vpn"/>
  <xhtml:link rel="alternate" hreflang="fr" href="https://vizoguard.com/fr/free-vpn"/>
  <xhtml:link rel="alternate" hreflang="es" href="https://vizoguard.com/es/free-vpn"/>
  <xhtml:link rel="alternate" hreflang="tr" href="https://vizoguard.com/tr/free-vpn"/>
  <xhtml:link rel="alternate" hreflang="ru" href="https://vizoguard.com/ru/free-vpn"/>
  <xhtml:link rel="alternate" hreflang="x-default" href="https://vizoguard.com/free-vpn"/>
</url>
```

- [ ] **Step 2: Add hreflang to existing English URL entries**

The 10 English original pages already in the sitemap need hreflang added. Find each `<url>` entry and add the 8 `xhtml:link` tags.

Also fix legacy entries: change `/compare/vizoguard-vs-nordvpn.html` and `/compare/vizoguard-vs-expressvpn.html` to clean URLs (remove `.html`).

- [ ] **Step 3: Verify**

```bash
grep -c '<loc>' public/sitemap.xml  # → 98
python3 -c "import xml.etree.ElementTree as ET; ET.parse('public/sitemap.xml'); print('Valid XML')"
```

- [ ] **Step 4: Commit**

```bash
cd /root/vizoguard && git add public/sitemap.xml
git commit -m "seo: add 60 international URLs to sitemap with hreflang (98 total)"
```

---

### Task 13: Bump service worker + final verification + CLAUDE.md

**Files:**
- Modify: `public/sw.js`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump sw.js**

Change `CACHE_NAME` from `vg-v32` to `vg-v33`. Do NOT add translated pages to APP_SHELL (runtime caching handles them).

- [ ] **Step 2: Verify all 60 files exist**

```bash
count=0; for lang in ar hi fr es tr ru; do for page in free-vpn.html best-vpn-2026.html vpn-download.html secure-vpn.html vpn-for-privacy.html features.html ai-threat-protection.html; do [ -f "public/$lang/$page" ] && count=$((count+1)); done; for page in vizoguard-vs-nordvpn.html vizoguard-vs-expressvpn.html vizoguard-vs-protonvpn.html; do [ -f "public/$lang/compare/$page" ] && count=$((count+1)); done; done; echo "$count files (expected: 60)"
```

- [ ] **Step 3: Verify hreflang on English originals**

```bash
for f in public/free-vpn.html public/best-vpn-2026.html public/vpn-download.html public/secure-vpn.html public/vpn-for-privacy.html public/compare/vizoguard-vs-nordvpn.html public/compare/vizoguard-vs-expressvpn.html public/compare/vizoguard-vs-protonvpn.html public/features.html public/ai-threat-protection.html; do echo "$(basename $f): $(grep -c 'hreflang' $f) hreflang"; done
```
Expected: 8 hreflang tags per file

- [ ] **Step 4: Verify Arabic RTL**

```bash
for f in public/ar/free-vpn.html public/ar/features.html public/ar/compare/vizoguard-vs-nordvpn.html; do echo "$(basename $f): dir=$(grep -c 'dir=\"rtl\"' $f) rtl=$(grep -c 'rtl.css' $f)"; done
```
Expected: dir=1, rtl=1 for each

- [ ] **Step 5: Verify sitemap**

```bash
grep -c '<loc>' public/sitemap.xml  # → 98
```

- [ ] **Step 6: Update CLAUDE.md**

Update the SEO Pages section to add:
```
- International: 10 Tier 1 pages translated into ar, hi, fr, es, tr, ru (60 pages) — hreflang cross-linked, localized meta/schemas
- Arabic pages load /css/rtl.css for RTL layout
- Sitemap: 98 URLs with hreflang cross-references
- Cache: service worker CACHE_NAME = 'vg-v33'
```

- [ ] **Step 7: Commit**

```bash
cd /root/vizoguard && git add public/sw.js CLAUDE.md
git commit -m "chore: bump sw to vg-v33, update CLAUDE.md with Phase 3 international SEO inventory"
```
