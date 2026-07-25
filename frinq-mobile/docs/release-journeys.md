# Frinq Release Journeys (Task 45)

What proves each critical customer/safety/deletion/accessibility journey works, where that proof lives,
and what's genuinely deferred (device credentials, not missing effort). This is a map, not a duplicate
of the tests themselves — follow the file references to see the actual assertions.

## Step 1 — isolated staging test data

`frinq-backend/scripts/seed_release_test_data.py` (`seed --tag <tag> --count N`, `cleanup --ids ...` /
`cleanup --tag <tag>`) creates uniquely-tagged, deterministic (never random) test users directly at an
active, community-assigned state — bypassing the quiz/AI pipeline the same way Task 38's one-off scratch
scripts did, but as a reusable, tracked tool. Hard-refuses under `APP_ENV=production` (same convention as
every other boot-guard in this repo). Cleanup only ever deletes explicitly-passed tagged IDs or rows
matching a given tag's display-name pattern — never a broad `DELETE FROM users`. Tested in
`frinq-backend/tests/test_scripts/test_seed_release_test_data.py` (8 tests, real `FakePool`, no live DB
needed for CI). This is a manual-QA staging tool, not itself wired into an automated CI journey — it
exists for whatever real-device/manual pass happens once credentials arrive, per the owner's own
"supplied at the end phases" direction.

## Step 2 — portable state/component journeys

| Journey | Covered by | Notes |
|---|---|---|
| New OTP account | `src/features/auth/__tests__/authFlow.test.tsx` (OtpScreen: token persistence, pending-legal flush, pending-quiz flush) | Pre-existing |
| Terms acceptance | `src/features/auth/__tests__/authFlow.test.tsx` ("flushes a pending legal acceptance"), `src/app/__tests__/bootMachine.test.ts` (`legalRequired` routing) | Pre-existing |
| Quiz resume after process death | `src/features/quiz/__tests__/quizRecovery.test.tsx` | Pre-existing — a fresh `render()` reading pre-seeded encrypted storage **is** the correct simulation of process death for this app's storage-first (not Activity-state-first) recovery design; confirmed by Task 40's `MainActivity.kt` fix, which is the only place Activity-instance-state actually mattered |
| Durable processing | `src/features/vibe-report/__tests__/processing.test.tsx` | Pre-existing |
| Active result | `src/features/profile/__tests__/profile.test.tsx` (ProfileScreen), `archetypeIllustrations.test.ts`, `shareVibeCard.test.ts` | Pre-existing |
| Assigned community | `src/features/community/__tests__/CommunityScreen.test.tsx` | Pre-existing |
| Two-user thread / report / block | `src/features/community/__tests__/safetyActions.test.tsx` | Pre-existing, full coverage — not duplicated this task |
| **Reconnect without duplicate** | `src/services/realtime/__tests__/CommunitySocket.test.ts` (2 new tests) + `src/features/community/__tests__/chatSafety.test.tsx` (new, real `CommunitySocket` + real `CommunityScreen` over a mock WebSocket) | **Genuine gap, found and fixed.** `CommunitySocket.pendingSends` survives a retrying-reconnect by design (its own doc comment said so) but nothing ever resent it — a message sent right before a drop stayed stuck on "sending…" forever, both un-retried and un-markable-failed. Added `resendPending()`, called from the `'ready'` handler on every (re)connect. Both new test files were confirmed to fail without the fix before being left in place. |
| Mute | `src/features/settings/__tests__/settings.test.tsx` (CommunitySettingsScreen) | Pre-existing |
| Profile edit | `src/features/profile/__tests__/profile.test.tsx` (EditProfileScreen) | Pre-existing |
| Logout/login | `src/features/settings/__tests__/settings.test.tsx` (logout), `logoutService.test.ts`, `authFlow.test.tsx` (login) | Pre-existing |
| Refresh rotation | `src/services/session/__tests__/SessionCoordinator.test.ts` | Pre-existing, coordinator-level |
| **Revoked-session rejection** | `src/app/__tests__/releaseJourneys.test.tsx` (new, 2 tests) | **Genuine gap, closed.** `SessionCoordinator.test.ts` already proved the coordinator's own state gets wiped on a rejected/reused refresh token; never proven that this actually reaches the real `BootController`/`routeForUser` chain and lands on the real sign-in screen (vs. an injected `resolveBoot`). New tests render the real `AppProviders`/`BootController` against a fake HTTP transport (only the network leaf is faked) and assert the real end state — sign-in screen for a rejected token, offline-retry screen (never sign-in) for an unreachable server. |
| **Account deletion** | `src/features/settings/__tests__/deleteAccount.test.tsx` (pre-existing, full confirm→OTP→type-DELETE UI flow + its own scroll-at-large-text addition) + `src/features/settings/__tests__/accountDeletion.test.tsx` (new) | **Genuine cross-module gap, closed.** The UI flow and each unit link (`clearLocalSessionState` → `coordinator.clear()` → `onAuthChange(false)`) were each already proven separately; never proven end to end that a real cleared coordinator actually re-resolves boot to `authRequired` through the real `routeForUser`. Same real-`BootController` harness as the revoked-session test above. |

