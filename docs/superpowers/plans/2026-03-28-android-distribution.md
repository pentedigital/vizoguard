# Android Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update download.html and thank-you.html to expose the native Vizoguard Android APK instead of directing users to the third-party Outline app.

**Architecture:** Two HTML files modified with pure JS/CSS changes. No backend changes, no new dependencies. The existing QRious library generates intent-URL QR codes for deep link activation. Android detection via `navigator.userAgent` conditionally renders platform-specific UI.

**Tech Stack:** HTML, vanilla JS, QRious (already loaded), existing CSS design tokens

**Spec:** `docs/superpowers/specs/2026-03-28-android-distribution-design.md`

---

### Task 1: Update Android card on download page

**Files:**
- Modify: `public/download.html:213-242` (add `.sideload-note` CSS)
- Modify: `public/download.html:295-300` (replace Android card)

- [ ] **Step 1: Add `.sideload-note` CSS rule**

In `public/download.html`, add this rule inside the existing `<style>` block (after line 220, the `.download-card .btn` rule):

```css
    .download-card .sideload-note { font-size: 0.75rem; color: rgba(255,255,255,0.45); margin: 0.75rem 0 0; line-height: 1.5; }
    .download-card .sideload-note a { color: rgba(0,229,160,0.7); }
```

- [ ] **Step 2: Replace Android card HTML**

Replace lines 295-300 (the entire Android download card contents):

```html
    <div class="download-card animate-up delay-4">
      <div class="platform-icon">&#129302;</div>
      <h3>Vizoguard for Android</h3>
      <p class="platform-req">Android 8+</p>
      <a href="/downloads/Vizoguard-latest.apk" class="btn">Download APK</a>
      <p class="sideload-note">Enable "Install unknown apps" in settings. <a href="https://play.google.com/store/apps/details?id=org.outline.android.client" target="_blank" rel="noopener">Or use Outline</a></p>
    </div>
```

- [ ] **Step 3: Verify the page renders**

Run: `curl -s https://vizoguard.com/download | grep -c "Vizoguard for Android"` — should return `0` (not deployed yet, just check local file):
```bash
grep -c "Vizoguard for Android" /root/vizoguard/public/download.html
```
Expected: `1`

Also check the APK exists:
```bash
curl -sI https://vizoguard.com/downloads/Vizoguard-latest.apk | head -3
```
Expected: `HTTP/2 200`

- [ ] **Step 4: Commit**

```bash
cd /root/vizoguard
git add public/download.html
git commit -m "feat(download): replace Outline with native Android APK card"
```

---

### Task 2: Update plan note and "which version" text on download page

**Files:**
- Modify: `public/download.html:303-306` (plan note)
- Modify: `public/download.html:388-393` (which version section)

- [ ] **Step 1: Update plan note text**

Replace lines 303-306:

```html
  <div class="plan-note">
    <strong>Basic plan:</strong> Use the Vizoguard Android app or Outline app on any device.
    <strong>Pro plan:</strong> Download the Vizoguard desktop app for full AI security.
  </div>
```

- [ ] **Step 2: Update "which version" Basic plan description**

Replace line 391:

