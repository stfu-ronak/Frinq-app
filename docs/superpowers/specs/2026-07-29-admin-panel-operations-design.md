# Admin Panel Operations, Analytics, Events, and AI Design

## Status

Approved for implementation planning. No application code is changed by this design.

## Objective

Make the Admin panel fast, operationally useful, and safe to use while keeping the existing mobile, backend, admin, emulator, and Redis services running. The work covers analytics, user refresh behavior, realtime community visibility, event management, unified AI generation, and targeted mobile cache updates.

## Product decisions

### Analytics and privacy

The Analytics page has two layers:

1. Product analytics: aggregate users, sessions, quiz funnel, completion/drop-off, retention/cohorts, community activity, event views/clicks/registrations, and AI generation outcomes.
2. System health: frontend/API availability, database readiness and latency, Redis readiness and latency, WebSocket status, Firebase configuration/telemetry status, and AI-provider health.

Aggregate data is shown by default. Detailed user activity is available only after an admin searches for a specific user. Phone numbers, raw quiz answers, conversation text, and other sensitive content are not sent as Firebase Analytics properties.

Firebase Analytics will be added as a consent-gated, allowlisted event transport. Backend tracking remains the source of truth for exact per-user operational timelines and audit data; Firebase is used for product trends and cohort analysis.

### Users refresh

The Users tab owns its data query. While visible, it refreshes automatically every 10 minutes without admin interaction. It also has a manual Refresh button, last-updated timestamp, and subtle loading/error state. It does not refresh Analytics, Community, Events, or Model Config. Auto-refresh pauses while the tab is hidden and resumes when it becomes visible.

### Journey

Journey remains a per-user event timeline searched by phone or name, but its presentation and data contract should support a useful journey view: ordered events, session grouping, page/action labels, funnel milestones, and timestamps. It is not a replacement for aggregate Analytics.

### Community

The existing community UI remains. Mobile continues to use WebSocket chat. Admin receives persisted messages and community metadata through a realtime channel or equivalent targeted update mechanism. Reconnects must recover missed messages; persistence happens before broadcast.

### Events

Campaigns is replaced in the Admin navigation by Events. Events are a collection, not a single active record. Admin can create and edit events containing:

- Main image
- Name
- Quote
- Details/body text
- Registration URL
- Start date/time
- End date/time
- Display ordering
- Draft/published/archive state

The Admin timeline separates upcoming, live, completed, and archived items. Mobile displays published upcoming and recent past events in timeline order. The Register button opens the configured external registration URL. Invalid or unsafe URLs are rejected by the backend.

### Unified AI generation

There is one active primary model for all generation. A single structured generation call receives the prompt insights and user answers and returns both the complete user summary and vibe card. Admin selects the primary provider/model and a validated fallback provider/model.

Failure behavior:

1. Retry transient primary failures with bounded backoff.
2. If the primary remains unavailable, temporarily route generation to the fallback.
3. Record the failure, fallback activation, provider, model, latency, token counts, and error category.
4. Probe the primary periodically and restore it only after a successful test generation.
5. If no validated model is available, show a recoverable generation-delayed state; never display malformed or partial output.

The Admin panel displays measured application usage immediately: calls, successes, failures, fallback calls, input/output tokens, latency, and estimated cost. Provider-side remaining quota is displayed only when the provider exposes a supported quota API; otherwise the UI labels it unavailable rather than implying a false quota.

### Instant updates and consistency

Use targeted realtime invalidation rather than global polling. Published event changes, relevant configuration changes, and community messages should reach the mobile app promptly. A quiz configuration is snapshotted when a quiz session starts, so an active quiz cannot change underneath a user. New sessions use the latest published configuration.

## Proposed data and API boundaries

Add or extend backend contracts for:

- Aggregate analytics and time-series metrics.
- Search-scoped user analytics and Journey data.
- Dependency health and uptime snapshots.
- Event CRUD, publish/unpublish, ordering, and public published-event reads.
- Unified AI configuration, failover state, generation tests, and usage metrics.
- Realtime invalidation/event versions for mobile and admin clients.

All Admin endpoints require the existing admin authentication. Event write operations validate URLs, image references, dates, and content size. Analytics responses are bounded and paginated where user/event data could grow.

## Acceptance criteria

- An admin can understand aggregate product activity and service health from the Admin panel.
- A searched user has a privacy-scoped timeline and journey view without exposing unrelated users.
- Users refresh automatically every 10 minutes only while the Users tab is visible, with manual refresh still available.
- Firebase Analytics receives only consented, allowlisted events after explicit transport wiring.
- Admin can create, publish, reorder, edit, and archive multiple events; mobile renders the published timeline and opens registration links.
- New community messages appear promptly in mobile and Admin, including after reconnect.
- One configured primary AI model generates the complete summary and vibe card in one structured response.
- Primary failures use the validated fallback and are visible in usage/health reporting.
- Active quiz sessions remain stable while future sessions receive updated configuration.
- Security checks cover authorization, PII exposure, URL validation, rate limits, and log redaction.

## Out of scope

- Replacing the existing community visual design.
- Sending raw conversations or quiz answers to Firebase Analytics.
- Guaranteeing provider quota visibility when a provider does not expose it.
- Hot-swapping questions inside an already-started quiz.
- Rebuilding the mobile app’s entire navigation or design system.
