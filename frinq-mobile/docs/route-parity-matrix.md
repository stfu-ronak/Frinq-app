# Frinq Native Route Parity Matrix

**Source of truth:** `frinq-frontend/` (Next.js App Router) behavior + FastAPI contracts, per the
2026-07-23 bare React Native design spec. This matrix enumerates all **52** current web routes and
their native destinations so native parity can be proven route-by-route before the Phase 11 cutover.

**Status legend (native):** `pending` = not built yet (Phase 7 baseline); filled in as Phases 8-10
land. **PublicWeb** = TRUE only for routes retained as public web pages after cutover (Task 43);
everything else moves fully native and is removed from the web consumer app.

**Conventions**
- Quiz answers persist client-side via `setQuizState(key, …)` → **native replaces this with encrypted
  MMKV bounded quiz drafts** (design spec: submission id, schema version, last safe route, bounded
  answers, sync metadata only). Server partial-save (`PATCH /api/v1/quiz/complete/{id}`) stays
  authoritative.
- `document.startViewTransition` (SVT) is used for nearly all web navigation → **native replaces with
  React Navigation 7 native-stack transitions** (app-wide; not repeated per row).
- Refresh token: web `sessionStorage`/Capacitor SecureStorage → **native `react-native-keychain`**;
  access token stays in memory (`SessionCoordinator`).
- Two analytics systems exist on web: (1) `track()` — the consent-gated allowlist that POSTs to
  `/api/v1/track` (**ported natively**, Task 28 `services/telemetry/analytics.ts`); (2)
  `window.frinqTrack?.(…)` — an undefined-by-default free-form beacon (no-op unless an external
  script injects it). **The `frinqTrack` beacon is NOT ported** — it is not on the allowlist and its
  free-form labels/props violate the privacy-minimal telemetry rule. Rows list frinqTrack calls only
  to document what is intentionally dropped.
- **Excluded screenshot-only matching fields:** dating/matching, DMs, location matching,
  gender/pronoun collection, social-account verification, photos/media chat, presence. Where the web
  app collects social handles (`/social-verify`), see the per-row exclusion note.

---

## Allowlisted analytics events (ported natively, `track()`)
`screen_view, otp_requested, otp_verified, quiz_started, quiz_completed, result_viewed,
community_opened, message_sent, report_submitted, block_created, notification_opt_in,
account_deleted` — gated on explicit consent, property-free.

---

## A. Onboarding / auth (5)

| Web route | Purpose | Backend API | Draft/storage keys → native | Browser-only APIs → native replacement | track() | States | Native destination (template) | PublicWeb |
|---|---|---|---|---|---|---|---|---|
| `/` | Splash + resume router | `POST /auth/refresh`, `GET /users/me` | reads `frinq_current_page`, identity, pending legal; clears quiz keys | SVT; `location.search`; SecureStorage → Keychain + `bootMachine` | — | static shell, silent routing | Boot/Splash → `RootNavigator` boot state | FALSE |
| `/name` | First name | none | `frinq_name` → MMKV draft | SVT | (frinqTrack `submit_name` dropped) | — | Quiz template: single text field | FALSE |
| `/phone` | WhatsApp number → send OTP | `POST /otp/send`, `POST /quiz/start` | `frinq_phone`, `frinq_submission_id` | `fetch` → ApiClient | `otp_requested`, `quiz_started` | loading, 429/network error | Auth: `PhoneField` screen | FALSE |
| `/verify` | OTP verify + session + legal POST + resume | `POST /otp/verify`, `POST /legal/accept`, `POST /quiz/start` | restores all answers; pending legal (SS); refresh token | `fetch`, `AbortController`, `window.clarity` (drop), `location.search` | `otp_verified` | loading, 400/410/504/timeout, resend cooldown | Auth: `OtpField` screen | FALSE |
| `/social-verify` | LinkedIn/IG links (skippable) | none | `frinq_linkedin_url`, `frinq_instagram`, `frinq_social_verified` | SVT | (frinqTrack dropped) | — | **Deferred/reviewed** — social-account verification is an excluded concept; keep only if the shipping web flow proves it in-scope, else drop | FALSE |

## B. Quiz — real input screens (23)

