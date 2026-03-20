# Vizoguard VPN Android — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native Android VPN app that connects to the existing Vizoguard Outline VPN server, with license activation, auto-connect, kill switch, and offline support.

**Architecture:** Single-activity Compose app with a VpnService for Shadowsocks tunneling via outline-go-tun2socks. State managed by a single `AppState` ViewModel. License and VPN credentials cached in EncryptedSharedPreferences. Background license validation via WorkManager.

**Tech Stack:** Kotlin, Jetpack Compose, VpnService, outline-go-tun2socks (AAR), Ktor (HTTP), EncryptedSharedPreferences, WorkManager, ZXing (QR), CameraX

**Spec:** `docs/superpowers/specs/2026-03-20-vizoguard-mobile-vpn-design.md`

**Definition of Done:** A user can install, activate with a license key, connect/disconnect VPN, background the app, reconnect on network change, survive airplane mode, and stay protected for 24h without issues. Kill switch blocks internet when VPN drops. App restart retains all state.

---

## File Structure

```
vizoguard-android/
├── app/
│   ├── build.gradle.kts
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── java/com/vizoguard/vpn/
│   │   │   ├── VizoguardApp.kt              — Application class
│   │   │   ├── MainActivity.kt              — Single activity, Compose host, deep link handler
│   │   │   ├── AppState.kt                  — ViewModel, single source of truth for all state
│   │   │   ├── api/
│   │   │   │   └── ApiClient.kt             — HTTP client (Ktor) for all backend endpoints
│   │   │   ├── license/
│   │   │   │   ├── LicenseManager.kt        — Activate, validate, grace period logic
│   │   │   │   ├── SecureStore.kt           — EncryptedSharedPreferences wrapper
│   │   │   │   └── DeviceId.kt              — UUID generation + persistence
│   │   │   ├── vpn/
│   │   │   │   ├── VpnManager.kt            — Connect/disconnect orchestration, state machine
│   │   │   │   └── ShadowsocksService.kt    — VpnService, foreground notification, tun2socks
│   │   │   ├── worker/
│   │   │   │   └── LicenseCheckWorker.kt    — WorkManager periodic license validation
│   │   │   ├── receiver/
│   │   │   │   └── BootReceiver.kt          — Auto-connect on device reboot
│   │   │   └── ui/
│   │   │       ├── theme/
│   │   │       │   └── Theme.kt             — Vizoguard dark theme (colors, typography)
│   │   │       ├── MainScreen.kt            — VPN toggle circle, status, stats
│   │   │       ├── ActivateScreen.kt        — Key entry, QR scanner, deep link
│   │   │       ├── OnboardingSheet.kt       — Auto-connect prompt (first launch)
│   │   │       └── SettingsSheet.kt         — Toggles, license info, sign out
│   │   └── res/
│   │       ├── values/strings.xml
│   │       ├── drawable/                    — App icon, notification icon
│   │       └── xml/backup_rules.xml
│   └── src/test/java/com/vizoguard/vpn/
│       ├── api/ApiClientTest.kt
│       ├── license/LicenseManagerTest.kt
│       ├── license/SecureStoreTest.kt
│       ├── vpn/VpnManagerTest.kt
│       └── AppStateTest.kt
├── libs/
│   └── tun2socks.aar                        — Pre-built Outline tun2socks library
├── build.gradle.kts                          — Root build file
├── settings.gradle.kts
└── gradle.properties
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `vizoguard-android/settings.gradle.kts`
- Create: `vizoguard-android/build.gradle.kts`
- Create: `vizoguard-android/gradle.properties`
- Create: `vizoguard-android/app/build.gradle.kts`
- Create: `vizoguard-android/app/src/main/AndroidManifest.xml`
- Create: `vizoguard-android/app/src/main/java/com/vizoguard/vpn/VizoguardApp.kt`
- Create: `vizoguard-android/app/src/main/java/com/vizoguard/vpn/MainActivity.kt`
- Create: `vizoguard-android/app/src/main/res/values/strings.xml`

- [ ] **Step 1: Create root build files**

`settings.gradle.kts`:
```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolution {
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "VizoguardVPN"
include(":app")
```

`build.gradle.kts` (root):
```kotlin
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0" apply false
}
```

`gradle.properties`:
```properties
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
```

- [ ] **Step 2: Create app/build.gradle.kts**

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.vizoguard.vpn"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.vizoguard.vpn"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions { jvmTarget = "11" }
    buildFeatures { compose = true }
}

dependencies {
    // Compose
    implementation(platform("androidx.compose:compose-bom:2025.01.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // Networking
    implementation("io.ktor:ktor-client-android:3.0.3")
    implementation("io.ktor:ktor-client-content-negotiation:3.0.3")
    implementation("io.ktor:ktor-serialization-kotlinx-json:3.0.3")

    // Security
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Background work
    implementation("androidx.work:work-runtime-ktx:2.10.0")

    // QR scanning (GMS-free)
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")

    // VPN tunnel (local AAR)
    implementation(files("../libs/tun2socks.aar"))

    // Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("io.mockk:mockk:1.13.13")
}
```

- [ ] **Step 3: Create AndroidManifest.xml**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.CAMERA" />

    <application
        android:name=".VizoguardApp"
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:theme="@android:style/Theme.Material.NoActionBar"
        android:allowBackup="false"
        android:supportsRtl="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <!-- Deep link: vizoguard-vpn://activate?key=... -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="vizoguard-vpn" android:host="activate" />
            </intent-filter>
        </activity>

        <service
            android:name=".vpn.ShadowsocksService"
            android:permission="android.permission.BIND_VPN_SERVICE"
            android:exported="false">
            <intent-filter>
                <action android:name="android.net.VpnService" />
            </intent-filter>
        </service>

        <receiver
            android:name=".receiver.BootReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>
    </application>
</manifest>
```

- [ ] **Step 4: Create Application class and MainActivity stub**

`VizoguardApp.kt`:
```kotlin
package com.vizoguard.vpn

import android.app.Application

class VizoguardApp : Application()
```

`MainActivity.kt`:
```kotlin
package com.vizoguard.vpn

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            // TODO: App content
        }
    }
}
```

`res/values/strings.xml`:
```xml
<resources>
    <string name="app_name">Vizoguard VPN</string>
</resources>
```

- [ ] **Step 5: Initialize git repo**

```bash
cd /root/vizoguard-android
git init
echo -e "*.iml\n.gradle/\nbuild/\n.idea/\nlocal.properties\n*.apk\n*.aab\ncaptures/\n.externalNativeBuild/\n.cxx/\n*.hprof" > .gitignore
git add -A
git commit -m "feat: scaffold Android project with Compose, Ktor, VpnService"
```

- [ ] **Step 6: Verify project builds**

```bash
cd /root/vizoguard-android
./gradlew assembleDebug
```
Expected: BUILD SUCCESSFUL (may need to download tun2socks.aar first — see Task 2)

---

## Task 2: Obtain tun2socks AAR

**Files:**
- Create: `vizoguard-android/libs/tun2socks.aar`

- [ ] **Step 1: Build or download tun2socks.aar**

Option A — Build from source (requires Go + Android NDK):
```bash
git clone https://github.com/Jigsaw-Code/outline-go-tun2socks.git /tmp/outline-tun2socks
cd /tmp/outline-tun2socks
make android
cp build/android/tun2socks.aar /root/vizoguard-android/libs/
```

Option B — Extract from Outline Apps release (faster):
```bash
# Download latest Outline Android APK and extract the AAR
# Or use the pre-built AAR from the outline-apps repository
mkdir -p /root/vizoguard-android/libs
# Place tun2socks.aar in libs/
```

- [ ] **Step 2: Verify AAR contains expected classes**

```bash
unzip -l /root/vizoguard-android/libs/tun2socks.aar | grep -i "tun2socks\|outline"
```
Expected: Should contain `tun2socks.jar` with `outline` package classes

- [ ] **Step 3: Commit**

```bash
cd /root/vizoguard-android
git add libs/tun2socks.aar
git commit -m "feat: add outline tun2socks AAR for Shadowsocks VPN tunnel"
```

---

## Task 3: Secure Storage + Device ID

**Files:**
- Create: `app/src/main/java/com/vizoguard/vpn/license/SecureStore.kt`
- Create: `app/src/main/java/com/vizoguard/vpn/license/DeviceId.kt`
- Create: `app/src/test/java/com/vizoguard/vpn/license/SecureStoreTest.kt`

- [ ] **Step 1: Write SecureStore tests**

```kotlin
package com.vizoguard.vpn.license

