# Android Distribution — Download Page + Thank-You Page

## Problem

The Vizoguard Android APK is hosted at `vizoguard.com/downloads/Vizoguard-latest.apk` but no public page links to it. Both `download.html` and `thank-you.html` direct Android users to the third-party Outline app on Google Play. This means:

- Android users get a worse UX (manual `ss://` key paste into Outline) instead of the native Vizoguard app with deep link activation
- The existing `vizoguard-vpn://activate?key=` deep link infrastructure goes unused
- Users in censored markets where Google Play is blocked have no path to the app

## Scope

Two files changed: `public/download.html` and `public/thank-you.html`. No backend changes. No new dependencies. No landing page changes.

## Design

### 1. Download Page (`download.html`)

#### Android Card (replaces lines 295-300)

Replace the current Outline card:

```html
<!-- BEFORE -->
<h3>VPN for Android</h3>
<p class="platform-req">Uses Outline app</p>
<a href="https://play.google.com/store/apps/details?id=org.outline.android.client" class="btn btn-secondary">Google Play</a>

<!-- AFTER -->
<h3>Vizoguard for Android</h3>
<p class="platform-req">Android 8+</p>
<a href="/downloads/Vizoguard-latest.apk" class="btn">Download APK</a>
<p class="sideload-note">Enable "Install unknown apps" in Android settings. <a href="https://play.google.com/store/apps/details?id=org.outline.android.client" target="_blank" rel="noopener">Or use Outline on Google Play</a></p>
```

- Primary CTA matches Mac/Windows pattern (`btn` not `btn-secondary`)
- Sideloading note is brief, one line
- Outline fallback preserved as text link

#### Plan Note (replaces lines 303-306)

Update to reflect native Android app:

```
Basic plan: Use the Vizoguard Android app or Outline app on any device.
Pro plan: Download the Vizoguard desktop app for full AI security.
```

#### "Which version" Section (lines 388-393)

Update Basic plan description:

```
Basic plan (all platforms): Use the Vizoguard app on Android, or the Outline app
on iOS, Mac, Windows, Linux, and ChromeOS for a fast, private, encrypted VPN.
```

#### FAQ Structured Data Updates

- System requirements Q: Add "Android 8+ (native Vizoguard app)"
- Outline vs Vizoguard Q: Update to note Android now has a native Vizoguard app
- Download verification Q: Update to mention APK is served over HTTPS from vizoguard.com

#### SoftwareApplication JSON-LD

The `downloadUrl` field (line 60) only supports a single URL per schema.org spec. Keep the Mac DMG as the primary `downloadUrl`. No change needed — Android discoverability comes from the page content and FAQ, not the JSON-LD download field.

#### FAQ Structured Data — Before/After

**System requirements Q (line 156):**
- Before: `"Mobile: iOS 15+ or Android 8+. The Outline app also supports Linux and ChromeOS."`
- After: `"Mobile: iOS 15+ (via Outline app) or Android 8+ (native Vizoguard app or Outline). Desktop: macOS 12+ or Windows 10/11. Outline also supports Linux and ChromeOS."`

**Outline vs Vizoguard Q (line 164):**
- Before: `"Outline is the VPN client available on all platforms for all plans. The Vizoguard desktop app is Pro-only for Mac and Windows..."`
- After: `"Outline is the VPN client for iOS, Mac, Windows, Linux, and ChromeOS. The Vizoguard native app is available for Android (all plans) and desktop Mac/Windows (Pro plan — adds AI threat detection, phishing protection, and connection monitoring)."`

**Download verification Q (line 162):**
- Before: `"...Mobile VPN uses the official Outline app from the App Store and Google Play."`
- After: `"...The Android APK is served over HTTPS from vizoguard.com. iOS uses the official Outline app from the App Store."`

### 2. Thank-You Page (`thank-you.html`)

#### Intent URL Generation

License keys follow the format `VIZO-XXXX-XXXX-XXXX-XXXX` (uppercase hex + hyphens only), so URL-encoding is safe but applied defensively:

