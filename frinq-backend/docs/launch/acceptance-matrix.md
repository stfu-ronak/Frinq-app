# Frinq Final Acceptance Matrix (Task 52)

**This is a scaffold, not a signed matrix.** Every row's "Evidence in this repo" column links to real,
already-verified work (tests that ran, docs that were written, endpoints that were curled) — that part
is factual and current as of this writing. The "Approver" and "Signed" columns are deliberately blank:
this plan requires a named human accountable for each area, and an agent cannot stand in for that
accountability — filling those in is the one thing this document cannot do for you. A blank row blocks
public release unless the accountable owner documents why they're waiving it and accepts the risk, per
the plan's own wording.

| Area | Required evidence | Evidence in this repo (verify still holds before signing) | Approver (name) | Signed (date) |
|---|---|---|---|---|
| Product scope | Beta inclusions/exclusions and truthful store copy | `frinq-mobile/CHANGELOG.md`'s "Added"/"Known gaps" sections; `store/metadata/en-IN.md` (still DRAFT-marked) | | |
| Identity | Bundle IDs, names, icons, versions, signing | `in.frinq.app` locked since Phase 7 (`verify-native-config.mjs`); `store/release-checklist.md`'s version table (1.0.0 / versionCode 1 / MARKETING_VERSION 1.0) | iOS and Android owners | |
| Backend | Migrations, API tests, worker tests, health | 406 backend tests passing (Task 47 ledger entry); migrations current through `015_legal_and_deletion.sql`; `/health/live`+`/health/ready` live-verified against a real server (Task 46 ledger entry) | Backend owner | |
| Sessions | Rotation, replay revocation, logout, ban | `SessionCoordinator.test.ts`; `refresh_reuse_detected_total` metric + `rotate_session`'s reuse-detection test (Task 46); `admin.py`'s suspend/ban endpoints force-close live connections immediately | Security owner | |
| Quiz | Resume, durable job, retry, one canonical community | `quizRecovery.test.tsx`; ARQ-backed `generate_quiz_insights` with `quiz_job_wait_seconds`/`quiz_jobs_total` metrics (Task 46); `assign_user_to_community`'s one-community-ever guarantee (raises on reassignment) | Product and backend owners | |
| Chat | Persistence, two-instance delivery, reconnect, rate limits | `persist_before_publish` (insert-before-publish, never publishes uncommitted); `CommunitySocket.test.ts` + `chatSafety.test.tsx`'s reconnect-without-duplicate proof (Task 45's real fix); `chat_send`/`chat_send_minute` rate limiters | Backend and mobile owners | |
| UGC safety | Rules, filter, report, block, moderation staffing | `app/core/moderation.py`; `safetyActions.test.tsx`; `docs/runbooks/moderation.md`'s staffing policy + `CHAT_DISABLED` kill switch (Task 46/47) | Trust and safety owner | |
| Privacy | Data inventory, consent, disclosures, deletion | `store/privacy-data-inventory.md` (reconciled through Task 48, includes the Task 46 crash-report addition); `PrivacySettingsScreen.tsx`'s off-by-default consent gate; `deleteAccount.test.tsx` + `accountDeletion.test.tsx`'s real cross-module boot-resolution proof (Task 45) | Privacy/legal owner | |
| Accessibility | Automated report and real-device checks | `frinq-mobile/docs/accessibility-checklist.md` (Task 40/45); `device-test-matrix.md`'s real on-device TalkBack/200%-text pass — **real device matrix still incomplete** (API-24 device, physical phone, iOS all outstanding, Task 45) | QA owner | |
| iOS | TestFlight matrix and App Store fields | **Not started** — Task 42's Mac/Xcode gate blocks this entirely; Task 49 is 100% Apple-account/Mac-dependent, nothing to verify from this environment | iOS release owner | |
| Android | Closed-test matrix, pre-launch report, Play fields | Task 50 Step 2's local build validation (`gradlew lintRelease bundleRelease testReleaseUnitTest`, see execution ledger) — **closed testing with real opted-in testers not started**, needs Play Console access | Android release owner | |
| Operations | Alerts, backup restore, load, rollback, incident drill | `docs/runbooks/{incident-response,moderation,provider-outage,backup-restore,deploy-rollback}.md`; `smoke_release.py`/`load_chat.py` live-verified locally (Task 47) — **real staging-scale load/restore/rollback rehearsals not started**, no dedicated staging tier exists | Operations owner | |
| Territories | Provider/legal/store availability review | `store/territory-review.md` (India-only recommended, Task 41, reconfirmed unchanged at Task 48) | Business/legal owner | |

## Phase 13 Gate checklist (from the plan)

- [ ] Apple approved the exact iOS candidate, rollout healthy at 100% of approved territories — **blocked, Task 42/49**
- [ ] Google approved the exact Android candidate, rollout healthy at 100% of approved territories — **blocked, Task 50 Steps 3-5 need Play Console + real testers**
- [ ] Production native apps, public web, admin, API, worker, PostgreSQL, Redis, OTP, AI, moderation, and push paths are healthy — **not deployed to production yet, Task 51**
- [ ] Legal/support/deletion URLs public and match both store declarations — legal copy is still DRAFT (Task 24), URLs exist but content isn't final
- [ ] Seven-day launch report signed, no active stop condition — **not applicable until Task 51 actually runs**

## Why this exists in this form

Task 52 says "a blank or waived row blocks public release unless the accountable owner documents the
reason and risk acceptance" — that's a human governance step, not a technical one. This scaffold exists
so that step is fast and evidence-backed when the real people who own each area are ready to sign, rather
than either (a) leaving them to reconstruct "what evidence exists for Sessions" from scratch, or (b) an
agent fabricating names/dates against rows nobody has actually reviewed.
