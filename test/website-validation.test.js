const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");

const PUBLIC_DIR = path.join(__dirname, "..", "public");

// ── Helpers ─────────────────────────────────────────────────────────────────

function getHtmlFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getHtmlFiles(fullPath, files);
    } else if (entry.name.endsWith(".html")) {
      files.push(fullPath);
    }
  }
  return files;
}

function relativePublicPath(absolutePath) {
  return "/" + path.relative(PUBLIC_DIR, absolutePath).replace(/\\/g, "/");
}

function stripHashAndQuery(href) {
  return href.split("#")[0].split("?")[0];
}

function resolveHref(href, currentDir) {
  const clean = stripHashAndQuery(href);
  if (!clean) return null; // pure anchor or query
  if (clean.startsWith("http") || clean.startsWith("mailto:") || clean.startsWith("tel:") || clean.startsWith("//")) {
    return null; // external
  }
  let resolved;
  if (clean.startsWith("/")) {
    resolved = path.join(PUBLIC_DIR, clean);
  } else {
    resolved = path.join(currentDir, clean);
  }
  // Try exact path, then .html, then /index.html
  if (fs.existsSync(resolved)) {
    if (fs.statSync(resolved).isDirectory()) {
      return path.join(resolved, "index.html");
    }
    return resolved;
  }
  const withHtml = resolved + ".html";
  if (fs.existsSync(withHtml)) return withHtml;
  const withIndex = path.join(resolved, "index.html");
  if (fs.existsSync(withIndex)) return withIndex;
  return resolved; // return original for error reporting
}

function extractTagContent(html, tagName) {
  const re = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : "";
}

function extractMetaContent(html, nameOrProperty) {
  const re = new RegExp(`<meta\\s+(?:name|property)="${nameOrProperty}"\\s+content="([^"]*)"`, "i");
  const m = html.match(re);
  return m ? m[1] : "";
}

function extractAllHrefs(html) {
  const matches = [];
  const re = /<a[^>]+href="([^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

function extractAllSrcs(html) {
  const matches = [];
  // Match src= on img, script, source, iframe
  const re = /<(img|script|source|iframe)[^>]+src="([^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    matches.push(m[2]);
  }
  // Match srcset on img, source
  const srcsetRe = /<(img|source)[^>]+srcset="([^"]*)"/gi;
  while ((m = srcsetRe.exec(html)) !== null) {
    m[2].split(",").forEach((part) => {
      const url = part.trim().split(/\s+/)[0];
      if (url) matches.push(url);
    });
  }
  return matches;
}

function extractJsonLd(html) {
  const scripts = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    scripts.push(m[1].trim());
  }
  return scripts;
}

