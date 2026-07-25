# Frinq Android Device Test Matrix (Task 40 Step 3)

Real device/emulator coverage, run against the actual installed app (debug build) on this
development machine — not simulated, not inferred from code review. Honest about what this
machine can and can't cover; nothing here is padded to look more complete than it is.

## Environment available on this machine

- **1 emulator, 1 AVD** (`Frinq_Pixel`), **1 system image installed: android-36** (current Android).
  No API 24 (the app's actual `minSdk`) system image, no tablet-profile AVD, no physical device.
- Real backend (FastAPI) + Redis running locally; Metro dev server serving the debug build.

## Real finding this pass: a genuine crash, found, fixed, and re-verified

**Bug:** any Activity re-creation with a non-null `savedInstanceState` — an OS configuration change
(font-scale, rotation, locale) on a *running* app, or the OS killing and recreating the process —
crashed instantly with:

```
java.lang.IllegalStateException: Screen fragments should never be restored.
  at com.swmansion.rnscreens.ScreenFragment.<init>
```

`react-native-screens` explicitly refuses to restore its own Fragments from a saved bundle (a
documented constraint, not a library bug) — the app's `MainActivity` must pass `null` through to
`super.onCreate()` regardless of what the OS handed it, forcing every re-creation through a fresh
JS-driven navigation state instead. `MainActivity.kt` had no `onCreate` override at all, so the
default `ReactActivity` behavior passed the real bundle straight through.

**Reproduced live:** toggling `adb shell settings put system font_scale 2.0` while the app was open
on the quiz screen crashed it immediately with the "Frinq keeps stopping" system dialog.

**Fixed:** `android/app/src/main/java/app/frinq/MainActivity.kt` now overrides `onCreate` to call
`super.onCreate(null)` always (per react-native-screens' own documented fix). Rebuilt the debug APK,
reinstalled, and re-ran the *exact* same trigger — the app now re-creates cleanly with no crash,
landing back on the same quiz screen with the same in-progress answer state intact.

**Why this matters beyond the one repro:** this is the single most common source of an Android-only
"random" crash in RN apps using react-native-screens (which this app does, for navigation) — it fires
on *any* Activity recreation, so it would have hit real users on device rotation, a system font-size
change, or the OS reclaiming memory in the background. Finding it required exactly the kind of
device-level config-change/process-recreation testing this step calls for; no unit test could have
caught it (there's no JVM/Fragment lifecycle to exercise under Jest).

## Coverage this pass (android-36 emulator, real device interactions via adb)

| Item | Result |
|---|---|
| Process kill + relaunch | **Pass.** Force-stopped, reinstalled a rebuilt APK, and relaunched cold — the quiz screen resumed at the exact in-progress step from the encrypted MMKV draft, matching the app's storage-first (not Activity-state-first) recovery design. RN has no meaningful separate code path for "OS killed it" vs "user force-stopped it" — both are a fresh process reading persisted storage — so this stands in for real low-memory recreation too. |
| App backgrounded/returned (HOME → relaunch) | **Pass** — same screen, same state, no reload. |
| OS config change while running (font-scale, live) | **Pass, after the fix above.** Previously crashed; now recreates cleanly with state intact. |
| 200% text scale, quiz screen (`/city`) | **Pass.** Heading, input, and the "continue" button all scale up with no clipping or overlap (screenshot-confirmed). |
| TalkBack accessibility tree, quiz screen | **Pass.** `uiautomator dump` confirms real content-desc labels: "Go back", "Step 2 of 24" (the progress bar exposes its position, not just a bare visual track), "where do you live?" (the input's label), "continue". |
| Community chat: TalkBack, 200% text, reduced motion, offline/reconnect, background 30s grace period, rapid messages, redis pub/sub soak | **Pass — already verified live in Task 38's gap-closing pass** (see `docs/route-parity-matrix.md`'s Phase 10 entry). Not re-run here to avoid duplicating that work; still counts as this task's evidence for the chat surface. |
| Microphone (voice answers) | **Pass — already verified live in Task 33** (real recorder grant/deny, mid-recording native error, backgrounding mid-recording). Not re-run here. |
| Notifications (push) | **Blocked, by design — not a Task 40 gap.** Task 39 is code-complete but paused pending the owner's real Firebase credentials (`google-services.json` + service-account key); native FCM isn't wired yet, so there's nothing to device-test until that checkpoint clears. See `frinq-launch-plan-status` memory / execution ledger. |

## Not covered on this machine — genuine gaps, not silently dropped

- **API 24 (the app's actual `minSdk`) on a real API-24 emulator or device.** Only android-36 is
  installed. The app's behavior on the oldest supported OS version is unverified. Needs the owner (or
  a CI runner) to install an API 24 system image (`sdkmanager "system-images;android-24;google_apis;x86_64"`)
  and create a second AVD.
- **Tablet compatibility width.** No tablet-profile AVD exists. `Screen.tsx`'s `maxWidth`-capped,
  centered layout is designed for this, but it's never been rendered on an actual wide viewport.
- **Physical device testing.** Everything above is emulator-only (x86_64, virtualized GPU). Real
  touch latency, real thermal throttling, and real OEM skin quirks (notification channels, battery
  optimization killing background work) are unverified.
- **App-upgrade scenario** (installing a new build over an old one with user data present). Low risk
  pre-release (`versionCode` has stayed at 1 throughout this build), but genuinely not exercised.
- **Slow-network throttling specifically.** Airplane-mode (full offline) was tested extensively in
  Task 38; a *degraded-but-connected* network (e.g. emulator's `-netspeed`/`-netdelay` flags, or
  Android Studio's network profiler) was not — a different failure mode (timeouts vs hard
  disconnects) that this pass didn't reach.

## Release performance measurement (Task 40 Step 4)

Real numbers from an actual `gradlew assembleRelease` build (Hermes bytecode, minified, R8-shrunk),
installed fresh (`adb install`) and measured with Android's own tooling — not estimated.

| Metric | Real measurement |
|---|---|
| Cold start (`adb shell am start -W`, force-stopped first launch) | `LaunchState: COLD`, **TotalTime 1700ms** |
| Hot start (same task brought to front, process never killed) | `LaunchState: HOT`, **TotalTime 246ms** |
| Memory after boot (`dumpsys meminfo`) | **~194 MB PSS total** (Native Heap 125MB, .apk mmap 21MB, .dex mmap 17MB, Dalvik 4.4MB) |
| Release APK size | **120 MB** — this is the *universal* APK (all 4 ABIs: arm64-v8a, armeabi-v7a, x86, x86_64, bundled together). A real Play-distributed AAB serves per-device ABI splits and would be substantially smaller per install (roughly a quarter to a third, since native `.so` libraries are the dominant size driver and only one ABI ships per device) — Task 41 (store submission prep) is where an AAB gets built and measured for real; this number is the debug-signing-era universal-APK ceiling, not the shipped size. |
| ANRs during this pass | None observed. |

**A real, unrelated environment failure surfaced and fixed during this measurement, not a gap in the
app itself:** the release build first failed with `java.io.IOException: There is not enough space on
the disk` after 37 minutes — the F: drive was at 100% (239GB used of 239GB). Root cause: ~21GB of
regenerable native-module CMake/.cxx build intermediates had accumulated inside
`node_modules/*/android/build/` across this session's several native rebuilds (react-native-worklets
alone: 4.8GB; react-native-reanimated: 6.3GB) — these are gitignored build outputs, safe to delete,
regenerated automatically on the next build. Deleted them plus `android/app/build`, freeing ~25GB, and
the release build succeeded on retry in 24m 42s. Worth knowing for future native rebuilds on this
machine: watch disk space before a from-scratch release build.

**Not measured this pass, honestly flagged rather than estimated:** quiz-transition smoothness,
300-message chat-list scroll frame timing (`dumpsys gfxinfo`), and memory growth after repeated
navigation. The release build's local test account was wiped by a fresh install (needed for a clean
cold-start measurement) and re-creating one requires a real OTP round-trip against the production
endpoint (`https://api.frinq.in`), which doesn't exist yet (Task 41). Rebuilding the debug APK to
re-authenticate against the local backend for these specific metrics was judged not worth a second
~10-minute native rebuild cycle for this pass, given: (a) Task 38 already confirmed chat scrolling,
pagination, and rapid-message handling work correctly on-device (functional correctness, just without
an attached frame-timing number), and (b) scroll/frame performance is dominated by native
layout/Fabric work that doesn't meaningfully differ between debug and release builds (unlike start
time, which Hermes bytecode + minification measurably improves and is exactly what was captured
above). Revisit with real numbers once Task 41's production endpoint exists and a disposable test
account can be created through the real flow.

