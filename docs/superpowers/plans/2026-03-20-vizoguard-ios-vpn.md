# Vizoguard VPN iOS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native iOS VPN app (Swift/SwiftUI) that connects to the existing Vizoguard Outline VPN server, with license activation, auto-connect, kill switch, and offline support. Mirrors the Android app functionality.

**Architecture:** SwiftUI app with an `AppState` ObservableObject as single source of truth. VPN tunneling via a Network Extension (NEPacketTunnelProvider) using outline-sdk. License and VPN credentials stored in iOS Keychain. Background license validation via BGTaskScheduler.

**Tech Stack:** Swift, SwiftUI, NetworkExtension (NEPacketTunnelProvider), outline-sdk (Swift Package), Keychain Services, BGTaskScheduler, AVCaptureSession (QR)

**Spec:** `docs/superpowers/specs/2026-03-20-vizoguard-mobile-vpn-design.md`

**Reference implementation:** `vizoguard-android/` — the Android app is complete and serves as the behavioral reference for state machine, error handling, and UX flows.

**Definition of Done:** A user can install, activate with a license key, connect/disconnect VPN, background the app, reconnect on network change, survive airplane mode, and stay protected for 24h without issues. Kill switch blocks internet when VPN drops. App restart retains all state.

---

## iOS-Specific Considerations

Unlike Android, iOS requires:

1. **Two Xcode targets** — Main app + Network Extension (PacketTunnel). The NE is a separate binary that runs in its own process.
2. **App Group** — Shared container for main app ↔ Network Extension communication (Keychain sharing + UserDefaults suite).
3. **Entitlements** — `com.apple.networkextension.packet-tunnel` capability on both targets.
4. **NEVPNManager** — System-level VPN configuration API. The app installs a VPN profile; the OS manages the tunnel lifecycle.
5. **NEOnDemandRule** — Auto-connect rules managed by the OS (not by app code like Android's BootReceiver).
6. **No foreground service** — iOS doesn't need one; the Network Extension runs independently of the app process.
7. **Outline SDK for iOS** — Available as a Swift Package from `github.com/nickolay-ponomarev/nickolay-ponomarev` or built from `outline-sdk` Go source via `gomobile`. Similar AAR situation to Android — may need to be built on a Mac with Go + Xcode.

---

## File Structure

```
vizoguard-ios/
├── VizoguardVPN.xcodeproj/
├── VizoguardVPN/
│   ├── App/
│   │   ├── VizoguardApp.swift           — @main entry, deep link handler, BGTask registration
│   │   └── AppState.swift               — ObservableObject, single source of truth
│   ├── API/
│   │   └── APIClient.swift              — URLSession HTTP client for all endpoints
│   ├── License/
│   │   ├── LicenseManager.swift         — activate, validate, grace period, key format
│   │   ├── KeychainStore.swift          — Keychain wrapper (license, VPN creds, device ID, settings)
│   │   └── DeviceID.swift               — UUID generation + Keychain persistence
│   ├── VPN/
│   │   ├── VPNManager.swift             — NEVPNManager wrapper, connect/disconnect, status observation
│   │   └── VPNState.swift               — State enum, status model
│   ├── UI/
│   │   ├── MainScreen.swift             — VPN toggle circle, status, stats
│   │   ├── ActivateScreen.swift         — Key entry, QR scanner, deep link
│   │   ├── OnboardingSheet.swift        — Auto-connect prompt
│   │   └── SettingsSheet.swift          — Toggles, license info, sign out
│   ├── Resources/
│   │   ├── Assets.xcassets/
│   │   └── Info.plist
│   └── VizoguardVPN.entitlements
├── PacketTunnel/
│   ├── PacketTunnelProvider.swift        — NEPacketTunnelProvider + outline-sdk tunnel
│   ├── Info.plist
│   └── PacketTunnel.entitlements
├── VizoguardVPNTests/
│   ├── APIClientTests.swift
│   ├── LicenseManagerTests.swift
│   ├── KeychainStoreTests.swift
│   └── VPNManagerTests.swift
└── Package.swift or SPM dependencies
```

---

## Task 1: Xcode Project Setup

**Files:**
- Create: Xcode project `VizoguardVPN` with 2 targets (app + Network Extension)
- Create: `VizoguardVPN/App/VizoguardApp.swift`
- Create: `VizoguardVPN/Resources/Info.plist`
- Create: `PacketTunnel/PacketTunnelProvider.swift` (stub)
- Create: `PacketTunnel/Info.plist`
- Create: Both `.entitlements` files

**Note:** This task MUST be done on a Mac with Xcode installed. The VPS cannot create Xcode projects. This plan provides the exact file contents; the developer creates the Xcode project structure manually or via `xcodegen`.

- [ ] **Step 1: Create Xcode project**

Option A — Xcode GUI:
1. File → New → Project → App (SwiftUI, Swift)
2. Product Name: `VizoguardVPN`, Organization: `com.vizoguard`, Bundle ID: `com.vizoguard.vpn`
3. Add Target → Network Extension → Packet Tunnel Provider, name: `PacketTunnel`

Option B — Use `xcodegen` with a `project.yml`:
```yaml
name: VizoguardVPN
options:
  bundleIdPrefix: com.vizoguard
  deploymentTarget:
    iOS: "15.0"
settings:
  SWIFT_VERSION: "5.9"
  DEVELOPMENT_TEAM: YOUR_TEAM_ID
targets:
  VizoguardVPN:
    type: application
    platform: iOS
    sources: [VizoguardVPN]
    settings:
      PRODUCT_BUNDLE_IDENTIFIER: com.vizoguard.vpn
      INFOPLIST_FILE: VizoguardVPN/Resources/Info.plist
      CODE_SIGN_ENTITLEMENTS: VizoguardVPN/VizoguardVPN.entitlements
    dependencies:
      - target: PacketTunnel
        embed: true
    entitlements:
      path: VizoguardVPN/VizoguardVPN.entitlements
      properties:
        com.apple.security.application-groups: [group.com.vizoguard.vpn]
        com.apple.developer.networking.networkextension: [packet-tunnel-provider]
  PacketTunnel:
    type: app-extension
    platform: iOS
    sources: [PacketTunnel]
    settings:
      PRODUCT_BUNDLE_IDENTIFIER: com.vizoguard.vpn.PacketTunnel
      INFOPLIST_FILE: PacketTunnel/Info.plist
      CODE_SIGN_ENTITLEMENTS: PacketTunnel/PacketTunnel.entitlements
    entitlements:
      path: PacketTunnel/PacketTunnel.entitlements
      properties:
        com.apple.security.application-groups: [group.com.vizoguard.vpn]
        com.apple.developer.networking.networkextension: [packet-tunnel-provider]
```

- [ ] **Step 2: Create entitlements**

`VizoguardVPN/VizoguardVPN.entitlements`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.vizoguard.vpn</string>
    </array>
    <key>com.apple.developer.networking.networkextension</key>
    <array>
        <string>packet-tunnel-provider</string>
    </array>
</dict>
</plist>
```

`PacketTunnel/PacketTunnel.entitlements`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.vizoguard.vpn</string>
    </array>
    <key>com.apple.developer.networking.networkextension</key>
    <array>
        <string>packet-tunnel-provider</string>
    </array>
</dict>
</plist>
```

- [ ] **Step 3: Create App entry point**

`VizoguardVPN/App/VizoguardApp.swift`:
```swift
import SwiftUI
import BackgroundTasks

@main
struct VizoguardApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .onOpenURL { url in
                    appState.handleDeepLink(url)
                }
        }
    }

    init() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.vizoguard.vpn.licenseCheck",
            using: nil
        ) { task in
            LicenseCheckTask.handle(task as! BGAppRefreshTask)
        }
    }
}
```

- [ ] **Step 4: Create PacketTunnel stub**

`PacketTunnel/PacketTunnelProvider.swift`:
```swift
import NetworkExtension

class PacketTunnelProvider: NEPacketTunnelProvider {
    override func startTunnel(options: [String: NSObject]?) async throws {
        // TODO: Initialize outline-sdk tunnel here
        // For now, simulate successful connection
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "10.0.0.1")
        settings.ipv4Settings = NEIPv4Settings(addresses: ["10.0.0.2"], subnetMasks: ["255.255.255.0"])
        settings.ipv4Settings?.includedRoutes = [NEIPv4Route.default()]
        settings.dnsSettings = NEDNSSettings(servers: ["1.1.1.1", "8.8.8.8"])
        settings.mtu = 1500
        try await setTunnelNetworkSettings(settings)
    }

    override func stopTunnel(with reason: NEProviderStopReason) async {
        // TODO: Tear down outline-sdk tunnel
    }

    override func handleAppMessage(_ messageData: Data) async -> Data? {
        return nil
    }
}
```

`PacketTunnel/Info.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.networkextension.packet-tunnel</string>
        <key>NSExtensionPrincipalClass</key>
        <string>$(PRODUCT_MODULE_NAME).PacketTunnelProvider</string>
    </dict>
</dict>
</plist>
```

- [ ] **Step 5: Create Info.plist for deep links + camera**

`VizoguardVPN/Resources/Info.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>vizoguard-vpn</string>
            </array>
            <key>CFBundleURLName</key>
            <string>com.vizoguard.vpn</string>
        </dict>
    </array>
    <key>NSCameraUsageDescription</key>
    <string>Vizoguard needs camera access to scan QR codes for license activation.</string>
    <key>BGTaskSchedulerPermittedIdentifiers</key>
    <array>
        <string>com.vizoguard.vpn.licenseCheck</string>
    </array>
</dict>
</plist>
```

- [ ] **Step 6: Initialize git repo and commit**

```bash
cd vizoguard-ios
git init
echo -e ".DS_Store\nbuild/\n*.xcuserdatad/\nDerivedData/\n*.xcworkspace/xcuserdata/\n*.pbxuser\n*.mode1v3\n*.mode2v3\n*.perspectivev3\n*.hmap\n*.ipa\n*.dSYM.zip\n*.dSYM" > .gitignore
git add -A
git commit -m "feat: scaffold iOS project with Network Extension, entitlements, deep links"
```

---

## Task 2: Keychain Store + Device ID

**Files:**
- Create: `VizoguardVPN/License/KeychainStore.swift`
- Create: `VizoguardVPN/License/DeviceID.swift`
- Create: `VizoguardVPNTests/KeychainStoreTests.swift`

- [ ] **Step 1: Write KeychainStore tests**

```swift
import XCTest
@testable import VizoguardVPN

final class KeychainStoreTests: XCTestCase {

    private var store: KeychainStore!

    override func setUp() {
        store = KeychainStore(service: "com.vizoguard.vpn.test.\(UUID().uuidString)")
    }

    override func tearDown() {
        store.clearAll()
    }

    func testStoreAndRetrieveLicenseKey() {
        store.saveLicenseKey("VIZO-AAAA-BBBB-CCCC-DDDD")
        XCTAssertEqual(store.getLicenseKey(), "VIZO-AAAA-BBBB-CCCC-DDDD")
    }

    func testReturnsNilWhenNoKey() {
        XCTAssertNil(store.getLicenseKey())
    }

    func testStoreAndRetrieveVpnAccessUrl() {
        store.saveVpnAccessUrl("ss://base64@host:port")
        XCTAssertEqual(store.getVpnAccessUrl(), "ss://base64@host:port")
    }

    func testClearAllRemovesEverything() {
        store.saveLicenseKey("VIZO-AAAA-BBBB-CCCC-DDDD")
        store.saveVpnAccessUrl("ss://test")
        store.clearAll()
        XCTAssertNil(store.getLicenseKey())
        XCTAssertNil(store.getVpnAccessUrl())
    }

    func testStoreAndRetrieveExpiry() {
        store.saveLicenseExpiry("2027-03-20T00:00:00Z")
        XCTAssertEqual(store.getLicenseExpiry(), "2027-03-20T00:00:00Z")
    }

    func testFirstFailureTimestamp() {
        XCTAssertNil(store.getFirstFailureTimestamp())
        store.saveFirstFailureTimestamp(1711929600)
        XCTAssertEqual(store.getFirstFailureTimestamp(), 1711929600)
        store.clearFirstFailureTimestamp()
        XCTAssertNil(store.getFirstFailureTimestamp())
    }

    func testDeviceId() {
        XCTAssertNil(store.getDeviceId())
        store.saveDeviceId("test-uuid")
        XCTAssertEqual(store.getDeviceId(), "test-uuid")
    }

    func testSettingsDefaults() {
        XCTAssertTrue(store.getAutoConnect())   // default ON
        XCTAssertTrue(store.getKillSwitch())    // default ON
        XCTAssertFalse(store.getNotifications()) // default OFF
    }
}
```

- [ ] **Step 2: Implement KeychainStore**

```swift
import Foundation
import Security

class KeychainStore {
    private let service: String

    init(service: String = "com.vizoguard.vpn") {
        self.service = service
    }

    // MARK: - License

    func saveLicenseKey(_ key: String) { set(key, forKey: "license_key") }
    func getLicenseKey() -> String? { get(forKey: "license_key") }

    func saveVpnAccessUrl(_ url: String) { set(url, forKey: "vpn_access_url") }
    func getVpnAccessUrl() -> String? { get(forKey: "vpn_access_url") }

    func saveLicenseExpiry(_ iso8601: String) { set(iso8601, forKey: "license_expiry") }
    func getLicenseExpiry() -> String? { get(forKey: "license_expiry") }

    func saveLicenseStatus(_ status: String) { set(status, forKey: "license_status") }
    func getLicenseStatus() -> String? { get(forKey: "license_status") }

    func saveFirstFailureTimestamp(_ ts: TimeInterval) { set(String(ts), forKey: "first_failure_ts") }
    func getFirstFailureTimestamp() -> TimeInterval? {
        guard let str = get(forKey: "first_failure_ts") else { return nil }
        return TimeInterval(str)
    }
    func clearFirstFailureTimestamp() { delete(forKey: "first_failure_ts") }

    // MARK: - Device

    func saveDeviceId(_ id: String) { set(id, forKey: "device_uuid") }
    func getDeviceId() -> String? { get(forKey: "device_uuid") }

    // MARK: - Settings (stored in UserDefaults via App Group for NE access)

    private var defaults: UserDefaults {
        UserDefaults(suiteName: "group.com.vizoguard.vpn") ?? .standard
    }

    func saveAutoConnect(_ enabled: Bool) { defaults.set(enabled, forKey: "auto_connect") }
    func getAutoConnect() -> Bool { defaults.object(forKey: "auto_connect") as? Bool ?? true }

    func saveKillSwitch(_ enabled: Bool) { defaults.set(enabled, forKey: "kill_switch") }
    func getKillSwitch() -> Bool { defaults.object(forKey: "kill_switch") as? Bool ?? true }

    func saveNotifications(_ enabled: Bool) { defaults.set(enabled, forKey: "notifications") }
    func getNotifications() -> Bool { defaults.object(forKey: "notifications") as? Bool ?? false }

    // MARK: - Clear

    func clearAll() {
        let keys = ["license_key", "vpn_access_url", "license_expiry", "license_status",
                     "first_failure_ts", "device_uuid"]
        keys.forEach { delete(forKey: $0) }
        defaults.removeObject(forKey: "auto_connect")
        defaults.removeObject(forKey: "kill_switch")
        defaults.removeObject(forKey: "notifications")
    }

    // MARK: - Keychain Helpers

    private func set(_ value: String, forKey key: String) {
        let data = value.data(using: .utf8)!
        delete(forKey: key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    private func get(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func delete(forKey key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}
```

- [ ] **Step 3: Implement DeviceID**

```swift
import Foundation

enum DeviceID {
    static func get(store: KeychainStore = KeychainStore()) -> String {
        if let existing = store.getDeviceId() { return existing }
        let uuid = UUID().uuidString
        store.saveDeviceId(uuid)
        return uuid
    }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
xcodebuild test -scheme VizoguardVPN -destination 'platform=iOS Simulator,name=iPhone 15'
```

- [ ] **Step 5: Commit**

```bash
git add VizoguardVPN/License/ VizoguardVPNTests/KeychainStoreTests.swift
git commit -m "feat: add KeychainStore and DeviceID with Keychain persistence"
```

---

## Task 3: API Client

**Files:**
- Create: `VizoguardVPN/API/APIClient.swift`
- Create: `VizoguardVPNTests/APIClientTests.swift`

- [ ] **Step 1: Write tests**

```swift
import XCTest
@testable import VizoguardVPN

final class APIClientTests: XCTestCase {

    func testParseLicenseResponse() throws {
        let json = Data(#"{"valid":true,"status":"active","expires":"2027-03-20T00:00:00Z"}"#.utf8)
        let result = try JSONDecoder().decode(LicenseResponse.self, from: json)
        XCTAssertTrue(result.valid)
        XCTAssertEqual(result.status, "active")
        XCTAssertEqual(result.expires, "2027-03-20T00:00:00Z")
    }

    func testParseVpnResponse() throws {
        let json = Data(#"{"access_url":"ss://Y2hhY2hhMjA=@1.2.3.4:8388/?outline=1"}"#.utf8)
        let result = try JSONDecoder().decode(VpnResponse.self, from: json)
        XCTAssertEqual(result.accessUrl, "ss://Y2hhY2hhMjA=@1.2.3.4:8388/?outline=1")
    }

    func testParseErrorResponse() throws {
        let json = Data(#"{"error":"License expired","status":"expired"}"#.utf8)
        let result = try JSONDecoder().decode(ErrorResponse.self, from: json)
        XCTAssertEqual(result.status, "expired")
        XCTAssertEqual(result.error, "License expired")
    }

    func testParseHealthResponse() throws {
        let json = Data(#"{"status":"ok","timestamp":"2026-03-20T08:00:00Z"}"#.utf8)
        let result = try JSONDecoder().decode(HealthResponse.self, from: json)
        XCTAssertEqual(result.status, "ok")
    }
}
```

- [ ] **Step 2: Implement APIClient**

```swift
import Foundation

struct LicenseResponse: Codable {
    let valid: Bool
    let status: String
    let expires: String
}

struct VpnResponse: Codable {
    let accessUrl: String
    enum CodingKeys: String, CodingKey { case accessUrl = "access_url" }
}

struct ErrorResponse: Codable {
    let error: String
    let status: String
}

struct HealthResponse: Codable {
    let status: String
}

struct APIError: Error {
    let httpStatus: Int
    let message: String
    let status: String
}

class APIClient {
    private let baseURL: String
    private let session: URLSession

    init(baseURL: String = "https://vizoguard.com/api") {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        self.session = URLSession(configuration: config)
    }

    func activateLicense(key: String, deviceId: String) async throws -> LicenseResponse {
        let body = ["key": key, "device_id": deviceId]
        return try await post("/license", body: body)
    }

    func createVpnKey(key: String, deviceId: String) async throws -> VpnResponse {
        let body = ["key": key, "device_id": deviceId]
        return try await post("/vpn/create", body: body)
    }

    func getVpnKey(key: String, deviceId: String) async throws -> VpnResponse {
        let body = ["key": key, "device_id": deviceId]
        return try await post("/vpn/get", body: body)
    }

    func checkHealth() async throws -> HealthResponse {
        return try await get("/health")
    }

    func checkVpnStatus() async throws -> HealthResponse {
        return try await get("/vpn/status")
    }

    // MARK: - HTTP Helpers

    private func post<T: Decodable>(_ path: String, body: [String: String]) async throws -> T {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)
        let httpResponse = response as! HTTPURLResponse

        if (200...299).contains(httpResponse.statusCode) {
            return try JSONDecoder().decode(T.self, from: data)
        } else {
            let err = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError(httpStatus: httpResponse.statusCode, message: err.error, status: err.status)
        }
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        let (data, _) = try await session.data(for: request)
        return try JSONDecoder().decode(T.self, from: data)
    }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
git add VizoguardVPN/API/ VizoguardVPNTests/APIClientTests.swift
git commit -m "feat: add APIClient with URLSession for all backend endpoints"
```

---

## Task 4: License Manager

**Files:**
- Create: `VizoguardVPN/License/LicenseManager.swift`
- Create: `VizoguardVPNTests/LicenseManagerTests.swift`

- [ ] **Step 1: Write tests**

```swift
import XCTest
@testable import VizoguardVPN

final class LicenseManagerTests: XCTestCase {

    func testIsExpiredReturnsFalseForFutureDate() {
        let future = ISO8601DateFormatter().string(from: Date().addingTimeInterval(86400 * 30))
        XCTAssertFalse(LicenseManager.isExpired(future))
    }

    func testIsExpiredReturnsTrueForPastDate() {
        let past = ISO8601DateFormatter().string(from: Date().addingTimeInterval(-86400))
        XCTAssertTrue(LicenseManager.isExpired(past))
    }

    func testGracePeriodWithin7Days() {
        let threeAgo = Date().addingTimeInterval(-86400 * 3).timeIntervalSince1970
        XCTAssertTrue(LicenseManager.isWithinGracePeriod(threeAgo))
    }

    func testGracePeriodExpiredAfter7Days() {
        let eightAgo = Date().addingTimeInterval(-86400 * 8).timeIntervalSince1970
        XCTAssertFalse(LicenseManager.isWithinGracePeriod(eightAgo))
    }

    func testMaskKey() {
        XCTAssertEqual(LicenseManager.maskKey("VIZO-AAAA-BBBB-CCCC-DDDD"), "VIZO-••••-••••-••••-DDDD")
    }

    func testValidKeyFormat() {
        XCTAssertTrue(LicenseManager.isValidKeyFormat("VIZO-AAAA-BBBB-CCCC-DDDD"))
        XCTAssertFalse(LicenseManager.isValidKeyFormat("invalid"))
        XCTAssertFalse(LicenseManager.isValidKeyFormat("VIZO-AAA-BBB-CCC-DDD"))
    }
}
```

- [ ] **Step 2: Implement LicenseManager**

```swift
import Foundation

class LicenseManager: ObservableObject {
    struct LicenseState {
        let key: String?
        let status: String?
        let expires: String?
        let vpnAccessUrl: String?
        let isValid: Bool
    }

    private let store: KeychainStore
    private let api: APIClient
    private let deviceId: String

    init(store: KeychainStore = KeychainStore(), api: APIClient = APIClient(), deviceId: String? = nil) {
        self.store = store
        self.api = api
        self.deviceId = deviceId ?? DeviceID.get(store: store)
    }

    func getCachedState() -> LicenseState {
        let key = store.getLicenseKey()
        let status = store.getLicenseStatus()
        let expires = store.getLicenseExpiry()
        let vpnUrl = store.getVpnAccessUrl()
        let isValid = key != nil && status == "active" && expires != nil && !Self.isExpired(expires!)
        return LicenseState(key: key, status: status, expires: expires, vpnAccessUrl: vpnUrl, isValid: isValid)
    }

    func activate(key: String) async throws -> LicenseState {
        let license = try await api.activateLicense(key: key, deviceId: deviceId)
        store.saveLicenseKey(key)
        store.saveLicenseStatus(license.status)
        store.saveLicenseExpiry(license.expires)
        store.clearFirstFailureTimestamp()

        if let vpn = try? await api.createVpnKey(key: key, deviceId: deviceId) {
            store.saveVpnAccessUrl(vpn.accessUrl)
        }

        return getCachedState()
    }

    func validate() async {
        guard let key = store.getLicenseKey() else { return }
        do {
            let license = try await api.activateLicense(key: key, deviceId: deviceId)
            store.saveLicenseStatus(license.status)
            store.saveLicenseExpiry(license.expires)
            store.clearFirstFailureTimestamp()
        } catch {
            if store.getFirstFailureTimestamp() == nil {
                store.saveFirstFailureTimestamp(Date().timeIntervalSince1970)
            }
        }
    }

    func canConnectOffline() -> Bool {
        let state = getCachedState()
        guard let _ = state.vpnAccessUrl, let expires = state.expires else { return false }
        if !Self.isExpired(expires) { return true }
        guard let firstFail = store.getFirstFailureTimestamp() else { return false }
        return Self.isWithinGracePeriod(firstFail)
    }

    func signOut() {
        store.clearAll()
    }

    func getStore() -> KeychainStore { store }

    // MARK: - Static Helpers

    static let gracePeriodDays: TimeInterval = 7 * 86400
    static let keyPattern = try! NSRegularExpression(pattern: "^VIZO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$")

    static func isExpired(_ iso8601: String) -> Bool {
        guard let date = ISO8601DateFormatter().date(from: iso8601) else { return true }
        return date < Date()
    }

    static func isWithinGracePeriod(_ firstFailure: TimeInterval) -> Bool {
        let deadline = firstFailure + gracePeriodDays
        return Date().timeIntervalSince1970 < deadline
    }

    static func maskKey(_ key: String) -> String {
        let parts = key.split(separator: "-")
        guard parts.count == 5 else { return key }
        return "\(parts[0])-••••-••••-••••-\(parts[4])"
    }

    static func isValidKeyFormat(_ key: String) -> Bool {
        let range = NSRange(key.startIndex..., in: key)
        return keyPattern.firstMatch(in: key, range: range) != nil
    }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
git add VizoguardVPN/License/LicenseManager.swift VizoguardVPNTests/LicenseManagerTests.swift
git commit -m "feat: add LicenseManager with activation, validation, grace period"
```

---

## Task 5: VPN Manager

**Files:**
- Create: `VizoguardVPN/VPN/VPNState.swift`
- Create: `VizoguardVPN/VPN/VPNManager.swift`
- Create: `VizoguardVPNTests/VPNManagerTests.swift`

- [ ] **Step 1: Write tests**

```swift
import XCTest
@testable import VizoguardVPN

final class VPNManagerTests: XCTestCase {

    func testParseShadowsocksUrl() {
        let url = "ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpwYXNzd29yZA==@1.2.3.4:8388/?outline=1"
        let config = VPNManager.parseShadowsocksUrl(url)
        XCTAssertNotNil(config)
        XCTAssertEqual(config?.host, "1.2.3.4")
        XCTAssertEqual(config?.port, 8388)
        XCTAssertEqual(config?.method, "chacha20-ietf-poly1305")
        XCTAssertEqual(config?.password, "password")
    }

    func testParseShadowsocksUrlInvalid() {
        XCTAssertNil(VPNManager.parseShadowsocksUrl("https://not-ss"))
        XCTAssertNil(VPNManager.parseShadowsocksUrl(""))
    }

    func testVpnStateEnum() {
        let states = VPNState.allCases
        XCTAssertEqual(states.count, 7)
        XCTAssertTrue(states.contains(.idle))
        XCTAssertTrue(states.contains(.connected))
        XCTAssertTrue(states.contains(.reconnecting))
        XCTAssertTrue(states.contains(.blocked))
    }
}
```

- [ ] **Step 2: Implement VPNState**

```swift
import Foundation

enum VPNState: CaseIterable {
    case idle, licensed, connecting, connected, reconnecting, blocked, error
}

struct ShadowsocksConfig {
    let host: String
    let port: Int
    let method: String
    let password: String
}

struct VPNStatus {
    var state: VPNState = .idle
    var errorMessage: String? = nil
    var connectedSince: Date? = nil
}
```

- [ ] **Step 3: Implement VPNManager**

```swift
import Foundation
import NetworkExtension

class VPNManager: ObservableObject {
    @Published var status = VPNStatus()

    private var vpnManager: NETunnelProviderManager?

    init() {
        loadVPNPreference()
        observeVPNStatus()
    }

    private func loadVPNPreference() {
        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, error in
            self?.vpnManager = managers?.first
        }
    }

    private func observeVPNStatus() {
        NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange, object: nil, queue: .main
        ) { [weak self] notification in
            guard let connection = notification.object as? NEVPNConnection else { return }
            self?.handleStatusChange(connection.status)
        }
    }

    private func handleStatusChange(_ neStatus: NEVPNStatus) {
        switch neStatus {
        case .connected:
            status = VPNStatus(state: .connected, connectedSince: status.connectedSince ?? Date())
        case .connecting, .reasserting:
            status = VPNStatus(state: .connecting, connectedSince: status.connectedSince)
        case .disconnecting:
            status = VPNStatus(state: .licensed)
        case .disconnected:
            status = VPNStatus(state: .licensed)
        case .invalid:
            status = VPNStatus(state: .error, errorMessage: "VPN configuration invalid")
        @unknown default:
            break
        }
    }

    func startVPN(accessUrl: String, killSwitch: Bool) {
        guard let config = Self.parseShadowsocksUrl(accessUrl) else {
            status = VPNStatus(state: .error, errorMessage: "Invalid VPN configuration")
            return
        }

        status = VPNStatus(state: .connecting)

        let manager = vpnManager ?? NETunnelProviderManager()
        let proto = NETunnelProviderProtocol()
        proto.providerBundleIdentifier = "com.vizoguard.vpn.PacketTunnel"
        proto.serverAddress = "\(config.host):\(config.port)"
        proto.providerConfiguration = [
            "host": config.host,
            "port": config.port,
            "method": config.method,
            "password": config.password
        ]

        manager.protocolConfiguration = proto
        manager.localizedDescription = "Vizoguard VPN"
        manager.isEnabled = true

        if killSwitch {
            manager.isOnDemandEnabled = true
            manager.onDemandRules = [NEOnDemandRuleConnect()]
        }

        // includeAllNetworks = kill switch (blocks all non-VPN traffic)
        if #available(iOS 14.2, *) {
            proto.includeAllNetworks = killSwitch
        }

        manager.saveToPreferences { [weak self] error in
            if let error {
                self?.status = VPNStatus(state: .error, errorMessage: error.localizedDescription)
                return
            }
            manager.loadFromPreferences { error in
                if let error {
                    self?.status = VPNStatus(state: .error, errorMessage: error.localizedDescription)
                    return
                }
                do {
                    try manager.connection.startVPNTunnel()
                    self?.vpnManager = manager
                } catch {
                    self?.status = VPNStatus(state: .error, errorMessage: error.localizedDescription)
                }
            }
        }
    }

    func stopVPN() {
        vpnManager?.connection.stopVPNTunnel()
        status = VPNStatus(state: .licensed)
    }

    // MARK: - SS URL Parser

    static func parseShadowsocksUrl(_ url: String) -> ShadowsocksConfig? {
        guard url.hasPrefix("ss://") else { return nil }
        let withoutScheme = String(url.dropFirst(5))
        guard let atIndex = withoutScheme.lastIndex(of: "@") else { return nil }

        let encoded = String(withoutScheme[..<atIndex])
        let hostPortQuery = String(withoutScheme[withoutScheme.index(after: atIndex)...])
        let hostPort = hostPortQuery.components(separatedBy: "/?").first ?? hostPortQuery

        guard let decoded = Data(base64Encoded: encoded),
              let decodedStr = String(data: decoded, encoding: .utf8),
              let colonIndex = decodedStr.firstIndex(of: ":") else { return nil }

        let method = String(decodedStr[..<colonIndex])
        let password = String(decodedStr[decodedStr.index(after: colonIndex)...])

        let parts = hostPort.components(separatedBy: ":")
        guard parts.count == 2, let port = Int(parts[1]) else { return nil }

        return ShadowsocksConfig(host: parts[0], port: port, method: method, password: password)
    }
}
```

- [ ] **Step 4: Run tests, commit**

```bash
git add VizoguardVPN/VPN/ VizoguardVPNTests/VPNManagerTests.swift
git commit -m "feat: add VPNManager with NEVPNManager, state observation, kill switch"
```

---

## Task 6: AppState + Content View

**Files:**
- Create: `VizoguardVPN/App/AppState.swift`
- Create: `VizoguardVPN/App/ContentView.swift`
- Create: `VizoguardVPN/App/LicenseCheckTask.swift`

- [ ] **Step 1: Implement AppState**

```swift
import Foundation
import SwiftUI

enum AppScreen {
    case activate, main, onboarding
}

@MainActor
class AppState: ObservableObject {
    @Published var screen: AppScreen = .activate
    @Published var isLoading = false
    @Published var errorMessage: String?

    let licenseManager: LicenseManager
    let vpnManager: VPNManager

    init() {
        self.licenseManager = LicenseManager()
        self.vpnManager = VPNManager()

        let cached = licenseManager.getCachedState()
        if cached.isValid {
            screen = .main
            if licenseManager.getStore().getAutoConnect(), cached.vpnAccessUrl != nil {
                connect()
            }
        }

        Task { await licenseManager.validate() }
    }

    func activate(key: String) {
        isLoading = true
        errorMessage = nil
        Task {
            do {
                let state = try await licenseManager.activate(key: key)
                isLoading = false
                if state.isValid {
                    screen = .onboarding
                }
            } catch let error as APIError {
                isLoading = false
                errorMessage = userFriendlyError(error)
            } catch {
                isLoading = false
                errorMessage = "Can't reach server. Check your internet connection."
            }
        }
    }

    func finishOnboarding(autoConnect: Bool) {
        licenseManager.getStore().saveAutoConnect(autoConnect)
        screen = .main
        if autoConnect { connect() }
    }

    func connect() {
        let state = licenseManager.getCachedState()
        guard let url = state.vpnAccessUrl else { return }
        vpnManager.startVPN(accessUrl: url, killSwitch: licenseManager.getStore().getKillSwitch())
    }

    func disconnect() {
        vpnManager.stopVPN()
    }

    func signOut() {
        vpnManager.stopVPN()
        licenseManager.signOut()
        screen = .activate
    }

    func handleDeepLink(_ url: URL) {
        guard url.scheme == "vizoguard-vpn",
              url.host == "activate",
              let key = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                  .queryItems?.first(where: { $0.name == "key" })?.value,
              LicenseManager.isValidKeyFormat(key)
        else { return }
        activate(key: key)
    }

    private func userFriendlyError(_ error: APIError) -> String {
        switch error.status {
        case "expired": return "Your plan has expired. Renew at vizoguard.com"
        case "suspended": return "Payment issue. Update payment at vizoguard.com"
        case "device_mismatch": return "This key is active on another device. Contact support@vizoguard.com"
        default: return error.message
        }
    }

    static func planDisplayName(_ apiValue: String?) -> String {
        switch apiValue {
        case "vpn": return "Basic"
        case "security_vpn": return "Pro"
        default: return "Unknown"
        }
    }
}
```

- [ ] **Step 2: Implement ContentView (router)**

```swift
import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        switch appState.screen {
        case .activate:
            ActivateScreen()
        case .onboarding:
            OnboardingSheet { autoConnect in
                appState.finishOnboarding(autoConnect: autoConnect)
            }
        case .main:
            MainScreen()
        }
    }
}
```

- [ ] **Step 3: Implement LicenseCheckTask**

```swift
import BackgroundTasks

enum LicenseCheckTask {
    static func handle(_ task: BGAppRefreshTask) {
        let manager = LicenseManager()

        task.expirationHandler = { task.setTaskCompleted(success: false) }

        Task {
            await manager.validate()
            task.setTaskCompleted(success: true)
            scheduleNext()
        }
    }

    static func scheduleNext() {
        let request = BGAppRefreshTaskRequest(identifier: "com.vizoguard.vpn.licenseCheck")
        request.earliestBeginDate = Date(timeIntervalSinceNow: 24 * 60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add VizoguardVPN/App/
git commit -m "feat: add AppState, ContentView router, and background license check"
```

---

## Task 7: UI Screens

**Files:**
- Create: `VizoguardVPN/UI/MainScreen.swift`
- Create: `VizoguardVPN/UI/ActivateScreen.swift`
- Create: `VizoguardVPN/UI/OnboardingSheet.swift`
- Create: `VizoguardVPN/UI/SettingsSheet.swift`

These follow the same design as the Android Compose screens. Create them using SwiftUI equivalents of the Android mockups (dark theme with Accent=#FF6B2B, Teal=#00E5A0, Background=#000000, Surface=#111111).

Key SwiftUI patterns:
- `@EnvironmentObject var appState: AppState` on MainScreen, ActivateScreen, SettingsSheet
- `Circle()` with `.stroke()` for VPN toggle
- `CodeScannerView` from `https://github.com/twostraws/CodeScanner` SPM package for QR (or use AVCaptureSession directly)
- `.sheet()` modifier for SettingsSheet
- `TextField` with custom formatting for license key input

- [ ] **Step 1: Implement all 4 screens** (read Android equivalents in `/root/vizoguard-android/app/src/main/java/com/vizoguard/vpn/ui/` for exact feature parity)

- [ ] **Step 2: Commit**

```bash
git add VizoguardVPN/UI/
git commit -m "feat: add all UI screens — MainScreen, ActivateScreen, OnboardingSheet, SettingsSheet"
```

---

## Task 8: Integration + Build

- [ ] **Step 1: Build for simulator**

```bash
xcodebuild build -scheme VizoguardVPN -destination 'platform=iOS Simulator,name=iPhone 15'
```

- [ ] **Step 2: Run tests**

```bash
xcodebuild test -scheme VizoguardVPN -destination 'platform=iOS Simulator,name=iPhone 15'
```

- [ ] **Step 3: Manual test checklist** (same as Android)

- [ ] App opens to Activate screen
- [ ] Enter valid license key → activates
- [ ] Onboarding sheet → auto-connect choice
- [ ] Main screen with VPN toggle
- [ ] Tap connect → VPN permission prompt → tunnel starts
- [ ] Status shows "Protected"
- [ ] Tap disconnect
- [ ] Settings sheet → toggles work
- [ ] Sign out → returns to Activate
- [ ] Deep link `vizoguard-vpn://activate?key=...` works
- [ ] QR scanner opens camera
- [ ] Kill airplane mode → reconnects
- [ ] Force quit + reopen → state preserved
- [ ] Kill switch blocks internet when VPN drops

- [ ] **Step 4: Archive for App Store**

```bash
xcodebuild archive -scheme VizoguardVPN -archivePath build/VizoguardVPN.xcarchive
xcodebuild -exportArchive -archivePath build/VizoguardVPN.xcarchive -exportPath build/export -exportOptionsPlist ExportOptions.plist
```

- [ ] **Step 5: Submit to App Store Connect**

Upload via Xcode Organizer or `xcrun altool`.

---

## Task Summary

| Task | Component | Files | Notes |
|------|-----------|-------|-------|
| 1 | Xcode project setup | ~8 | Must be done on Mac with Xcode |
| 2 | Keychain Store + Device ID | 3 | Persists across reinstall (unlike Android) |
| 3 | API Client | 2 | URLSession (no third-party deps) |
| 4 | License Manager | 2 | Same logic as Android, Swift syntax |
| 5 | VPN Manager | 3 | NEVPNManager + NEOnDemandRule (very different from Android) |
| 6 | AppState + ContentView | 3 | ObservableObject + BGTaskScheduler |
| 7 | UI Screens | 4 | SwiftUI equivalents of Android Compose screens |
| 8 | Integration + Build | 0 | Xcode build, test, archive, submit |
| **Total** | | **~25 files** | **Requires Mac with Xcode 15+** |

---

## Key Differences from Android

| Aspect | Android | iOS |
|--------|---------|-----|
| VPN service | `VpnService` (in-process) | `NEPacketTunnelProvider` (separate process) |
| VPN config | Intent extras to service | `NETunnelProviderProtocol.providerConfiguration` dict |
| Kill switch | `DISALLOW_NON_VPN` builder flag | `includeAllNetworks` on protocol config |
| Auto-connect | `BootReceiver` + manual service start | `NEOnDemandRule` (OS-managed, automatic) |
| Background task | WorkManager (24h periodic) | BGTaskScheduler (best-effort, not guaranteed) |
| Secure storage | EncryptedSharedPreferences (lost on uninstall) | Keychain (persists across reinstall) |
| QR scanning | ZXing (GMS-free) | AVCaptureSession or CodeScanner SPM |
| HTTP client | Ktor (third-party) | URLSession (built-in, zero deps) |
| State comms | `MutableStateFlow` singleton | `NotificationCenter` + `@Published` |
| Notification | Foreground service required | Not needed (NE runs independently) |