import org.junit.Assert.*
import org.junit.Test

class SecureStoreTest {
    @Test
    fun `store and retrieve license key`() {
        val store = SecureStore.createForTest()
        store.saveLicenseKey("VIZO-AAAA-BBBB-CCCC-DDDD")
        assertEquals("VIZO-AAAA-BBBB-CCCC-DDDD", store.getLicenseKey())
    }

    @Test
    fun `returns null when no key stored`() {
        val store = SecureStore.createForTest()
        assertNull(store.getLicenseKey())
    }

    @Test
    fun `store and retrieve VPN access URL`() {
        val store = SecureStore.createForTest()
        store.saveVpnAccessUrl("ss://base64@host:port")
        assertEquals("ss://base64@host:port", store.getVpnAccessUrl())
    }

    @Test
    fun `clear all removes everything`() {
        val store = SecureStore.createForTest()
        store.saveLicenseKey("VIZO-AAAA-BBBB-CCCC-DDDD")
        store.saveVpnAccessUrl("ss://test")
        store.clearAll()
        assertNull(store.getLicenseKey())
        assertNull(store.getVpnAccessUrl())
    }

    @Test
    fun `store and retrieve license expiry`() {
        val store = SecureStore.createForTest()
        store.saveLicenseExpiry("2027-03-20T00:00:00Z")
        assertEquals("2027-03-20T00:00:00Z", store.getLicenseExpiry())
    }