| Web route | Purpose | API | Answer key(s) → MMKV draft | Browser-only | track()/beacon | States | Native template | PublicWeb |
|---|---|---|---|---|---|---|---|---|
| `/city` | City | none | `frinq_city` | SVT | beacon `select_option` (drop) | — | text/autocomplete | FALSE |
| `/age` | DOB + 18+ gate | none | `frinq_dob` | SVT | — | inline error (<18/bad date) | `DateField` + gate | FALSE |
| `/social-type` | Social type | none | `frinq_social_type` | SVT | beacon (drop) | — | `ChoiceCard` grid | FALSE |
| `/scene` | Substances multi | none | `frinq_scene[]` | SVT | beacon (drop) | — | `TagPicker` | FALSE |
| `/saturday-night` | Card + custom | none | `frinq_saturday` | SVT | beacon (drop) | — | `ChoiceCard` + custom | FALSE |
| `/hobbies` | Hashtag multi | none | `frinq_hobbies` | SVT | beacon (drop) | — | `TagPicker` | FALSE |
| `/interests` | Grouped hashtag multi | none | `frinq_interests[]` | SVT | beacon (drop) | — | `TagPicker` grouped | FALSE |
| `/trip` | Single-pick reaction | none | `frinq_trip` | SVT | beacon (drop) | — | `ChoiceCard` | FALSE |
| `/travel-style` | Single pick | none | `frinq_travel_style` | SVT | beacon (drop) | — | `ChoiceListRow` | FALSE |
| `/connection-mode` | Single pick | none | `frinq_connection_mode` | SVT | beacon (drop) | — | `ChoiceListRow` | FALSE |
| `/event-yes` | Hashtag multi | none | `frinq_event_yes[]` | SVT | beacon (drop) | — | `TagPicker` | FALSE |
| `/event-no` | Hashtag multi | none | `frinq_event_no[]` | SVT | beacon (drop) | — | `TagPicker` | FALSE |
| `/would-rather` | Single pick | none | `frinq_would_rather` | SVT | beacon (drop) | — | `ChoiceListRow` | FALSE |
| `/meeting-style` | Single pick | none | `frinq_meeting_style` | SVT | beacon (drop) | — | `ChoiceListRow` | FALSE |
| `/story` | Voice/text friend story | `POST /voice` (FormData) | `frinq_story` + voice clip | `getUserMedia`, `MediaRecorder`, `Blob`, `FormData` → `services/audio` (RN Audio API) | beacon `click`/`submit` (drop) | recording/uploading/done/**failed+retry** | dedicated feature (voice) | FALSE |
| `/connection` | Card + custom | none | `frinq_connection` | SVT | beacon (drop) | — | `ChoiceCard` + custom | FALSE |
| `/red-flags` | Hashtag multi | none | `frinq_red_flags[]` | SVT | beacon (drop) | — | `TagPicker` | FALSE |
| `/show-up` | Hashtag multi | none | `frinq_show_up` | SVT | beacon (drop) | — | `TagPicker` | FALSE |
| `/rapid-fire` | 10 timed A/B (auto-pick) | none | `frinq_rapid[]` | SVT, `setInterval` → `RapidFireTimer` | beacon (drop) | timer auto-pick | dedicated (timed) | FALSE |
| `/opinions` | 4 A/B picks | none | `frinq_opinions[]` | SVT | beacon (drop) | progress dots | A/B template | FALSE |
| `/opinions-why` | 3 follow-up voice/text | `POST /voice` (FormData) | `frinq_opinions_why[]` + voice | `getUserMedia`, `MediaRecorder` → `services/audio` | beacon (drop) | recorder idle/upload/done/fail | dedicated (voice) | FALSE |
| `/preferences` | 4 snap sliders | none | `frinq_preferences[]` | SVT | beacon (drop) | progress dots | slider template | FALSE |
| `/last-question` | Looking-for multi | none | `frinq_looking_for` | SVT | beacon (drop) | — | `TagPicker` | FALSE |

## C. Quiz — interstitials / transitions (10)

| Web route | Purpose | API | Browser-only | Native template | PublicWeb |
|---|---|---|---|---|---|
| `/s0` | "let's get to know you" | none | SVT | interstitial (heading + `ArrowButton`) | FALSE |
| `/ready` | "are you ready?" | none | SVT | interstitial | FALSE |
| `/nahh` | transition | none | SVT | interstitial | FALSE |
| `/sweet` | transition | none | SVT | interstitial | FALSE |
| `/glorious` | opinions intro | none | SVT | interstitial | FALSE |
| `/preferences-intro` | slider intro | none | SVT | interstitial | FALSE |
| `/rapid-intro` | 3-2-1 countdown | none | SVT, `setTimeout` | interstitial + countdown | FALSE |
| `/connecting` | auto-advance "thinking" → vibe-box | none | SVT, `setTimeout` | transition (auto-nav) | FALSE |
| `/done` | "that's a wrap" | none | SVT | terminal interstitial | FALSE |
| `/what-next` | post-result actions | none | `navigator.share` → RN `Share`; `location.origin` | actions screen | FALSE |

## D. Result (1) — state machine

| Web route | Purpose | Backend API | Browser-only | track() | States | Native destination | PublicWeb |
|---|---|---|---|---|---|---|---|
| `/vibe-box` | Submit quiz, poll AI summary, envelope→report reveal | `PATCH /quiz/complete/{id}`, `POST /quiz/submit`, `GET /quiz/summary/{id}` (poll 2s/90s), `POST /whatsapp/notify/{sid}` | `location.search`, `scrollTo`, `requestAnimationFrame`, `setInterval` poll | `quiz_completed`, `result_viewed` | loading / sealed / opening / whats_next / reveal / **error** | `vibe-report` feature: collectible `VibeCard` + `ReportSection`s (Task 34) | FALSE |

## E. Main app — authenticated (7)

| Web route | Purpose | Backend API | Browser-only → native | track() | States | Native destination | PublicWeb |
|---|---|---|---|---|---|---|---|
| `/community` | Realtime community thread | `GET /users/me`, `GET /community/messages(?before=)`, `POST /community/ws-ticket`, **WS** `/ws/community?ticket=`, `POST /messages/{id}/report`, `POST /users/{id}/block` | `WebSocket`→`services/realtime`, `crypto.randomUUID`, `navigator.onLine`+online/offline→NetInfo | `community_opened`, `message_sent`, `report_submitted`, `block_created` | loading, offline+retry, no-membership, suspended/banned/auth_expired, send-fail+retry, reconnecting | MainTabs→Community (`CommunityMessage`, `MessageComposer`, `MessageActionSheet`) — Task 37/38 | FALSE |
| `/profile` | Read-only profile | `GET /users/me` | — | — | loading, error | MainTabs→Profile | FALSE |
| `/profile/edit` | Edit display_name | `GET /users/me`, `PATCH /users/me` | `window.confirm` → `Dialog` | — | loading, saving, server-error map, network err | Profile→Edit (stack) | FALSE |
| `/settings` | Settings hub + logout | `POST /auth/logout` | — | — | logging-out | MainTabs→Settings | FALSE |
| `/settings/account` | Reverify + hard-delete | `POST /auth/reverify/request`, `POST /auth/reverify/verify`, `DELETE /users/me` | `setInterval` cooldown | `account_deleted` | confirm/otp/type-DELETE/deleting, error, cooldown | Settings→Delete (stack) — Task 36 | FALSE |
| `/settings/community` | Mute toggle | `GET /community/me`, `PATCH /community/preferences` | — | — | loading, error+revert | Settings→Community | FALSE |
| `/settings/privacy` | Analytics consent toggle | none | `localStorage` → MMKV pref | writes consent (gates track()) | instant | Settings→Privacy | FALSE |

## F. Public legal / support — retained on web after cutover (6)

| Web route | Purpose | Backend API | Native destination | PublicWeb |
|---|---|---|---|---|
| `/terms` | ToS (static draft) | none | native legal doc screen (Task 36) **and** retained web page | **TRUE** |
| `/terms/accept` | Age + legal consent gate | `GET /legal/current`, `POST /legal/accept` (authed path) | native `LegalAcceptance` (Task 30) **and** retained web | **TRUE** |
| `/privacy` | Privacy policy + data table | none | native legal doc + retained web | **TRUE** |
| `/community-rules` | Rules (static) | none | native legal doc + retained web | **TRUE** |
| `/support` | Support email (static) | none | native support screen + retained web | **TRUE** |
| `/delete-account` | Deletion instructions (static, mailto) | none | native + retained web (Play external-deletion link) | **TRUE** |

---

**Count check:** 5 + 23 + 10 + 1 + 7 + 6 = **52** routes. Matches the current Next.js route count.

**Open product note (needs owner confirmation before Task 30/32):** `/social-verify` collects
LinkedIn/Instagram handles. The design spec lists "social-account verification" as an *excluded*
concept. Resolve whether this screen ships natively as-is, is reduced to optional non-verifying
profile links, or is dropped. Flagged, not decided here.

---

## Task 31 update (2026-07-24): verified real order + native template mapping

Section B/C above listed screens per-route but did not lock a verified navigation order or an exact
native template. Both are now confirmed against the web reference's actual `router.push`/`nextHref`
targets (not inferred) and compiled into `src/features/quiz/domain/quizDefinition.ts` (`QUIZ_STEPS`,
31 entries: 7 intro + 24 answer-bearing, exactly covering `storage/quizDraftRepository.ts`'s
`ANSWER_KEYS`). **Verified linear order** (quiz-domain portion only — excludes `/name`, which sits
between `/s0` and `/phone` in the web reference but is scoped out here, see below):

```
s0(intro) → name → city → age → ready(intro) → nahh(intro) → social_type → scene → saturday_night
→ hobbies → interests → sweet(intro) → trip → travel_style → connection_mode → event_yes → event_no
→ would_rather → meeting_style → story → connection → red_flags → show_up → rapid_intro(intro)
→ rapid_fire → glorious(intro) → opinions → opinions_why → preferences_intro(intro) → preferences
→ last_question → [connecting / vibe-box, Task 33/34]
```

**Native template per step kind** (`src/features/quiz/screens/templates/`): `IntroTemplate` (7 steps),
`TextInputTemplate` (name, city), `DateInputTemplate` (age), `SingleChoiceCardTemplate` (social_type,
saturday_night, connection — supports the web's "or describe your own" custom-text fallback),
`SingleChoiceListTemplate` (trip, travel_style, connection_mode, would_rather, meeting_style),
`MultiChoiceTagsTemplate` (scene, hobbies, interests, event_yes, event_no, red_flags, show_up,
last_question), `RapidFireTemplate` (rapid_fire — 10 timed A/B pairs, auto-picks on timeout),
`OpinionsTemplate` (opinions — 4 sequential A/B pairs), `PreferencesTemplate` (preferences — 4
sliders via a new `SnapSlider` component: discrete 5-stop tap selector, data-equivalent to the web's
5-snap drag slider; a true drag gesture is a motion-polish upgrade, not a correctness gap),
`VoiceOrTextTemplate` (story, opinions_why — **text-input baseline only**; native voice recording is
Task 33's job per `docs/dependency-compatibility.md`'s blocking audio spike, this template is fully
usable without it).

**Scope decision: `/name` is NOT wired into a screen yet.** In the real web reference, `/name` sits
between `/s0` and `/phone` — i.e. name is collected *before* the phone/OTP/account-creation flow, and
only gets attached to a `quiz_submissions` row once `/phone` calls `POST /api/v1/quiz/start`. Task 30
(already shipped) wired `Landing → Legal → Phone → Otp` directly, skipping both `/s0` and `/name`.
Inserting just those two screens now, without also wiring the `quiz/start` call and submission-id
handoff into `PhoneScreen` (both explicitly Task 32 territory — "implement every quiz screen,
synchronization, and recovery path"), would collect a name with nowhere durable to persist it before
the account exists. Deferred to Task 32 as a single coherent fix (insert s0+name into the pre-auth
flow AND wire quiz/start) rather than a partial patch now. `name` stays defined in `QUIZ_STEPS`
(position 2) so the domain/structural tests already cover it; only its screen wiring is deferred.

**Storage-format normalization:** the web reference stores `hobbies`/`show_up`/`looking_for` as plain
comma-joined strings and the rest as JSON-stringified arrays (a localStorage-serialization artifact).
The native domain normalizes all multi-select answers to real `string[]` values (the encrypted draft
holds actual JS values, no double-serialization needed). **Task 32 must confirm the backend's
quiz-submit payload accepts this shape for those three fields** before wiring submission — the same
kind of check that caught real `UserResponse` drift in Task 29; not assumed here.

---

## Task 32 update (2026-07-24): quiz wired end to end, `/name` correction done

**Storage-format check resolved:** read `app/api/v1/quiz.py` directly — `answers` is stored as opaque
JSONB (`json.dumps(body.answers)`, no Pydantic sub-schema, no per-field shape validation beyond an
age-gate check on `dob`). The array-normalization decision is confirmed safe at the wire-contract
level (no 422 risk) for all three fields. Flagged as a product-level note, not a blocker: the backend
AI-insights worker (consumes this JSONB downstream, outside this native rewrite's control surface)
may have been tuned against the web's comma-string shape for `hobbies`/`show_up`/`looking_for` —
worth a manual check against real AI output quality before Phase 11 cutover, not a code-correctness
gap.

**`/name` correction (previously deferred):** `src/features/auth/screens/QuizIntroScreen.tsx` (s0) and
`NameScreen.tsx` now sit between Legal and Phone in `AuthNavigator`, exactly matching the verified web
order. Both are genuinely local-only (`pendingQuizState.ts`, same encrypted-store pattern as
`pendingLegalAcceptance`) — `PhoneScreen` now calls `POST /quiz/start` (fire-and-forget) storing the
returned `submission_id`; `OtpScreen` flushes both into the real per-user `QuizDraftRepository` via a
new `flushPendingQuizState()` (merges the freshly-typed name with any server-side `prior_session` —
fresh input wins on a name conflict; falls back to a synchronous `quiz/start` if the fire-and-forget
one never landed).

**Full quiz wiring:** `src/features/quiz/quizContext.tsx` (`QuizProvider`/`useQuiz` — one `QuizMachine`
instance per session, flushes the debounced sync on unmount), `src/features/quiz/screens/
QuizStepScreen.tsx` (the registry: one component dispatches every step kind by
`domain/quizDefinition.ts`, no per-step screen files), `src/navigation/QuizNavigator.tsx` (real
resolution: local draft first, else a fresh `quiz/start` reusing the account's phone — matches the web
reference's identical "no dedicated resume-answers endpoint" limitation), `quizSyncService.ts` (thin
wrapper over `/quiz/start|partial|complete|submit|summary|retry`, contract-verified against the live
OpenAPI snapshot), `quizSubmissionService.ts` (finalize-exactly-once: single-flight dedupe on a
double-tap, local validation before any network call).

**Two real bugs found and fixed via these tests, not by inspection:**
1. `PreferencesTemplate`'s per-slider `onChange` sent an in-progress (holey) answers array straight to
   the draft repository on every tap — `boundedValue()` correctly rejects `undefined` array elements,
   so this threw synchronously the moment a user tapped one slider dot. Fixed: in-progress slider
   values now live in `QuizStepScreen`'s own local state; the complete array is sent once, in
   `onContinue`, only once every slider is filled (already gated by the template).
2. `QuizNavigator`'s resolution effect had no `.catch()` — a boot-time `/users/me` failure (offline,
   session hiccup) became an unhandled promise rejection with no recovery path. Fixed: shows a real
   `ErrorState` with retry.

**Verification:** `npm run verify` → exit 0 — **182 Jest tests / 22 suites** (19 new: `quizJourney.test.tsx`
walks the real registry+machine from `city` through `last_question` driving every template kind's
actual UI, asserting the final answers cover every `ANSWER_KEYS` entry and `onQuizComplete` fires
exactly once; `quizRecovery.test.tsx` covers resume-from-draft vs fresh-`quiz/start`, a boot-resolution
failure showing a retryable error, and finalize-failure/404 leaving the local draft intact for retry;
plus `quizSubmissionService.test.ts` and `flushPendingQuizState.test.ts`) + all 4 native verifiers.

**Task 32: complete** except the device-dependent manual checks (TalkBack, large text, slow/offline
network, Android process-recreation) deferred to a device/emulator pass, consistent with every prior
task.

---

## Task 33 update (2026-07-24): native voice answers + durable processing states

**Architecture decision (voice/story vs. the generic registry):** the design spec says "Complex pages
such as voice/story and the result screen remain dedicated feature components," which appears to
conflict with Task 31's registry-only routing of `voiceOrText` steps. Resolved: `VoiceOrTextTemplate.tsx`
was already its own dedicated file (referenced by `step.kind` from the registry, not an inline
template) — Task 33 enhances it in place rather than adding a redundant `StoryScreen.tsx`. The mic
(`VoiceAnswer.tsx`) is additive: it uploads independently of the typed answer and never affects
Continue's validity, preserving Task 31's text-only baseline contract. Confirmed correct by
`VoiceOrTextTemplate.tsx`'s own Task 31 comment, which already anticipated this: "Task 33 adds a mic
affordance alongside this same text field, it doesn't replace it."

**Native voice recording:** `src/services/audio/AudioRecorderAdapter.ts` wraps `react-native-audio-api`
(`AudioRecorder`/`AudioManager`, real API read directly from the package's `.d.ts` files, not guessed)
behind a small `RecorderPort`/`PermissionPort`/`FilePort` seam (same DI pattern as `KeyValueStore`/
`HttpTransport` elsewhere) — permission is requested only from an explicit `requestAndStart()` call
(never proactively), recording always writes an M4A cache file, auto-stops at 120s (matching the
backend's hard duration cap), and is deleted after a successful upload, on cancel, on re-record, on a
native mid-recording error, and when the app backgrounds mid-recording (via the existing
`onAppPhase`/`appLifecycle.ts` pub-sub — no new lifecycle plumbing needed). File deletion needed a
small new dependency (`@dr.pogodin/react-native-fs`, confirmed real/maintained via npm before
installing) since nothing already in the project could delete a cache file.

**Upload:** `src/features/quiz/quizSyncService.ts` gained `uploadVoiceClip()` (multipart `POST
/api/v1/voice`); `apiClient.ts`'s `request()` now detects a `FormData` body and skips JSON-encoding/
Content-Type (RN's fetch sets the multipart boundary itself) — a small extension of the existing
client, not a parallel upload path.

**UI:** `src/features/quiz/components/VoiceAnswer.tsx` — idle/requesting/recording/uploading/success/
error/permissionDenied states (network-transient "uploading→error" and native "recording→error" both
covered; a distinct "stopping" state was collapsed into "uploading" since `stop()` resolves
synchronously enough that a separate state added no observable UI value). `PermissionStatus` only has
3 real values (`Undetermined`/`Denied`/`Granted` — no distinct "permanently denied" signal from the
library itself), so denial handling offers both a re-tap (covers first-denial) and `Linking.openSettings()`
(covers permanent denial) rather than guessing which applies.

**Durable processing state:** `src/features/vibe-report/screens/ProcessingScreen.tsx` replaces
`RootNavigator`'s Task-28 placeholder. Polls `GET /quiz/summary/{id}` via TanStack Query's
`refetchInterval` (exponential backoff 2s→30s, computed from `query.state.dataUpdateCount` — no extra
state needed), and gets background-pause + offline-pause for free from the app's existing
`focusManager`/`onlineManager` bindings (`appLifecycle.ts`/`networkState.ts`, already wired in
`App.tsx` since Task 29) — confirmed by reading `query-core`'s own source, not assumed. The submission
id survives app restart/process death via the same encrypted quiz draft Task 32 already persists (not
cleared on finalize) — no new storage mechanism needed. `status: 'done'` triggers `onComplete()`
(re-resolves boot state from `/users/me`, same pattern as `onQuizComplete`/`onLegalAccepted` — never a
client-side success guess); the backend worker (`quiz_insights.py`) sets `quiz_submissions.status='done'`
and `users.onboarding_state='active'` in the same job, confirmed by reading the worker directly.
`status: 'error'` shows a retry (`POST /quiz/{id}/retry`); a missing local draft (rare: reinstall/
cleared storage mid-processing) shows a recoverable error rather than an infinite spinner.

**Backend hardening (`app/api/v1/voice.py`):** real magic-byte signature sniffing (WebM/EBML,
MP4/M4A `ftyp` box) replaces trusting the client-supplied Content-Type; duration cap raised to a real
enforced 120s (was an implicit 600s DB-sanity clamp); size cap 10MB. **Real bug found and fixed before
it shipped:** the format-sniff check was initially written to run before the ownership/existence
check, which would have changed `test_user_cannot_upload_voice_to_other_users_submission`'s
expected 404 (wrong-user) into a 422 (bad format) for its fake non-signature payload — reordered so
ownership is checked first (also the more correct security posture: a caller probing someone else's
submission ID gets 404 regardless of what garbage bytes they upload, not a format-validation error).
New `tests/test_api/test_voice_formats.py` (7 tests: valid WebM/M4A accepted, unrecognized format
rejected, spoofed Content-Type rejected by signature not header, oversized/too-long rejected, ownership
checked before format sniff). Full backend suite: **283 passed, 4 skipped.**

**Real Windows/Android build-environment gaps found and fixed (Task 33's Step 1 "build spike" is the
literal point of this task — this wasn't a detour):**
1. `react-native-audio-api`'s native build needs prebuilt Opus/FFmpeg static libs fetched by the
   package's own `download-prebuilt-binaries.sh` (via a Gradle `Exec` task wired to `preBuild`) — the
   download succeeded but `unzip` was missing from the WSL Ubuntu distro that Gradle's `Exec` task
   invokes `bash` through on this machine (confirmed via `wsl.exe which unzip` returning nothing).
   Fixed: `wsl.exe -u root apt-get install -y unzip`. Not a code change — a one-time host machine gap.
2. Once binaries downloaded, a second failure: `ninja: error: mkdir(...) No such file or directory`
   building `react-native-audio-api`'s own arm64-v8a target — the app module already pins CMake 4.1.2
   (Phase 7, for ninja's Windows long-path support), but that pin lives in `android/app/build.gradle`
   and only applies to the `:app` Gradle module; `react-native-audio-api` configures its own separate
   autolinked Gradle module and was still resolving AGP's default CMake 3.22.1 (ninja 1.10.2, no
   long-path support), and its deep `node_modules/react-native-audio-api/common/cpp/...` path mirrors
   past ninja's ~260-char limit under that older toolchain. Fixed in `android/build.gradle`: pins CMake
   4.1.2 on `project(':react-native-audio-api')` specifically via `afterEvaluate` (a blanket
   `subprojects {}` hook was tried first and rejected by Gradle — "Cannot run Project.afterEvaluate
   when the project is already evaluated" — because some autolinked module is already evaluated by the
   time root `build.gradle`'s script body runs; scoping to the one project that actually needs it
   avoided the ordering conflict entirely).
3. `gradlew.bat :app:assembleDebug` → **BUILD SUCCESSFUL**, real debug APK produced (264MB). This is
   the literal blocking-spike proof the design spec required before any quiz screen could depend on
   this dependency.

**Verification:** `npm run verify` → exit 0 — tsc + eslint (0 errors) + **220 Jest tests / 27 suites**
(23 new: `AudioRecorderAdapter.test.ts` — 12 tests covering permission-denied, start/stop, 120s
auto-stop, cancel-deletes-file, re-record-deletes-previous-take, background-cancels-and-deletes,
dispose-is-synchronous, native start() failure, native mid-recording error; `processing.test.tsx` — 4
tests covering pending/done/error/missing-draft) + all 4 native verifiers.

**Task 33: complete.** Device-dependent manual checks (real mic grant/deny/permanent-denial on a
physical device or emulator with a working audio input, TalkBack over the recording UI, backgrounding
mid-upload) deferred to a device pass, consistent with every prior task. iOS voice recording remains
explicitly unverified pending Task 42 (owner's Mac + physical iPhone).

**Post-hoc review (2026-07-24):** Task 33 was the one task this session that shipped without an
independent review pass — ran one retroactively. Found and fixed 1 Critical (`VoiceAnswer.tsx` had no
`try/catch` around the recorder start call, so a native failure left the button stuck disabled forever
— no test file existed for this component at all; added `VoiceAnswer.test.tsx`, 7 tests) and 3 Important
issues (backend body-size middleware still capped voice uploads at the old 6MB limit despite the
handler's real 10MB cap; `ProcessingScreen` had no branch for the fetch itself failing, only for a
successful response with a domain-level error status; unmount-mid-upload could race the cache-file
delete against the in-flight upload). See `frinq-backend/docs/launch/execution-ledger.md`'s Task 33
entry for the full breakdown. Now **276 Jest tests / 33 suites**, backend **284 passed, 4 skipped**.

---

## Task 34 update (2026-07-24): collectible Vibe card + full native report

**Contract:** `src/services/api/contracts.ts` gained `InsightItem`, `ShareCardStats`, `ShareCard`,
`DeepSummary`, `VibeReport` — every field checked directly against `app/schemas/quiz.py`'s
`QuizSummaryResponse`/`InsightItem` and, for `share_card`, against the exact dict `app/core/ai/
insights.py`'s `generate_insights()` assembles (not the web's separate, currently-dead `ShareCard.tsx`
component's props shape, which was a red herring — confirmed by reading the real assembly code).
`share_card` is always the same guaranteed shape when non-null (server fills defaults for every field);
`deep_summary` is genuinely freeform/independently-failable (a separate AI call) — typed as all-optional,
rendered defensively, sections omitted (not shown empty) when absent. Added to `verify-contracts.mjs`'s
MANIFEST and `__tests__/verify-scripts.test.js`'s fixture.

**Files:** `vibeReportService.ts` (`loadVibeReport`), `shareVibeCard.ts`, `components/VibeCard.tsx`
(on-screen + a `mode="share"` fixed-size noninteractive composition, both driven entirely by the
server's `share_card` — no local recomputation of stats/descriptions), `components/ReportSection.tsx`
(one generic labeled-section wrapper reused for every content block instead of one bespoke component
per block type), `screens/VibeReportScreen.tsx`, wired into `MainTabs.tsx`'s existing `ProfileStack`
`VibeReport` route (replacing the Task 28 placeholder — `ProfileHome` itself, and the button into this
screen, is Task 35's job).

**New dependencies:** `react-native-view-shot@5.1.1` and `react-native-share@12.3.1` (real versions
confirmed on npm before installing, RN >=0.76/New-Architecture compatible per their own docs).
`react-native-share` auto-merges its own `FileProvider` manifest entry — no manual Android config
needed, confirmed by reading its bundled `AndroidManifest.xml`.

**Architecture decision (dropped the web's reveal ceremony):** the web reference (`vibe-box/page.tsx`)
has a `loading→sealed→opening→whats_next→reveal` tap-to-open ceremony. Native goes straight to
`loading→ready/stale/error` — deliberate, reasoned from Task 34's own file list (no envelope-related
files) and the design spec's phrasing ("collectible shareable hero card plus full sectioned report",
no ceremony mentioned). An independent code review confirmed this reading is reasonable but flagged a
real side-effect riding along with it: the web's `whats_next` mount also fires a one-time
`POST /api/v1/whatsapp/notify/{id}` (a WhatsApp launch-notice message, idempotent server-side). **Open
question for whoever owns the launch/growth flow, not resolved here:** native submissions never trigger
this notice today — confirmed nothing else in the backend or the launch plan fires it for native (the
plan's only other WhatsApp usage is OTP login, Twilio Verify). Needs an explicit decision: wire an
equivalent native call, treat push notifications as its intended replacement, or accept the gap.

**Two real issues found by independent review, both fixed before calling this done:**
1. `archetypeIllustrations.ts`'s `ARCHETYPE_SLUGS` was sourced from `app/core/ai/archetypes.py`'s
   taxonomy dict, but the list actually *enforced* at generation time (`_validate()`'s assertion) is a
   separate, disagreeing frozenset in `app/core/ai/insights.py` — the two backend files have drifted
   from each other (pre-existing, not introduced here), and Task 34 copied the non-authoritative one.
   One entry differs: `archetypes.py` has "Quiet Anchor", `insights.py` (the real gate) has "Glass
   House" instead. Fixed: `ARCHETYPE_SLUGS` now mirrors `insights.py`'s `ARCHETYPES`, and every test
   fixture that used the fictitious "Quiet Anchor" now uses a real archetype ("Soft Anchor"). The
   `archetypes.py` vs `insights.py` disagreement itself is out of Task 34's file list — flagging it here
   as a backend cleanup candidate, not fixing it in this task.
2. `VibeReportScreen.tsx` originally hand-rolled its own `useEffect`/phase-state fetch, inconsistent
   with `ProcessingScreen.tsx` (same folder, same underlying endpoint, built one task earlier) which
   already uses TanStack Query's `useQuery`. Fixed: `VibeReportScreen` now uses `useQuery` with the
   **same** `['quizSummary', submissionId]` query key `ProcessingScreen` uses — landing on the report
   right after processing finishes can reuse that cached fetch instead of re-requesting, and the screen
   gets offline-pause/background-pause for free from the app's existing `focusManager`/`onlineManager`
   bindings, same as every other query-backed screen. This also makes the plan's own Step 6 verify item
   ("offline cached display policy") actually meaningful, where before there was no cache to check.

**Manual, real-device-adjacent verification done in this session (not just unit tests):** built and
installed a real debug APK with both new native modules linked, launched it on the Android emulator via
a temporary preview harness (fixture data injected through a context override, reverted before
finishing — no trace left in the shipped code), and visually confirmed: card layout/typography/spacing,
all report sections in order, tag pills, snapshot rows, closing line. **Tapped the real Share button and
confirmed the actual Android share sheet opens with the correctly-captured card image** — proves
`react-native-view-shot`'s capture and `react-native-share`'s native share intent genuinely work
end-to-end on-device, not just under Jest mocks.

**Verification:** `npm run verify` → exit 0 — tsc + eslint (0 errors) + **241 Jest tests / 27 suites**
(47 in `vibe-report/`: `VibeReportScreen.test.tsx`, `shareVibeCard.test.ts`, `archetypeIllustrations.test.ts`
— including a 24-slug loop confirming every real archetype resolves a fallback without throwing — plus
the pre-existing `processing.test.tsx`) + all 4 native verifiers + a real Android `assembleDebug` build.

**Task 34: complete**, pending the WhatsApp-notify product decision above (not a Task-34-scope blocker)
and the usual device-dependent manual checks (TalkBack, 200% text on a real device, reduced-motion
system setting) deferred to a device pass.

---

## Task 35 update (2026-07-24): native app shell, profile, and settings

**Real screens replace the Task 28 placeholders:** `ProfileScreen.tsx`/`EditProfileScreen.tsx`
(Profile tab), `SettingsScreen.tsx`/`CommunitySettingsScreen.tsx`/`PrivacySettingsScreen.tsx` (Settings
tab, now a real stack, not a flat placeholder), `CommunityPlaceholderScreen.tsx` (Community tab — still
a placeholder for Tasks 37-38, but a real named component per the plan's file list instead of an inline
`<Placeholder>`). Terms/Privacy/Community Rules reuse the existing `LegalDocumentScreen.tsx` (built in
Task 30 for the pre-auth legal gate) rather than new screens — confirmed by real navigation that it
handles all three doc keys correctly when reached from Settings, not just the gate flow. Support and
Delete Account route to inline `Placeholder`s noted "Task 36" (their real screens are explicitly that
task's file list). **Community tab's own suspended/banned/active-membership states are out of scope
here too** — `CommunityPlaceholderScreen` has no logic at all; that gating is Task 37-38's job (their
file list owns the real community screen), not a gap in this task.

**Profile:** `profileService.ts` — `fetchProfile`/`updateDisplayName` (thin `GET`/`PATCH /users/me`
wrappers), `maskPhone` (byte-for-byte port of the web's masking: last-10-digits, `+91` prefix, first
2 + last 2 visible), `mapDisplayNameError` (exact port of the web's 8-code error table). `ProfileScreen`
shows phone (masked)/gender/age/area/community, read-only except the `display_name` edit link — no
quiz-derived field is ever editable. `EditProfileScreen` matches the web's dirty-check
(`value.trim() !== original`), discard-confirm dialog, and "navigate back only after server acceptance"
ordering exactly.

**A real, previously-invisible bug fixed at the shared layer, not just for profile:** `apiClient.ts`'s
`safeCode()` only handled a plain-string `detail` field. FastAPI's actual 422 validation shape is
`detail: [{msg, loc, type}, ...]` — every Pydantic field-validator error across the *entire app*
(not just `display_name`) was silently collapsing to a generic `http_422` code before this fix, since
`display_name`'s validator raises `ValueError(f"display_name_{reason}")`, which Pydantic v2 formats as
`"Value error, display_name_reason"` inside that array. Fixed `safeCode()` to extract and strip that
prefix from the first array entry's `msg` — bounded, still never leaks arbitrary body content, same
security posture as the existing string-`detail` path. New test in `apiClient.test.ts` uses the real
wire shape, not a simplified stand-in.

**Settings:** `communityPreferencesService.ts` (`GET /community/me`, `PATCH /community/preferences`),
`logoutService.ts` (`performLogout`: `POST /auth/logout` best-effort → `coordinator.clear()` →
`queryClient.clear()` → `QuizDraftRepository.clear()` — no explicit navigation call; `coordinator.clear()`
flips `authenticated`, which `App.tsx`'s existing boot-resolver effect already reacts to, same mechanism
every other auth-state change uses). `CommunitySettingsScreen` uses TanStack Query's canonical optimistic-
update pattern (`onMutate`/`onError` with a captured previous value) rather than hand-rolled state.
`PrivacySettingsScreen` is a pure client-side toggle with no backend call, matching the web exactly.

**A real, pre-existing gap fixed as part of building the consent screen:** `AnalyticsConsentProvider`
(`AppProviders.tsx`) was in-memory-only — the toggle silently reset to off on every app restart, unlike
the web's localStorage-backed persistence. Fixed by persisting through the same encrypted store used for
quiz drafts (a non-secret preference, the same category the design spec calls out for that store).
`configureAnalytics()` — the piece that would make `track()` actually send events over the network —
is still never called anywhere in the app; that remains a separate, pre-existing, undone gap (from
Task 30), not fixed here, since wiring it correctly needs real per-screen `page` tracking this task's
file list doesn't cover.

**Independent code review caught one real bug, fixed:** `CommunitySettingsScreen.tsx` rendered a live,
interactive switch (defaulting to "notify: on") even when the initial `GET /community/me` had failed —
a user could toggle from an unvalidated default and fire a `PATCH` from the wrong baseline. Fixed: the
switch only renders once the fetch actually succeeds; a failed fetch shows the error and nothing
interactive. New test covers the GET-failure case explicitly. The review also flagged a missing
navigation-shell test (added: `MainTabs.test.tsx`, exercising tab switching and a nested `LegalDocument`
route with its `doc` param through the real navigator, not a mocked one) and a real switch-thumb-color
bug caught only by the on-device visual pass (Android's default green thumb clashed with the brand
palette — fixed on both toggle screens).

**Real on-device verification:** installed the app on the Android emulator via a temporary fixture-data
preview harness (same technique as Task 34 — a context override reverted before finishing, no trace in
shipped code) and walked the actual screens: tab switching, Profile fields, Edit Profile's dirty/save
flow (confirmed Save enables only once the name actually changes), Settings' full row list, Community
Notifications toggle (including the fixed cream-colored thumb), Delete Account's Task-36 placeholder,
and Terms of Service via the reused `LegalDocumentScreen`.

**Verification:** `npm run verify` → exit 0 — tsc + eslint (0 errors) + **268 Jest tests / 32 suites**
(new: `profile.test.tsx`, `profileService.test.ts`, `settings.test.tsx`, `analyticsConsent.test.tsx`,
`MainTabs.test.tsx`, plus one new `apiClient.test.ts` case) + all 4 native verifiers. No new native
dependencies this task, so no Android rebuild was required — confirmed the existing Task 34 debug build
still runs this JS/TS-only change correctly.

**Task 35: complete.** Device-dependent manual checks (TalkBack across Profile/Settings, 200% text,
reduced-motion) deferred to a device pass, consistent with every prior task.

---

## Task 36 update (2026-07-24): native legal documents, support, and account deletion

**Legal hub replaces Task 35's interim direct links:** `LegalHubScreen.tsx` collapses the three separate
Settings rows for Terms/Privacy/Community Rules into one "legal" entry. Shows current acceptance date
for Terms/Privacy (from `UserResponse.terms_accepted_at`/`privacy_accepted_at` — Community Rules has no
separate per-user acceptance to show, matching the backend's actual legal-gate schema). Each document
gets two actions: "view in app" (reuses the existing `LegalDocumentScreen.tsx` from Task 30's pre-auth
gate — no new content screen needed) and "read online" (`Linking.openURL` to the real public site,
never an embedded WebView, per the design spec). New `WEB_BASE_URL` config constant (`https://frinq.in`,
placeholder pending Task 41 like `API_BASE_URL`'s prod value).

**A real UI bug caught only by the on-device visual pass, not by any test:** the two action buttons
("view {document} in app" / "read {document} online") are long enough with the document name included
(needed for unique per-row accessibility labels — three identical "view in app" buttons is bad for
screen readers) that laid out side-by-side they overflowed the screen width, cutting off "read Terms of
Service online" entirely. Fixed by stacking the actions vertically instead of in a row — this is exactly
the kind of thing unit tests (which don't lay out real pixel widths) can't catch; caught by literally
looking at the screen on the emulator.

**Support:** `SupportScreen.tsx` is a near-exact native port of `frinq-frontend/app/support/page.tsx` —
same placeholder support email (`support@frinq.in`, `mailto:` link via `Linking.openURL`), same links to
account deletion and each legal document. Draft-copy treatment matches the legal documents.

**Account deletion:** `AccountScreen.tsx` is a small landing page (never delete on one accidental tap
from the main Settings list) that leads into `DeleteAccountScreen.tsx`'s real
`confirm → otp_sent → type_delete` flow — `requestDeletionOtp`/`verifyDeletionOtp`/`deleteAccount` in
`deleteAccountService.ts` wrap the existing Phase-6-built backend endpoints
(`POST /auth/reverify/request`, `POST /auth/reverify/verify`, `DELETE /users/me`) exactly; no new
backend work needed, confirmed by re-reading `app/api/v1/auth.py`/`users.py` directly rather than
trusting the plan's description. Reuses `OtpField`/`TextField` and the exact resend-cooldown pattern
already established by the login `OtpScreen`.

**A real correctness decision, reasoned from reading the actual backend code, not guessed:**
`consume_reauth_token` runs *before* the deletion transaction even starts (`users.py:80-97`) — so a
reauth token is burned the instant `DELETE /users/me` is called, whether or not the deletion itself
succeeds. On a delete failure, retrying with the same token is therefore guaranteed to fail with 401
"reverification required" — there is no safe retry path except requesting a brand-new OTP. Implemented
accordingly: a delete failure resets the flow all the way back to `'confirm'` (not to `'type_delete'`,
which would tempt a doomed retry with the stale token), with an explanatory error message. This is more
conservative than the research summary's read of the web page's behavior, which appeared to reset only
to `type_delete` — reasoned as a genuine improvement given the token's real single-use semantics, not
just a difference for its own sake.

**Shared cleanup extracted:** logout and deletion both need identical local teardown (coordinator
clear + query cache clear + quiz draft clear) — pulled into a new `localSessionCleanup.ts`, reused by
both `logoutService.ts` (which also calls `POST /auth/logout` first) and the deletion flow (which
doesn't, since the server already revoked all sessions as part of the DELETE transaction).

**Real, previously-undetected privacy-copy inaccuracy found and fixed on the public web side:**
`frinq-frontend/app/privacy/page.tsx`'s data-inventory table claimed anonymous usage analytics events
are "deleted" when an account is deleted. Reading `app/api/v1/users.py`'s deletion handler and
`app/api/v1/tracking.py`'s insert path together shows this isn't what actually happens: deletion's
cleanup only removes `tracking_events` rows matching the account's phone number, but analytics events
are inserted with `session_id`/`page`/`action` only — no phone column is ever populated for that path.
Analytics rows are therefore never touched by account deletion; they're simply unlinkable to any
account from the moment they're created (no FK, no phone). Fixed the copy to say "kept, never linked to
your account" instead of "deleted" — a factual correction using the page's own established phrasing
(matches the neighboring "kept, unlinked from you" rows), not new legal language. `delete-account/page.tsx`
and `support/page.tsx` were checked too and already accurately describe the real native flow — no
changes needed there.

**Verification:** native `npm run verify` → exit 0 — tsc + eslint (0 errors) + **286 Jest tests / 35
suites** (new: `deleteAccount.test.tsx` — 6 tests covering OTP-bound-to-stored-phone, incorrect/expired
code mapping, typed-DELETE gating, successful deletion + full local cleanup, and the no-retry-with-stale-
token behavior; `legalHubAndSupport.test.tsx` — 4 tests) + all 4 native verifiers. Backend: **284
passed, 4 skipped** (Phase 6's existing `test_legal_deletion.py`, 19 tests, re-confirmed still passing
unchanged — no backend code needed for this task). Public web (`frinq-frontend`): lint clean (0
errors), **48 vitest tests passed**, `next build` succeeds with the privacy-page fix.

**Real on-device verification:** same temporary preview-harness technique as Tasks 34/35 (reverted
before finishing). Walked Settings → Legal (confirmed acceptance dates + the overflow bug + its fix) →
Support → Account → Delete Account's confirm step and OTP-entry screen (layout, copy, and the 30s resend
cooldown all confirmed correct). OTP box *entry* itself wasn't re-confirmed via automated input this
pass — a known `adb input`-vs-custom-multi-segment-field friction, not an app defect — but the identical
`OtpField` component is already shipped and working in the real login flow, and the delete flow's own
OTP-handling logic is directly exercised by `deleteAccount.test.tsx`'s real `fireEvent.changeText` calls
against the actual component tree.

**Task 36: complete.** Device-dependent manual checks (TalkBack, 200% text, reduced-motion, a real
disposable-account deletion journey on a physical device/emulator against a live backend) deferred to a
device pass, consistent with every prior task. Phase 9 gate items (24 archetypes, share-artifact privacy,
Community/Profile/Settings guards, phone/ID exposure, legal/support/deletion reachability, public
legal-site verification) are now all satisfied by Tasks 34-36 together.