```javascript
function buildAndroidIntentUrl(key) {
  return 'intent://activate?key=' + encodeURIComponent(key) +
    '#Intent;scheme=vizoguard-vpn;package=com.vizoguard.vpn;' +
    'S.browser_fallback_url=https%3A%2F%2Fvizoguard.com%2Fdownloads%2FVizoguard-latest.apk;end';
}
```

When scanned: if Vizoguard is installed, it opens and auto-activates with the key. If not, Android falls back to the APK download URL.

#### Android Detection

In `showSuccess(data)`, local variable inside the function:

```javascript
var isAndroid = /android/i.test(navigator.userAgent);
```

#### QR Code — Progressive Enhancement

QR generation uses the existing `showQR()` wrapper which has a silent try/catch (line 262). If QRious fails to load or Canvas is unsupported, the QR section stays hidden and the user falls back to the APK download button + manual license key entry. This is acceptable — the QR is a convenience, not a requirement.

#### Basic Plan — Android User

Replace the "Connect with Outline" flow. Show instead:

1. **Primary CTA**: "Download Vizoguard for Android" button linking to `/downloads/Vizoguard-latest.apk`
2. **QR code**: Encodes the intent URL via `buildAndroidIntentUrl(data.key)`
3. **QR label**: "Scan to install and activate"
4. **Fallback**: "Or use Outline on Google Play" text link
5. **Steps list**: Updated for Vizoguard app flow:
   - Download and install the Vizoguard APK
   - Open the app — your license key activates automatically
   - Tap Connect — you're protected

The existing `basic-vpn-section` div is repurposed. When `isAndroid` is true, its innerHTML is replaced with the Android-specific content. When false, the existing Outline flow renders unchanged.

#### Basic Plan — Non-Android User

Keep existing Outline flow, but add a secondary section:

- "Also available: Vizoguard for Android" with QR code containing the intent URL
- Lets desktop buyers set up their phone by scanning

#### Pro Plan — Android User

Add Android section below Mac/Windows buttons:

- "On Android?" with APK download link
- Same intent QR code with license key
- Keep Mac/Windows buttons (Pro users likely on desktop)

#### Pro Plan — Non-Android User

Keep existing Mac/Windows buttons. Add "Also on Android" QR code below the Outline VPN access section.

#### connectVPN() Fallback Update (lines 218-227)

Update Android fallback from Outline Play Store to Vizoguard APK:

```javascript
} else if (/android/.test(ua)) {
  window.location.href = "/downloads/Vizoguard-latest.apk";
}
```

### 3. Styling

New CSS additions (in existing `<style>` blocks):

- `.sideload-note`: small text below Android card button on download page
- `.android-section`: card styling for thank-you page Android section

Both use existing design tokens (`--text-2`, `--teal`, `--surface`, `--border`). No new CSS files.

### 4. Unchanged

- Outline `ss://` deep link still works (iOS, existing Outline installs)
- Mac/Windows download buttons unchanged
- All analytics tracking unchanged (conversion events, GA4, enhanced conversions)
- Service worker caching unchanged
- No backend API changes
- Landing pages (7 languages) and translated SEO pages (60 pages) — deferred
- CI/CD release signing — separate workstream
- iOS flow — still Outline via App Store

## Testing

- Verify APK download works: `curl -I https://vizoguard.com/downloads/Vizoguard-latest.apk`
- Verify download page renders correctly on desktop and mobile viewports
- Verify thank-you page Android detection (test with Android UA string)
- Verify QR code encodes correct intent URL with license key
- Verify Outline fallback links still work
- Verify JSON-LD validates (Google Rich Results Test)
- Run existing backend tests (no changes expected)

## Files Modified

1. `public/download.html` — Android card, plan note, FAQ, JSON-LD, "which version" section
2. `public/thank-you.html` — Android detection, APK button, intent QR code, connectVPN fallback