function extractHreflangs(html) {
  const map = {};
  const re = /<link rel="alternate" hreflang="([^"]*)" href="([^"]*)"\s*\/?>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

function extractOnclickPlans(html) {
  const plans = new Set();
  const re = /startCheckout\(['"]([^'"]+)['"]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    plans.add(m[1]);
  }
  return [...plans];
}

// ── Load all pages ──────────────────────────────────────────────────────────

const allHtmlFiles = getHtmlFiles(PUBLIC_DIR);
const pages = allHtmlFiles.map((file) => ({
  file,
  relPath: relativePublicPath(file),
  html: fs.readFileSync(file, "utf8"),
  dir: path.dirname(file),
}));

// Pages that are exempt from full SEO (verification files, raw assets)
const structureExempt = new Set(["/google4695fa22216f6680.html"]);

// ── Tests ─────────────────────────────────────────────────────────────────--

describe("Website HTML structure", () => {
  for (const page of pages) {
    if (structureExempt.has(page.relPath)) continue;
    const name = page.relPath;
    it(`${name} has DOCTYPE html`, () => {
      assert(page.html.toLowerCase().startsWith("<!doctype html>"), "Missing DOCTYPE");
    });
    it(`${name} has html lang attribute`, () => {
      assert(/<html[^>]+lang="[^"]+"/.test(page.html), "Missing html lang");
    });
    it(`${name} has charset UTF-8`, () => {
      assert(/charset="?UTF-8"?/i.test(page.html), "Missing charset UTF-8");
    });
    it(`${name} has viewport meta`, () => {
      assert(/<meta[^>]+name="viewport"/.test(page.html), "Missing viewport meta");
    });
    it(`${name} has title`, () => {
      const title = extractTagContent(page.html, "title");
      assert(title.length > 0, "Missing title");
    });
    it(`${name} has description meta`, () => {
      const desc = extractMetaContent(page.html, "description");
      assert(desc.length > 0, "Missing meta description");
    });
  }
});

describe("Website SEO completeness", () => {
  const requiredOg = ["og:title", "og:description", "og:url", "og:type", "og:site_name", "og:image"];
  const requiredTwitter = ["twitter:card", "twitter:title", "twitter:description", "twitter:image"];

  for (const page of pages) {
    if (structureExempt.has(page.relPath)) continue;
    const name = page.relPath;
    it(`${name} has canonical link`, () => {
      assert(/<link rel="canonical"/.test(page.html), "Missing canonical link");
    });
    for (const prop of requiredOg) {
      it(`${name} has ${prop}`, () => {
        const val = extractMetaContent(page.html, prop);
        assert(val.length > 0, `Missing ${prop}`);
      });
    }
    for (const prop of requiredTwitter) {
      it(`${name} has ${prop}`, () => {
        const val = extractMetaContent(page.html, prop);
        assert(val.length > 0, `Missing ${prop}`);
      });
    }
  }
});

describe("Website JSON-LD validity", () => {
  for (const page of pages) {
    const name = page.relPath;
    const jsonlds = extractJsonLd(page.html);
    if (jsonlds.length === 0) continue;
    it(`${name} JSON-LD parses as valid JSON`, () => {
      for (const raw of jsonlds) {
        try {
          JSON.parse(raw);
        } catch (err) {
          assert.fail(`Invalid JSON-LD: ${err.message}`);
        }
      }
    });
  }
});

describe("Website internal link integrity", () => {
  const skippedPrefixes = ["/downloads/", "/api/"];
  for (const page of pages) {
    const name = page.relPath;
    const hrefs = [...new Set(extractAllHrefs(page.html))];
    for (const href of hrefs) {
      const clean = stripHashAndQuery(href);
      if (!clean) continue;
      if (clean.startsWith("http") || clean.startsWith("mailto:") || clean.startsWith("tel:") || clean.startsWith("//")) continue;
      if (skippedPrefixes.some((p) => clean.startsWith(p))) continue;

      const resolved = resolveHref(href, page.dir);
      it(`${name} → ${href}`, () => {
        assert(fs.existsSync(resolved), `Broken link: ${href} (resolved to ${resolved})`);
      });
    }
  }
});

describe("Website asset integrity", () => {
  for (const page of pages) {
    const name = page.relPath;
    const srcs = [...new Set(extractAllSrcs(page.html))];
    for (const src of srcs) {
      if (src.startsWith("http") || src.startsWith("//")) continue;
      const resolved = resolveHref(src, page.dir);
      if (!resolved) continue;
      it(`${name} src=${src}`, () => {
        assert(fs.existsSync(resolved), `Missing asset: ${src}`);
      });
    }
  }
});

describe("Website checkout flow", () => {
  const pricingPages = pages.filter((p) =>
    (p.relPath.includes("pricing") || p.relPath.endsWith("/index.html")) &&
    !p.relPath.includes("/blog/")
  );
  for (const page of pricingPages) {
    it(`${page.relPath} has checkout buttons with valid plans`, () => {
      const plans = extractOnclickPlans(page.html);
      assert(plans.length > 0, "No checkout buttons found");
      for (const plan of plans) {
        assert(["vpn", "security_vpn"].includes(plan), `Invalid plan: ${plan}`);
      }
    });
  }

  it("main.js defines startCheckout", () => {
    const mainJs = fs.readFileSync(path.join(PUBLIC_DIR, "js", "main.js"), "utf8");
    assert(/async function startCheckout\(plan\)/.test(mainJs), "startCheckout not found in main.js");
    assert(/fetch\("\/api\/checkout"/.test(mainJs), "main.js does not call /api/checkout");
    assert(/AbortController/.test(mainJs), "main.js missing timeout protection");
  });
});

describe("Website download links", () => {
  // /vpn-download pages are SEO landing pages; actual downloads are on /download.html
  const downloadPages = pages.filter((p) => p.relPath.includes("download") && !p.relPath.includes("vpn-download"));
  for (const page of downloadPages) {
    it(`${page.relPath} has download links`, () => {
      assert(/href="\/downloads\//.test(page.html), "No /downloads/ links found");
    });
  }
});

describe("Website 404 page", () => {
  it("404.html exists", () => {
    assert(fs.existsSync(path.join(PUBLIC_DIR, "404.html")), "Missing 404.html");
  });
  it("404.html returns noindex meta", () => {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, "404.html"), "utf8");
    assert(/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/.test(html), "404 page should have noindex");
  });
});

describe("Website hreflang consistency", () => {
  const indexPages = pages.filter((p) => p.relPath.endsWith("/index.html") && !p.relPath.includes("/blog/"));
  for (const page of indexPages) {
    const name = page.relPath;
    const hreflangs = extractHreflangs(page.html);
    it(`${name} has self-referencing hreflang`, () => {
      const selfLang = page.html.match(/<html[^>]+lang="([^"]+)"/)?.[1] || "en";
      assert(hreflangs[selfLang], `Missing self hreflang for ${selfLang}`);
    });
    it(`${name} has x-default hreflang`, () => {
      assert(hreflangs["x-default"], "Missing x-default hreflang");
    });
  }
});
