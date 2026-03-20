# Vizoguard VPN — Mobile App Design Spec (v1)

**Date:** 2026-03-20
**Status:** Draft
**Platforms:** iOS 15+ (Swift/SwiftUI), Android 8+ (Kotlin/Jetpack Compose)
**Distribution:** App Store, Google Play, direct APK (Huawei)

---

## 1. Product Overview

### What
Native mobile VPN apps that connect to the existing Vizoguard Outline VPN infrastructure. Single-screen UI with a big connect/disconnect button. Zero backend changes.

### Philosophy: "Zero-Thinking VPN"
- One screen, one button
- Auto-connect by default
- Silent reconnects
- Minimal notifications
- User never has to think about whether they're protected

### Target User
Non-technical, privacy-focused individuals who want VPN protection without complexity. Both Basic ($24.99/yr) and Pro ($99.99/yr) plan holders — both include VPN access.

### Store Listing
- **App name:** Vizoguard VPN
- **Subtitle:** Secure & Private Internet
- **Category:** Utilities / VPN

### What This Is NOT (v1)
- No threat detection (v2)
- No connection monitoring (v2)
- No in-app purchase (Stripe web checkout only)
- No region switching (single VPN node)
- No multi-device per license

---

## 2. Architecture

### System Diagram

```
┌──────────────────────────────────────────────┐
│            EXISTING (no changes)              │
│                                              │
│  vizoguard.com API (Express/PM2)             │
│       ↕                                      │
│  SQLite DB (licenses, vpn_nodes)             │
│       ↕                                      │
│  Outline VPN Server (Docker/Shadowbox)       │
│       ↕                                      │
│  Stripe (checkout, webhooks, subscriptions)  │
└──────────────────┬───────────────────────────┘
                   │ HTTPS
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌────────┐   ┌──────────┐   ┌──────────┐
│ iOS    │   │ Android  │   │ Huawei   │
│ App    │   │ App      │   │ APK      │
│ Store  │   │ Play     │   │ sideload │
└────────┘   └──────────┘   └──────────┘
```

### Three Independent Deliverables

| Deliverable | Stack | Distribution | Repo |
|-------------|-------|-------------|------|
| iOS app | Swift + SwiftUI | App Store | `vizoguard-ios` |
| Android app | Kotlin + Jetpack Compose | Google Play | `vizoguard-android` |
| Huawei APK | Same Android build, no GMS | `vizoguard.com/downloads/` | Same as Android |

### Key Constraint
Mobile apps are **separate repos**. They do not touch `vizoguard/` (backend) or `vizoguard-app/` (desktop). Backend remains completely untouched.

### Shared Across All Platforms
- Same backend API endpoints
- Same Outline SDK for Shadowsocks tunneling
- Same `ss://` access key format
- Same Stripe web checkout (no IAP)
- Same license key format (`VIZO-XXXX-XXXX-XXXX-XXXX`)

---

## 3. API Contract (No Backend Changes)

All endpoints already exist and are production-tested.

### Endpoints Used by Mobile

```
POST /api/license
  Request:  { key: string, device_id: string }
  Response: { status, plan, expires_at, email }
  Errors:   404 (invalid key), 403 (device mismatch), 400 (suspended/expired)

POST /api/vpn/create
  Request:  { key: string, device_id: string }
  Response: { access_url: "ss://..." }
  Errors:   403 (not authorized), 409 (already exists)

POST /api/vpn/get
  Request:  { key: string, device_id: string }
  Response: { access_url: "ss://..." }
  Errors:   403 (device mismatch), 404 (no key)

GET /api/vpn/status
  Response: { status: "online" | "offline" }

GET /api/health
  Response: { status: "ok", timestamp: ISO8601 }
```

### Rate Limits (Existing)
- API general: 30 req/min
- License: 10 req/min
- Checkout: 5 req/min

### VPN Credential Lifecycle
1. **First activation** → `POST /api/vpn/create` (provisions Outline access key)
2. **Subsequent launches** → `POST /api/vpn/get` (retrieves existing key)
3. **Cache** `ss://` key in secure storage after first fetch
4. **Re-fetch only** if cached key fails to connect
5. Keys do not rotate — static per license

### Device ID Strategy
- Generate a UUID on first launch
- Store in Keychain (iOS) / Keystore (Android)
- Persists across app reinstalls
- Never use IDFA, hardware identifiers, or any privacy-sensitive ID

---

## 4. Project Structure

### iOS (`vizoguard-ios`)

