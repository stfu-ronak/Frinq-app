# Frinq Mobile — Dependency Compatibility Matrix

Authoritative source: the 2026-07-23 bare React Native design spec ("Runtime and Dependency
Direction"). Every dependency is resolved to an **exact lockfile version during its own task** — this
doc records the intended target, the New-Architecture/platform constraints each must satisfy, and any
build spike that gates dependent work. Task 26 only scaffolds RN + the two verifier scripts; feature
dependencies below are installed in Tasks 27-39.

## Hard platform constraints every dependency must satisfy

| Constraint | Value | Why |
|---|---|---|
| React Native | 0.86.0 (pinned) | scaffolded baseline |
| Architecture | New Architecture ON (`newArchEnabled=true`) | no legacy-bridge-only packages |
| JS engine | Hermes ON | |
| Android 16 KB page size | must support | Android 15+ device requirement / Play policy |
| Android minSdk / compile / target | 24 / 36 / 36 | design spec |
| iOS deployment target | 15.1 | design spec |
| React | 19.2.x | RN 0.86 peer |

A dependency that cannot meet New Architecture + 16 KB pages + these OS floors **blocks the task that
needs it**; per the handoff it never justifies switching to Expo, Capacitor, or a WebView.

## Installed at Task 26 (scaffold baseline — pinned)

| Package | Version | Notes |
|---|---|---|
| react-native | 0.86.0 | CLI init |
| react | 19.2.3 | |
| @react-native/new-app-screen | 0.86.0 | placeholder screen, removed in Task 27/28 |
| react-native-safe-area-context | ^5.5.2 | ships with template; pinned exactly in Task 27 |
| @react-native/jest-preset | 0.86.0 | added — CLI template referenced it but did not install it (scaffold gap) |

## Installed at Task 27 — UI/motion foundations (resolved versions)

| Package | Installed | New-Arch | Note |
|---|---|---|---|
| @react-navigation/native | ^7.3.13 | n/a (JS) | v7, **not** the v8 prerelease |
| @react-navigation/native-stack | ^7.18.5 | yes | |
| @react-navigation/bottom-tabs | ^7.18.13 | yes | |
| react-native-screens | ^4.26.2 | yes | |
| react-native-safe-area-context | ^5.8.0 | yes | |
| react-native-gesture-handler | ^3.1.0 | yes | |
| react-native-reanimated | **^4.5.3** | yes | see reconciliation ↓ |
| react-native-worklets | **^0.11.2** | yes | Reanimated 4.5.3 peer range `0.10.x - 0.11.x` |
| react-native-svg | ^15.15.5 | yes | line motifs/icons |
| react-native-haptic-feedback | ^3.0.0 | — | motion/haptic recipes |

**Reconciliation (recorded 2026-07-23):** the design spec named Reanimated `4.6.x` and Worklets
`0.12.x`. **Neither is published** — the newest releases are Reanimated `4.5.3` and Worklets `0.11.2`.
Reanimated `4.5.3` declares peers `react-native: 0.83 - 0.86` (✓ our 0.86) and
`react-native-worklets: 0.10.x - 0.11.x`, so the installed pair `4.5.3` + `0.11.2` is the newest
mutually-compatible, RN-0.86 + New-Architecture-supported set. This is a version reconciliation
(newest-available), not an architecture change; when 4.6/0.12 publish they can be adopted if they hold
the same peer guarantees. Native linking is verified only at Android build time (SDK required).

## Planned (installed in later tasks — target ranges from the design spec)

| Package | Target | Task | New-Arch | Spike / risk |
|---|---|---|---|---|
| @tanstack/react-query | 5.x | 28 | n/a (JS) | wired to AppState + NetInfo; no sensitive cache persistence |
| @react-native-community/netinfo | 12.x | 28 | yes | reachability/reconnect |
| react-native-keychain | 10.x | 29 | yes | refresh token + MMKV encryption key |
| react-native-mmkv | 4.x | 29 | yes | encryption key from Keychain; bounded quiz drafts + non-secret prefs |
| @react-native-firebase/app, messaging, crashlytics | latest-compatible | 28/39 | yes | Crashlytics redacted; **Firebase Analytics NOT enabled** |
| react-native-audio-api | 0.12.x (verify at install) | 33 | yes | **BLOCKING SPIKE (below)** before quiz voice UI; confirm published version like the Reanimated case |
| react-native-view-shot + native Share | latest-compatible | 34 | yes | Vibe card image capture |

## Blocking build spike: Android audio (gates Task 33)

`react-native-audio-api@0.12.x` must pass a foundation build spike on **RN 0.86 + New Architecture +
Android** — a clean `assembleDebug` plus a minimal foreground record→file round-trip — **before** any
quiz voice/story UI (`/story`, `/opinions-why`) depends on it. If the spike fails, voice answers fall
back to text-only for the affected screens and the failure is recorded; it does not change the runtime
framework. This spike requires the Android SDK (see below) and is deferred until then.

## Environment prerequisite (recorded 2026-07-23, Task 26 Step 1)

No Android SDK / Android Studio / adb / emulator is installed on the Windows dev machine
(`ANDROID_HOME` unset). All JS/TS verification (`npm run verify`) runs now; **Android native builds
(`gradlew assembleDebug`, the audio spike, emulator/device journeys) are blocked until the SDK
(cmdline-tools + platform-36 + build-tools 36 + platform-tools) is installed.** iOS is unverified
until the consolidated Task 42 Mac/Xcode/physical-iPhone gate.