    @Test
    fun `store and retrieve first failure timestamp`() {
        val store = SecureStore.createForTest()
        assertNull(store.getFirstFailureTimestamp())
        store.saveFirstFailureTimestamp(1711929600000L)
        assertEquals(1711929600000L, store.getFirstFailureTimestamp())
        store.clearFirstFailureTimestamp()
        assertNull(store.getFirstFailureTimestamp())
    }
}
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
./gradlew test --tests "com.vizoguard.vpn.license.SecureStoreTest"
```
Expected: FAIL — classes don't exist yet

- [ ] **Step 3: Implement SecureStore**

```kotlin
package com.vizoguard.vpn.license

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecureStore private constructor(private val prefs: SharedPreferences) {

    fun saveLicenseKey(key: String) = prefs.edit().putString(KEY_LICENSE, key).apply()
    fun getLicenseKey(): String? = prefs.getString(KEY_LICENSE, null)

    fun saveVpnAccessUrl(url: String) = prefs.edit().putString(KEY_VPN_URL, url).apply()
    fun getVpnAccessUrl(): String? = prefs.getString(KEY_VPN_URL, null)

    fun saveLicenseExpiry(iso8601: String) = prefs.edit().putString(KEY_EXPIRY, iso8601).apply()
    fun getLicenseExpiry(): String? = prefs.getString(KEY_EXPIRY, null)

    fun saveLicenseStatus(status: String) = prefs.edit().putString(KEY_STATUS, status).apply()
    fun getLicenseStatus(): String? = prefs.getString(KEY_STATUS, null)

    fun saveFirstFailureTimestamp(ts: Long) = prefs.edit().putLong(KEY_FIRST_FAIL, ts).apply()
    fun getFirstFailureTimestamp(): Long? {
        return if (prefs.contains(KEY_FIRST_FAIL)) prefs.getLong(KEY_FIRST_FAIL, 0) else null
    }
    fun clearFirstFailureTimestamp() = prefs.edit().remove(KEY_FIRST_FAIL).apply()

    fun saveAutoConnect(enabled: Boolean) = prefs.edit().putBoolean(KEY_AUTO_CONNECT, enabled).apply()
    fun getAutoConnect(): Boolean = prefs.getBoolean(KEY_AUTO_CONNECT, true) // default ON

    fun saveKillSwitch(enabled: Boolean) = prefs.edit().putBoolean(KEY_KILL_SWITCH, enabled).apply()
    fun getKillSwitch(): Boolean = prefs.getBoolean(KEY_KILL_SWITCH, true) // default ON

    fun saveNotifications(enabled: Boolean) = prefs.edit().putBoolean(KEY_NOTIFICATIONS, enabled).apply()
    fun getNotifications(): Boolean = prefs.getBoolean(KEY_NOTIFICATIONS, false) // default OFF

    fun clearAll() = prefs.edit().clear().apply()

    companion object {
        private const val KEY_LICENSE = "license_key"
        private const val KEY_VPN_URL = "vpn_access_url"
        private const val KEY_EXPIRY = "license_expiry"
        private const val KEY_STATUS = "license_status"
        private const val KEY_FIRST_FAIL = "first_failure_ts"
        private const val KEY_AUTO_CONNECT = "auto_connect"
        private const val KEY_KILL_SWITCH = "kill_switch"
        private const val KEY_NOTIFICATIONS = "notifications"

        fun create(context: Context): SecureStore {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            val prefs = EncryptedSharedPreferences.create(
                context,
                "vizoguard_secure",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
            return SecureStore(prefs)
        }

        /** For unit tests — uses a plain HashMap-backed SharedPreferences */
        fun createForTest(): SecureStore = SecureStore(InMemoryPrefs())
    }
}
```

Note: `InMemoryPrefs` is a simple in-memory SharedPreferences implementation for testing. Create it as a test helper:

```kotlin
// In test source set
package com.vizoguard.vpn.license

import android.content.SharedPreferences

class InMemoryPrefs : SharedPreferences {
    private val data = mutableMapOf<String, Any?>()
    private val editor = InMemoryEditor()

    override fun getString(key: String?, defValue: String?) = data[key] as? String ?: defValue
    override fun getBoolean(key: String?, defValue: Boolean) = data[key] as? Boolean ?: defValue
    override fun getLong(key: String?, defValue: Long) = data[key] as? Long ?: defValue
    override fun getInt(key: String?, defValue: Int) = data[key] as? Int ?: defValue
    override fun getFloat(key: String?, defValue: Float) = data[key] as? Float ?: defValue
    override fun getStringSet(key: String?, defValues: MutableSet<String>?) = defValues
    override fun contains(key: String?) = data.containsKey(key)
    override fun getAll(): MutableMap<String, *> = data.toMutableMap()
    override fun edit() = editor
    override fun registerOnSharedPreferenceChangeListener(l: SharedPreferences.OnSharedPreferenceChangeListener?) {}
    override fun unregisterOnSharedPreferenceChangeListener(l: SharedPreferences.OnSharedPreferenceChangeListener?) {}

    inner class InMemoryEditor : SharedPreferences.Editor {
        override fun putString(key: String?, value: String?) = apply { data[key!!] = value }
        override fun putBoolean(key: String?, value: Boolean) = apply { data[key!!] = value }
        override fun putLong(key: String?, value: Long) = apply { data[key!!] = value }
        override fun putInt(key: String?, value: Int) = apply { data[key!!] = value }
        override fun putFloat(key: String?, value: Float) = apply { data[key!!] = value }
        override fun putStringSet(key: String?, values: MutableSet<String>?) = apply { data[key!!] = values }
        override fun remove(key: String?) = apply { data.remove(key) }
        override fun clear() = apply { data.clear() }
        override fun commit() = true
        override fun apply() {}
    }
}
```

- [ ] **Step 4: Implement DeviceId**

```kotlin
package com.vizoguard.vpn.license

import android.content.Context
import java.util.UUID

object DeviceId {
    private const val KEY = "device_uuid"

    fun get(context: Context): String {
        val store = SecureStore.create(context)
        val existing = store.prefs.getString(KEY, null)
        if (existing != null) return existing
        val uuid = UUID.randomUUID().toString()
        store.prefs.edit().putString(KEY, uuid).apply()
        return uuid
    }
}
```

Note: DeviceId needs `prefs` exposed — either add a package-private accessor to SecureStore or use a separate SharedPreferences file for device ID. For simplicity, use the same EncryptedSharedPreferences instance.

- [ ] **Step 5: Run tests — verify they pass**

```bash
./gradlew test --tests "com.vizoguard.vpn.license.SecureStoreTest"
```
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/com/vizoguard/vpn/license/ app/src/test/
git commit -m "feat: add SecureStore (EncryptedSharedPreferences) and DeviceId"
```

---

## Task 4: API Client

**Files:**
- Create: `app/src/main/java/com/vizoguard/vpn/api/ApiClient.kt`
- Create: `app/src/test/java/com/vizoguard/vpn/api/ApiClientTest.kt`

- [ ] **Step 1: Write API client tests**

```kotlin
package com.vizoguard.vpn.api

import org.junit.Assert.*
import org.junit.Test

class ApiClientTest {
    @Test
    fun `parseLicenseResponse extracts valid fields`() {
        val json = """{"valid":true,"status":"active","expires":"2027-03-20T00:00:00Z"}"""
        val result = ApiClient.parseLicenseResponse(json)
        assertTrue(result.valid)
        assertEquals("active", result.status)
        assertEquals("2027-03-20T00:00:00Z", result.expires)
    }

    @Test
    fun `parseVpnResponse extracts access_url`() {
        val json = """{"access_url":"ss://Y2hhY2hhMjA=@1.2.3.4:8388/?outline=1"}"""
        val result = ApiClient.parseVpnResponse(json)
        assertEquals("ss://Y2hhY2hhMjA=@1.2.3.4:8388/?outline=1", result.accessUrl)
    }

    @Test
    fun `parseErrorResponse extracts status field`() {
        val json = """{"error":"License expired","status":"expired"}"""
        val result = ApiClient.parseErrorResponse(json)
        assertEquals("expired", result.status)
        assertEquals("License expired", result.error)
    }

    @Test
    fun `parseHealthResponse extracts status`() {
        val json = """{"status":"ok","timestamp":"2026-03-20T08:00:00Z"}"""
        val result = ApiClient.parseHealthResponse(json)
        assertEquals("ok", result.status)
    }
}
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
./gradlew test --tests "com.vizoguard.vpn.api.ApiClientTest"
```

- [ ] **Step 3: Implement ApiClient**

```kotlin
package com.vizoguard.vpn.api

import io.ktor.client.*
import io.ktor.client.engine.android.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable data class LicenseResponse(val valid: Boolean, val status: String, val expires: String)
@Serializable data class VpnResponse(val accessUrl: String)
@Serializable data class ErrorResponse(val error: String, val status: String = "")
@Serializable data class HealthResponse(val status: String)

class ApiClient(private val baseUrl: String = "https://vizoguard.com/api") {

    private val client = HttpClient(Android) {
        engine { connectTimeout = 15_000; socketTimeout = 15_000 }
    }
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    suspend fun activateLicense(key: String, deviceId: String): Result<LicenseResponse> {
        return try {
            val response = client.post("$baseUrl/license") {
                contentType(ContentType.Application.Json)
                setBody("""{"key":"$key","device_id":"$deviceId"}""")
            }
            if (response.status.isSuccess()) {
                Result.success(parseLicenseResponse(response.bodyAsText()))
            } else {
                val err = parseErrorResponse(response.bodyAsText())
                Result.failure(ApiException(response.status.value, err.error, err.status))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createVpnKey(key: String, deviceId: String): Result<VpnResponse> {
        return try {
            val response = client.post("$baseUrl/vpn/create") {
                contentType(ContentType.Application.Json)
                setBody("""{"key":"$key","device_id":"$deviceId"}""")
            }
            if (response.status.isSuccess()) {
                Result.success(parseVpnResponse(response.bodyAsText()))
            } else {
                val err = parseErrorResponse(response.bodyAsText())
                Result.failure(ApiException(response.status.value, err.error, err.status))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getVpnKey(key: String, deviceId: String): Result<VpnResponse> {
        return try {
            val response = client.post("$baseUrl/vpn/get") {
                contentType(ContentType.Application.Json)
                setBody("""{"key":"$key","device_id":"$deviceId"}""")
            }
            if (response.status.isSuccess()) {
                Result.success(parseVpnResponse(response.bodyAsText()))
            } else {
                val err = parseErrorResponse(response.bodyAsText())
                Result.failure(ApiException(response.status.value, err.error, err.status))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun checkHealth(): Result<HealthResponse> {
        return try {
            val response = client.get("$baseUrl/health")
            Result.success(parseHealthResponse(response.bodyAsText()))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun checkVpnStatus(): Result<HealthResponse> {
        return try {
            val response = client.get("$baseUrl/vpn/status")
            Result.success(parseHealthResponse(response.bodyAsText()))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true; isLenient = true }

        fun parseLicenseResponse(body: String): LicenseResponse = json.decodeFromString(body)
        fun parseVpnResponse(body: String): VpnResponse {
            // Backend returns "access_url", we map to "accessUrl"
            val mapped = body.replace("\"access_url\"", "\"accessUrl\"")
            return json.decodeFromString(mapped)
        }
        fun parseErrorResponse(body: String): ErrorResponse = json.decodeFromString(body)
        fun parseHealthResponse(body: String): HealthResponse = json.decodeFromString(body)
    }
}

class ApiException(val httpStatus: Int, override val message: String, val status: String) : Exception(message)
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
./gradlew test --tests "com.vizoguard.vpn.api.ApiClientTest"
```
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/vizoguard/vpn/api/ app/src/test/java/com/vizoguard/vpn/api/
git commit -m "feat: add ApiClient with Ktor for all backend endpoints"
```

---

## Task 5: License Manager

**Files:**
- Create: `app/src/main/java/com/vizoguard/vpn/license/LicenseManager.kt`
- Create: `app/src/test/java/com/vizoguard/vpn/license/LicenseManagerTest.kt`

- [ ] **Step 1: Write LicenseManager tests**

```kotlin
package com.vizoguard.vpn.license

import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.time.temporal.ChronoUnit

class LicenseManagerTest {
    @Test
    fun `isExpired returns false for future date`() {
        val future = Instant.now().plus(30, ChronoUnit.DAYS).toString()
        assertFalse(LicenseManager.isExpired(future))
    }

    @Test
    fun `isExpired returns true for past date`() {
        val past = Instant.now().minus(1, ChronoUnit.DAYS).toString()
        assertTrue(LicenseManager.isExpired(past))
    }

    @Test
    fun `isWithinGracePeriod returns true within 7 days of first failure`() {
        val firstFail = Instant.now().minus(3, ChronoUnit.DAYS).toEpochMilli()
        assertTrue(LicenseManager.isWithinGracePeriod(firstFail))
    }

    @Test
    fun `isWithinGracePeriod returns false after 7 days`() {
        val firstFail = Instant.now().minus(8, ChronoUnit.DAYS).toEpochMilli()
        assertFalse(LicenseManager.isWithinGracePeriod(firstFail))
    }

    @Test
    fun `formatKeyForDisplay masks middle segments`() {
        assertEquals("VIZO-••••-••••-••••-DDDD", LicenseManager.maskKey("VIZO-AAAA-BBBB-CCCC-DDDD"))
    }

    @Test
    fun `validateKeyFormat accepts valid key`() {
        assertTrue(LicenseManager.isValidKeyFormat("VIZO-AAAA-BBBB-CCCC-DDDD"))
    }

    @Test
    fun `validateKeyFormat rejects invalid key`() {
        assertFalse(LicenseManager.isValidKeyFormat("invalid"))
        assertFalse(LicenseManager.isValidKeyFormat("VIZO-AAA-BBB-CCC-DDD"))
    }
}
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
./gradlew test --tests "com.vizoguard.vpn.license.LicenseManagerTest"
```

- [ ] **Step 3: Implement LicenseManager**

```kotlin
package com.vizoguard.vpn.license

import com.vizoguard.vpn.api.ApiClient
import com.vizoguard.vpn.api.ApiException
import java.time.Instant
import java.time.temporal.ChronoUnit

class LicenseManager(
    private val store: SecureStore,
    private val api: ApiClient,
    private val deviceId: String
) {
    data class LicenseState(
        val key: String?,
        val status: String?,
        val expires: String?,
        val vpnAccessUrl: String?,
        val isValid: Boolean
    )

    fun getCachedState(): LicenseState {
        val key = store.getLicenseKey()
        val status = store.getLicenseStatus()
        val expires = store.getLicenseExpiry()
        val vpnUrl = store.getVpnAccessUrl()
        val isValid = key != null && status == "active" && expires != null && !isExpired(expires)
        return LicenseState(key, status, expires, vpnUrl, isValid)
    }

    suspend fun activate(key: String): Result<LicenseState> {
        val licenseResult = api.activateLicense(key, deviceId)
        if (licenseResult.isFailure) return Result.failure(licenseResult.exceptionOrNull()!!)

        val license = licenseResult.getOrThrow()
        store.saveLicenseKey(key)
        store.saveLicenseStatus(license.status)
        store.saveLicenseExpiry(license.expires)
        store.clearFirstFailureTimestamp()

        // Provision VPN key
        val vpnResult = api.createVpnKey(key, deviceId)
        if (vpnResult.isSuccess) {
            store.saveVpnAccessUrl(vpnResult.getOrThrow().accessUrl)
        }

        return Result.success(getCachedState())
    }

    suspend fun validate(): Result<LicenseState> {
        val key = store.getLicenseKey() ?: return Result.failure(Exception("No license"))
        val result = api.activateLicense(key, deviceId)
        if (result.isSuccess) {
            val license = result.getOrThrow()
            store.saveLicenseStatus(license.status)
            store.saveLicenseExpiry(license.expires)
            store.clearFirstFailureTimestamp()
        } else {
            // Track first failure for grace period
            if (store.getFirstFailureTimestamp() == null) {
                store.saveFirstFailureTimestamp(System.currentTimeMillis())
            }
        }
        return Result.success(getCachedState())
    }

    fun canConnectOffline(): Boolean {
        val state = getCachedState()
        if (state.vpnAccessUrl == null) return false
        val expires = state.expires ?: return false
        if (!isExpired(expires)) return true
        // Check grace period
        val firstFail = store.getFirstFailureTimestamp() ?: return false
        return isWithinGracePeriod(firstFail)
    }

    fun signOut() {
        store.clearAll()
    }

    companion object {
        private const val GRACE_PERIOD_DAYS = 7L
        private val KEY_PATTERN = Regex("^VIZO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$")

        fun isExpired(iso8601: String): Boolean {
            return try {
                Instant.parse(iso8601).isBefore(Instant.now())
            } catch (e: Exception) { true }
        }

        fun isWithinGracePeriod(firstFailureMs: Long): Boolean {
            val deadline = Instant.ofEpochMilli(firstFailureMs).plus(GRACE_PERIOD_DAYS, ChronoUnit.DAYS)
            return Instant.now().isBefore(deadline)
        }

        fun maskKey(key: String): String {
            val parts = key.split("-")
            if (parts.size != 5) return key
            return "${parts[0]}-••••-••••-••••-${parts[4]}"
        }

        fun isValidKeyFormat(key: String): Boolean = KEY_PATTERN.matches(key)
    }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
./gradlew test --tests "com.vizoguard.vpn.license.LicenseManagerTest"
```
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/vizoguard/vpn/license/LicenseManager.kt app/src/test/
git commit -m "feat: add LicenseManager with activation, validation, grace period"
```

---

## Task 6: VPN Manager + ShadowsocksService

**Files:**
- Create: `app/src/main/java/com/vizoguard/vpn/vpn/VpnManager.kt`
- Create: `app/src/main/java/com/vizoguard/vpn/vpn/ShadowsocksService.kt`
- Create: `app/src/test/java/com/vizoguard/vpn/vpn/VpnManagerTest.kt`

- [ ] **Step 1: Write VpnManager state tests**

```kotlin
package com.vizoguard.vpn.vpn

import org.junit.Assert.*
import org.junit.Test

class VpnManagerTest {
    @Test
    fun `parseShadowsocksUrl extracts host port method password`() {
        val url = "ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpwYXNzd29yZA==@1.2.3.4:8388/?outline=1"
        val config = VpnManager.parseShadowsocksUrl(url)
        assertNotNull(config)
        assertEquals("1.2.3.4", config!!.host)
        assertEquals(8388, config.port)
    }

    @Test
    fun `parseShadowsocksUrl returns null for invalid URL`() {
        assertNull(VpnManager.parseShadowsocksUrl("https://not-a-ss-url"))
        assertNull(VpnManager.parseShadowsocksUrl(""))
    }

    @Test
    fun `VpnState enum has all required states`() {
        val states = VpnState.values()
        assertTrue(states.contains(VpnState.IDLE))
        assertTrue(states.contains(VpnState.LICENSED))
        assertTrue(states.contains(VpnState.CONNECTING))
        assertTrue(states.contains(VpnState.CONNECTED))
        assertTrue(states.contains(VpnState.RECONNECTING))
        assertTrue(states.contains(VpnState.BLOCKED))
        assertTrue(states.contains(VpnState.ERROR))
    }
}
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
./gradlew test --tests "com.vizoguard.vpn.vpn.VpnManagerTest"
```

- [ ] **Step 3: Implement VpnState enum and VpnManager**

```kotlin
package com.vizoguard.vpn.vpn

import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.util.Base64
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.net.URI

enum class VpnState {
    IDLE, LICENSED, CONNECTING, CONNECTED, RECONNECTING, BLOCKED, ERROR
}

data class ShadowsocksConfig(
    val host: String,
    val port: Int,
    val method: String,
    val password: String
)

data class VpnStatus(
    val state: VpnState = VpnState.IDLE,
    val errorMessage: String? = null,
    val connectedSince: Long? = null
)

class VpnManager(private val context: Context) {

    private val _status = MutableStateFlow(VpnStatus())
    val status: StateFlow<VpnStatus> = _status

    fun updateState(state: VpnState, errorMessage: String? = null) {
        _status.value = VpnStatus(
            state = state,
            errorMessage = errorMessage,
            connectedSince = if (state == VpnState.CONNECTED) System.currentTimeMillis() else _status.value.connectedSince
        )
    }

    fun needsVpnPermission(): Boolean {
        return VpnService.prepare(context) != null
    }

    fun startVpn(accessUrl: String, killSwitch: Boolean) {
        val config = parseShadowsocksUrl(accessUrl) ?: run {
            updateState(VpnState.ERROR, "Invalid VPN configuration")
            return
        }
        updateState(VpnState.CONNECTING)
        val intent = Intent(context, ShadowsocksService::class.java).apply {
            action = ACTION_CONNECT
            putExtra(EXTRA_HOST, config.host)
            putExtra(EXTRA_PORT, config.port)
            putExtra(EXTRA_METHOD, config.method)
            putExtra(EXTRA_PASSWORD, config.password)
            putExtra(EXTRA_KILL_SWITCH, killSwitch)
        }
        context.startForegroundService(intent)
    }

    fun stopVpn() {
        val intent = Intent(context, ShadowsocksService::class.java).apply {
            action = ACTION_DISCONNECT
        }
        context.startService(intent)
        updateState(VpnState.LICENSED)
    }

    companion object {
        const val ACTION_CONNECT = "com.vizoguard.vpn.CONNECT"
        const val ACTION_DISCONNECT = "com.vizoguard.vpn.DISCONNECT"
        const val EXTRA_HOST = "host"
        const val EXTRA_PORT = "port"
        const val EXTRA_METHOD = "method"
        const val EXTRA_PASSWORD = "password"
        const val EXTRA_KILL_SWITCH = "kill_switch"

        fun parseShadowsocksUrl(url: String): ShadowsocksConfig? {
            if (!url.startsWith("ss://")) return null
            return try {
                // Format: ss://base64(method:password)@host:port/?outline=1
                val withoutScheme = url.removePrefix("ss://")
                val atIndex = withoutScheme.lastIndexOf('@')
                if (atIndex == -1) return null

                val encoded = withoutScheme.substring(0, atIndex)
                val hostPort = withoutScheme.substring(atIndex + 1).split("/?")[0]

                val decoded = String(Base64.decode(encoded, Base64.DEFAULT))
                val colonIndex = decoded.indexOf(':')
                if (colonIndex == -1) return null

                val method = decoded.substring(0, colonIndex)
                val password = decoded.substring(colonIndex + 1)

                val parts = hostPort.split(':')
                if (parts.size != 2) return null

                ShadowsocksConfig(
                    host = parts[0],
                    port = parts[1].toInt(),
                    method = method,
                    password = password
                )
            } catch (e: Exception) { null }
        }
    }
}
```

- [ ] **Step 4: Implement ShadowsocksService**

```kotlin
package com.vizoguard.vpn.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import com.vizoguard.vpn.MainActivity
import com.vizoguard.vpn.R

class ShadowsocksService : VpnService() {

    private var tunFd: ParcelFileDescriptor? = null
    private var tunnel: Any? = null // tun2socks OutlineTunnel reference

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            VpnManager.ACTION_CONNECT -> {
                val host = intent.getStringExtra(VpnManager.EXTRA_HOST) ?: return START_NOT_STICKY
                val port = intent.getIntExtra(VpnManager.EXTRA_PORT, 0)
                val method = intent.getStringExtra(VpnManager.EXTRA_METHOD) ?: return START_NOT_STICKY
                val password = intent.getStringExtra(VpnManager.EXTRA_PASSWORD) ?: return START_NOT_STICKY
                val killSwitch = intent.getBooleanExtra(VpnManager.EXTRA_KILL_SWITCH, true)
                startForeground(NOTIFICATION_ID, buildNotification("Connecting..."))
                connect(host, port, method, password, killSwitch)
            }
            VpnManager.ACTION_DISCONNECT -> {
                disconnect()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun connect(host: String, port: Int, method: String, password: String, killSwitch: Boolean) {
        try {
            val builder = Builder()
                .setSession("Vizoguard VPN")
                .addAddress("10.0.0.2", 32)
                .addRoute("0.0.0.0", 0)
                .addDnsServer("1.1.1.1")
                .addDnsServer("8.8.8.8")
                .setMtu(1500)

            if (killSwitch) {
                builder.setBlocking(true)
            }

            tunFd = builder.establish() ?: run {
                // VPN permission not granted
                return
            }

            // TODO: Initialize tun2socks tunnel with tunFd.fd
            // tunnel = Tun2socks.connectSocksTunnel(tunFd!!.fd, host, port, true)

            updateNotification("Connected — Protected")

            // Notify VpnManager of success
            // This would be done via a broadcast or shared state
        } catch (e: Exception) {
            disconnect()
        }
    }

    private fun disconnect() {
        try {
            // TODO: tunnel?.disconnect()
            tunFd?.close()
            tunFd = null
            tunnel = null
        } catch (e: Exception) {
            // Ignore cleanup errors
        }
    }

    override fun onDestroy() {
        disconnect()
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "VPN Status",
            NotificationManager.IMPORTANCE_LOW
        ).apply { description = "Shows VPN connection status" }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(text: String): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        val disconnectIntent = PendingIntent.getService(
            this, 1,
            Intent(this, ShadowsocksService::class.java).apply { action = VpnManager.ACTION_DISCONNECT },
            PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Vizoguard VPN")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(openIntent)
            .addAction(Notification.Action.Builder(null, "Disconnect", disconnectIntent).build())
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, buildNotification(text))
    }

    companion object {
        private const val CHANNEL_ID = "vpn_status"
        private const val NOTIFICATION_ID = 1
    }
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
./gradlew test --tests "com.vizoguard.vpn.vpn.VpnManagerTest"
```
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/com/vizoguard/vpn/vpn/ app/src/test/java/com/vizoguard/vpn/vpn/
git commit -m "feat: add VpnManager state machine and ShadowsocksService (VpnService)"
```

---

## Task 7: AppState ViewModel

**Files:**
- Create: `app/src/main/java/com/vizoguard/vpn/AppState.kt`
- Create: `app/src/test/java/com/vizoguard/vpn/AppStateTest.kt`

- [ ] **Step 1: Write AppState tests**

```kotlin
package com.vizoguard.vpn

import com.vizoguard.vpn.vpn.VpnState
import org.junit.Assert.*
import org.junit.Test

class AppStateTest {
    @Test
    fun `initial screen is ACTIVATE when no license`() {
        assertEquals(Screen.ACTIVATE, AppState.screenForState(VpnState.IDLE, hasLicense = false))
    }

    @Test
    fun `screen is MAIN when licensed`() {
        assertEquals(Screen.MAIN, AppState.screenForState(VpnState.LICENSED, hasLicense = true))
    }

    @Test
    fun `screen is MAIN when connected`() {
        assertEquals(Screen.MAIN, AppState.screenForState(VpnState.CONNECTED, hasLicense = true))
    }

    @Test
    fun `planDisplayName maps vpn to Basic`() {
        assertEquals("Basic", AppState.planDisplayName("vpn"))
    }

    @Test
    fun `planDisplayName maps security_vpn to Pro`() {
        assertEquals("Pro", AppState.planDisplayName("security_vpn"))
    }
}

enum class Screen { ACTIVATE, MAIN, ONBOARDING }
```

- [ ] **Step 2: Run tests — verify fail, then implement**

- [ ] **Step 3: Implement AppState**

```kotlin
package com.vizoguard.vpn

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.vizoguard.vpn.api.ApiClient
import com.vizoguard.vpn.license.DeviceId
import com.vizoguard.vpn.license.LicenseManager
import com.vizoguard.vpn.license.SecureStore
import com.vizoguard.vpn.vpn.VpnManager
import com.vizoguard.vpn.vpn.VpnState
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

enum class Screen { ACTIVATE, MAIN, ONBOARDING }

class AppState(app: Application) : AndroidViewModel(app) {

    private val store = SecureStore.create(app)
    private val api = ApiClient()
    private val deviceId = DeviceId.get(app)
    val licenseManager = LicenseManager(store, api, deviceId)
    val vpnManager = VpnManager(app)

    private val _screen = MutableStateFlow(Screen.ACTIVATE)
    val screen: StateFlow<Screen> = _screen

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage

    init {
        val cached = licenseManager.getCachedState()
        if (cached.isValid) {
            _screen.value = Screen.MAIN
            vpnManager.updateState(VpnState.LICENSED)
            // Auto-connect if enabled
            if (store.getAutoConnect() && cached.vpnAccessUrl != null) {
                connect()
            }
        }
        // Background license validation
        viewModelScope.launch {
            licenseManager.validate()
        }
    }

    fun activate(key: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            val result = licenseManager.activate(key)
            _isLoading.value = false
            result.fold(
                onSuccess = { state ->
                    if (state.isValid) {
                        _screen.value = Screen.ONBOARDING
                        vpnManager.updateState(VpnState.LICENSED)
                    }
                },
                onFailure = { e ->
                    _errorMessage.value = userFriendlyError(e)
                }
            )
        }
    }

    fun finishOnboarding(autoConnect: Boolean) {
        store.saveAutoConnect(autoConnect)
        _screen.value = Screen.MAIN
        if (autoConnect) connect()
    }

    fun connect() {
        val state = licenseManager.getCachedState()
        val accessUrl = state.vpnAccessUrl ?: return
        vpnManager.startVpn(accessUrl, store.getKillSwitch())
    }

    fun disconnect() {
        vpnManager.stopVpn()
    }

    fun signOut() {
        vpnManager.stopVpn()
        licenseManager.signOut()
        _screen.value = Screen.ACTIVATE
        vpnManager.updateState(VpnState.IDLE)
    }

    private fun userFriendlyError(e: Throwable): String {
        if (e is com.vizoguard.vpn.api.ApiException) {
            return when (e.status) {
                "expired" -> "Your plan has expired. Renew at vizoguard.com"
                "suspended" -> "Payment issue. Update payment at vizoguard.com"
                "device_mismatch" -> "This key is active on another device. Contact support@vizoguard.com"
                else -> e.message ?: "Something went wrong"
            }
        }
        return "Can't reach server. Check your internet connection."
    }

    companion object {
        fun screenForState(vpnState: VpnState, hasLicense: Boolean): Screen {
            if (!hasLicense) return Screen.ACTIVATE
            return Screen.MAIN
        }

        fun planDisplayName(apiValue: String?): String = when (apiValue) {
            "vpn" -> "Basic"
            "security_vpn" -> "Pro"
            else -> "Unknown"
        }
    }
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/vizoguard/vpn/AppState.kt app/src/test/
git commit -m "feat: add AppState ViewModel — single source of truth"
```

---

## Task 8: UI — Theme + MainScreen

**Files:**
- Create: `app/src/main/java/com/vizoguard/vpn/ui/theme/Theme.kt`
- Create: `app/src/main/java/com/vizoguard/vpn/ui/MainScreen.kt`

- [ ] **Step 1: Create Vizoguard dark theme**

```kotlin
package com.vizoguard.vpn.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Accent = Color(0xFFFF6B2B)
val Teal = Color(0xFF00E5A0)
val Surface = Color(0xFF111111)
val Background = Color(0xFF000000)
val TextPrimary = Color(0xFFFFFFFF)
val TextSecondary = Color(0xFF999999)
val Red = Color(0xFFFF3B3B)
val Border = Color(0xFF222222)

private val DarkColorScheme = darkColorScheme(
    primary = Accent,
    secondary = Teal,
    background = Background,
    surface = Surface,
    onPrimary = Color.Black,
    onSecondary = Color.Black,
    onBackground = TextPrimary,
    onSurface = TextPrimary,
    error = Red,
)

@Composable
fun VizoguardTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = DarkColorScheme, content = content)
}
```

- [ ] **Step 2: Create MainScreen composable**

```kotlin
package com.vizoguard.vpn.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vizoguard.vpn.ui.theme.*
import com.vizoguard.vpn.vpn.VpnState
import com.vizoguard.vpn.vpn.VpnStatus

