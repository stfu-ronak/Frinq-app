# Frinq Bare React Native Mobile Design

**Status:** Approved direction; implementation starts only from the revised Phase 7 in the launch plan.

**Date:** 2026-07-23

**Supersedes:** The Capacitor/native-shell direction in Phase 7 and later sections of `../plans/2026-07-22-frinq-global-mobile-launch.md`.

## Goal

Replace the consumer Capacitor launch path with a true native iOS and Android
application built using bare React Native. Preserve the completed FastAPI,
PostgreSQL, Redis/ARQ, community, moderation, admin, legal, and deletion
contracts. Preserve the existing Next.js consumer application as the behavior
reference until native parity is accepted, then retain only its public legal,
support, and deletion-information pages.

## Approved Decisions

| Area | Decision |
|---|---|
| Native runtime | Bare React Native Community CLI; no Expo runtime |
| Rendering | Native React Native views; no WebView screens |
| Project location | New parallel `frinq-mobile/` directory |
| Cutover | Keep `frinq-frontend/` runnable until native parity |
| Consumer web after cutover | Public Terms, Privacy, Community Rules, Support, and deletion information only |
| Product behavior authority | Current `frinq-frontend/` plus FastAPI contracts |
| Visual authority | Screenshots and extracted artwork under `App/Figma/` |
| Screenshot scope | Visual examples only; they do not add matching, DMs, location matching, gender, pronouns, or social verification |
| Type | Borel display headings and organization-licensed Vastago Grotesk body/UI |
| Palette | Maroon `#621507`, cream `#FFFBF7`, peach `#FFE8D6`, brown `#3C2110` |
| Motion | Playful and purposeful, with reduced-motion support |
| Device scope | Portrait-first phones; safe centered tablet compatibility layout |
| Minimum OS | iOS 15.1 and Android API 24 |
| Build targets | iOS 26 SDK and Android compile/target API 36 |
| Offline model | Resilient online: encrypted quiz draft and automatic resume/sync; no claim of offline OTP, voice upload, processing, or chat |
| Chat | Community-thread layout, not private-message bubbles or a social feed |
| Vibe result | Collectible shareable hero card plus full sectioned report |
| Theme | One brand-controlled cream/maroon theme; no separate dark theme |
| Telemetry | Existing allowlisted first-party product events plus redacted crash reporting; no replay |
| Accessibility | Accessibility wins over pixel-perfect screenshot geometry |
| Push | Included, explicit opt-in, generic, throttled, mute-aware, and fully removable |
| Existing native users | None; this is a clean native launch |
| iOS verification | One consolidated Mac/Xcode/physical-iPhone gate after feature completion |

## Non-Goals

- Expo, Expo Router, EAS-only runtime dependencies, or Expo prebuild.
- Capacitor, Ionic, a locally served website, or any WebView application shell.
- Reusing Tailwind/CSS components in React Native.
- Reimplementing the obsolete Express/Prisma/matching proposal in
  `App/Figma/plan.txt`.
- Direct messages, matching, user photos, events, payments, presence, typing
  indicators, reactions, threads, or read receipts.
- A second server API or direct client access to Supabase.
- A tablet-specific product experience for the first release.
- Full offline quiz completion or durable offline chat.

## System Architecture

