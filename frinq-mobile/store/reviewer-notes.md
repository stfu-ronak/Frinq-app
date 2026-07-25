# Frinq — App Store / Play Console Reviewer Notes

**STATUS: DRAFT** — accurate about how the app actually works today; the specific review-account
values must be set as real production secrets before submission (never committed here).

## Signing in as a reviewer

Frinq has no email/password login — only WhatsApp/SMS OTP (Twilio Verify). The backend already has a
purpose-built reviewer bypass for exactly this situation (`app/core/otp.py`'s `_review_bypass_allowed`):

1. Before submission, set three production environment variables on the backend:
   - `REVIEW_PHONE` — a real-looking but non-production phone number reserved for reviewers
   - `REVIEW_OTP` — a fixed numeric code (e.g. `123456`) reviewers enter instead of a real SMS code
   - `REVIEW_OTP_EXPIRES_AT` — an ISO-8601 timestamp no more than 30 days out; the bypass **fails
     closed automatically** once this passes or if any of the three values is unset — it cannot be
     accidentally left enabled indefinitely.
2. Give the reviewer: "Enter `REVIEW_PHONE` on the phone-number screen, then `REVIEW_OTP` as the code."
   No real SMS/WhatsApp message is sent for this number — the bypass short-circuits delivery entirely.
3. This account behaves like any other — reviewers can complete the real quiz, reach a real (AI-
   generated) Vibe report, and enter a real community chat with other seeded/real users.

## What reviewers will see, screen by screen

Landing → legal acceptance (currently DRAFT-marked placeholder legal copy, Task 24 — real counsel-
reviewed text replaces it before general availability, not blocking review) → phone/OTP → ~30-question
quiz (a couple of screens offer an optional spoken-answer recording; typing is always the primary,
required path — the mic never blocks progress) → processing (a short AI-generation wait, polls a
job status) → Vibe report (an archetype summary + shareable card) → main app: Community (real-time
group chat, report/block/mute available on any other member's message), Profile, Settings (notification
preferences, privacy/analytics opt-in — off by default, legal documents, support, account deletion).

## Things that may look unusual without context

- **No swiping, no 1:1 matching, no DMs.** Frinq places each user into a small group chat with people
  who scored similarly on the quiz — it is not a dating app and has none of that surface area.
- **Microphone permission** is requested only after a user actively taps the mic on one of two specific
  quiz questions — never on launch, never for any other purpose.
- **Push notification permission** (once Task 39 ships) is requested only after a user taps "enable
  notifications" in a one-time community-entry prompt — never on launch.
- **Account deletion** requires a fresh OTP re-verification (a 5-minute single-use token) even though
  the user is already signed in — this is intentional (a stolen/left-open session alone can't delete
  the account), not a bug in the flow.

## Known, deliberate scope gaps (not defects)

- iOS is built and code-complete but has not yet had its consolidated device/Xcode-archive gate (Task
  42, requires a physical Mac + iPhone) — if this reaches review before that gate, flag it explicitly
  rather than treat prior Android-only verification as sufficient for an iOS submission.
- Push notifications are code-complete on both client and server but not yet wired to real Firebase
  credentials (Task 39, paused pending the owner's Firebase project) — if review happens before that,
  the notification-preferences screen will be present but non-functional; say so rather than let a
  reviewer discover it.
