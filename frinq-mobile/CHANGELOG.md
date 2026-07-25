# Changelog

All notable changes to the Frinq mobile app, in [Keep a Changelog](https://keepachangelog.com/)
style. This is the mobile app's own changelog — `frinq-backend`, `frinq-frontend`, and `frinq-admin`
ship from the same monorepo and the same frozen revision (see `store/release-checklist.md`), but each
is a continuously-deployed web service, not a discretely-versioned store release, so this file tracks
the mobile app specifically.

## [1.0.0] — release candidate (Task 48, not yet tagged/shipped)

First release candidate. No prior version has shipped to a store — this is the initial submission.

### Added

- **Onboarding**: WhatsApp/SMS OTP sign-in (Twilio Verify), Terms/Privacy acceptance gating account
  creation, ~30-question quiz with an optional spoken-answer path (typed answer always required and
  primary; voice is additive, never a replacement).
- **AI-generated Vibe report**: archetype/insights generation from typed quiz answers (voice is never
  sent to a third-party AI provider — verified in code, not assumed), durable background processing
  survives app close/process death.
- **Community**: automatic placement into a small group chat by quiz-archetype similarity (not
  geography, not swiping/matching/DMs), real-time chat with report/block/mute, load-older history
  pagination, reconnect-safe optimistic sends (no duplicate messages on a reconnect after a dropped
  send — closed a real gap during Task 45's release-journey audit).
- **Moderation**: report queue, ban/suspend with immediate live-connection termination, an emergency
  chat-disable kill switch for when no moderator is available to work the queue.
- **Profile & settings**: editable display name (quiz-derived fields stay read-only), notification/
  privacy-analytics preferences (analytics off by default, consent-gated), legal document access,
  support contact.
- **Account deletion**: fresh-OTP re-verification + typed confirmation before a real hard delete;
  in-app and without-the-app (web) paths both documented and working.
- **Push notifications**: code-complete on both client and server (registration, preferences,
  community-entry opt-in prompt, mute suppression, active-socket suppression) — **not yet live**,
  paused pending the owner's real Firebase project credentials (tracked since Task 39).
- **Accessibility**: screen-reader roles/names/state across every interactive control, WCAG AA
  contrast, 200%-text-scale support (including a real fix for 5 screens that couldn't scroll at large
  text), touch-target minimums, reduced-motion support, native modal focus (via the platform's real
  `Modal`, not custom JS).
- **Security & privacy hardening**: security response headers, rate limiting (fail-closed on OTP/
  WS-ticket, fail-open elsewhere), production-config boot guard, a pattern-based secret scanner, redacted
  structured logging, a redacted mobile crash reporter (no backend wired yet), request-ID correlation.
- **Observability**: liveness/readiness health endpoints, minimum-viable metrics (requests, OTP/quiz/
  chat/push outcomes, queue age, DB pool saturation), three operational runbooks (incident response,
  moderation, provider outage) plus deploy/rollback and backup/restore runbooks and a release
  smoke-test script.
- **Legal**: Terms, Privacy, Community Rules, Support, and account-deletion-information pages —
  **DRAFT-marked placeholder copy**, not yet reviewed by counsel; must be replaced before general
  availability (tracked since Task 24).

### Known gaps at this release candidate (not defects — tracked, not silently dropped)

- **iOS**: built and code-complete, but has not been through its consolidated device/Xcode-archive
  verification gate (Task 42) — requires a physical Mac + iPhone, unavailable in the primary dev
  environment. Do not treat Android-only verification as sufficient for an iOS submission.
- **Push notifications**: not live pending real Firebase credentials (Task 39).
- **Real device matrix**: an API-24-class Android device, a physical phone, and a signed iPhone pass
  are still outstanding (Task 45).
- **Staging/backup rehearsal**: the plan's real load-test scale, PITR-restore-into-isolated-DB
  rehearsal, and staging-rollback rehearsal all require a dedicated staging environment/Supabase access
  this project doesn't have yet (Task 47) — the tooling for all three is built and ready.
- **Legal copy**: placeholder, not counsel-reviewed (Task 24).

[1.0.0]: https://github.com/dhairya2003vashishtha/Frinq-app
