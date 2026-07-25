# Frinq Release Candidate Checklist (Task 48)

One traceable build whose binaries, disclosures, screenshots, and backend version match — this is the
single document that ties versions, revisions, and disclosure evidence together for sign-off.

## Step 1 — Frozen versions

| Component | Version | Notes |
|---|---|---|
| Mobile app (`frinq-mobile`) | **1.0.0** | `package.json`; first release candidate, no prior store release |
| Android | versionCode **1**, versionName **1.0** | `android/app/build.gradle` |
| iOS | CURRENT_PROJECT_VERSION **1**, MARKETING_VERSION **1.0** | `ios/FrinqMobile.xcodeproj/project.pbxproj` |
| Backend (`frinq-backend`) | **1.0.0** | `app/main.py`'s `FastAPI(version=...)` |
| Public frontend (`frinq-frontend`) | **1.0.0** | `package.json` |
| Admin (`frinq-admin`) | **1.0.0** | `package.json` |
| Git revision (all four — single monorepo, one commit covers everything) | **PENDING** | This repo had ~250 changed/new files still uncommitted as of Task 48 (everything since Tasks 39-47). The owner is committing this history directly (their explicit choice when asked, rather than having an agent construct the commit history) — fill in the resulting commit SHA here once that's done. **Any code or configuration change after that point invalidates this candidate** and requires re-running the checks below against the new commit. |
| Migrations | Highest applied: `015_legal_and_deletion.sql` | `frinq-backend/migrations/` — no migration newer than this exists as of Task 48 |
| Worker | Same commit as backend (single `arq` process, `app.workers.queue.WorkerSettings`, same repo) | — |

**Do not tag or push this candidate without the owner's explicit, separate authorization** — standing
project rule, and the plan's own Step 1 wording ("Do not create a tag or push without owner
authorization").

## Step 2 — Data inventory reconciliation

`frinq-mobile/store/privacy-data-inventory.md` — reconciled this task against everything shipped since
Task 41 first wrote it. One real addition: crash/error-report data (Task 46's `crashReporter.ts`,
allowlisted fields only, no backend wired yet). Every other row confirmed unchanged against current
code. Two items still explicitly need a real pass before filling out Apple/Play's actual forms (Xcode's
Required-Reason-API scan, and Firebase's own SDK disclosure once push/crash-reporting backends go
live) — see that file's own "Reconciliation still needed" section.

## Step 3 — UGC safety evidence

`frinq-mobile/store/reviewer-notes.md` — reviewer sign-in procedure (OTP bypass, fails closed
automatically), full screen-by-screen walkthrough, community-rules acceptance, report/block/mute entry
points, moderator workflow (`docs/runbooks/moderation.md`), support contact, ban/suspend capability.
Added this task: an operational caveat that `OTP_REQUESTS_DISABLED` (Task 47's kill switch) would also
block the reviewer's bypass login if flipped during an active review window — coordinate before using
it during a review period.

## Step 4 — Territory approval

`frinq-mobile/store/territory-review.md` — recommends India-only for the initial release (OTP delivery,
`ncr_zone` field, `.in` domain, single-locale copy all point the same direction), standard-encryption
export-compliance exemption confirmed for both platforms. Unchanged since Task 41 — nothing shipped
since then affects phone-number format, locale, or encryption. **This is a business decision for the
owner to confirm or override, not a final answer from this checklist.**

## Cross-reference: everything already verified for this candidate

- Backend: 406 tests passing (`docs/launch/execution-ledger.md`'s Task 47 entry).
- Mobile: 469 tests passing, tsc clean, eslint 0 errors, 5 native verifiers passing (Task 46 entry).
- Frontend: 7 unit tests + 33 Playwright tests (including axe accessibility scans) passing (Task 45
  entry).
- Admin: lint + build clean (Task 46 entry, last time it was touched/re-verified).
- Live-verified (not just unit-tested): health endpoints, structured logging with redaction, metrics,
  the chat-disable kill switch, `smoke_release.py`, and `load_chat.py` — all against a real restarted
  local server (Task 46/47 entries).

## Open items before this candidate can actually ship (not this checklist's job to close)

1. **The git revision above** — owner is committing directly; fill in the SHA once done.
2. **iOS device/Xcode-archive gate** (Task 42) — needs a physical Mac + iPhone.
3. **Firebase push credentials** (Task 39) — needs the owner's Firebase project.
4. **Real device matrix** (Task 45) — API-24 Android device, physical phone, signed iPhone.
5. **Staging load/backup/rollback rehearsals** (Task 47) — needs a dedicated staging tier + Supabase
   restore access.
6. **Counsel-reviewed legal copy** (Task 24) — current Terms/Privacy/Community Rules are DRAFT-marked
   placeholders.
7. **Real store metadata values** — `store/metadata/en-IN.md` (Task 41) has draft copy; screenshots
   haven't been captured against this exact frozen build yet (can't be, until iOS is verified and the
   git revision above is filled in).