```html
  <p style="color:var(--text-2); line-height:1.7; margin-bottom:1em;"><strong>Basic plan (all platforms):</strong> Use the Vizoguard app on Android, or the Outline app on iOS, Mac, Windows, Linux, and ChromeOS for a fast, private, encrypted VPN with 100 GB/month and zero logging. Perfect if you need VPN protection without the security suite.</p>
```

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard
git add public/download.html
git commit -m "feat(download): update plan descriptions to mention native Android app"
```

---

### Task 3: Update FAQ structured data and visible FAQ on download page

**Files:**
- Modify: `public/download.html:156` (JSON-LD system requirements)
- Modify: `public/download.html:162` (JSON-LD download safety)
- Modify: `public/download.html:164` (JSON-LD Outline vs Vizoguard)
- Modify: `public/download.html:402` (visible FAQ: system requirements)
- Modify: `public/download.html:432` (visible FAQ: download safety)
- Modify: `public/download.html:442` (visible FAQ: Outline vs Vizoguard)

- [ ] **Step 1: Update JSON-LD system requirements FAQ (line 156)**

Replace the `text` value in the system requirements question:

Before: `"Desktop: macOS 12+ (Intel & Apple Silicon) or Windows 10/11 (64-bit). Mobile: iOS 15+ or Android 8+. The Outline app also supports Linux and ChromeOS."`

After: `"Desktop: macOS 12+ (Intel & Apple Silicon) or Windows 10/11 (64-bit). Mobile: iOS 15+ (via Outline app) or Android 8+ (native Vizoguard app or Outline). Outline also supports Linux and ChromeOS."`

- [ ] **Step 2: Update JSON-LD download safety FAQ (line 162)**

Before: `"All downloads are served over HTTPS from vizoguard.com. The desktop app is code-signed and macOS notarized. Mobile VPN uses the official Outline app from the App Store and Google Play."`

After: `"All downloads are served over HTTPS from vizoguard.com. The desktop app is code-signed and macOS notarized. The Android APK is served directly from vizoguard.com. iOS uses the official Outline app from the App Store."`

- [ ] **Step 3: Update JSON-LD Outline vs Vizoguard FAQ (line 164)**

Before: `"Outline is the VPN client available on all platforms for all plans. The Vizoguard desktop app is Pro-only for Mac and Windows — it adds AI threat detection, phishing protection, and connection monitoring on top of the VPN."`

After: `"Outline is the VPN client for iOS, Mac, Windows, Linux, and ChromeOS. The Vizoguard native app is available for Android (all plans) and desktop Mac/Windows (Pro plan — adds AI threat detection, phishing protection, and connection monitoring)."`

- [ ] **Step 4: Update visible FAQ — system requirements (line 402)**

Before: `<p><strong>Desktop:</strong> macOS 12+ (Intel & Apple Silicon) or Windows 10/11 (64-bit). <strong>Mobile:</strong> iOS 15+ or Android 8+. The Outline app supports Linux and ChromeOS as well.</p>`

After: `<p><strong>Desktop:</strong> macOS 12+ (Intel & Apple Silicon) or Windows 10/11 (64-bit). <strong>Mobile:</strong> iOS 15+ (via Outline app) or Android 8+ (native Vizoguard app or Outline). Outline also supports Linux and ChromeOS.</p>`

- [ ] **Step 5: Update visible FAQ — download safety (line 432)**

Before: `<p>All downloads are served over HTTPS from vizoguard.com. The desktop app is code-signed and macOS notarized. Mobile VPN uses the official Outline app from the App Store and Google Play.</p>`

After: `<p>All downloads are served over HTTPS from vizoguard.com. The desktop app is code-signed and macOS notarized. The Android APK is served directly from vizoguard.com. iOS uses the official Outline app from the App Store.</p>`

- [ ] **Step 6: Update visible FAQ — Outline vs Vizoguard (line 442)**

Before: `<p>Outline is the VPN client available on all platforms for all plans. The Vizoguard desktop app is Pro-only for Mac and Windows — it adds AI threat detection, phishing protection, and connection monitoring on top of the VPN.</p>`

After: `<p>Outline is the VPN client for iOS, Mac, Windows, Linux, and ChromeOS. The Vizoguard native app is available for Android (all plans) and desktop Mac/Windows (Pro plan — adds AI threat detection, phishing protection, and connection monitoring).</p>`

- [ ] **Step 7: Commit**

```bash
cd /root/vizoguard
git add public/download.html
git commit -m "feat(download): update FAQ structured data and visible FAQ for Android app"
```

---

### Task 4: Add Android intent URL helper and CSS to thank-you page

**Files:**
- Modify: `public/thank-you.html:32-41` (add CSS for `.android-section`)
- Modify: `public/thank-you.html:261-266` (add `buildAndroidIntentUrl` and `buildAndroidSection` functions)

- [ ] **Step 1: Add `.android-section` CSS**

In `public/thank-you.html`, add these rules inside the existing `<style>` block (after line 40, the `.vpn-steps strong` rule):

```css
    .android-section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px 24px; margin: 24px auto 0; max-width: 400px; text-align: center; }
    .android-section h4 { color: var(--text); font-size: 0.95rem; margin: 0 0 12px; }
    .android-section .btn { margin-bottom: 12px; }
    .android-section .outline-fallback { font-size: 0.75rem; color: var(--text-3); margin-top: 12px; }
    .android-section .outline-fallback a { color: rgba(0,229,160,0.7); }