```text
frinq-mobile/
├── android/                         Native Android project
├── ios/                             Native iOS project
├── src/
│   ├── app/                         Composition root, providers, boot state
│   ├── navigation/                  Root, onboarding, quiz, and main navigators
│   ├── design/
│   │   ├── tokens/                  Color, type, spacing, radius, elevation, motion
│   │   ├── components/              Accessible native UI primitives
│   │   ├── icons/                   Reviewed SVG/icon components
│   │   └── motion/                  Shared animation and haptic recipes
│   ├── features/
│   │   ├── auth/
│   │   ├── legal/
│   │   ├── quiz/
│   │   ├── vibe-report/
│   │   ├── community/
│   │   ├── profile/
│   │   └── settings/
│   ├── services/
│   │   ├── api/                     Typed HTTPS client and contract models
│   │   ├── session/                 Rotation coordinator and boot restoration
│   │   ├── realtime/                Ticketed WebSocket state machine
│   │   ├── push/                    Permission, token, and deep-link lifecycle
│   │   ├── audio/                   Optional voice recording and upload
│   │   └── telemetry/               Allowlisted events and redacted crashes
│   ├── storage/                     Keychain/Keystore and encrypted draft storage
│   └── assets/                      Optimized illustrations and licensed fonts
└── tests/                            Unit, component, contract, and journey tests
```

The FastAPI service remains the sole authority for identity, legal acceptance,
onboarding state, quiz ownership, durable AI processing, archetype assignment,
community membership, profile data, chat, moderation, sessions, push
registration, and deletion. React Native owns presentation, navigation,
device-local draft recovery, and native device integrations.

## Runtime and Dependency Direction

- React Native `0.86.x`, TypeScript, Hermes, and the New Architecture.
- React Navigation `7.x` with native stack and bottom tabs. React Navigation 8
  remains prerelease and is not used.
- Reanimated `4.6.x`, Worklets `0.12.x`, Gesture Handler `3.x`, and native
  haptics for motion that stays off the JavaScript thread.
- Safe Area Context `5.x` and a compatible native keyboard controller.
- TanStack Query `5.x` for server-state caching, connected to React Native
  `AppState` and NetInfo. Do not persist sensitive query caches.
- NetInfo `12.x` for reachability and reconnection signals.
- `react-native-keychain` `10.x` for the refresh token and local encryption
  key. Access tokens remain in process memory.
- `react-native-mmkv` `4.x` with an encryption key stored in
  Keychain/Keystore for bounded quiz drafts and non-secret preferences.
- React Native Firebase messaging and Crashlytics for native push delivery and
  redacted operational crash reports. Firebase Analytics is not enabled.
- React Native Audio API `0.12.x` for optional foreground-only voice
  recording. Compatibility with React Native 0.86 must pass a foundation
  build spike before quiz UI work depends on it.
- React Native SVG for line motifs and small vector icons; optimized PNG
  assets for supplied illustrations.
- View Shot plus native Share for the Vibe card image.

Every dependency is resolved to an exact lockfile version during its task.
Packages must support the New Architecture, Android 16 KB pages, iOS 15.1,
Android API 24, and current store SDKs. A failed compatibility spike blocks
dependent work; it does not justify switching to Expo or a WebView.

## Design System

### Visual language

The native system derives from the supplied references:

- generous cream negative space;
- deep maroon full-screen milestone states;
- peach action surfaces;
- thin maroon outlines;
- rounded capsules and large rounded cards;
- Borel editorial/display copy;
- Vastago Grotesk controls and body copy;
- hand-drawn arrows, waves, and line illustrations;
- occasional high-energy pink/orange gradients only for quiz milestones.

The full-screen PNG references are never used as screen backgrounds. Screens
are reconstructed with native layout, text, controls, SVG motifs, and extracted
illustrations so text scaling, screen readers, keyboard avoidance, safe areas,
and different phone sizes continue to work.

### Font licensing record

Borel includes the SIL Open Font License and can be bundled with its notice.
On 2026-07-23, the product owner confirmed that the organization purchased
Vastago and that its developer supplied this font folder specifically for
building the app. Vastago is therefore approved for the native application;
no fallback substitution is required. Record this owner confirmation in the
asset provenance manifest and bundle any notice required by the
organization's license. Keep purchase records, license keys, and commercial
order details out of Git unless the owner explicitly approves a sanitized
license notice for inclusion.

### Component families

