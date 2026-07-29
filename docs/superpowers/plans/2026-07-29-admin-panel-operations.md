# Admin Panel Operations Implementation Plan

> Execute this plan in a separate implementation session. Keep the current emulator, backend, admin, Metro, and Redis processes running.

## 1. Baseline and contracts

Inspect the existing admin page shell, analytics/submissions routes, tracking events, community WebSocket protocol, event-related mobile navigation, AI worker, model configuration, and usage logging. Record current response shapes and add contract tests before changing them.

Deliverable: a short baseline test matrix and typed API contracts shared by backend/admin/mobile where practical.

## 2. Backend analytics and system health

Extend the Admin analytics service with bounded aggregate metrics for users, sessions, funnel stages, retention/cohorts, community engagement, event views/clicks/registrations, and AI outcomes. Add a search-scoped per-user endpoint that composes Journey events and safe user activity without returning raw sensitive content by default.

Add a protected health/observability endpoint that reports dependency status, latency, timestamps, WebSocket connectivity, Firebase telemetry configuration, and AI primary/fallback state. Keep liveness/readiness endpoints lightweight and avoid putting secrets or raw provider responses in logs.

Tests: authorization, date ranges, empty data, pagination/bounds, PII redaction, dependency failure, cache expiry, and slow dependency behavior.

## 3. Firebase Analytics transport

Add the mobile Firebase Analytics dependency and wire the existing consent-gated telemetry service to it. Keep the event allowlist, add stable non-phone user/session correlation where appropriate, and document which events are sent to Firebase versus retained only on the backend. Add analytics initialization/error handling that never blocks login, quiz, or chat.

Tests: consent off/on, event allowlist, initialization failure, no sensitive properties, offline behavior, and duplicate-event prevention.

## 4. Users and Journey UI

Separate Users data fetching from the page-wide dashboard fetch. Add a visible-tab 10-minute timer, manual refresh, last-updated state, cancellation of stale requests, and hidden-tab pause/resume behavior. Improve Journey with session grouping, milestone labels, and a search-scoped loading/error/empty state.

Tests: fake timers for the ten-minute interval, no unrelated requests, hidden-tab behavior, manual refresh, stale-response protection, and user isolation.

## 5. Events backend and Admin UI

Create the event persistence/migration and protected CRUD routes. Validate registration URLs, image references, text lengths, dates, ordering, and publish transitions. Add public published-event reads with cache headers/versioning. Replace the Campaigns navigation entry and RSVP-oriented view with an Events manager showing upcoming, live, completed, and archived sections.

Tests: CRUD authorization, publish transitions, ordering, date boundaries, invalid URLs, oversized content, archived visibility, and public endpoint filtering.

## 6. Events mobile timeline

Add the mobile Events tab/timeline using the published-event contract. Render image, name, quote, details, dates, and Register action. Open only validated external registration URLs. Add targeted cache invalidation and a safe stale-cache fallback for offline use.

Tests: upcoming/past ordering, unpublished filtering, link handling, empty state, image failure, offline cache, and update invalidation.

## 7. Community realtime reliability

Review the existing mobile WebSocket reconnect/recovery path and add an Admin realtime subscription or narrowly scoped polling fallback. Ensure message persistence precedes broadcast, reconnects resume from a cursor/version, duplicate messages are de-duplicated, and community summaries update without page-wide reloads.

Tests: reconnect, missed messages, duplicate delivery, ordering, Redis outage, unauthorized subscription, and high-message-volume behavior.

## 8. Unified AI generation and failover

Replace the current separate hero/deep-report orchestration with one structured generation contract containing the full summary and vibe card. Add one primary and one fallback model configuration, validation/test-generation before activation, bounded retries, cooldown state, periodic primary recovery probes, and normalized errors.

Update usage logging and Admin Model Config to show active route, fallback state, calls, success/failure, tokens, latency, estimated cost, and provider quota availability. Ensure no raw model output or secrets are logged.

Tests: valid combined output, malformed output, transient failure, permanent primary failure, fallback success/failure, recovery, timeout, token accounting, and concurrent requests.

## 9. Targeted invalidation and performance

Introduce query-level caching/invalidation for Admin and mobile resources. Refresh only the resource that changed. Use bounded server queries, indexes for event dates/status, analytics time ranges, user lookup, and Journey events. Add request cancellation and optimistic UI only where rollback is reliable.

Measure Admin initial load, Users refresh, event publish-to-mobile visibility, community message delivery, and AI generation latency before and after the changes.

## 10. Security and verification

Run authorization tests and a focused security review covering admin routes, event URLs, PII in analytics, log redaction, WebSocket tickets, rate limits, CORS, cache isolation, and provider key handling. Run backend tests, admin lint/typecheck/build, mobile typecheck/tests/lint, secret scan, and `git diff --check`. Verify the live emulator, direct backend/admin services, Metro, and Docker Redis without stopping them.

Completion requires evidence from the verification commands and a manual smoke test of Users auto-refresh, Events publish/register flow, community realtime delivery, and primary-to-fallback AI behavior.
