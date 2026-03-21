# Phase 3: International SEO — Design Spec

**Date**: 2026-03-21
**Phase**: 3 of 4 (Traffic → Conversion → **International** → Engineering)
**Goal**: Translate 10 high-value English pages into 6 languages to multiply organic traffic 2-4x
**Deliverables**: 60 new translated pages + hreflang on 10 English originals + sitemap expansion

---

## 4-Phase Roadmap Context

| Phase | Focus | Goal |
|-------|-------|------|
| 1 (done) | English SEO content (20+ pages) | Traffic |
| 2 (done) | Conversion optimization + authority pages | Revenue |
| **3 (this spec)** | International SEO (6 languages) | Scale |
| 4 | Backend tests + Prometheus metrics | Stability |

---

## Languages

| Code | Language | Direction | Special |
|------|----------|-----------|---------|
| ar | Arabic | RTL | Loads `/css/rtl.css` |
| hi | Hindi | LTR | — |
| fr | French | LTR | — |
| es | Spanish | LTR | — |
| tr | Turkish | LTR | — |
| ru | Russian | LTR | — |

---

## Pages to Translate (Tier 1)

| # | English Page | Target Word Count | Type |
|---|-------------|-------------------|------|
| 1 | `/free-vpn` | 2500-3000 | Core SEO |
| 2 | `/best-vpn-2026` | 2500-3000 | Core SEO |
| 3 | `/vpn-download` | 2500-3000 | Core SEO |
| 4 | `/secure-vpn` | 2500-3000 | Core SEO |
| 5 | `/vpn-for-privacy` | 2500-3000 | Core SEO |
| 6 | `/compare/vizoguard-vs-nordvpn` | 3200-3500 | Comparison |
| 7 | `/compare/vizoguard-vs-expressvpn` | 3200-3500 | Comparison |
| 8 | `/compare/vizoguard-vs-protonvpn` | 3200-3500 | Comparison |
| 9 | `/features` | 2500-3000 | Authority |
| 10 | `/ai-threat-protection` | 2500-3000 | Authority |

---

## Translation Approach

**Direct translation** of English content. Same structure, same H2s, same word count, same internal logic. No market-specific localization or adaptation in Phase 3.

---

## URL Structure

**Clean URLs** (no `.html` extension) — matching English originals. Files on disk use `.html` extension; nginx `try_files` strips it.

```
Clean URL (sitemap/hreflang)          File on disk
/ar/free-vpn                          public/ar/free-vpn.html
/ar/best-vpn-2026                     public/ar/best-vpn-2026.html
/ar/vpn-download                      public/ar/vpn-download.html
/ar/secure-vpn                        public/ar/secure-vpn.html
/ar/vpn-for-privacy                   public/ar/vpn-for-privacy.html
/ar/compare/vizoguard-vs-nordvpn      public/ar/compare/vizoguard-vs-nordvpn.html
/ar/compare/vizoguard-vs-expressvpn   public/ar/compare/vizoguard-vs-expressvpn.html
/ar/compare/vizoguard-vs-protonvpn    public/ar/compare/vizoguard-vs-protonvpn.html
/ar/features                          public/ar/features.html
/ar/ai-threat-protection              public/ar/ai-threat-protection.html
(same structure for /fr/, /es/, /hi/, /tr/, /ru/)
```

**Note**: Existing sitemap entries for `/compare/vizoguard-vs-nordvpn.html` and `/compare/vizoguard-vs-expressvpn.html` should be updated to clean URLs (remove `.html`) when hreflang is added to them for consistency.

**New directories to create:**
- `public/ar/compare/`
- `public/fr/compare/`
- `public/es/compare/`
- `public/hi/compare/`
- `public/tr/compare/`
- `public/ru/compare/`

---

## Per-Page Localization Checklist

Every translated page MUST have ALL of these:

| Element | Requirement |
|---------|-------------|
| `<html lang="XX">` | Correct language code |
| `<html dir="rtl">` | Arabic only; all others `dir="ltr"` |
| `<title>` | Translated, format: `{Translated H1} \| Vizoguard` |
| `<meta name="description">` | Translated, 150-160 chars |
| `<meta name="keywords">` | Translated keywords in target language |
| `<link rel="canonical">` | Self-referencing (e.g., `https://vizoguard.com/ar/free-vpn`) |
| hreflang tags | 8 tags: en + ar + hi + fr + es + tr + ru + x-default |
| `<meta property="og:title">` | Translated |
| `<meta property="og:description">` | Translated |
| `<meta property="og:url">` | Self URL |
| `<meta property="og:locale">` | Correct locale (e.g., `ar_SA`, `hi_IN`, `fr_FR`, `es_ES`, `tr_TR`, `ru_RU`) |
| Twitter Card | Translated title + description |
| JSON-LD Article | Translated `headline`, `description`; set `inLanguage` to correct code |
| JSON-LD FAQPage | All questions + answers translated |
| JSON-LD BreadcrumbList | Translated names, correct language-prefixed URLs |
| Body content | All H1, H2, paragraphs, lists, FAQ, CTA text translated |
| Internal links | Link to same-language version where it exists; link to English for pages not yet translated |
| RTL CSS | Arabic pages: add `<link rel="stylesheet" href="/css/rtl.css">` after style.css |
| CSS/JS version | `?v=20` |
| Analytics | Same gtag setup (AW-18020160060 + GT-NGJF3VBT) — events keep English identifiers for consistent tracking |

---

## Template & CRO Elements

**Each translated page uses the English original as its template.** Read the English page, translate all text, keep all structural HTML/CSS/JS unchanged. Specifically:

- **Keep all CRO elements**: urgency countdown banner, sticky mobile CTA, discount badges, strikethrough pricing — translate visible text only, keep JS logic unchanged (dates, selectors, gtag events)
- **Keep post-discount JS**: the `2026-04-04` date check added in Phase 2 — works identically in all languages
- **Header/footer**: identical structure to English — nav links point to `/pricing`, `/download` (English, not translated in Tier 1). Footer links point to `/privacy.html`, `/terms.html` (English)
- **Language switcher**: NOT included on translated SEO pages in Phase 3. The existing landing pages have a switcher, but adding one to 60 new pages requires JS changes to detect current page and construct language-specific URLs. Defer to a future optimization.
- **Author names**: Keep in English in JSON-LD schema (`"author": {"@type": "Organization", "name": "Vizoguard"}`). Author names don't translate.
- **Analytics events**: Keep English event names/parameters (e.g., `gtag('event','seo_cta',{page:'free-vpn',plan:'basic'})`) for consistent tracking across languages
- **All translated pages must be indexable**: do NOT add `noindex`, `nofollow`, or any robots restrictions

## Breadcrumb Structure

For translated pages, breadcrumbs follow the English pattern:

- Core SEO pages: Home → [Page Title] (2 items)
  - `Home` links to `/<lang>/` (translated landing page)
  - Example: `<a href="/ar/">الرئيسية</a> › VPN مجاني`
- Comparison pages: Home → Compare → [Title] (3 items)
  - `Home` links to `/<lang>/`
  - `Compare` links to `/<lang>/compare/` — this directory does NOT have an index page, but the breadcrumb can still use it as a logical path (matching English pattern)
  - Example: `<a href="/ar/">الرئيسية</a> › مقارنة › Vizoguard vs NordVPN`

BreadcrumbList JSON-LD uses the clean translated URLs.

---

## hreflang Tags

**Every version of a page (including English original) must have this block in `<head>`:**

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

**Critical**: The 10 English original pages currently have NO hreflang tags. They must be updated to add the hreflang block pointing to all 7 versions.

**For comparison pages**, the hreflang URLs use the `/compare/` subpath:
```html
<link rel="alternate" hreflang="ar" href="https://vizoguard.com/ar/compare/vizoguard-vs-nordvpn">
```