```

- [ ] **Step 2: Add helper functions after `showQR` (after line 266)**

Add `buildAndroidIntentUrl` and `buildAndroidSection` using safe DOM construction (no innerHTML with user data):

```javascript
function buildAndroidIntentUrl(key) {
  return 'intent://activate?key=' + encodeURIComponent(key) +
    '#Intent;scheme=vizoguard-vpn;package=com.vizoguard.vpn;' +
    'S.browser_fallback_url=https%3A%2F%2Fvizoguard.com%2Fdownloads%2FVizoguard-latest.apk;end';
}

function buildAndroidSection(title, qrCanvasId, showApkBtn) {
  var section = document.createElement('div');
  section.className = 'android-section';

  var h4 = document.createElement('h4');
  h4.textContent = title;
  section.appendChild(h4);

  if (showApkBtn) {
    var btn = document.createElement('a');
    btn.href = '/downloads/Vizoguard-latest.apk';
    btn.className = 'btn';
    btn.style.marginBottom = '12px';
    btn.textContent = 'Download Vizoguard APK';
    section.appendChild(btn);
  }

  var qrBox = document.createElement('div');
  qrBox.className = 'qr-box';
  qrBox.style.display = 'none';
  var canvas = document.createElement('canvas');
  canvas.id = qrCanvasId;
  qrBox.appendChild(canvas);
  var label = document.createElement('div');
  label.className = 'qr-label';
  label.textContent = 'Scan to install and activate on your phone';
  qrBox.appendChild(label);
  section.appendChild(qrBox);

  return section;
}
```

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard
git add public/thank-you.html
git commit -m "feat(thank-you): add Android intent URL helper and section builder"
```

---

### Task 5: Add Android-aware UI to Basic plan success flow

**Files:**
- Modify: `public/thank-you.html:306-317` (Basic plan branch in `showSuccess`)

- [ ] **Step 1: Update Basic plan branch in `showSuccess()`**

Replace lines 306-317 (the `else` branch for Basic plan). The new code detects Android and renders either the native APK flow or the existing Outline flow with a bonus Android QR:

```javascript
  } else {
    // Basic plan
    var isAndroid = /android/i.test(navigator.userAgent);
    document.getElementById("basic-license-key").textContent = data.key;
    document.getElementById("basic-email").textContent = data.email || "your email";
    if (vpnAccessUrl) {
      document.getElementById("basic-vpn-section").style.display = "block";
      if (isAndroid) {
        // Android: replace Outline flow with APK download + intent QR
        var vpnSection = document.getElementById("basic-vpn-section");
        // Clear existing Outline content
        while (vpnSection.firstChild) vpnSection.removeChild(vpnSection.firstChild);

        // APK download button
        var dlBtns = document.createElement('div');
        dlBtns.className = 'download-buttons';
        dlBtns.style.marginTop = '24px';
        var dlLink = document.createElement('a');
        dlLink.href = '/downloads/Vizoguard-latest.apk';
        dlLink.className = 'btn';
        dlLink.textContent = 'Download Vizoguard for Android';
        dlBtns.appendChild(dlLink);
        vpnSection.appendChild(dlBtns);

        // Intent QR code
        var qrBox = document.createElement('div');
        qrBox.className = 'qr-box';
        qrBox.style.display = 'none';
        var qrCanvas = document.createElement('canvas');
        qrCanvas.id = 'basic-android-qr';
        qrBox.appendChild(qrCanvas);
        var qrLabel = document.createElement('div');
        qrLabel.className = 'qr-label';
        qrLabel.textContent = 'Scan to install and activate on your phone';
        qrBox.appendChild(qrLabel);
        vpnSection.appendChild(qrBox);

        // Steps
        var steps = document.createElement('ol');
        steps.className = 'vpn-steps';
        var s1 = document.createElement('li');
        var s1b = document.createElement('strong');
        s1b.textContent = 'Download and install';
        s1.appendChild(s1b);
        s1.appendChild(document.createTextNode(' the Vizoguard APK above.'));
        steps.appendChild(s1);
        var s2 = document.createElement('li');
        var s2b = document.createElement('strong');
        s2b.textContent = 'Open the app';
        s2.appendChild(s2b);
        s2.appendChild(document.createTextNode(' \u2014 your license activates automatically.'));
        steps.appendChild(s2);
        var s3 = document.createElement('li');
        var s3b = document.createElement('strong');
        s3b.textContent = 'Tap Connect';
        s3.appendChild(s3b);
        s3.appendChild(document.createTextNode(' \u2014 you\u2019re protected.'));
        steps.appendChild(s3);
        vpnSection.appendChild(steps);

        // Outline fallback
        var fallback = document.createElement('p');
        fallback.className = 'outline-fallback';
        fallback.style.cssText = 'font-size:0.75rem;color:var(--text-3);margin-top:12px;';
        fallback.appendChild(document.createTextNode('Or use '));
        var fallbackLink = document.createElement('a');
        fallbackLink.href = 'https://play.google.com/store/apps/details?id=org.outline.android.client';
        fallbackLink.target = '_blank';
        fallbackLink.rel = 'noopener';
        fallbackLink.style.color = 'rgba(0,229,160,0.7)';
        fallbackLink.textContent = 'Outline on Google Play';
        fallback.appendChild(fallbackLink);
        vpnSection.appendChild(fallback);

        showQR('basic-android-qr', buildAndroidIntentUrl(data.key));
      } else {
        // Non-Android: existing Outline flow
        document.getElementById("basic-connect-btn").href = vpnAccessUrl;
        showQR("basic-qr", vpnAccessUrl);
        // Bonus: "Also on Android" section for desktop buyers
        var androidSection = buildAndroidSection('Also available: Vizoguard for Android', 'basic-desktop-android-qr', false);
        document.getElementById("basic-vpn-section").appendChild(androidSection);
        showQR('basic-desktop-android-qr', buildAndroidIntentUrl(data.key));
      }
    }
    document.getElementById("basic-setup-link").href = "/setup.html" + (vpnAccessUrl ? "?key=" + encodeURIComponent(vpnAccessUrl) : "");
    document.getElementById("success-basic").style.display = "block";
  }
```

- [ ] **Step 2: Verify by reading the modified function**