```
vizoguard-ios/
├── App/
│   ├── VizoguardApp.swift             — entry point, deep link handler
│   └── AppState.swift                 — ObservableObject, single source of truth
├── VPN/
│   ├── VPNManager.swift               — connect/disconnect, status, kill switch
│   └── OutlineSDK integration         — Shadowsocks tunnel via outline-sdk
├── License/
│   ├── LicenseManager.swift           — activate, validate, periodic check
│   ├── KeychainStore.swift            — secure storage (key, VPN creds, device ID)
│   └── DeviceID.swift                 — UUID generation + Keychain persistence
├── API/
│   └── APIClient.swift                — HTTP client for all endpoints
├── UI/
│   ├── MainScreen.swift               — VPN toggle, status circle, stats
│   ├── ActivateScreen.swift           — key entry, QR scanner, deep link
│   ├── OnboardingSheet.swift          — auto-connect prompt (first launch)
│   └── SettingsSheet.swift            — toggles, license info, sign out
├── PacketTunnel/                      — Network Extension target (separate binary)
│   └── PacketTunnelProvider.swift     — NEPacketTunnelProvider implementation
└── Resources/
    └── Assets, Info.plist, entitlements
```

### Android (`vizoguard-android`)

```
vizoguard-android/
├── app/src/main/java/com/vizoguard/vpn/
│   ├── VizoguardApp.kt                — Application class
│   ├── MainActivity.kt                — single activity, Compose host
│   ├── vpn/
│   │   ├── VpnManager.kt              — connect/disconnect, status, kill switch
│   │   └── ShadowsocksService.kt      — VpnService (foreground + notification)
│   ├── license/
│   │   ├── LicenseManager.kt          — activate, validate, WorkManager check
│   │   ├── SecureStore.kt             — EncryptedSharedPreferences
│   │   └── DeviceID.kt                — UUID + Keystore persistence
│   ├── api/
│   │   └── ApiClient.kt               — Retrofit or Ktor HTTP client
│   ├── ui/
│   │   ├── MainScreen.kt              — VPN toggle, status circle, stats
│   │   ├── ActivateScreen.kt          — key entry, QR scanner, deep link
│   │   ├── OnboardingSheet.kt         — auto-connect prompt
│   │   └── SettingsSheet.kt           — toggles, license info
│   └── receiver/
│       └── BootReceiver.kt            — auto-connect on device reboot
└── app/src/main/
    ├── AndroidManifest.xml
    └── res/
```

### Platform-Specific Implementation

| Concern | iOS | Android |
|---------|-----|---------|
| VPN tunnel | NEPacketTunnelProvider | VpnService |
| Shadowsocks | outline-sdk (Swift package) | outline-sdk (Android lib) |
| Secure storage | Keychain Services | EncryptedSharedPreferences |
| Background license check | BGTaskScheduler (24h) | WorkManager (24h) |
| Auto-connect | NEOnDemandRule | BootReceiver + foreground service |
| Kill switch | includeAllNetworks flag | DISALLOW_NON_VPN (VpnService.Builder) |
| Deep links | Universal Links (`vizoguard://`) | App Links (intent-filter) |
| QR scanning | AVCaptureSession | ML Kit / CameraX |
| Notifications | UNUserNotificationCenter | NotificationCompat (foreground service) |
| Device reboot | NEOnDemandRule (automatic) | BOOT_COMPLETED BroadcastReceiver |

---

## 5. User Flow

### First Launch
1. App opens → **Activate Screen** (no license stored)
2. User enters key via one of 4 methods (see Section 6)
3. App calls `POST /api/license` with key + device_id
4. On success → app calls `POST /api/vpn/create` to provision VPN key
5. Cache license data + `ss://` key in secure storage
6. Show **Onboarding Sheet**: "Stay protected automatically?"
7. User chooses → navigate to **Main Screen**

### Returning Launch (License Valid)
1. App opens → check cached license
2. If auto-connect ON → start VPN immediately
3. Show **Main Screen** (connecting or connected)
4. Background: validate license with API (opportunistic, non-blocking)

### Connect Flow
1. User taps connect button (or auto-connect triggers)
2. Check license validity (cached, or API if stale)
3. Use cached `ss://` key to start tunnel
4. If cached key fails → re-fetch via `POST /api/vpn/get`
5. If re-fetch fails → show error with retry
6. On success → show "Protected" state

### Disconnect Flow
1. User taps disconnect button
2. Stop Shadowsocks tunnel
3. Show "Not Protected" state
4. If kill switch ON → warn: "Your internet will be unprotected"

---

## 6. Activation Methods

Four methods, covering every user journey:

### 6a. Deep Link (Primary — purchased on phone)
- Thank-you page shows "Open in Vizoguard" button
- URL: `vizoguard://activate?key=VIZO-XXXX-XXXX-XXXX-XXXX`
- App receives key, activates automatically
- Fallback: if app not installed, link goes to App Store / Play Store

### 6b. QR Code Scan (Cross-device — purchased on desktop)
- Thank-you page already shows QR code (existing feature)
- Mobile app has built-in QR scanner on Activate screen
- QR encodes: `vizoguard://activate?key=VIZO-...`