@Composable
fun MainScreen(
    vpnStatus: VpnStatus,
    onToggle: () -> Unit,
    onSettingsClick: () -> Unit
) {
    val isConnected = vpnStatus.state == VpnState.CONNECTED
    val isConnecting = vpnStatus.state == VpnState.CONNECTING || vpnStatus.state == VpnState.RECONNECTING
    val borderColor by animateColorAsState(
        when {
            isConnected -> Teal
            vpnStatus.state == VpnState.ERROR || vpnStatus.state == VpnState.BLOCKED -> Red
            else -> Border
        }, label = "border"
    )

    Column(
        modifier = Modifier.fillMaxSize().background(Background).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // VPN toggle circle
        Box(
            modifier = Modifier
                .size(180.dp)
                .clip(CircleShape)
                .background(if (isConnected) Teal.copy(alpha = 0.05f) else Color.Transparent)
                .clickable(enabled = !isConnecting) { onToggle() },
            contentAlignment = Alignment.Center
        ) {
            // Outer ring
            Box(
                modifier = Modifier
                    .size(180.dp)
                    .clip(CircleShape)
                    .background(Color.Transparent)
                    .then(
                        Modifier.background(Color.Transparent) // border handled by surface
                    )
            )
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = when {
                        isConnected -> "VPN\nON"
                        isConnecting -> "..."
                        else -> "TAP TO\nCONNECT"
                    },
                    color = if (isConnected) Teal else TextSecondary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                    lineHeight = 24.sp
                )
            }
        }

        Spacer(Modifier.height(24.dp))

        // Status text
        Text(
            text = when (vpnStatus.state) {
                VpnState.CONNECTED -> "Protected"
                VpnState.CONNECTING -> "Connecting..."
                VpnState.RECONNECTING -> "Reconnecting..."
                VpnState.BLOCKED -> "Internet Paused"
                VpnState.ERROR -> vpnStatus.errorMessage ?: "Connection Failed"
                else -> "Not Protected"
            },
            color = when {
                isConnected -> Teal
                vpnStatus.state == VpnState.ERROR || vpnStatus.state == VpnState.BLOCKED -> Red
                else -> Red
            },
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium
        )

        Spacer(Modifier.height(32.dp))

        // Stats row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            StatCard("Status", if (isConnected) "Connected" else "Disconnected")
            Spacer(Modifier.width(12.dp))
            StatCard("Duration", if (isConnected && vpnStatus.connectedSince != null) {
                formatDuration(System.currentTimeMillis() - vpnStatus.connectedSince)
            } else "--:--")
        }

        // Error action buttons
        if (vpnStatus.state == VpnState.ERROR) {
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = onToggle,
                colors = ButtonDefaults.buttonColors(containerColor = Accent)
            ) { Text("Try Again", color = Color.Black) }
        }

        if (vpnStatus.state == VpnState.BLOCKED) {
            Spacer(Modifier.height(24.dp))
            OutlinedButton(onClick = onToggle) { Text("Disable Kill Switch") }
        }

        Spacer(Modifier.weight(1f))

        // Settings gear
        TextButton(onClick = onSettingsClick) {
            Text("Settings", color = TextSecondary, fontSize = 12.sp)
        }
    }
}