---

## Internal Links in Translated Pages

When a translated page links to another page:

1. **If the target page has a translated version** → link to the same-language version
   - e.g., Arabic `/ar/free-vpn` links to `/ar/best-vpn-2026` (not `/best-vpn-2026`)
2. **If the target page is NOT translated** (blog posts, press, torrenting, streaming) → link to English version
   - e.g., Arabic `/ar/free-vpn` links to `/blog/is-vpn-safe` (English, no Arabic version)
3. **`/pricing` and `/download`** → always link to English (not translated in Tier 1)

**Pages that exist in all languages (can cross-link):**
- `/free-vpn`, `/best-vpn-2026`, `/vpn-download`, `/secure-vpn`, `/vpn-for-privacy`
- `/compare/vizoguard-vs-nordvpn`, `/compare/vizoguard-vs-expressvpn`, `/compare/vizoguard-vs-protonvpn`
- `/features`, `/ai-threat-protection`
- Landing page `/` (already exists in all languages)

**Pages that stay English-only:**
- All blog posts (`/blog/*`)
- `/pricing`, `/download`, `/press`
- `/compare/vizoguard-vs-surfshark`, `/compare/vizoguard-vs-cyberghost`
- `/vpn-for-streaming`, `/vpn-for-torrenting`

---

## Sitemap Updates

### New URL entries (60 total)
Each translated page gets its own `<url>` entry with all 8 hreflang cross-references:

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

### Update existing English URL entries
The 10 English original pages need hreflang added to their existing sitemap entries (same format as above).

### Final sitemap count
- Current: 38 URLs
- Add: 60 new translated URLs
- Total: 98 URLs

---

## Service Worker

- **Do NOT add 60 pages to APP_SHELL** — too many for precache
- Existing runtime caching in sw.js fetch handler will cache pages on first visit
- Bump `CACHE_NAME` from `vg-v32` to `vg-v33` — do this ONCE after all 60 pages are done (not after pilot)
- CSS/JS stays at `?v=20` (no new styles needed — Arabic RTL CSS already exists)

---

## Execution Order

### Phase 3A: Pilot (`/free-vpn` × 6 languages)

1. Create 6 translated `free-vpn.html` files
2. Add hreflang tags to English `/free-vpn.html`
3. Add 6 new URLs + hreflang to sitemap
4. Verify: all 7 versions cross-link correctly, HTML valid, schemas correct
5. Commit

### Phase 3B: Scale (remaining 9 pages × 6 languages)

Batch by page (not by language) — each batch = 1 page × 6 languages dispatched as parallel subagents:

| Batch | Page | New Files |
|-------|------|-----------|
| 1 | `/best-vpn-2026` | 6 |
| 2 | `/vpn-download` | 6 |
| 3 | `/secure-vpn` | 6 |
| 4 | `/vpn-for-privacy` | 6 |
| 5 | `/compare/vizoguard-vs-nordvpn` | 6 |
| 6 | `/compare/vizoguard-vs-expressvpn` | 6 |
| 7 | `/compare/vizoguard-vs-protonvpn` | 6 |
| 8 | `/features` | 6 |
| 9 | `/ai-threat-protection` | 6 |

After all batches:
- Add hreflang to all 9 remaining English originals
- Update sitemap with all 54 new URLs + hreflang
- Bump sw.js to vg-v33
- Update CLAUDE.md

---

## Success Criteria

- All 60 new translated files exist and are accessible via clean URLs
- Every translated page has correct `lang` attribute, `dir` attribute (RTL for Arabic)
- Every translated page has 8 hreflang tags (en + 6 languages + x-default)
- All 10 English originals updated with hreflang tags
- All JSON-LD schemas have correct `inLanguage` value
- Arabic pages load `/css/rtl.css`
- Internal links point to same-language versions where available
- Sitemap has 98 URLs with correct hreflang cross-references
- Sitemap validates as XML
- No broken internal links across any language version