Shared test harness: `src/test/releaseFixtures.ts` — `renderBootJourney()` (mounts the real
`AppProviders`/`BootController`, hands back the live `SessionCoordinator` instance via a probe component
so a test can call the exact same `coordinator.clear()` account deletion/logout perform, without
reaching into React internals or duplicating `BootController`'s own resolver logic) and `routedTransport()`
(URL-suffix-matched fake `HttpTransport`, unmatched routes 404 loudly instead of hanging). `BootController`
itself gained one export (`App.tsx`) purely for this — no behavior change, same pattern as `RootNavigator`/
`screenForState` already being exported for direct testing.

## Step 3 — native accessibility assertions

Full detail in `docs/accessibility-checklist.md`'s "Task 45 Step 3 update" section. Summary: of the six
failure categories the step names, three were already solid (accessible names/roles generally, contrast,
font-scale caps) and three had genuine gaps — all closed:

- **Incorrect selection state**: `SnapSlider` had zero test coverage (new `SnapSlider.test.tsx`, 5 tests);
  `ChoiceCard`'s `accessibilityState.selected` was untested (label-only before); `MainTabs`' active-tab
  selection was untested.
- **Inaccessible modal focus**: every modal in the app (`MessageActionSheet`/`ReportSheet`/`BlockDialog`/
  `PushOptInPrompt`) already goes through `Sheet`/`Dialog`, both wrapping RN's real native `Modal` with
  `accessibilityViewIsModal` — focus-into-modal is a platform guarantee, not custom JS, confirmed
  structurally rather than faked with an unfalsifiable focus-trap test. The one thing that can't be
  proven in Jest (a live screen reader actually honoring it) is now an explicit line in
  `device-test-matrix.md` instead of an unstated assumption.
- **Controls below the token minimum**: was spot-checked (2 components); now systematically swept across
  every previously-untested interactive primitive.
- **Screens that cannot scroll at large text**: real gap. Five screens (`SettingsScreen`,
  `EditProfileScreen`, `PhoneScreen`, `OtpScreen`, two of `DeleteAccountScreen`'s three steps) used a
  non-scrolling `<Screen>` for content that could plausibly clip at 200% text — especially the two
  keyboard-guaranteed entry screens (OTP/phone, `autoFocus`). Fixed by switching to `<Screen scroll>`;
  each fix has a matching structural test (`UNSAFE_getByType(ScrollView)`), confirmed to fail on the
  pre-fix code first.

## Step 4 — retained public pages (Playwright)

`frinq-frontend/tests/e2e/legal-public-pages.spec.ts` extended from 14 to 33 tests: document
versions/cross-links, narrow-viewport (iPhone SE width, no horizontal overflow), keyboard-only navigation
(every link on the support page reachable in order, no trap), and `@axe-core/playwright` scans (fail on
serious/critical) for every retained page. The axe pass found a real WCAG AA contrast failure (the shared
`#8B7355` secondary-text tone on the cream background measured 3.95:1 against a 4.5:1 requirement at
13px) — fixed by adopting the mobile app's own already-vetted `#5E4636` secondary-text color (documented
`>= 4.5:1 on cream` in `frinq-mobile/src/design/tokens/colors.ts`) across every usage in `frinq-frontend`,
keeping the two apps' brand color visually consistent rather than inventing a third shade.

## Step 5 — real device matrix

`docs/device-test-matrix.md`'s "Task 45 Step 5 update" maps every item this step asks for against what
this machine can/can't provide. Net: no new gaps beyond what Task 40/41/42 had already honestly flagged
(no Mac → iOS unverified; no API-24 image; Task 39 push blocked on Firebase credentials). One genuinely
new follow-up: the 5 screens newly switched to scrollable containers (Step 3 above) haven't had their own
live 200%-text visual confirmation yet, separate from the quiz/chat screens already confirmed in Task 40/38.

## Step 6 — automation stack

No new stack introduced. Jest/React Native Testing Library (native), Playwright + axe-core (retained
public pages), Android instrumentation via the existing template. No Maestro/Detox/Appium — nothing in
this task's findings justified that cost.

## Deferred, not silently dropped

- iOS: unverified pending a real Mac session (Task 42 gate, standing since it was authorized to skip).
- Native push: code-complete, paused pending the owner's Firebase credentials (Task 39).
- API 24 device, physical device, tablet width, app-upgrade scenario, throttled-but-connected network:
  all pre-existing gaps from Task 40, restated (not re-discovered) in the Step 5 device-matrix update.
- Live 200%-text visual confirmation for the 5 newly-scrolled screens (Step 5 above).