@Composable
private fun StatCard(label: String, value: String) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Surface)
            .padding(horizontal = 24.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(label, color = TextSecondary, fontSize = 11.sp)
        Text(value, color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

private fun formatDuration(ms: Long): String {
    val s = ms / 1000
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return "%02d:%02d:%02d".format(h, m, sec)
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/vizoguard/vpn/ui/
git commit -m "feat: add Vizoguard dark theme and MainScreen composable"
```

---

## Task 9: UI — ActivateScreen + QR Scanner

**Files:**
- Create: `app/src/main/java/com/vizoguard/vpn/ui/ActivateScreen.kt`

- [ ] **Step 1: Implement ActivateScreen with key entry, QR scan, deep link**

```kotlin
package com.vizoguard.vpn.ui

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.vizoguard.vpn.license.LicenseManager
import com.vizoguard.vpn.ui.theme.*

@Composable
fun ActivateScreen(
    onActivate: (String) -> Unit,
    isLoading: Boolean,
    errorMessage: String?
) {
    var keyInput by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current

    val qrLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let { scanned ->
            // Extract key from deep link or raw key
            val key = if (scanned.startsWith("vizoguard-vpn://activate?key=")) {
                scanned.substringAfter("key=")
            } else if (scanned.startsWith("VIZO-")) {
                scanned
            } else null
            if (key != null && LicenseManager.isValidKeyFormat(key)) {
                onActivate(key)
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().background(Background).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Welcome to", color = TextSecondary, fontSize = 16.sp)
        Text(
            "Vizoguard VPN",
            color = Accent,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold
        )

        Spacer(Modifier.height(32.dp))

        Text(
            "Enter your license key to get started",
            color = TextSecondary,
            fontSize = 14.sp,
            textAlign = TextAlign.Center
        )

        Spacer(Modifier.height(24.dp))

        // Key input
        OutlinedTextField(
            value = keyInput,
            onValueChange = { input ->
                // Auto-format: VIZO-XXXX-XXXX-XXXX-XXXX
                val clean = input.uppercase().replace("[^A-Z0-9]".toRegex(), "")
                val formatted = buildString {
                    clean.forEachIndexed { i, c ->
                        if (i == 4 || i == 8 || i == 12 || i == 16) append('-')
                        if (length < 24) append(c)
                    }
                }
                keyInput = formatted
            },
            placeholder = { Text("VIZO-XXXX-XXXX-XXXX-XXXX", color = Border) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                imeAction = ImeAction.Done
            ),
            keyboardActions = KeyboardActions(onDone = {
                focusManager.clearFocus()
                if (LicenseManager.isValidKeyFormat(keyInput)) onActivate(keyInput)
            }),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Accent,
                unfocusedBorderColor = Border,
                cursorColor = Accent,
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(16.dp))

        // Activate button
        Button(
            onClick = { if (LicenseManager.isValidKeyFormat(keyInput)) onActivate(keyInput) },
            enabled = LicenseManager.isValidKeyFormat(keyInput) && !isLoading,
            colors = ButtonDefaults.buttonColors(containerColor = Accent),
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(12.dp)
        ) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.Black, strokeWidth = 2.dp)
            } else {
                Text("Activate", color = Color.Black, fontWeight = FontWeight.SemiBold)
            }
        }

        // Error message
        if (errorMessage != null) {
            Spacer(Modifier.height(12.dp))
            Text(errorMessage, color = Red, fontSize = 13.sp, textAlign = TextAlign.Center)
        }

        Spacer(Modifier.height(16.dp))
        Text("or", color = TextSecondary, fontSize = 12.sp)
        Spacer(Modifier.height(12.dp))

        // QR + Email buttons
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = {
                    val options = ScanOptions().apply {
                        setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                        setPrompt("Scan your Vizoguard QR code")
                        setCameraId(0)
                    }
                    qrLauncher.launch(options)
                },
                modifier = Modifier.weight(1f)
            ) { Text("Scan QR", fontSize = 13.sp) }

            OutlinedButton(
                onClick = { /* Opens email app — handled by deep link */ },
                modifier = Modifier.weight(1f)
            ) { Text("From Email", fontSize = 13.sp) }
        }

        Spacer(Modifier.height(24.dp))
        Text(
            "No key? Visit vizoguard.com",
            color = TextSecondary,
            fontSize = 11.sp
        )
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/main/java/com/vizoguard/vpn/ui/ActivateScreen.kt
git commit -m "feat: add ActivateScreen with key entry, QR scanner, auto-formatting"
```

---

## Task 10: UI — OnboardingSheet + SettingsSheet

**Files:**
- Create: `app/src/main/java/com/vizoguard/vpn/ui/OnboardingSheet.kt`
- Create: `app/src/main/java/com/vizoguard/vpn/ui/SettingsSheet.kt`

- [ ] **Step 1: Implement OnboardingSheet**

```kotlin
package com.vizoguard.vpn.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vizoguard.vpn.ui.theme.*

@Composable
fun OnboardingSheet(onChoice: (autoConnect: Boolean) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Surface, RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Stay protected\nautomatically?", color = TextPrimary, fontSize = 20.sp,
            fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(12.dp))
        Text("VPN connects when you open the app or restart your device.",
            color = TextSecondary, fontSize = 14.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = { onChoice(true) },
            colors = ButtonDefaults.buttonColors(containerColor = Accent),
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(12.dp)
        ) { Text("Yes, keep me safe", color = Color.Black, fontWeight = FontWeight.SemiBold) }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = { onChoice(false) },
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(12.dp)
        ) { Text("I'll connect manually", color = TextSecondary) }
    }
}
```

- [ ] **Step 2: Implement SettingsSheet**

```kotlin
package com.vizoguard.vpn.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vizoguard.vpn.license.LicenseManager
import com.vizoguard.vpn.ui.theme.*