### 6c. Email Magic Link (Async — setting up later)
- License confirmation email includes `vizoguard://activate?key=...` link
- User taps from phone email app → app opens and activates
- Requires: update email template in `server/email.js` to include mobile deep link

### 6d. Manual Key Entry (Fallback)
- Text input field with `VIZO-` prefix
- Auto-formatting: inserts dashes as user types
- Paste support for full key
- "Activate" button validates and binds

---

## 7. State Machine

### States

| State | Description | UI |
|-------|-------------|-----|
| IDLE | No license activated | Activate screen |
| LICENSED | License valid, VPN disconnected | Main screen, grey circle, "Tap to Connect" |
| CONNECTING | Fetching key / starting tunnel | Main screen, pulsing animation |
| CONNECTED | VPN tunnel active | Main screen, green circle, "Protected" |
| RECONNECTING | Network changed, silently reconnecting | Main screen, subtle pulse, no error shown |
| BLOCKED | Kill switch active, reconnect failed (60s) | Main screen, red warning, "Disable kill switch" option |
| ERROR | Connection failed after retries | Main screen, error message + "Try Again" |

### Transitions

```
IDLE ──activate──→ LICENSED
LICENSED ──connect──→ CONNECTING
CONNECTING ──success──→ CONNECTED
CONNECTING ──fail(3x)──→ ERROR
CONNECTING ──timeout(20s)──→ ERROR ("Taking longer than expected")
CONNECTED ──disconnect──→ LICENSED
CONNECTED ──network_change──→ RECONNECTING
RECONNECTING ──success──→ CONNECTED
RECONNECTING ──fail(60s)+kill_switch──→ BLOCKED
RECONNECTING ──fail(60s)+no_kill_switch──→ ERROR
BLOCKED ──user_override──→ LICENSED
ERROR ──retry──→ CONNECTING
```

### License Check Triggers
- App comes to foreground
- Before every VPN connect attempt
- Background task every 24h (BGTaskScheduler / WorkManager)
- On network change (opportunistic, non-blocking)

### Connecting Timeout
- Hard cap: 20 seconds
- If exceeded: "Connection is taking longer than expected. Try again?"
- Prevents stuck spinner perception

---

## 8. Offline Behavior

### Cached Data
| Data | Storage | Persists Across Reinstall |
|------|---------|--------------------------|
| License key | Keychain / Keystore | Yes |
| License status + expiry | Keychain / EncryptedPrefs | Yes |
| VPN credentials (`ss://`) | Keychain / Keystore | Yes |
| Device UUID | Keychain / Keystore | Yes |
| Settings (auto-connect, kill switch) | UserDefaults / SharedPrefs | No |
| Last known good server | Keychain / EncryptedPrefs | Yes |

### Grace Period
- License expiry is checked locally: `expires_at + 7 days`
- Store the **first failure timestamp** when API is unreachable
- Grace period = 7 days from first failure, not from each check
- After grace period: show "License expired" and block VPN connect
- Grace period resets on successful API validation

### Cold Start Without Network
- If cached license is within grace period AND cached `ss://` key exists:
  - Allow VPN connection using cached credentials
  - Queue license validation for when network returns
- If no cached credentials: show "Connect to internet to activate"

### Last Known Good Server
- After first successful VPN connection, persist server config
- If `/vpn/get` fails on next launch, try cached config first
- Improves cold-start reliability on poor networks

---

## 9. Error Handling

### User-Facing Error Messages

| Error | User Sees | Action |
|-------|-----------|--------|
| No internet | "No internet connection" | Auto-retry when network returns |
| VPN key fetch fails | "Can't reach server. Retrying..." | 3 retries with exponential backoff (5s, 15s, 30s) |
| Tunnel start fails | "VPN connection failed" | "Try again" + "Contact support" |
| Connect timeout (20s) | "Taking longer than expected" | "Try again" button |
| License expired | "Your plan has expired" | "Renew at vizoguard.com" deep link |
| License suspended | "Payment issue" | "Update payment at vizoguard.com" |
| Device mismatch | "This key is active on another device" | "Contact support@vizoguard.com" |
| Kill switch + reconnect failed | "Internet paused to protect you" | "Disable kill switch" button + auto-retry |
| Server offline | "VPN server maintenance" | Exponential backoff, subtle "Reconnecting..." after 3 fails |
| Grace period expired | "Connect to internet to verify license" | Blocks VPN until API reachable |

### Error Philosophy
- **Silent recovery first** — try reconnect before showing any error
- **No toast spam** — aggregate failures, show one message
- **Always actionable** — every error has a button or next step
- **Exponential backoff** — 5s → 15s → 30s to prevent battery drain and server hammering

---

## 10. Settings

Bottom sheet accessible from gear icon on main screen.