- `Screen`: safe-area-aware background, width cap, scroll/keyboard policy.
- `BrandHeading`: Borel typography with explicit accessible text.
- `BodyText`: Vastago roles with platform-safe line height.
- `ArrowButton` and `PrimaryButton`: at least 48 dp high.
- `TextField`, `PhoneField`, `OtpField`, and `DateField`.
- `ChoicePill`, `ChoiceCard`, `ChoiceListRow`, and `TagPicker`.
- `QuizHeader`, `QuizProgress`, `RapidFireTimer`, and `OfflineBanner`.
- `Sheet`, `Dialog`, `Toast`, `EmptyState`, `ErrorState`, and `Skeleton`.
- `VibeCard`, `ReportSection`, `CommunityMessage`, `MessageComposer`, and
  `MessageActionSheet`.

Components expose semantic state (`disabled`, `selected`, `busy`, `error`)
rather than accepting arbitrary colors. Screen files compose primitives and
do not duplicate token values.

### Motion contract

- Quiz choices use press scale, selection fill, and a short haptic.
- Screen content may use staggered fade/translate entrances.
- Milestones may animate illustrations, waves, or gradients.
- Navigation uses native-stack gestures and transitions.
- Community chat and data-entry screens remain calm; new messages do not
  trigger large motion.
- All indefinite motion pauses while backgrounded.
- Reduced-motion users receive crossfades or immediate state changes without
  losing information.
- Animations do not delay taps, network submission, or screen-reader focus.

## Navigation and State Flow

The root navigator is selected only after session restoration:

```text
Boot
├── AuthRequired -> LegalAcceptance -> Phone -> OTP -> Quiz
├── QuizInProgress -> restored quiz route
├── ProfileProcessing -> processing / retry
├── Active -> MainTabs
├── Error -> retry / support
└── BannedOrSuspended -> support / logout
```

`MainTabs` contains Community, Profile, and Settings. The Vibe card and full
report are reachable from Profile. Legal documents and deletion help remain
reachable before authentication and from Settings.

Navigation is driven by server onboarding state, not by a persisted “complete”
flag. A deep link or push tap waits for boot/session/legal/membership checks
before entering its destination.

## Sessions, Storage, and API Access

- `SessionCoordinator` owns the in-memory access token, the secure refresh
  token, one shared refresh promise, token rotation, logout, and terminal auth
  failure.
- `ApiClient` adds the bearer access token, retries one request once after a
  successful coordinated refresh, and never retries a second 401 or arbitrary
  validation errors.
- Refresh-token rotation is persisted before retrying the original request.
- Logout, ban, deletion, or refresh reuse clears secure storage, encrypted quiz
  state, query state, WebSocket state, and push registration as applicable.
- Error objects expose safe codes and request IDs, never tokens, phone
  numbers, quiz text, voice paths, or message content.

The encrypted draft stores only the current submission ID, schema version,
last safe route, bounded structured answers, and sync metadata. It excludes
access/refresh tokens, voice bytes, AI output, chat, and analytics. Server
partial-save responses remain authoritative. Draft migrations are explicit;
unknown future versions are quarantined and the user is offered a safe restart
instead of parsing untrusted data.

## Offline and Lifecycle Behavior

- NetInfo drives a global offline banner and pauses queries/mutations that
  require connectivity.
- Quiz answers are saved locally first, then debounced to the owned partial
  endpoint. Reconnect resumes synchronization with the same submission ID.
- OTP, final submission, voice upload, Vibe generation, and chat clearly state
  that a connection is required.
- Unsent chat messages live only for the active process and keep their original
  `client_message_id` during retry.
- Backgrounding stops timers/indefinite motion, closes or suspends realtime
  after a grace period, and stops the microphone. Resume refreshes session and
  membership before reconnecting.
- Android Back closes transient UI first, then navigates. Unsaved form/draft
  boundaries require confirmation.

## Feature Design

### Auth, legal, and quiz