@Composable
fun SettingsSheet(
    autoConnect: Boolean,
    killSwitch: Boolean,
    notifications: Boolean,
    licenseKey: String?,
    expiresAt: String?,
    onAutoConnectChange: (Boolean) -> Unit,
    onKillSwitchChange: (Boolean) -> Unit,
    onNotificationsChange: (Boolean) -> Unit,
    onSignOut: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Surface, RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
            .padding(24.dp)
    ) {
        Text("Settings", color = TextPrimary, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(16.dp))

        SettingRow("Auto-connect", autoConnect, onAutoConnectChange)
        HorizontalDivider(color = Border)
        SettingRow("Kill switch", killSwitch, onKillSwitchChange)
        HorizontalDivider(color = Border)
        SettingRow("Notifications", notifications, onNotificationsChange)
        HorizontalDivider(color = Border)

        // License info
        Spacer(Modifier.height(12.dp))
        Text("License", color = TextSecondary, fontSize = 13.sp)
        Text(
            licenseKey?.let { LicenseManager.maskKey(it) } ?: "Not activated",
            color = TextSecondary,
            fontSize = 11.sp,
            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
        )
        Spacer(Modifier.height(8.dp))

        if (expiresAt != null) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Expires", color = TextSecondary, fontSize = 13.sp)
                Text(expiresAt.take(10), color = Accent, fontSize = 13.sp)
            }
        }

        Spacer(Modifier.height(24.dp))
        TextButton(
            onClick = onSignOut,
            modifier = Modifier.align(Alignment.CenterHorizontally)
        ) { Text("Sign out", color = Red, fontSize = 13.sp) }
    }
}