### Settings (with defaults)

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-connect | ON | VPN connects on app launch and device reboot |
| Kill switch | ON | Blocks internet if VPN drops unexpectedly |
| Notifications | OFF (minimal) | Optional: notify on connect/disconnect changes |

### Account Info (read-only)
- License key (masked: `VIZO-••••-••••-••••-R8N5`)
- Plan: Basic / Pro
- Expires: date
- Sign out (clears all cached data, returns to Activate screen)

---

## 11. App Store Considerations

### iOS (Apple) — External Payment Strategy
- **No in-app purchase.** Users buy via Stripe on `vizoguard.com`
- App is an "account-based service" / "reader app"
- No pricing, purchase CTAs, or Stripe links inside the iOS app
- Activate screen shows only: "Enter your license key" + activation methods
- "No key?" links to `vizoguard.com` (general landing, not checkout)
- Precedent: NordVPN, Mullvad, ProtonVPN all accept external keys
- **Risk:** Apple may push back. Mitigation: frame as enterprise/account service, not consumer subscription bypass

### Android (Google Play)
- Same external payment model — no Google Play Billing
- Less strict than Apple — direct web links to purchase are generally allowed
- VPN apps require manual review — expect 3-7 day review period
- Must declare `BIND_VPN_SERVICE` permission with clear justification

### Huawei (APK Sideload)
- Same APK as Play Store build
- No Google Mobile Services dependency (no GMS calls anywhere)
- Distributed via `vizoguard.com/downloads/Vizoguard-VPN-latest.apk`
- No Huawei AppGallery listing for v1 (add later for discoverability)

---

## 12. Security Requirements

### Storage
- License key: Keychain (iOS) / Android Keystore
- VPN credentials (`ss://` URL): Keychain (iOS) / EncryptedSharedPreferences (Android)
- Device UUID: Keychain / Keystore (persists across reinstall)
- Settings: UserDefaults / SharedPreferences (non-sensitive)

### Network
- All API calls over HTTPS (TLS 1.2+)
- Certificate pinning: optional for v1, recommended for v2
- Never log: license keys, `ss://` URLs, device IDs, user email

### App Security
- No debug logging in release builds
- No hardcoded secrets (API base URL is public: `https://vizoguard.com/api`)
- Obfuscation: ProGuard/R8 for Android release builds
- iOS: standard App Store binary encryption

---

## 13. Minimum OS and Dependencies

### iOS
- **Minimum:** iOS 15.0
- **Dependencies:** outline-sdk (Swift Package), no other third-party deps
- **Entitlements:** Network Extension (Packet Tunnel), Keychain Sharing
- **Targets:** 2 — main app + Network Extension

### Android
- **Minimum:** API 26 (Android 8.0)
- **Dependencies:** outline-sdk (Android lib), Retrofit or Ktor, ML Kit (QR), WorkManager
- **Permissions:** INTERNET, FOREGROUND_SERVICE, BIND_VPN_SERVICE, RECEIVE_BOOT_COMPLETED, CAMERA (QR)
- **Huawei:** No GMS dependency — all Google-specific APIs have fallbacks

---

## 14. v2 Roadmap (Out of Scope for v1)

These features are explicitly deferred:

| Feature | Why Deferred |
|---------|-------------|
| Threat detection (DNS filtering) | Needs new backend endpoint + mobile DNS interception |
| Connection monitoring | iOS sandboxing limits this severely |
| Region switching | Single VPN node for now |
| In-app purchase | Adds store fee complexity, not needed with Stripe |
| Device reset (self-service) | Needs new backend endpoint |
| Certificate pinning | Nice-to-have, not MVP |
| Huawei AppGallery listing | Add when app is stable |
| Widget (iOS/Android) | VPN status widget for home screen |
| Multi-device per license | Needs license model changes |
| Blocklist auto-update | Needs `/api/blocklist` endpoint |

---

## 15. Backend Changes Required

**None for v1.**

The only change that touches the existing codebase:
- **Email template update** (`server/email.js`): Add `vizoguard://activate?key=...` deep link to the license confirmation email. This is a one-line addition to the existing email body — not a new endpoint or schema change.

---

## 16. Success Criteria

### v1 Launch
- [ ] iOS app approved on App Store
- [ ] Android app approved on Play Store
- [ ] Huawei APK downloadable from vizoguard.com
- [ ] VPN connects/disconnects reliably on all three platforms
- [ ] License activation works via all 4 methods
- [ ] Auto-connect works on app launch and device reboot
- [ ] Kill switch blocks traffic when VPN drops
- [ ] Offline mode works with cached credentials + 7-day grace
- [ ] No crashes in first 48h of release

### Metrics to Track
- Time from activation to first VPN connection (target: < 30s)
- VPN connection success rate (target: > 98%)
- Reconnection success rate (target: > 95%)
- App Store rating (target: > 4.5)
