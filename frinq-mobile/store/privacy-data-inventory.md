# Frinq — Privacy Data Inventory (Task 41 Step 4)

Built from reading the actual backend/mobile code paths, not from a generic template — every row below
traces to a specific file. Feeds both Apple's App Privacy questionnaire and Play's Data Safety form.
Copy/documentation work, same "clearly marked, checked against real code" treatment Task 25 gave the
public web privacy page's own data table.

| Field | Purpose | Processor | Retention | On account deletion | Store privacy category |
|---|---|---|---|---|---|
| Phone number | Login (OTP via WhatsApp/SMS), account identity | Twilio Verify (OTP delivery), Supabase Postgres (storage) | Until deletion | Row deleted (`DELETE /users/me`); a later signup with the same phone creates a fresh account | Contact Info — linked to user |
| Display name | Public profile shown to other community members | Supabase Postgres | Until deletion | Deleted with account | Identifiers — linked to user |
| Quiz answers (city, DOB/age, preference selections, typed free-text) | Generate the AI archetype/insights report; matched community placement | Supabase Postgres (storage); **OpenAI and Anthropic APIs** (insight/archetype generation from typed text only — see note below) | Until deletion | Cascades with the owning `quiz_submissions` row | Other Data / User Content — linked to user |
| Voice recordings (Story + Opinions-Why questions, optional) | User's own spoken answer, stored for moderation review only | Supabase Postgres (`voice_clips.audio_data`, BYTEA) | Until deletion | Cascades transitively via `quiz_submissions` | Audio Data — linked to user |
| Community chat messages | Real-time community chat | Supabase Postgres, Redis (transient pub/sub only, not persisted there) | Until the user deletes the message or the account | `user_id` set NULL on deletion (message history is preserved for other participants, unlinked from the deleted account) | User Content — linked to user while account exists, unlinked after deletion |
| Push notification token (Task 39, not yet live) | Deliver push notifications for new community activity | Firebase Cloud Messaging, Supabase Postgres (encrypted token + HMAC lookup hash) | Until logout/uninstall/token invalidation | Cascades with the account (`push_tokens.user_id ON DELETE CASCADE`) | Device ID / Identifiers — linked to user |
| Anonymous usage analytics (screen views, quiz progress milestones, chat activity — allowlisted event names only) | Product analytics | Supabase Postgres (`tracking_events`) | Not linked to any account at write time (no FK, no phone column) — see note | Not touched by deletion (nothing to unlink — see note | Usage Data — **not linked** to user (opt-in, off by default) |
| Session/refresh tokens | Keep the user signed in | iOS Keychain / Android Keystore (device-local only, never leaves the device except as an opaque bearer value over HTTPS) | Until logout or expiry | Revoked as part of the deletion transaction | Not collected by Frinq's servers as a stored personal record — an auth artifact, not profile data |
| Crash/error reports (Task 46, no backend wired yet) | Diagnose app crashes/handled errors | Whatever crash backend is configured (`configureCrashReporter`) — currently none; a no-op until a Crashlytics config exists | Whatever the eventual crash backend's own retention is (not this app's data) | Not linked to an account at all — no user/phone/session identifier is ever attached, see note below | Crash Data — **not linked** to user |

**Voice content is never sent to a third-party AI provider.** Traced directly in code
(`app/api/v1/voice.py`, `app/api/v1/admin.py`): the only reads of `voice_clips.audio_data` are
admin/moderation endpoints (playback, review, listing) — there is no code path forwarding raw audio to
OpenAI or Anthropic. The AI insights pipeline (`app/core/ai/insights.py`) only ever receives the
**typed** text answer from the same quiz question (`VoiceOrTextTemplate`'s text-input baseline, which
the mic is additive to, never a replacement for — confirmed in the Task 33 ledger entry). Get this
distinction right in the actual store listings: voice is collected and stored, but not "shared with"
an AI vendor; only typed text is.

**Analytics events carry no phone/message/quiz-answer content** — reconfirmed from
`app/api/v1/tracking.py`'s insert path and the allowlist in `docs/route-parity-matrix.md`. Consent is
off by default (`PrivacySettingsScreen.tsx`), gates every event, and can be revoked at any time with
immediate effect.

**Crash reports carry only an allowlisted field set** (`frinq-mobile/src/services/telemetry/
crashReporter.ts`, built Task 46): app version, build number, OS family, device performance CLASS
(never the raw device model — a fingerprinting vector), screen identifier (route name only), lifecycle
state, network class, and a sanitized error code. Every string value — including the error code itself
— is scrubbed against phone-number/bearer-token/JWT/PEM-key patterns before it can leave the module
(`scrubText()`), and forbidden-named fields (phone, any token, message/report/quiz/voice/profile/
community content, raw request/response bodies) are dropped entirely regardless of value — proven with
planted secrets/content in `crashReporter.test.ts`, not just asserted. No backend is wired yet (default
is a no-op) — this row exists so the disclosure is ready the moment a real Crashlytics config lands,
not backfilled after the fact.

## What Frinq does NOT collect

Location, camera/photos, contacts, precise device advertising ID, health data, financial data,
biometric identifiers (voice is stored as audio, not processed into a biometric voiceprint). No data
is sold. No cross-app/cross-site tracking (`NSPrivacyTracking = false` in `PrivacyInfo.xcprivacy`).

## Reconciliation still needed before submission

This inventory is accurate as of the code that exists today. Two things still need a real pass before
filling out Apple/Play's actual forms:
1. **Xcode's own Required-Reason-API scan** (Task 42, Mac-only) may surface something this
   code-reading pass missed — `PrivacyInfo.xcprivacy` already carries a note to reconcile then.
2. **Once Task 39's Firebase push goes live**, Firebase/Google Play Services' own data collection
   (device identifiers, diagnostic data per Firebase's own privacy manifest) needs to be added to
   Play's Data Safety form and Apple's App Privacy questionnaire — those are Google's/Apple's
   disclosures for their own SDKs, not this app's, but the store listing must still declare them.
