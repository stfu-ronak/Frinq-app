# Emulator Test Accounts, Admin Question Editor, and Gemini Provider

## Goal

Provide a repeatable local emulator workflow for the mobile app, backend, and admin console; make question editing practical on a laptop and mobile-sized viewport; and add Google Gemini/Gemma as a first-class provider for both insight/vibe-card generation and deep-summary generation.

## Scope

### Local test accounts

The development emulator uses three explicit test phones and the shared OTP `123456`:

| Phone | Role | State after login |
|---|---|---|
| `8000000001` | reset/onboarding account | Previous quiz, profile, AI results, community membership, messages, voice clips, and sessions are cleared in one transaction before a fresh session is created; the account starts at the first onboarding question. |
| `8000000002` | chat account A | Seeded active in `quiet-storm`; quiz/profile state and messages persist. |
| `8000000003` | chat account B | Seeded active in `quiet-storm`; quiz/profile state and messages persist. |

The bypass is limited to the configured test phone list and is ignored in production. The reset behavior is an internal login hook, not a public reset endpoint. Production boot validation must reject test-phone bypass configuration.

The seed command must be idempotent and must not delete unrelated rows. It should create/update the two stable chat accounts and prepare the reset account without making the reset account active.

### Admin question editor

The questions page becomes a responsive draft editor:

- On laptop/desktop, a compact ordered question list remains visible on the left and the selected question editor appears on the right.
- On narrow/mobile layouts, the editor stacks below the list.
- Each list item has a native grab handle for reordering.
- Edits and order changes are local draft state until one Save action.
- Save presents a Confirm/Cancel dialog, then sends one atomic payload containing question edits and order.
- Routine question saves require the existing admin bearer authentication and backend validation, but not the action password. The action password remains required for destructive actions and model configuration changes.
- The backend validates serialized question drafts and commits the complete question configuration atomically.

### Provider and model configuration

The admin panel can independently switch the provider/model for:

1. `insights`: hero card, archetype, tags, and insight fields.
2. `deep_report`: the longer “know more” summary.

Each generation job snapshots both selected configurations before making provider calls. A later admin change affects only jobs that have not started. Existing OpenAI and Claude behavior remains supported.

The Gemini/Gemma catalog includes:

- `gemma-4-31b-it`
- `gemini-3.5-flash-lite`
- `gemini-3.1-flash-lite`
- `gemini-3.6-flash`

Gemini 3.x uses the current Interactions API with structured JSON output. Gemma 4 uses the documented GenAI `generateContent` path, with strict JSON extraction and the same server-side normalizer used by the other providers. Gemini requests omit deprecated sampling parameters for the latest models.

The provider adapter must preserve:

- PII scrubbing before external calls.
- The existing insight and deep-summary prompt contracts.
- Schema validation, character limits, archetype validation, and safe fallback handling.
- Retry behavior for malformed or transient responses.
- Per-call usage and cost logging, including model snapshots.

### Model connection and generation checks

The admin model panel exposes a test action for each available model and generation step. The action uses a fixed PII-free fixture answer set and the real production prompts, then reports:

- provider and model;
- latency;
- response parsing/schema status;
- normalized vibe-card fields;
- normalized summary text/tags;
- a safe error category without raw user/model content in logs.

The check is allowed to make a provider call only when that provider key is configured. Unit tests cover the adapter and normalization without network access. Live smoke checks cover each configured provider/model when keys are available.

## Runtime design

Add a local Compose configuration for Postgres, Redis, backend, and admin with health checks and explicit development-only environment wiring. The React Native app runs in the Android emulator using the backend host mapping (`10.0.2.2` for the standard Android emulator) while Metro/native tooling remains in the existing mobile project.

The runtime verification sequence is:

1. Start Compose services and wait for health endpoints.
2. Run migrations and seed the three test accounts.
3. Start/open the Android emulator and run the mobile app.
4. Log in with `8000000001` and verify the first question is shown after repeated logins.
5. Log in with `8000000002` and `8000000003`, send messages in the shared community, and verify persistence after reload.
6. Open admin chat browsing and verify messages are grouped by community and identifiable user without exposing auth secrets.
7. Switch the insights and deep-report models independently in admin, run connection checks, and complete one real seeded generation for every configured provider key.

## Security checks

- Test OTP bypass is exact-phone and non-production only.
- No reset endpoint is exposed.
- Reset operations are transactionally scoped to the test account and child rows.
- Admin requests still require the bearer admin key; model and destructive actions retain the action password.
- Admin credentials remain in session storage/headers and never in URLs.
- Provider keys stay backend-only and are never returned to the mobile/admin client.
- Run the existing secret scanner, production boot-guard tests, admin security tests, CORS/origin checks, and dependency health checks.
- Review Compose configuration for unintended host exposure and ensure logs redact phones, tokens, keys, raw answers, and model output.

## Verification

Before claiming completion, run the relevant backend tests, mobile verification suite, admin lint/build, Compose health checks, account reset/chat persistence smoke checks, and live provider checks when keys are present. Report unavailable external dependencies explicitly rather than marking them passed.

## References

- [Google Gemini latest models](https://ai.google.dev/gemini-api/docs/latest-model)
- [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Run Gemma with the Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api)