The screenshots define the visual treatment for splash, phone, OTP, name,
single choice, multi-choice, tag selection, rapid-fire, and milestone screens.
The existing web flow defines which screens and answer keys actually ship.
Fields shown only by the obsolete matching proposal are not added.

Quiz pages are implemented through a small set of tested native templates and
a typed screen registry. Complex pages such as voice/story and the result
screen remain dedicated feature components. This preserves the existing order
and copy without maintaining 38 unrelated implementations of layout,
navigation, persistence, and accessibility.

### Vibe result

The result starts with a collectible hero card containing the canonical
archetype name, approved illustration, short descriptor, and Frinq identity.
It is rendered natively and captured at a fixed share-safe size only when the
user requests sharing. The on-screen card remains responsive and accessible.

Below the card, the complete server report is shown in labeled editorial
sections with loading, processing, exhausted-retry, and stale-result states.
The app never invents or locally assigns an archetype.

### Community chat

Chat uses a community thread rather than private left/right bubbles. Messages
show author context, group consecutive posts, reveal timestamps/actions on
demand, and use a restrained ownership accent for the current user. The
virtualized list is bounded, cursor-paginated, and maintains scroll position
when older messages load.

The composer is keyboard-safe and plain text only. Report and block are
available from every eligible message. The UI omits links, Markdown, media,
reactions, read receipts, typing indicators, and public presence.

### Profile, settings, legal, and deletion

Profile shows the immutable archetype/report identity and the editable safe
display name. Settings exposes community mute, notification opt-in, analytics
consent, Terms, Privacy, Community Rules, Support, logout, and deletion.
Deletion requires the existing fresh-OTP re-verification flow and explicit
confirmation, then removes local credentials and returns to the signed-out
root.

## Push and Telemetry

Push permission is never requested on first launch. After community value is
visible, an in-app explanation offers Not now and Enable notifications. Push
content is generic, membership-validated on tap, suppressed for active/muted
users, throttled server-side, and cleaned up on logout, ban, or deletion.

Product analytics use the existing explicit-consent allowlist. Native
Crashlytics is operational telemetry only: disable automatic screen/content
capture, redact custom keys, and never attach phone, tokens, messages, reports,
quiz answers, voice data, or push tokens. Session replay and Firebase Analytics
are not included.

## Accessibility

- 48 dp preferred minimum touch targets.
- Dynamic Type/font scaling and Android font scaling without clipped actions.
- Screen-reader names, roles, selected/busy/error states, and logical focus.
- Focus moves to screen heading or first error at navigation/submission.
- Sufficient text/control contrast in every token combination.
- Reduced motion, high-contrast system setting checks, and no color-only state.
- Keyboard-safe input/composer behavior and hardware-keyboard traversal.
- Decorative line art is hidden from accessibility APIs.

## Testing and Delivery

Windows continuously verifies TypeScript, ESLint, Jest, React Native Testing
Library, API-contract fixtures, backend tests, Android debug/release builds,
and Android emulator/device journeys. Visual state tests cover each component
family without treating fragile full-screen snapshots as the only assertion.

iOS is not claimed as built or verified on Windows. After feature completion,
one consolidated Mac session performs clean install, CocoaPods, Debug build,
Release archive, physical-iPhone installation, complete user/safety journey,
voice, push, lifecycle, accessibility, and artifact checks. Failures return to
implementation and require a repeated final gate.

## Cutover

1. Build `frinq-mobile/` in parallel.
2. Prove native parity against a written route/behavior matrix.
3. Complete Android automated/device checks.
4. Complete the consolidated iOS gate.
5. Freeze the native release candidate.
6. Reduce `frinq-frontend/` to the public legal/support/deletion surface.
7. Remove Capacitor dependencies and code from the retained web project.
8. Submit only the React Native iOS and Android binaries.

No public deployment, secret/provider mutation, store upload, or rollout occurs
without explicit owner authorization at that step.