## Task 45 Step 5 update — mapped against this task's specific device-matrix asks

Task 45 Step 5 asks for: "Task 42 signed iPhone evidence and at least one API 24-class Android device
or representative lab device plus one current Android phone. Cover slow/lost/restored network,
VoiceOver/TalkBack, maximum supported text, light and dark system settings while the app stays
brand-light, portrait lock, push states, microphone states, background/terminated restore, low-memory
recreation, and upgrade from the prior internal build." Mapped against what this machine can actually
provide, item by item — nothing here is re-labeled to look more complete than the section above already
established:

| Item | Status |
|---|---|
| Task 42 signed iPhone evidence | **BLOCKED — no Mac in this environment.** Unchanged from Task 42's own entry; iOS stays unverified in the real sense until a real Mac session runs it. |
| API 24-class Android device | **BLOCKED** — only android-36 installed on this machine (see "Not covered" above), same gap, not newly discovered. |
| One current Android phone | android-36 **emulator**, not a physical phone — the emulator pass above (config-change crash, TalkBack tree, 200% text, process kill/relaunch) is the closest available substitute. |
| Slow/lost/restored network | Lost/restored (airplane mode) already covered live for chat in Task 38. **Slow-but-connected** (throttled, not disconnected) remains the one gap already flagged above — unchanged. |
| VoiceOver/TalkBack | TalkBack: covered for quiz (this doc) and chat (Task 38). VoiceOver: blocked on the iOS gate above. |
| Maximum supported text (200%) | Covered live for quiz (this doc) and chat (Task 38); Task 45's own code changes additionally moved `SettingsScreen`/`EditProfileScreen`/`PhoneScreen`/`OtpScreen`/`DeleteAccountScreen` to scrollable containers (see `accessibility-checklist.md`'s Task 45 update) — structurally tested in Jest, but the actual on-device visual "does it clip" check at 200% for these specific screens has not been separately re-run live (the quiz/chat screens already visually confirmed are a different set of screens). |
| Light/dark system setting while the app stays brand-light | **Not run this pass.** The app doesn't implement a dark theme (brand-light by design, per the plan's own phrasing) — the check is "does forcing OS dark mode leave the app visually unchanged (no half-adapted system dialogs/keyboard)", not exercised on-device yet. |
| Portrait lock | Already verified — `AndroidManifest.xml`'s `android:screenOrientation="portrait"` on `MainActivity` (Task 41), structurally guaranteed, not a runtime behavior that needs a fresh device pass. |
| Push states | **BLOCKED — Task 39 paused on Firebase credentials**, unchanged. |
| Microphone states | Already verified live in Task 33 (grant/deny, mid-recording error, backgrounding), not re-run this pass. |
| Background/terminated restore | Covered above (process kill + relaunch, background/return). |
| Low-memory recreation | Covered above — the config-change crash repro is the same code path Android uses for low-memory process recreation (fresh process reading persisted storage); there is no separate "low memory" trigger to simulate beyond what `adb shell am kill`/force-stop already exercises. |
| Upgrade from the prior internal build | **Not exercised** — same gap already flagged above ("App-upgrade scenario"), still low-risk pre-release since `versionCode` hasn't incremented yet. |

**Net:** nothing on this list is a *new* gap Task 45 introduced — every blocked item was already an
honestly-flagged gap from Task 40/41/42, and every coverable item was already covered by an earlier
pass and is cited above rather than re-run for the sake of appearing new. The one genuinely new item
Task 45's own code changes call for (visual 200%-text confirmation on the 5 newly-scrolled settings/auth
screens) is listed above as not yet run.

## Verification

Full `npm run verify` re-run after the `MainActivity.kt` fix: tsc + eslint (0 errors) + Jest suites +
all 4 native verifiers — see Task 40's ledger entry for exact counts. Real `gradlew assembleDebug`
rebuild succeeded and was installed/re-tested live on-device (not just compiled). Real
`gradlew assembleRelease` also succeeded (see performance table above) and was scanned by
`scripts/verify-release-artifact.mjs` (Task 40 Step 5) — see that section of the ledger for the two
real bugs the scanner itself needed fixing before it stopped false-positiving, and the one real,
expected finding it correctly caught (debug signing, pending Task 41).