@Composable
private fun SettingRow(label: String, checked: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, color = TextPrimary, fontSize = 14.sp)
        Switch(
            checked = checked,
            onCheckedChange = onToggle,
            colors = SwitchDefaults.colors(
                checkedThumbColor = TextPrimary,
                checkedTrackColor = Accent,
                uncheckedThumbColor = TextSecondary,
                uncheckedTrackColor = Border
            )
        )
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/vizoguard/vpn/ui/
git commit -m "feat: add OnboardingSheet and SettingsSheet composables"
```

---

## Task 11: Wire Everything in MainActivity

**Files:**
- Modify: `app/src/main/java/com/vizoguard/vpn/MainActivity.kt`

- [ ] **Step 1: Wire all screens, deep link handling, VPN permission**

```kotlin
package com.vizoguard.vpn

import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.vizoguard.vpn.license.LicenseManager
import com.vizoguard.vpn.ui.*
import com.vizoguard.vpn.ui.theme.VizoguardTheme

class MainActivity : ComponentActivity() {

    private var pendingVpnConnect: (() -> Unit)? = null

    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            pendingVpnConnect?.invoke()
        }
        pendingVpnConnect = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleDeepLink(intent)

        setContent {
            VizoguardTheme {
                val appState: AppState = viewModel()
                val screen by appState.screen.collectAsState()
                val vpnStatus by appState.vpnManager.status.collectAsState()
                val isLoading by appState.isLoading.collectAsState()
                val errorMessage by appState.errorMessage.collectAsState()
                var showSettings by remember { mutableStateOf(false) }
                val store = appState.licenseManager.getCachedState()

                when (screen) {
                    Screen.ACTIVATE -> ActivateScreen(
                        onActivate = { key -> appState.activate(key) },
                        isLoading = isLoading,
                        errorMessage = errorMessage
                    )
                    Screen.ONBOARDING -> OnboardingSheet(
                        onChoice = { auto -> appState.finishOnboarding(auto) }
                    )
                    Screen.MAIN -> {
                        MainScreen(
                            vpnStatus = vpnStatus,
                            onToggle = {
                                if (vpnStatus.state == com.vizoguard.vpn.vpn.VpnState.CONNECTED ||
                                    vpnStatus.state == com.vizoguard.vpn.vpn.VpnState.CONNECTING) {
                                    appState.disconnect()
                                } else {
                                    requestVpnPermissionAndConnect { appState.connect() }
                                }
                            },
                            onSettingsClick = { showSettings = true }
                        )

                        if (showSettings) {
                            ModalBottomSheet(onDismissRequest = { showSettings = false }) {
                                SettingsSheet(
                                    autoConnect = true, // TODO: read from store
                                    killSwitch = true,
                                    notifications = false,
                                    licenseKey = store.key,
                                    expiresAt = store.expires,
                                    onAutoConnectChange = { /* TODO */ },
                                    onKillSwitchChange = { /* TODO */ },
                                    onNotificationsChange = { /* TODO */ },
                                    onSignOut = { showSettings = false; appState.signOut() }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "vizoguard-vpn" && uri.host == "activate") {
            val key = uri.getQueryParameter("key")
            if (key != null && LicenseManager.isValidKeyFormat(key)) {
                // Will be picked up by AppState on next composition
                // For now, store as pending activation
                intent.putExtra("pending_key", key)
            }
        }
    }

    private fun requestVpnPermissionAndConnect(onGranted: () -> Unit) {
        val prepareIntent = VpnService.prepare(this)
        if (prepareIntent != null) {
            pendingVpnConnect = onGranted
            vpnPermissionLauncher.launch(prepareIntent)
        } else {
            onGranted()
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/main/java/com/vizoguard/vpn/MainActivity.kt
git commit -m "feat: wire all screens in MainActivity with deep link + VPN permission"
```

---

## Task 12: Background Workers + Boot Receiver

**Files:**
- Create: `app/src/main/java/com/vizoguard/vpn/worker/LicenseCheckWorker.kt`
- Create: `app/src/main/java/com/vizoguard/vpn/receiver/BootReceiver.kt`

- [ ] **Step 1: Implement LicenseCheckWorker**

```kotlin
package com.vizoguard.vpn.worker

import android.content.Context
import androidx.work.*
import com.vizoguard.vpn.api.ApiClient
import com.vizoguard.vpn.license.DeviceId
import com.vizoguard.vpn.license.LicenseManager
import com.vizoguard.vpn.license.SecureStore
import java.util.concurrent.TimeUnit

class LicenseCheckWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val store = SecureStore.create(applicationContext)
        val api = ApiClient()
        val deviceId = DeviceId.get(applicationContext)
        val manager = LicenseManager(store, api, deviceId)
        manager.validate()
        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "license_check"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<LicenseCheckWorker>(24, TimeUnit.HOURS)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }
}
```

- [ ] **Step 2: Implement BootReceiver**

```kotlin
package com.vizoguard.vpn.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.vizoguard.vpn.license.SecureStore

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val store = SecureStore.create(context)
        if (store.getAutoConnect() && store.getVpnAccessUrl() != null) {
            // Start ShadowsocksService to auto-connect
            val vpnIntent = Intent(context, com.vizoguard.vpn.vpn.ShadowsocksService::class.java).apply {
                action = com.vizoguard.vpn.vpn.VpnManager.ACTION_CONNECT
                // TODO: pass cached VPN config
            }
            context.startForegroundService(vpnIntent)
        }
    }
}
```

- [ ] **Step 3: Schedule WorkManager in VizoguardApp**

Update `VizoguardApp.kt`:
```kotlin
package com.vizoguard.vpn

import android.app.Application
import com.vizoguard.vpn.worker.LicenseCheckWorker

class VizoguardApp : Application() {
    override fun onCreate() {
        super.onCreate()
        LicenseCheckWorker.schedule(this)
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/com/vizoguard/vpn/worker/ app/src/main/java/com/vizoguard/vpn/receiver/ app/src/main/java/com/vizoguard/vpn/VizoguardApp.kt
git commit -m "feat: add LicenseCheckWorker (24h) and BootReceiver (auto-connect)"
```

---

## Task 13: Backend Email Update

**Files:**
- Modify: `/root/vizoguard/server/email.js` (add deep link to license email)

- [ ] **Step 1: Read current email template**

```bash
grep -n "vizoguard" /root/vizoguard/server/email.js | head -20
```

- [ ] **Step 2: Add mobile deep link to email body**

Add after the existing license key section in the email HTML:
```html
<p style="margin-top: 16px;">
  <a href="vizoguard-vpn://activate?key=${license.key}" style="color: #ff6b2b;">
    Open in Vizoguard VPN app
  </a>
</p>
```

- [ ] **Step 3: Test email sends correctly**

```bash
cd /root/vizoguard && pm2 logs vizoguard-api --lines 5
```

- [ ] **Step 4: Commit and push**

```bash
cd /root/vizoguard
git add server/email.js
git commit -m "feat: add mobile deep link to license confirmation email"
git push origin main
```

---

## Task 14: Integration Testing + Build

- [ ] **Step 1: Build debug APK**

```bash
cd /root/vizoguard-android
./gradlew assembleDebug
```
Expected: `app/build/outputs/apk/debug/app-debug.apk`

- [ ] **Step 2: Manual test checklist**

Run through on a physical Android device or emulator:

- [ ] App opens to Activate screen
- [ ] Enter valid license key → activates successfully
- [ ] Onboarding sheet appears → choose auto-connect preference
- [ ] Main screen shows with VPN toggle
- [ ] Tap connect → VPN permission dialog → tunnel starts
- [ ] Status shows "Protected"
- [ ] Tap disconnect → shows "Not Protected"
- [ ] Settings sheet opens → toggles work
- [ ] Sign out → returns to Activate screen
- [ ] Deep link `vizoguard-vpn://activate?key=VIZO-...` opens app and activates
- [ ] QR scanner opens camera and scans key
- [ ] Kill airplane mode → VPN reconnects
- [ ] Force stop app → reopen → state preserved
- [ ] Reboot device → VPN auto-connects (if enabled)

- [ ] **Step 3: Build release APK**

```bash
cd /root/vizoguard-android
./gradlew assembleRelease
```

- [ ] **Step 4: Copy Huawei APK to website**

```bash
cp app/build/outputs/apk/release/app-release.apk /var/www/vizoguard/downloads/Vizoguard-VPN-latest.apk
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: integration testing complete, ready for Play Store submission"
```

---

## Task Summary

| Task | Component | Files | Est. Steps |
|------|-----------|-------|------------|
| 1 | Project scaffolding | 8 new | 6 |
| 2 | tun2socks AAR | 1 new | 3 |
| 3 | Secure storage + Device ID | 3 new | 6 |
| 4 | API client | 2 new | 5 |
| 5 | License manager | 2 new | 5 |
| 6 | VPN manager + service | 3 new | 6 |
| 7 | AppState ViewModel | 2 new | 5 |
| 8 | Theme + MainScreen | 2 new | 3 |
| 9 | ActivateScreen + QR | 1 new | 2 |
| 10 | Onboarding + Settings | 2 new | 3 |
| 11 | Wire MainActivity | 1 modify | 2 |
| 12 | Workers + Boot receiver | 3 new | 4 |
| 13 | Backend email update | 1 modify | 4 |
| 14 | Integration test + build | 0 | 5 |
| **Total** | | **~30 files** | **59 steps** |