Read the `showSuccess` function to confirm both Android and non-Android code paths are present with no syntax errors.

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard
git add public/thank-you.html
git commit -m "feat(thank-you): add Android-aware Basic plan success flow with intent QR"
```

---

### Task 6: Add Android-aware UI to Pro plan success flow

**Files:**
- Modify: `public/thank-you.html:296-305` (Pro plan branch in `showSuccess`)

- [ ] **Step 1: Update Pro plan branch in `showSuccess()`**

Replace lines 296-305 (the Pro plan `if` branch). Add Android section using `buildAndroidSection()`:

```javascript
  if (data.plan === "security_vpn") {
    // Pro plan
    var isAndroid = /android/i.test(navigator.userAgent);
    document.getElementById("pro-license-key").textContent = data.key;
    document.getElementById("pro-email").textContent = data.email || "your email";
    if (vpnAccessUrl) {
      document.getElementById("pro-connect-btn").href = vpnAccessUrl;
      document.getElementById("pro-vpn-section").style.display = "block";
    }
    // Android section for Pro users
    var proTitle = isAndroid ? 'On Android?' : 'Also available: Vizoguard for Android';
    var proAndroid = buildAndroidSection(proTitle, 'pro-android-qr', isAndroid);
    document.getElementById("success-pro").appendChild(proAndroid);
    showQR('pro-android-qr', buildAndroidIntentUrl(data.key));
    document.getElementById("pro-setup-link").href = "/setup.html" + (vpnAccessUrl ? "?key=" + encodeURIComponent(vpnAccessUrl) : "");
    document.getElementById("success-pro").style.display = "block";
```

- [ ] **Step 2: Verify by reading the modified function**

Read the Pro plan branch to confirm `buildAndroidSection` is called correctly and the existing Mac/Windows buttons are preserved.

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard
git add public/thank-you.html
git commit -m "feat(thank-you): add Android section to Pro plan success flow"
```

---

### Task 7: Update connectVPN() Android fallback

**Files:**
- Modify: `public/thank-you.html:222-223` (Android fallback in connectVPN)

- [ ] **Step 1: Update Android fallback URL**

Replace line 222-223:

Before:
```javascript
    } else if (/android/.test(ua)) {
      window.location.href = "https://play.google.com/store/apps/details?id=org.outline.android.client";
```

After:
```javascript
    } else if (/android/.test(ua)) {
      window.location.href = "/downloads/Vizoguard-latest.apk";
```

- [ ] **Step 2: Commit**

```bash
cd /root/vizoguard
git add public/thank-you.html
git commit -m "feat(thank-you): update connectVPN Android fallback to APK download"
```

---

### Task 8: Verify and bump cache

**Files:**
- Modify: `public/sw.js` (bump CACHE_NAME version)

- [ ] **Step 1: Verify APK download URL**

```bash
curl -sI https://vizoguard.com/downloads/Vizoguard-latest.apk | head -5
```

Expected: HTTP 200 with content-length ~34MB.

- [ ] **Step 2: Verify download.html references**

```bash
grep -oP 'href="[^"]*"' /root/vizoguard/public/download.html | grep -i -E "android|apk|outline"
```

Expected: `/downloads/Vizoguard-latest.apk` and the Google Play Outline link.

- [ ] **Step 3: Verify thank-you.html has the intent URL function**

```bash
grep -c "buildAndroidIntentUrl" /root/vizoguard/public/thank-you.html
```

Expected: at least 4 occurrences (function definition + 3 call sites).

- [ ] **Step 4: Verify JSON-LD is valid JSON**

```bash
cd /root/vizoguard
node -e "
  var html = require('fs').readFileSync('public/download.html','utf8');
  var matches = html.match(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/g);
  matches.forEach(function(m,i) {
    var json = m.replace(/<\/?script[^>]*>/g,'');
    try { JSON.parse(json); console.log('Schema ' + (i+1) + ': valid'); }
    catch(e) { console.error('Schema ' + (i+1) + ': INVALID - ' + e.message); process.exit(1); }
  });
"
```

Expected: All 4 schemas report "valid".

- [ ] **Step 5: Run backend tests to verify no regressions**

```bash
cd /root/vizoguard/server && npm test
```

Expected: 69 tests pass.

- [ ] **Step 6: Bump service worker cache version**

Bump `CACHE_NAME` in `public/sw.js` (e.g., `vg-v41` -> `vg-v42`) to force cache invalidation.

- [ ] **Step 7: Commit cache bump**

```bash
cd /root/vizoguard
git add public/sw.js
git commit -m "chore: bump service worker cache for Android distribution changes"
```
