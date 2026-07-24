# Frinq Global Mobile Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking. Execute one numbered task at a time. Stop at every phase gate for review and fresh verification.

**Goal:** Ship Frinq as a stable, secure, English-language iOS and Android social app that can be downloaded in all App Store and Google Play territories approved by the product owner, service providers, and legal review.

**Architecture:** A new bare React Native application in `frinq-mobile/` renders the consumer experience with native iOS and Android views. FastAPI owns OTP authentication, rotating sessions, the durable quiz-to-archetype pipeline, profile data, community membership, WebSocket chat, moderation, account deletion, and push registration. PostgreSQL is the system of record, Redis/ARQ provides durable jobs, rate limits, WebSocket tickets, and cross-instance fan-out, a separate Next.js admin app provides internal moderation, and the existing Next.js consumer frontend remains the behavior reference until it is reduced to public legal/support pages after native parity.

**Tech Stack:** React Native 0.86.x Community CLI, React, TypeScript, Node.js 22.11+, Hermes, React Native New Architecture, React Navigation 7, Reanimated 4.6, Android minSdk 24 / compileSdk 36 / targetSdk 36, iOS 15.1+ built with the iOS 26 SDK and current Xcode 26, Next.js 16.2.6 for public legal pages and the separate admin app, Python 3.12, FastAPI 0.115, asyncpg, PostgreSQL/Supabase, Redis 5, ARQ 0.25, Firebase Cloud Messaging/Crashlytics, and Twilio Verify WhatsApp OTP.

## Revision Status — 2026-07-23

- The product owner reports Phases 0-6 complete. Treat those phases as historical implementation context and verify their current code/tests before starting new work; do not re-execute or undo them.
- The working tree contains uncommitted Phase 6 implementation and untracked design/font assets. Preserve all of it. Establish a reviewed baseline before Phase 7 without staging, committing, or discarding unrelated work.
- Phase 7 and every later phase in this revision supersede the former Capacitor launch path.
- The approved design is `../specs/2026-07-23-frinq-bare-react-native-design.md`.
- The coding-agent entrypoint and change guide is `../../launch/react-native-rewrite-handoff.md`.
- New implementation begins at Phase 7 only and creates `frinq-mobile/` in parallel. `frinq-frontend/` remains runnable until the cutover task explicitly changes it.

## Approved Product Scope

The public launch contains:

- WhatsApp OTP account login.
- Existing 38-step quiz and optional voice answers.
- Durable AI Vibe Report generation.
- One canonical archetype and one community per active user.
- Community, Profile, and Settings tabs.
- Text-only real-time community chat.
- Message history, reconnect, report, block, content filtering, admin deletion, and user banning.
- Terms acceptance, community rules, privacy controls, account deletion, and support contact.
- Opt-in, muted-by-default-until-requested, throttled push notifications.
- iOS and Android store builds and production rollout.

The public launch does not contain:

- Events or payments.
- Direct messages.
- Chat media or file attachments.
- Presence indicators.
- Message reactions, mentions, threads, or read receipts.
- User-uploaded avatars.
- Editable quiz questions.
- Speculative message virtualization.
- Matching or meetup expansion.

These exclusions are deliberate. Add them only through a separately approved design and plan after launch.

## Global Constraints

- Work from F:\Project\Test\FrinqFull\Frinq with access to frinq-backend, frinq-frontend, frinq-admin, App/Figma, and the new frinq-mobile directory created in Phase 7.
- `frinq-mobile/` is the only production consumer native application. Create it with the React Native Community CLI. Do not install Expo, Expo Router, Capacitor, Ionic, or a WebView app shell.
- `App/Figma/New folder/` screenshots and `App/Figma/Assets/` are the visual authority only. They must not introduce matching, direct messages, location matching, gender/pronoun collection, or social-verification behavior from the obsolete `App/Figma/plan.txt`.
- `frinq-frontend/` is the behavior/copy/API reference through native parity. Do not remove or broadly refactor it during the parallel build. After the native gates pass, Task 43 reduces it to public Terms, Privacy, Community Rules, Support, and deletion-information pages.
- Preserve existing user changes and untracked files. The untracked frinq-frontend/FRINQ_PROJECT_ANALYSIS.md belongs to the user.
- Preserve the untracked `App/Figma/Assets/`, `App/Figma/New folder/`, and font directories. Before copying them into the native app, inventory provenance, optimize duplicates, and obtain permission to add them to source control.
- Never output, copy, log, or commit values from .env files.
- The superseded plan contains an exposed credential. Treat it as compromised, never repeat it, and require external rotation before any production deploy.
- Never commit .env, Firebase service-account JSON, GoogleService-Info.plist, google-services.json, APNs keys, signing certificates, keystores, provisioning profiles, or store credentials.
- Use npm ci in verification and deployment. Package-lock.json is authoritative.
- Before changing Next.js code/configuration, follow frinq-frontend/AGENTS.md and read the relevant versioned guide under frinq-frontend/node_modules/next/dist/docs/; do not rely on older Next.js conventions.
- Use React Native 0.86.x with Hermes and the New Architecture. Use React Navigation 7; React Navigation 8 is prerelease and is not approved for this launch.
- Use Node.js 22.11 or newer, JDK 21, Android SDK/build tools 36, Android minSdk 24, compileSdk 36, targetSdk 36, iOS deployment target 15.1, and an App Store submission build made with the iOS 26 SDK/current Xcode 26.
- Render every consumer screen with React Native native views. Do not use WebView, HTML, CSS, `dangerouslySetInnerHTML`, or a bundled static-site runtime in `frinq-mobile/`.
- App identifier and Android applicationId are in.frinq.app.
- User-facing production traffic is HTTPS/WSS only.
- The app is 18+; date/age validation is enforced server-side, not only through UI copy.
- English is the only supported launch language. Worldwide distribution means availability, not localization.
- All model calls continue through app/core/ai/pii.py. Chat moderation must not bypass the PII rule by sending raw chat messages to an LLM.
- The canonical community key is the 24-value slug from app/core/ai/archetypes.py, never the display-name spirit_animal value.
- A user becomes active only after the AI result and community membership are committed successfully.
- Access tokens live only in memory. Native refresh tokens use Keychain/Keystore via the approved secure-storage adapter. Encrypted quiz drafts use a separate key stored in Keychain/Keystore. Public web pages do not persist a native session.
- WebSocket URLs never contain a long-lived access or refresh token.
- React Native `Text` renders chat as plain text. Do not add HTML/Markdown rendering for user content.
- Destructive account and moderation actions require explicit confirmation and server authorization.
- Store release is blocked until report, block, filter, account deletion, privacy policy, community rules, and support contact all work.
- Do not claim iOS build or device verification from Windows. iOS verification requires macOS, Xcode 26+, and a physical iPhone.
- The owner approved one consolidated Mac/Xcode/iPhone validation session after native feature completion. Until Task 42 passes, every report must say that iOS remains unverified. An iOS failure reopens the affected task and requires the consolidated gate to be repeated.
- Do not commit, push, deploy, rotate secrets, or submit store builds unless the user separately authorizes those external actions.
- Command convention: start each mixed-repository command block from F:\Project\Test\FrinqFull\Frinq and use Push-Location/Pop-Location exactly as shown. A backend pytest block runs from frinq-backend; native npm/Gradle blocks run from frinq-mobile; retained public-web blocks run from frinq-frontend; admin-only npm blocks run from frinq-admin. Check Get-Location before a destructive or deployment command.
- The native design uses Borel for display headings and Vastago Grotesk for body/UI text. Borel's OFL notice must ship. On 2026-07-23, the owner confirmed that the organization purchased Vastago and its developer supplied the font folder for building this app. Vastago is approved for the native binary; record that confirmation and any required notice in the asset manifest without committing commercial purchase records or license secrets.
- Use one brand-controlled theme: maroon #621507, cream #FFFBF7, peach #FFE8D6, and brown #3C2110, with tested accessible state colors. No separate dark theme is in launch scope.
- Accessibility outranks pixel-perfect screenshot geometry: support screen readers, reduced motion, large text, sufficient contrast, logical focus, and 48 dp preferred touch targets.
- Product analytics stay explicit opt-in through the existing allowlist. Native crash reporting is redacted operational telemetry; Firebase Analytics and session replay are not approved.

## Current Baseline to Re-Verify at Phase 7

- Git history contains committed Phase 1-5 checkpoints; the product owner reports Phase 0-6 complete.
- The working tree currently contains extensive modified and untracked Phase 6 files. They belong to the user and must be reviewed and preserved.
- `frinq-frontend/` currently contains 52 Next.js routes, including the 38-step quiz, auth/session routing, Vibe report, community chat, profile, settings, legal, support, and deletion flows.
- `frinq-frontend/package.json` still contains Capacitor packages and browser-oriented dependencies. They remain temporarily because the web app is the parity reference; they are removed only during Task 43.
- No production `frinq-mobile/` directory exists in the current checkout.
- `App/Figma/New folder/` contains 26 804x1748 visual references and `App/Figma/Assets/` contains extracted art. These directories are currently untracked.
- Borel, Motive, Urbanist, and Vastago font folders are currently untracked under `frinq-frontend/public/fonts/`.
- Borel includes an OFL license. The owner confirmed organization-owned Vastago app rights on 2026-07-23; the current font folder was supplied by its developer for this app.
- `app/core/ai/archetypes.py` contains the 24 canonical slugs. The native app must never derive community membership from display names or screenshot concepts.
- `app/core/ai/openai_client.py` uses httpx directly; do not add the OpenAI Python SDK.
- Before Phase 7 code, rerun backend, frontend, and admin verification from the preserved working tree and record exact commands/counts in the execution ledger.

## Final Runtime Contracts

### Authentication

POST /api/v1/otp/verify returns:

~~~json
{
  "verified": true,
  "access_token": "<15-minute JWT>",
  "refresh_token": "<session-uuid>.<random-secret>",
  "user": {
    "id": "<uuid>",
    "onboarding_state": "quiz_in_progress",
    "community_slug": null
  },
  "prior_session": null
}
~~~

POST /api/v1/auth/refresh accepts:

~~~json
{ "refresh_token": "<session-uuid>.<random-secret>" }
~~~

and rotates the refresh secret, returning a new access/refresh pair. Reuse of an older secret revokes that session.

POST /api/v1/auth/logout revokes the named session. DELETE /api/v1/users/me revokes every session and deletes the account data.

### Onboarding states

- quiz_in_progress: OTP verified, quiz incomplete.
- profile_processing: full quiz saved and durable AI job queued/running.
- active: AI result persisted and exactly one community membership exists.
- error: durable AI job exhausted retries; user sees retry/support UI.

### Community and chat

GET /api/v1/community/me returns the caller's community and membership.

GET /api/v1/community/messages?before=<opaque-cursor>&limit=50 returns newest-first keyset history, then the client renders oldest-to-newest.

POST /api/v1/community/ws-ticket returns a random, single-use, 60-second Redis ticket.

WS /api/v1/ws/community?ticket=<ticket> accepts:

~~~json
{
  "type": "message.send",
  "client_message_id": "<uuid>",
  "body": "hello"
}
~~~

and broadcasts:

~~~json
{
  "type": "message.created",
  "message": {
    "id": 123,
    "client_message_id": "<uuid>",
    "community_slug": "quiet-storm",
    "user_id": "<uuid>",
    "display_name": "A",
    "body": "hello",
    "created_at": "2026-07-22T12:00:00Z"
  }
}
~~~

Message bodies are normalized and trimmed, 1-1000 Unicode code points, plain text, and server-filtered. Duplicate client_message_id values from one user return the already-created message.

## Target Database Shape

New or changed columns:

~~~sql
ALTER TABLE users ALTER COLUMN supabase_uid DROP NOT NULL;
ALTER TABLE users ADD COLUMN onboarding_state TEXT NOT NULL DEFAULT 'quiz_in_progress';
ALTER TABLE users ADD COLUMN banned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN banned_reason TEXT;
ALTER TABLE users ADD COLUMN banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN suspended_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN privacy_version TEXT;
ALTER TABLE users ADD COLUMN privacy_accepted_at TIMESTAMPTZ;

ALTER TABLE quiz_submissions ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE quiz_submissions ADD COLUMN archetype_slug TEXT;
~~~

New tables:

~~~sql
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_secret_hash TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE TABLE communities (
    archetype_slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quiz_submissions
    ADD CONSTRAINT fk_quiz_archetype
    FOREIGN KEY (archetype_slug) REFERENCES communities(archetype_slug);

CREATE TABLE community_members (
    archetype_slug TEXT NOT NULL REFERENCES communities(archetype_slug),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    muted BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (archetype_slug, user_id)
);

CREATE TABLE messages (
    id BIGSERIAL PRIMARY KEY,
    client_message_id UUID NOT NULL,
    archetype_slug TEXT NOT NULL REFERENCES communities(archetype_slug),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,
    UNIQUE (user_id, client_message_id)
);

CREATE TABLE message_reports (
    id UUID PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL CHECK (reason IN ('spam','harassment','hate','sexual','self_harm','violence','impersonation','privacy','other')),
    details TEXT CHECK (char_length(details) <= 500),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    UNIQUE (message_id, reporter_user_id)
);

CREATE TABLE user_blocks (
    blocker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_user_id, blocked_user_id),
    CHECK (blocker_user_id <> blocked_user_id)
);

CREATE TABLE push_tokens (
    token_hash TEXT PRIMARY KEY,
    token_ciphertext TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('ios','android')),
    installation_id UUID NOT NULL,
    app_version TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_sent_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (installation_id)
);

CREATE TABLE moderation_actions (
    id UUID PRIMARY KEY,
    report_id UUID REFERENCES message_reports(id) ON DELETE SET NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('resolve_no_action','delete_message','suspend_user','ban_user')),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE legal_acceptances (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_version TEXT NOT NULL,
    privacy_version TEXT NOT NULL,
    locale TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('ios','android','web')),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, terms_version, privacy_version)
);
~~~

## Manual Prerequisites

These do not block local coding, but they block release:

- [ ] Rotate every credential identified by the superseded plan.
- [ ] Provide one scheduled final macOS session with current Xcode 26, the iOS 26 SDK, CocoaPods/Bundler dependencies, and a physical iPhone running iOS 15.1 or later.
- [ ] Provide at least two Android devices, including one Android 13+ device.
- [ ] Enroll the publishing organization in Apple Developer Program and Google Play Console.
- [ ] Confirm whether the Google Play account is a personal account created after 2023-11-13; if yes, schedule 12 opted-in testers for 14 continuous days.
- [ ] Reserve app identifier in.frinq.app in App Store Connect and Play Console.
- [ ] Create a Firebase project, iOS app, Android app, service account, APNs authentication key upload, GoogleService-Info.plist, and google-services.json.
- [ ] Create and securely back up the Android upload keystore. Never store it in Git.
- [ ] Configure app.frinq.in, admin.frinq.in, api.frinq.in, support email, privacy contact, and account-deletion URL.
- [ ] Obtain legal review of Terms, Privacy Policy, Community Guidelines, retention, international availability, and age positioning.
- [ ] Confirm Twilio WhatsApp Verify availability for every intended territory. Disable territories where login cannot work.
- [ ] Prepare App Store and Play Store organization, tax, banking, agreements, and contact verification.
- [x] Vastago Grotesk app use confirmed by the owner on 2026-07-23: the organization purchased it and its developer supplied this folder for building the app. Preserve commercial documents outside Git.

---

# Phase 0: Reproducible Baseline and Safe Delivery

## Task 0: Create an execution ledger and protect existing work

**Files:**

- Create: frinq-backend/docs/launch/execution-ledger.md
- Create: frinq-backend/.env.example
- Create: frinq-frontend/.env.example
- Modify: frinq-backend/.gitignore
- Modify: frinq-frontend/.gitignore

**Produces:** A durable checklist of task status, exact verification output, manual blockers, and secret-safe environment templates.

- [ ] **Step 1: Inspect both repositories**

Run:

~~~powershell
git -C frinq-backend status --short
git -C frinq-backend log -5 --oneline
git -C frinq-frontend status --short
git -C frinq-frontend log -5 --oneline
~~~

Expected: record existing changes without modifying or deleting them.

- [ ] **Step 2: Record the baseline**

Run:

~~~powershell
Push-Location frinq-backend
python -m pytest -q
Pop-Location
Push-Location frinq-frontend
npm run lint
npm run build
Pop-Location
~~~

Expected at plan creation: backend 77 tests pass; frontend lint fails with 27 errors. Record actual output on execution day. A build result is not inferred from lint.

- [ ] **Step 3: Create example-only environment templates**

Backend .env.example must list every key from app/config.py with blank or descriptive non-secret values. Frontend .env.example must contain:

~~~dotenv
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_APP_ENV=development
~~~

Do not add openai to requirements.txt; the code uses httpx.

- [ ] **Step 4: Expand secret ignores**

Ensure both repositories ignore:

~~~gitignore
.env
.env.*
!.env.example
google-services.json
GoogleService-Info.plist
*.p8
*.p12
*.mobileprovision
*.jks
*.keystore
service-account*.json
firebase-admin*.json
~~~

- [ ] **Step 5: Scan tracked content**

Run:

~~~powershell
git -C frinq-backend grep -n -I -E "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|SUPABASE_SERVICE_KEY=|DATABASE_URL=.*@|ADMIN_KEY=Admin"
git -C frinq-frontend grep -n -I -E "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|SUPABASE_SERVICE_KEY=|DATABASE_URL=.*@|ADMIN_KEY=Admin"
~~~

Expected: no real secret values. Variable names with clearly fake example values are allowed.

- [ ] **Step 6: Checkpoint**

Run backend tests again. Do not commit unless authorized. Suggested commit if authorized:

~~~text
chore: add launch execution guardrails
~~~

## Task 1: Make frontend lint a real zero-error gate

**Files:**

- Modify only the 27 files reported by npm run lint.
- Do not change quiz copy, routing, timing, animation, or stored-key names.

**Produces:** npm run lint exits 0 before feature work begins.

- [ ] **Step 1: Save the exact lint report in the ledger**

Run:

~~~powershell
Push-Location frinq-frontend
npm run lint -- --quiet
Pop-Location
~~~

Expected: FAIL on the existing React hook/ref violations.

- [ ] **Step 2: Apply behavior-preserving fixes**

Use lazy state initializers for localStorage reads, derive values during render when they do not need state, reset state inside the event that changes the controlling value, and move ref writes to event handlers/effects. Do not disable react-hooks rules and do not add eslint-disable comments.

Required pattern:

~~~tsx
const [value, setValue] = useState(() => getQuizState("frinq_name") ?? "");
~~~

Forbidden pattern:

~~~tsx
useEffect(() => {
  setValue(getQuizState("frinq_name") ?? "");
}, []);
~~~

- [ ] **Step 3: Verify the existing quiz**

Run:

~~~powershell
npm run lint
npm run build
~~~

Expected: both exit 0 before continuing.

- [ ] **Step 4: Run Playwright smoke navigation**

Use the existing Playwright dependency to visit splash, name, phone, verify, one choice page, voice fallback, and vibe-box preview. Add tests only where no existing smoke coverage exists.

- [ ] **Step 5: Checkpoint**

Suggested commit if authorized:

~~~text
fix: clear frontend launch quality gate
~~~

## Task 2: Replace best-effort startup DDL with deterministic migrations

**Files:**

- Create: frinq-backend/app/migrations.py
- Create: frinq-backend/scripts/predeploy.py
- Create: frinq-backend/migrations/010_legacy_schema_baseline.sql
- Create: frinq-backend/tests/test_migrations.py
- Modify: frinq-backend/app/main.py
- Modify: frinq-backend/.do/app.yaml

**Produces:** run_migrations(pool) -> list[str] applies each numbered SQL migration once under a PostgreSQL advisory lock, in a transaction, and records filename plus SHA-256 checksum.

- [ ] **Step 1: Write migration-runner tests**

Test these exact cases with a fake connection:

~~~python
async def test_migrations_apply_in_numeric_order():
    assert discovered_names == [
        "001_initial.sql",
        "002_quiz_submissions.sql",
        "003_otp_and_verification.sql",
    ]

async def test_applied_checksum_mismatch_fails_closed():
    with pytest.raises(RuntimeError, match="checksum mismatch"):
        await run_migrations(fake_pool)

async def test_existing_legacy_database_is_baselined_once():
    assert recorded_versions == list(range(1, 11))
    assert executed_names == ["010_legacy_schema_baseline.sql"]
~~~

- [ ] **Step 2: Verify tests fail**

Run:

~~~powershell
pytest tests/test_migrations.py -v
~~~

Expected: FAIL because app.migrations does not exist.

- [ ] **Step 3: Implement the runner**

Requirements:

- Create schema_migrations(version INT PRIMARY KEY, filename TEXT, checksum TEXT, applied_at TIMESTAMPTZ).
- Acquire one connection from the pool, hold pg_advisory_lock(717174) on that same connection before inspection, execute all baseline/migration work through it, and release the lock in finally before returning the connection.
- If schema_migrations is empty and users plus quiz_submissions already exist, validate the expected effects/checksums of legacy migrations 001-009, record only 001-009 as adopted in one transaction, then execute 010 normally. Never mark an unapplied migration as complete.
- If the database is empty, apply 001 onward in numeric order.
- Execute each migration in one transaction.
- Abort on the first SQL error or checksum mismatch.
- Never log SQL contents or environment values.

- [ ] **Step 4: Reconcile legacy startup objects**

migrations/010_legacy_schema_baseline.sql must idempotently ensure tracking_events, voice_clips, whatsapp_inbound, whatsapp_sent_at, admin flags, followup_sent_at, RSVP columns, and deep_summary exist. Move those statements out of main.py and delete _run_migrations after pre-deploy is active.

- [ ] **Step 5: Add a blocking DigitalOcean pre-deploy job**

.do/app.yaml adds a jobs entry using the same Git source and secrets:

~~~yaml
jobs:
  - name: migrate
    kind: PRE_DEPLOY
    github:
      repo: stfu-ronak/frinq-backend
      branch: main
      deploy_on_push: true
    build_command: pip install -r requirements.txt
    run_command: python scripts/predeploy.py
    instance_size_slug: apps-s-1vcpu-1gb
~~~

scripts/predeploy.py initializes the pool, runs migrations, later runs the community seed, and exits non-zero on any failure.

- [ ] **Step 6: Verify**

Run:

~~~powershell
pytest tests/test_migrations.py -v
pytest -q
~~~

Expected: PASS. Do not deploy yet.

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
feat: add deterministic database migrations
~~~

### Phase 0 Gate

- [ ] Backend full suite passes.
- [ ] Frontend lint passes with zero errors.
- [ ] Frontend production build passes.
- [ ] No secret is introduced.
- [ ] Migration runner fails closed.
- [ ] Existing dirty files remain untouched unless explicitly part of Task 1.

Stop and obtain review before Phase 1.

---

# Phase 1: OTP Accounts, Rotating Sessions, and Ownership

## Task 3: Add account and session schema

**Files:**

- Create: frinq-backend/migrations/011_accounts_and_sessions.sql
- Modify: frinq-backend/tests/conftest.py
- Create: frinq-backend/tests/test_api/test_sessions.py

**Produces:** Database support for OTP-native users, session revocation, onboarding state, terms acceptance, bans, and quiz ownership.

- [ ] **Step 1: Write schema assertions**

Integration or migration tests must assert:

~~~python
assert users["supabase_uid"].is_nullable is True
assert "onboarding_state" in users
assert "user_id" in quiz_submissions
assert "archetype_slug" in quiz_submissions
assert "user_sessions" in tables
~~~

- [ ] **Step 2: Write migration 011**

The migration must:

- Drop NOT NULL from users.supabase_uid without dropping the unique constraint.
- Add onboarding_state nullable, backfill profile_processing for a user with an owned completed submission and quiz_in_progress otherwise, then add the four-value CHECK, NOT NULL, and quiz_in_progress default. Do not mark a legacy user active until Task 8 validates the result and creates membership.
- Add banned, banned_reason, banned_at, last_seen_at, terms_version, and terms_accepted_at.
- Add quiz_submissions.user_id ON DELETE CASCADE and archetype_slug.
- Backfill quiz_submissions.user_id by normalized phone only when exactly one matching user exists.
- Create user_sessions exactly as defined in Target Database Shape.
- Add indexes on user_sessions(user_id), user_sessions(expires_at), quiz_submissions(user_id), and users(onboarding_state).

- [ ] **Step 3: Run migration tests**

Run:

~~~powershell
pytest tests/test_migrations.py tests/test_api/test_sessions.py -v
~~~

Expected: schema assertions pass.

- [ ] **Step 4: Checkpoint**

Suggested commit if authorized:

~~~text
feat: add OTP account session schema
~~~

## Task 4: Implement session primitives

**Files:**

- Create: frinq-backend/app/core/session.py
- Modify: frinq-backend/app/api/deps.py
- Modify: frinq-backend/app/config.py
- Modify: frinq-backend/.env.example
- Modify: frinq-backend/tests/test_api/test_sessions.py

**Interfaces:**

- create_session(conn, user_id, platform) -> TokenPair
- rotate_session(conn, refresh_token) -> TokenPair
- revoke_session(conn, session_id) -> None
- revoke_all_sessions(conn, user_id) -> None
- decode_access_token(token) -> AccessClaims
- get_current_account(...) -> CurrentAccount

- [ ] **Step 1: Write failing token tests**

~~~python
def test_access_token_contains_user_session_and_type():
    claims = decode_access_token(pair.access_token)
    assert claims.sub == str(user_id)
    assert claims.sid == str(session_id)
    assert claims.type == "access"

async def test_refresh_rotation_rejects_old_secret():
    first = await create_session(conn, user_id, "android")
    second = await rotate_session(conn, first.refresh_token)
    assert second.refresh_token != first.refresh_token
    with pytest.raises(SessionReuseError):
        await rotate_session(conn, first.refresh_token)

async def test_banned_user_cannot_authenticate():
    response = await client.get("/api/v1/users/me", headers=bearer)
    assert response.status_code == 403
~~~

- [ ] **Step 2: Verify failure**

Run:

~~~powershell
pytest tests/test_api/test_sessions.py -v
~~~

Expected: FAIL because the session module does not exist.

- [ ] **Step 3: Implement token format**

Use secrets.token_urlsafe(48) for the refresh secret. Return refresh token as session UUID, a dot, and the secret. Store HMAC-SHA256(SESSION_HASH_PEPPER, secret), never the plaintext secret. Keep SESSION_HASH_PEPPER separate from the JWT signing key and expose only a fake example value in .env.example.

Access JWT requirements:

- HS256 using SECRET_KEY.
- 15-minute expiry.
- sub=user UUID.
- sid=session UUID.
- iss=frinq-api and aud=frinq-app, both validated on decode.
- a unique jti for correlation/revocation diagnostics without logging the token.
- type=access.
- iat and exp integer timestamps.

Refresh session expiry is 30 days. Rotation uses SELECT FOR UPDATE. A secret mismatch revokes that session and raises SessionReuseError.

- [ ] **Step 4: Implement CurrentAccount**

CurrentAccount exposes id, phone, row, session_id, onboarding_state, community_slug, and banned. get_current_account rejects missing/expired/wrong-type access tokens, revoked sessions, deleted users, and banned users.

- [ ] **Step 5: Keep legacy Supabase dependency isolated**

Do not silently accept both token types in get_current_account. Existing legacy endpoints may keep get_current_user temporarily, but every new app/community endpoint uses get_current_account. Record the legacy-removal work in the execution ledger rather than leaving an untracked source comment.

- [ ] **Step 6: Verify**

Run:

~~~powershell
pytest tests/test_api/test_sessions.py tests/test_api/test_auth.py tests/test_api/test_users.py -v
pytest -q
~~~

Expected: PASS.

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
feat: add rotating account sessions
~~~

## Task 5: Make OTP verification create or resume an account

**Files:**

- Modify: frinq-backend/app/api/v1/otp.py
- Modify: frinq-backend/app/core/otp.py
- Modify: frinq-backend/app/config.py
- Modify: frinq-backend/tests/test_api/test_auth.py
- Create: frinq-backend/tests/test_api/test_otp_accounts.py

**Produces:** OTP verify upserts by normalized phone, links owned quiz rows, and returns TokenPair plus user state.

- [ ] **Step 1: Write failing endpoint tests**

~~~python
async def test_otp_verify_creates_user_and_session(client):
    response = await client.post(
        "/api/v1/otp/verify",
        json={"phone": "9990000001", "code": "123456", "platform": "android"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["onboarding_state"] == "quiz_in_progress"

async def test_verify_same_phone_reuses_user_but_creates_new_session(client):
    assert first["user"]["id"] == second["user"]["id"]
    assert first["refresh_token"] != second["refresh_token"]

async def test_verify_links_only_same_normalized_phone_submissions(client):
    assert linked_user_id == verified_user_id
    assert other_submission_user_id is None
~~~

- [ ] **Step 2: Verify failure**

Run:

~~~powershell
pytest tests/test_api/test_otp_accounts.py -v
~~~

- [ ] **Step 3: Implement the response**

Add platform Literal["ios","android","web"] to VerifyOTPRequest. Inside one transaction after successful Twilio verification:

- SELECT user by normalized phone FOR UPDATE.
- Insert a user with supabase_uid NULL if none exists.
- Reject a banned user. A previously hard-deleted account is absent and therefore creates a new user with no linkage to deleted data.
- Link legacy quiz_submissions rows with that phone and NULL user_id.
- Determine prior_session from rows owned by this user.
- Create a new user_session.

Return access_token, refresh_token, user, and prior_session. Do not return the legacy phone-token field from this account-login contract; the coordinated frontend migration in Task 11 consumes the new fields before deployment.

- [ ] **Step 4: Make test OTP safe**

Development/staging may accept one shared OTP for TEST_PHONES. Production may accept only one REVIEW_PHONE plus a high-entropy REVIEW_OTP, and only when REVIEW_OTP_EXPIRES_AT is in the future and no more than 30 days away. The production boot guard must fail if a production review bypass lacks an expiry. SKIP_OTP_VERIFICATION remains ignored in production.

- [ ] **Step 5: Verify**

Run:

~~~powershell
pytest tests/test_api/test_otp_accounts.py tests/test_api/test_auth.py -v
pytest -q
~~~

- [ ] **Step 6: Checkpoint**

Suggested commit if authorized:

~~~text
feat: promote OTP verification to account login
~~~

## Task 6: Add refresh, logout, and owned quiz access

**Files:**

- Create: frinq-backend/app/api/v1/sessions.py
- Modify: frinq-backend/app/main.py
- Modify: frinq-backend/app/api/v1/quiz.py
- Modify: frinq-backend/app/api/v1/voice.py
- Create: frinq-backend/app/schemas/quiz.py
- Modify: frinq-frontend/app/(quiz)/age/page.tsx
- Create: frinq-backend/tests/test_api/test_quiz_ownership.py
- Create: frinq-backend/tests/test_api/test_age_gate.py

**Produces:** POST /auth/refresh, POST /auth/logout, authenticated quiz mutation, and authenticated voice ownership.

- [ ] **Step 1: Write failing API tests**

Test:

- refresh rotates both tokens.
- reuse of the old refresh token returns 401 and revokes the session.
- logout returns 204 and the access token is rejected afterward.
- user A cannot patch, complete, summarize, or upload voice to user B's submission.
- an unauthenticated caller cannot complete or summarize a submission.
- invalid calendar dates, future dates, and users younger than 18 are rejected server-side.
- a user whose 18th birthday is today is accepted using the server UTC date.

- [ ] **Step 2: Implement session routes**

Mount sessions.router at /api/v1. Never accept refresh tokens in query parameters or headers that may be logged. Accept JSON bodies.

- [ ] **Step 3: Enforce ownership**

Every partial, complete, summary, and voice query includes:

~~~sql
WHERE id = $1 AND user_id = $2
~~~

Return 404 rather than revealing that another user's submission exists.

- [ ] **Step 4: Enforce the 18+ boundary**

Parse frinq_dob as DD/MM/YYYY with a strict calendar parser. Validate it when the field is saved and again when the quiz is completed. Return a stable 422 code for invalid_date or must_be_18. The frontend uses the same rules for immediate feedback but never becomes the authority. Do not infer adulthood from a year alone.

- [ ] **Step 5: Preserve admin previews**

Admin preview remains available only through an admin-authenticated endpoint. Remove public preview-by-submission behavior from the mobile frontend before launch.

- [ ] **Step 6: Verify**

Run:

~~~powershell
pytest tests/test_api/test_sessions.py tests/test_api/test_quiz_ownership.py tests/test_api/test_age_gate.py -v
pytest -q
~~~

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
feat: secure sessions and quiz ownership
~~~

### Phase 1 Gate

- [ ] OTP creates and resumes one account per normalized phone.
- [ ] Access tokens expire after 15 minutes.
- [ ] Refresh tokens rotate and reuse is rejected.
- [ ] Logout and bans revoke sessions.
- [ ] Quiz and voice resources enforce ownership.
- [ ] Invalid dates and under-18 quiz completion are rejected by the server.
- [ ] Full backend suite passes.

Stop and obtain review before Phase 2.

---

# Phase 2: Durable Quiz Processing and Canonical Community Assignment

## Task 7: Add community and moderation schema

**Files:**

- Create: frinq-backend/migrations/012_communities_and_chat.sql
- Create: frinq-backend/app/core/communities.py
- Create: frinq-backend/tests/test_communities.py
- Modify: frinq-backend/scripts/predeploy.py
- Modify: frinq-backend/tests/conftest.py

**Interfaces:**

- sync_communities(conn) -> int upserts the 24 canonical archetypes.
- get_user_community(conn, user_id) -> CommunityRow | None.
- assign_user_to_community(conn, user_id, archetype_slug) -> CommunityRow.

- [ ] **Step 1: Write failing taxonomy tests**

~~~python
async def test_sync_creates_exactly_the_taxonomy_communities(conn):
    count = await sync_communities(conn)
    assert count == len(ARCHETYPES) == 24

async def test_assignment_replaces_no_existing_membership(conn):
    await assign_user_to_community(conn, user_id, "quiet-storm")
    with pytest.raises(CommunityAssignmentError):
        await assign_user_to_community(conn, user_id, "soft-anchor")

async def test_unknown_archetype_is_rejected(conn):
    with pytest.raises(UnknownArchetypeError):
        await assign_user_to_community(conn, user_id, "made-up-type")
~~~

- [ ] **Step 2: Verify failure**

Run:

~~~powershell
pytest tests/test_communities.py -v
~~~

- [ ] **Step 3: Write migration 012**

Add users.suspended_until, then create communities, community_members, messages, message_reports, user_blocks, and push_tokens exactly as defined in Target Database Shape. Add a foreign key from quiz_submissions.archetype_slug to communities.archetype_slug after the communities table exists; the nullable column remains empty until validated assignment. Add these indexes:

~~~sql
CREATE INDEX idx_messages_archetype_slug_desc
    ON messages (archetype_slug, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_message_reports_status_created
    ON message_reports (status, created_at DESC);
CREATE INDEX idx_push_tokens_user
    ON push_tokens (user_id);
~~~

- [ ] **Step 4: Implement community sync**

Read names and descriptions from app/core/ai/archetypes.py. Do not duplicate a 24-row list elsewhere. Upsert name and description by slug. predeploy.py runs migrations and then sync_communities before exiting.

- [ ] **Step 5: Implement immutable assignment**

The assignment function validates get_archetype(slug), checks for an existing membership, returns it if the same slug is requested, and raises on a different slug. A user must never silently move between communities.

- [ ] **Step 6: Verify**

Run:

~~~powershell
pytest tests/test_communities.py tests/test_migrations.py -v
pytest -q
~~~

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
feat: add canonical communities and chat schema
~~~

## Task 8: Move quiz insights into a durable ARQ task

**Files:**

- Create: frinq-backend/app/workers/tasks/quiz_insights.py
- Modify: frinq-backend/app/workers/queue.py
- Modify: frinq-backend/app/api/v1/quiz.py
- Modify: frinq-backend/app/config.py
- Modify: frinq-backend/.do/app.yaml
- Create: frinq-backend/scripts/backfill_quiz_activation.py
- Create: frinq-backend/tests/test_workers/test_quiz_insights.py
- Create: frinq-backend/tests/test_workers/__init__.py

**Interfaces:**

- enqueue_quiz_insights(submission_id: UUID) -> str.
- generate_quiz_insights(ctx, submission_id: str) -> None.
- WorkerSettings.functions contains build_profile and generate_quiz_insights.

- [ ] **Step 1: Write failing worker tests**

~~~python
async def test_success_activates_user_and_assigns_one_community(fake_pool):
    await generate_quiz_insights(ctx, str(submission_id))
    assert submission.status == "done"
    assert submission.archetype_slug == "quiet-storm"
    assert user.onboarding_state == "active"
    assert membership.archetype_slug == "quiet-storm"

async def test_invalid_archetype_fails_without_activation(fake_pool):
    await generate_quiz_insights(ctx, str(submission_id))
    assert submission.status == "error"
    assert user.onboarding_state == "error"
    assert membership is None

async def test_rerun_is_idempotent(fake_pool):
    await generate_quiz_insights(ctx, str(submission_id))
    await generate_quiz_insights(ctx, str(submission_id))
    assert membership_count == 1

async def test_existing_done_result_assigns_without_second_model_call(fake_pool):
    await generate_quiz_insights(ctx, str(submission_id))
    assert ai_call_count == 0
    assert membership.archetype_slug == "quiet-storm"
~~~

- [ ] **Step 2: Verify failure**

Run:

~~~powershell
pytest tests/test_workers/test_quiz_insights.py -v
~~~

- [ ] **Step 3: Implement canonical slug selection**

The AI result's display name must map to a known entry in ARCHETYPES. Prefer share_card.archetype_slug when it exactly matches a taxonomy key; otherwise derive the slug from the validated display name and confirm get_archetype(slug) is not None. Never accept arbitrary model output.

- [ ] **Step 4: Implement the durable task**

Required sequence:

1. Lock submission row.
2. Return immediately when status is done and membership already exists.
3. If a completed submission already contains a usable result, validate its canonical slug and skip model calls; otherwise set submission processing and user profile_processing.
4. Run generate_insights and generate_deep_report outside a database transaction only when a usable stored result is absent.
5. Validate the final result and slug.
6. Start one transaction.
7. Update quiz_submissions fields and status done.
8. Insert the single community membership.
9. Set users.onboarding_state active.
10. Commit.

On final failure, store a short sanitized error code, set submission error and user error, and let ARQ retain full exception context in logs without questionnaire or model content.

- [ ] **Step 5: Make complete_quiz queue-only**

complete_quiz:

- Updates owned submission answers, is_complete, status pending.
- Sets user profile_processing.
- Enqueues generate_quiz_insights.
- Returns 202 with submission_id, status pending, and job_id.
- Returns 503 if Redis is unavailable and resets the user to error so the UI can retry.
- Does not add a FastAPI BackgroundTask.

- [ ] **Step 6: Add WorkerSettings**

Worker startup initializes the asyncpg pool; shutdown closes it. Configure:

~~~python
class WorkerSettings:
    functions = [build_profile, generate_quiz_insights]
    redis_settings = _redis_settings()
    max_jobs = 4
    job_timeout = 300
    max_tries = 3
~~~

Add a DigitalOcean worker:

~~~yaml
workers:
  - name: worker
    github:
      repo: stfu-ronak/frinq-backend
      branch: main
      deploy_on_push: true
    build_command: pip install -r requirements.txt
    run_command: arq app.workers.queue.WorkerSettings
    instance_size_slug: apps-s-1vcpu-1gb
    instance_count: 1
~~~

Share DATABASE_URL, REDIS_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY, VOYAGE_API_KEY, model configuration, and APP_ENV through secret environment settings.

- [ ] **Step 7: Reconcile legacy completed submissions**

backfill_quiz_activation.py defaults to --dry-run and reports counts only. With --apply, enqueue only the newest owned completed submission for each profile_processing user who lacks membership. Use deterministic ARQ job IDs based on submission ID so reruns do not duplicate work. Run dry-run in staging, review counts, run apply, wait for queue drain, and assert every active user has one membership while no user has more than one. Production execution requires explicit deployment authorization.

- [ ] **Step 8: Verify**

Run:

~~~powershell
pytest tests/test_workers/test_quiz_insights.py tests/test_api/test_profile.py -v
pytest -q
~~~

- [ ] **Step 9: Checkpoint**

Suggested commit if authorized:

~~~text
feat: make quiz activation durable
~~~

## Task 9: Add processing, retry, and active-state APIs

**Files:**

- Modify: frinq-backend/app/api/v1/quiz.py
- Modify: frinq-backend/app/api/v1/users.py
- Create: frinq-backend/tests/test_api/test_onboarding_state.py

**Produces:** GET /api/v1/users/me reports authoritative state/community; POST /api/v1/quiz/{submission_id}/retry safely requeues an error.

- [ ] **Step 1: Write state transition tests**

Test:

- quiz_in_progress cannot call community/me.
- profile_processing receives 409 profile_not_ready.
- active receives exactly one community.
- error owner can retry once and becomes profile_processing.
- active or processing submission cannot be duplicated by retry.
- banned user receives 403 everywhere.

- [ ] **Step 2: Implement response shape**

GET /api/v1/users/me returns existing safe profile fields plus:

~~~json
{
  "onboarding_state": "active",
  "community_slug": "quiet-storm",
  "terms_version": null,
  "terms_accepted_at": null
}
~~~

- [ ] **Step 3: Implement owner-only retry**

Retry requires an error submission belonging to the caller, resets only status/error fields, sets profile_processing, and enqueues the durable worker. Limit retry to three attempts using ARQ job metadata or a quiz_submissions.retry_count column added by a small follow-on migration.

- [ ] **Step 4: Verify**

Run:

~~~powershell
pytest tests/test_api/test_onboarding_state.py -v
pytest -q
~~~

- [ ] **Step 5: Checkpoint**

Suggested commit if authorized:

~~~text
feat: expose reliable onboarding state
~~~

### Phase 2 Gate

- [ ] No quiz AI work runs in FastAPI BackgroundTasks.
- [ ] Worker retry is bounded and idempotent.
- [ ] Only a validated taxonomy slug can activate a user.
- [ ] AI result, membership, and active state commit atomically.
- [ ] Every active user has exactly one membership.
- [ ] Legacy activation dry-run is reviewed; authorized apply leaves no eligible profile_processing user stranded.
- [ ] Backend suite passes.

Stop and obtain review before Phase 3.

---

# Phase 3: Mobile-Compatible Frontend, Sessions, and App Shell

## Task 10: Install Capacitor web dependencies and secure session storage

**Files:**

- Modify: frinq-frontend/package.json
- Modify: frinq-frontend/package-lock.json
- Create: frinq-frontend/app/lib/session.ts
- Create: frinq-frontend/app/lib/api.ts
- Create: frinq-frontend/tests/session.test.ts
- Create: frinq-frontend/tests/setup.ts
- Create: frinq-frontend/vitest.config.ts

**Interfaces:**

- saveRefreshToken(token: string) -> Promise<void>
- loadRefreshToken() -> Promise<string | null>
- clearRefreshToken() -> Promise<void>
- setAccessToken(token: string | null) -> void
- apiFetch(path: string, init?: RequestInit) -> Promise<Response>
- restoreSession() -> Promise<SessionState>

- [ ] **Step 1: Confirm Node 22**

Run:

~~~powershell
node --version
npm --version
~~~

Expected: Node 22 or newer. Stop if the version is older.

- [ ] **Step 2: Install matched dependencies**

Run:

~~~powershell
npm install @capacitor/core@8 @capacitor/app@8 @capacitor/system-bars@8
npm install @capawesome-team/capacitor-secure-preferences@0.2
npm install -D @capacitor/cli@8 @capacitor/ios@8 @capacitor/android@8
npm install -D vitest@4 jsdom@27 @testing-library/react@16 @testing-library/jest-dom@6 @testing-library/user-event@14
~~~

Use the resolved package-lock versions. Do not install @capacitor/preferences for tokens.

Add test: vitest run and test:watch: vitest to package.json. Configure jsdom, the @ alias, automatic cleanup, and jest-dom matchers in vitest.config.ts/tests/setup.ts. Keep Playwright for browser journeys and Vitest for deterministic modules/components.

- [ ] **Step 3: Write failing session tests**

Test:

- native path stores only refresh token in SecurePreferences.
- web path stores refresh token in sessionStorage.
- access token exists only in module memory.
- a 401 triggers exactly one refresh and request retry.
- concurrent 401 responses share one refresh promise.
- refresh failure clears all session state and returns auth_required.

- [ ] **Step 4: Implement session storage**

Use Capacitor.isNativePlatform() to choose secure preferences. Use key frinq.refresh_token. The web fallback is sessionStorage, not localStorage. Never store access tokens, refresh tokens, phone numbers, or admin credentials in log output.

- [ ] **Step 5: Implement apiFetch**

apiFetch:

- Builds an absolute URL from NEXT_PUBLIC_API_URL.
- Adds Authorization Bearer when an access token exists.
- Adds Content-Type only for JSON bodies.
- On one 401, calls /api/v1/auth/refresh with the stored refresh token, saves the rotated token, then retries once.
- Uses one shared in-flight refresh Promise.
- Does not retry 403, 404, validation errors, or a second 401.

- [ ] **Step 6: Verify**

Run:

~~~powershell
npm test
npm run lint
npm run build
~~~

Expected: all session tests, lint, and build pass.

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
feat: add secure mobile sessions
~~~

## Task 11: Migrate OTP and returning-user routing

**Files:**

- Modify: frinq-frontend/app/(quiz)/verify/page.tsx
- Modify: frinq-frontend/app/page.tsx
- Modify: frinq-frontend/app/components/QuizProgressTracker.tsx
- Modify: frinq-frontend/app/(quiz)/vibe-box/page.tsx
- Remove after migration: legacy frinq_phone_token and frinq_resuming behavior
- Create: frinq-frontend/tests/e2e/auth-routing.spec.ts

**Produces:** Server-authoritative routing for new, processing, active, error, logged-out, and banned users.

- [ ] **Step 1: Write failing routing tests**

Test exact destinations:

~~~text
no refresh token -> /
quiz_in_progress -> saved last_page or /social-verify
profile_processing -> /vibe-box
active -> /community
error -> /vibe-box?state=error
refresh rejected -> /
~~~

- [ ] **Step 2: Update verify**

After OTP success, save the refresh token, set the access token, restore safe quiz answers, and route from response.user.onboarding_state. Do not persist a local assessment_completed flag.

- [ ] **Step 3: Update splash**

On mount, call restoreSession once. Show the existing splash art during the check. Route only after authoritative state is known. Do not route from stale frinq_current_page for an active account.

- [ ] **Step 4: Authenticate quiz writes**

Replace raw fetch calls for partial, complete, summary, and voice upload with apiFetch. Voice uploads omit Content-Type so the browser sets the multipart boundary.

- [ ] **Step 5: Verify**

Run:

~~~powershell
npm run lint
npm run build
npx playwright test tests/e2e/auth-routing.spec.ts
~~~

- [ ] **Step 6: Checkpoint**

Suggested commit if authorized:

~~~text
feat: route from authoritative account state
~~~

## Task 12: Centralize API access and remove analytics PII

**Files:**

- Modify: frinq-frontend/app/(quiz)/phone/page.tsx
- Modify: frinq-frontend/app/(quiz)/story/page.tsx
- Modify: frinq-frontend/app/(quiz)/verify/page.tsx
- Modify: frinq-frontend/app/(quiz)/vibe-box/page.tsx
- Modify: frinq-frontend/app/components/VoiceRecorder.tsx
- Modify: frinq-frontend/app/components/QuizProgressTracker.tsx
- Modify: frinq-frontend/app/components/Tracker.tsx
- Modify: frinq-frontend/app/lib/identity.ts
- Create: frinq-frontend/app/lib/analytics.ts

**Produces:** One API URL implementation and no raw phone/name sent to analytics vendors.

- [ ] **Step 1: Replace inline API_URL constants**

All backend calls use apiUrl or apiFetch. Public OTP send and verify may use apiUrl without authorization; owned resources use apiFetch.

- [ ] **Step 2: Replace analytics identity**

Delete:

~~~tsx
window.clarity("set", "phone", identity.phone);
window.clarity("identify", identity.phone);
~~~

After login, identify with the opaque internal user UUID only after analytics consent. Never put phone, name, DOB, city, quiz answers, voice transcripts, message text, or archetype psychology in GA, Clarity, Sentry, URLs, or event labels.

- [ ] **Step 3: Send tracking directly to FastAPI**

Remove the local Node file logger. Tracker posts to apiUrl("/api/v1/track"). Minimize payload to opaque session ID, page, action, element, and non-sensitive metadata.

- [ ] **Step 4: Verify**

Run:

~~~powershell
rg -n "clarity.*phone|identify.*phone|frinq_phone_token|fetch\(\"/api" app
npm run lint
npm run build
~~~

Expected: forbidden patterns absent; lint/build pass.

- [ ] **Step 5: Checkpoint**

Suggested commit if authorized:

~~~text
fix: remove analytics PII and centralize API calls
~~~

## Task 13: Make the mobile frontend a true static export

**Files:**

- Modify: frinq-frontend/next.config.ts
- Delete: frinq-frontend/app/api/track/route.ts
- Delete: frinq-frontend/app/api/admin/route.ts
- Delete: frinq-frontend/lib/tracking.ts
- Modify: frinq-frontend/app/page.tsx
- Modify: frinq-frontend/app/(quiz)/vibe-box/page.tsx
- Modify: frinq-frontend/.do/app.yaml
- Test: frinq-frontend/tests/e2e/static-export.spec.ts

**Produces:** npm run build emits out/ with no server-only features.

- [ ] **Step 1: Write the final Next config**

~~~ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
~~~

Security headers move to the hosting edge/native configuration. Do not keep headers() in this config.

- [ ] **Step 2: Remove server-only features**

Delete request-dependent route handlers and Node fs tracking. Remove every force-dynamic declaration. Search for cookies(), headers(), redirects, rewrites, Server Actions, dynamic routes without generateStaticParams, and Next Image optimization assumptions.

- [ ] **Step 3: Build**

Run:

~~~powershell
if (Test-Path -LiteralPath '.next') {
  $target = Resolve-Path -LiteralPath '.next' -ErrorAction Stop
  $root = (Resolve-Path -LiteralPath '.').Path
  if (-not $target.Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete outside frontend: $($target.Path)"
  }
  Remove-Item -LiteralPath $target.Path -Recurse -Force
}
npm ci
npm run build
Test-Path out\index.html
Test-Path out\community\index.html
~~~

The executor must validate the resolved .next path is inside frinq-frontend before removing it. Expected: both files exist and build exits 0.

- [ ] **Step 4: Convert DigitalOcean frontend to a static site**

Use static_sites with build_command npm ci && npm run build and output_dir out. Configure index_document index.html and error_document 404.html. Do not use index.html as a catchall until direct loading of every emitted Next route is verified; Next exports an HTML document per route.

- [ ] **Step 5: Verify route loading**

Serve out/ locally with a temporary static server and verify /, /phone/, /verify/, /vibe-box/, /community/, /profile/, /privacy/, /terms/, and /delete-account/.

- [ ] **Step 6: Checkpoint**

Suggested commit if authorized:

~~~text
feat: make frontend a Capacitor-ready static export
~~~

## Task 14: Create the authenticated app shell

**Files:**

- Create: frinq-frontend/app/(app)/layout.tsx
- Create: frinq-frontend/app/(app)/community/page.tsx
- Create: frinq-frontend/app/(app)/profile/page.tsx
- Create: frinq-frontend/app/(app)/settings/page.tsx
- Create: frinq-frontend/app/components/AppTabBar.tsx
- Create: frinq-frontend/app/components/AccountGate.tsx
- Modify: frinq-frontend/app/globals.css
- Test: frinq-frontend/tests/e2e/app-shell.spec.ts

**Produces:** Community, Profile, and Settings tabs protected by authoritative active-account state. The current-legal-version gate is added with the approved legal pages in Task 24 before chat release.

- [ ] **Step 1: Add route gate tests**

Test:

- logged out app route returns to splash.
- profile_processing returns to vibe-box.
- active opens Community.
- bottom navigation preserves current tab and has accessible names.

- [ ] **Step 2: Implement AccountGate**

AccountGate calls restoreSession and /api/v1/users/me. It renders a non-flashing paper-themed loading state, routes invalid states, and renders children only for active users.

- [ ] **Step 3: Implement the tab bar**

Use three links: Community, Profile, Settings. Respect iOS safe-area-inset-bottom. Each tap target is at least 44 by 44 CSS pixels. Use aria-current=page on the selected tab. Do not add a UI library.

- [ ] **Step 4: Add page stubs with real empty/error states**

Community shows loading, no-membership error, offline/retry, and the community heading. Profile shows current server profile. Settings exposes legal links and logout. Hide notification controls until Task 29 and account-deletion controls until Task 24 so no dead controls ship.

- [ ] **Step 5: Verify**

Run:

~~~powershell
npm run lint
npm run build
npx playwright test tests/e2e/app-shell.spec.ts
~~~

- [ ] **Step 6: Checkpoint**

Suggested commit if authorized:

~~~text
feat: add authenticated mobile app shell
~~~

### Phase 3 Gate

- [ ] Frontend lint and static build pass.
- [ ] out/ contains every required route.
- [ ] Refresh token never enters localStorage.
- [ ] Analytics contains no raw PII.
- [ ] Routing is server-authoritative.
- [ ] App shell is keyboard and screen-reader navigable.

Stop and obtain review before Phase 4.

---

# Phase 4: Separate Admin Application

## Task 15: Extract admin from the mobile bundle

**Files:**

- Create: frinq-admin/package.json
- Create: frinq-admin/package-lock.json
- Create: frinq-admin/tsconfig.json
- Create: frinq-admin/next.config.ts
- Create: frinq-admin/app/layout.tsx
- Create: frinq-admin/app/page.tsx
- Create: frinq-admin/app/rsvps/page.tsx
- Create: frinq-admin/app/lib/adminFetch.ts
- Create: frinq-admin/.env.example
- Create: frinq-admin/.gitignore
- Create: frinq-admin/.do/app.yaml
- Delete: frinq-frontend/app/admin/page.tsx
- Delete: frinq-frontend/app/admin/rsvps/page.tsx

**Produces:** A server-deployed internal admin app absent from the exported consumer bundle.

- [ ] **Step 1: Scaffold with matched web versions**

Use Next.js 16.2.6, React 19.2.4, React DOM 19.2.4, TypeScript 5.8.2, ESLint 9, and the existing Tailwind 4 setup. Do not add a component framework.

- [ ] **Step 2: Move, do not fork, existing admin behavior**

Copy the existing pages and shared styles, fix imports, then delete the consumer admin routes. Preserve overview, users, testing, analytics, insights, funnel, journey, RSVP, voice, retry, delete, and WhatsApp controls.

- [ ] **Step 3: Harden credential handling**

Admin key is entered at runtime and stored only in sessionStorage. It is sent in Authorization, never in query parameters. ADMIN_ACTION_PASSWORD is requested for destructive operations and never persisted.

- [ ] **Step 4: Add server response headers**

Because admin is not a static export, next.config.ts sets HSTS, X-Content-Type-Options nosniff, Referrer-Policy no-referrer, X-Frame-Options DENY, Permissions-Policy disabling camera/mic/location, and a tested CSP allowing only required API/image/font sources.

- [ ] **Step 5: Add deployment config**

Deploy as a Next service at admin.frinq.in. ADMIN_KEY stays only in the backend; the admin frontend has NEXT_PUBLIC_API_URL but no bundled key. Add a manual Cloudflare Access, DigitalOcean edge gate, or IP allowlist prerequisite before public DNS.

- [ ] **Step 6: Verify consumer exclusion**

Run:

~~~powershell
Push-Location frinq-admin
npm ci
npm run lint
npm run build
Pop-Location
Push-Location frinq-frontend
npm run build
rg -n "admin|ADMIN_KEY|rsvps" out
Pop-Location
~~~

Expected: admin build passes; consumer out/ contains no admin route or admin secret name beyond harmless documentation.

- [ ] **Step 7: Checkpoint**

Suggested commits if authorized:

~~~text
feat: extract internal admin application
chore: remove admin from mobile bundle
~~~

## Task 16: Add admin origin and least-privilege backend controls

**Files:**

- Modify: frinq-backend/app/config.py
- Modify: frinq-backend/app/main.py
- Modify: frinq-backend/.do/app.yaml
- Modify: frinq-backend/app/api/v1/admin.py
- Create: frinq-backend/tests/test_api/test_admin_security.py

**Produces:** Explicit origins and consistent admin authentication without key-bearing URLs.

- [ ] **Step 1: Add security tests**

Test:

- missing/wrong Authorization returns 401.
- destructive endpoint without X-Action-Password returns 403.
- allowed admin origin preflight succeeds.
- arbitrary origin preflight fails.
- banned-user action writes banned_at and revokes sessions.

- [ ] **Step 2: Normalize admin auth**

Use Authorization: Bearer <ADMIN_KEY> for every admin endpoint. Do not accept key query parameters after the admin extraction is deployed. Destructive endpoints additionally require X-Action-Password.

- [ ] **Step 3: Configure CORS**

Production origins are exact values:

~~~text
https://app.frinq.in
https://admin.frinq.in
https://localhost
capacitor://localhost
~~~

Keep allow_credentials true and explicit headers Content-Type, Authorization, and X-Action-Password. Never use wildcard origin with credentials.

- [ ] **Step 4: Verify**

Run:

~~~powershell
pytest tests/test_api/test_admin_security.py -v
pytest -q
~~~

- [ ] **Step 5: Checkpoint**

Suggested commit if authorized:

~~~text
security: harden admin access and origins
~~~

### Phase 4 Gate

- [ ] Consumer mobile bundle contains no admin UI.
- [ ] Admin lint/build pass.
- [ ] Keys never appear in URLs or bundled environment values.
- [ ] Destructive actions require two server-validated secrets.
- [ ] Production CORS is exact.

Stop and obtain review before Phase 5.

# Phase 5: Safe community chat backend

## Task 17: Add authenticated community, message, report, and block APIs

**Files:**

- Create: frinq-backend/app/schemas/community.py
- Create: frinq-backend/app/schemas/message.py
- Create: frinq-backend/app/api/v1/communities.py
- Create: frinq-backend/app/api/v1/moderation.py
- Modify: frinq-backend/app/main.py
- Create: frinq-backend/tests/test_api/test_communities.py
- Create: frinq-backend/tests/test_api/test_message_safety.py

**Produces:** The minimum store-compliant REST surface for community discovery, history, reporting, blocking, and mute preferences.

- [ ] **Step 1: Write failing API tests**

Cover these contracts:

~~~text
GET    /api/v1/community/me
GET    /api/v1/community/messages?before=<cursor>&limit=50
POST   /api/v1/messages/{message_id}/report
POST   /api/v1/users/{user_id}/block
DELETE /api/v1/users/{user_id}/block
PATCH  /api/v1/community/preferences
~~~

Assert:

- every route requires a valid access token.
- GET /community/me returns exactly the user's archetype community for beta; no arbitrary joining.
- history is newest-first at the database boundary and returned oldest-first for rendering.
- the cursor is an opaque base64url encoding of created_at plus id, never an offset.
- limit defaults to 50 and is clamped to 1..100.
- deleted messages and messages from either direction of a block relationship are absent.
- a report accepts one reason enum: spam, harassment, hate, sexual, self_harm, violence, impersonation, privacy, or other.
- a user cannot report their own message, report the same message twice, or block themselves.
- reporting does not reveal reporter identity to the reported user.
- blocking immediately hides prior messages in later history reads.
- preferences allow muted boolean only; they cannot change membership or role.

- [ ] **Step 2: Implement strict schemas**

Set message content to UTF-8 text with a post-normalization range of 1..1000 Unicode code points. Set report details to 0..500 code points. Reject unknown fields. Return public user fields only: id, display_name, avatar_key, and archetype_slug. Never serialize phone, supabase_uid, moderation notes, or session identifiers.

- [ ] **Step 3: Implement membership-scoped queries**

Resolve membership from the authenticated user on every read or write. Do not trust a client-supplied user ID or community ID. Use parameterized SQL, stable ordering by created_at then id, and one query for each page rather than per-message author lookups.

- [ ] **Step 4: Make report and block writes idempotent**

Use the schema uniqueness constraints from Task 7. Return the existing report/block state on a retry instead of creating duplicates. Record report timestamps in UTC.

- [ ] **Step 5: Register routes and verify**

Run:

~~~powershell
pytest tests/test_api/test_communities.py tests/test_api/test_message_safety.py -v
pytest -q
~~~

- [ ] **Step 6: Checkpoint**

Suggested commit if authorized:

~~~text
feat: add safe community and moderation APIs
~~~

## Task 18: Add deterministic message moderation and Redis rate limits

**Files:**

- Create: frinq-backend/app/core/moderation.py
- Create: frinq-backend/app/core/rate_limit.py
- Modify: frinq-backend/app/config.py
- Modify: frinq-backend/.env.example
- Modify: frinq-backend/app/api/v1/communities.py
- Create: frinq-backend/tests/test_core/test_moderation.py
- Create: frinq-backend/tests/test_core/test_rate_limit.py

**Produces:** Predictable local safeguards before any chat content is persisted or broadcast.

- [ ] **Step 1: Write failing moderation tests**

Test Unicode normalization, leading/trailing whitespace removal, empty-after-normalization rejection, control-character rejection except newline, excessive repeated-character rejection, maximum five URLs, and configurable blocked terms. Test both Latin and non-Latin valid text. The beta filter must not send chat content to an LLM or external moderation service.

- [ ] **Step 2: Implement one moderation result type**

Return one of accepted, rejected, or review with a stable machine-readable reason. Persist only accepted content. For review, reject the live send with a neutral client message and log only the reason, user ID, and content hash; do not log raw content.

- [ ] **Step 3: Write failing rate-limit tests**

Use a fake Redis clock and assert these production defaults:

~~~text
OTP request:       5 per phone hash per 15 minutes, 20 per IP per hour
OTP verify:       10 per phone hash per 15 minutes, 40 per IP per hour
REST authenticated: 120 per user per minute
Chat send:        10 per user per 10 seconds and 60 per minute
Report:           10 per user per day
WebSocket ticket: 10 per user per minute
~~~

Return HTTP 429 with Retry-After for REST limits. WebSocket sends rejected for rate limits must return an error frame and keep the connection open unless abuse continues.

- [ ] **Step 4: Implement atomic Redis limits**

Use one Lua script or an equivalent atomic Redis transaction with expiring keys. Hash phone numbers and IP addresses with a server-side RATE_LIMIT_PEPPER before using them in keys. If Redis is unavailable, fail closed for OTP and WebSocket-ticket creation; fail open with an error metric for ordinary authenticated reads.

- [ ] **Step 5: Verify**

Run:

~~~powershell
pytest tests/test_core/test_moderation.py tests/test_core/test_rate_limit.py -v
pytest -q
~~~

- [ ] **Step 6: Checkpoint**

Suggested commit if authorized:

~~~text
security: moderate and rate limit community traffic
~~~

## Task 19: Add single-use WebSocket tickets and Redis-backed realtime delivery

**Files:**

- Create: frinq-backend/app/schemas/realtime.py
- Create: frinq-backend/app/core/realtime.py
- Create: frinq-backend/app/api/v1/realtime.py
- Modify: frinq-backend/app/main.py
- Modify: frinq-backend/requirements.txt
- Create: frinq-backend/tests/test_api/test_realtime.py
- Create: frinq-backend/tests/test_integration/test_realtime_redis.py

**Produces:** Horizontally safe community chat without putting bearer tokens in URLs.

- [ ] **Step 1: Write failing ticket tests**

Define:

~~~text
POST /api/v1/community/ws-ticket
Authorization: Bearer <access_token>
Body: {}
Response: {"ticket":"<random-value>","expires_in":60}

WS /api/v1/ws/community?ticket=<single-use-ticket>
~~~

Assert that a ticket is 32 cryptographically random bytes encoded base64url, stored only as a SHA-256 hash, scoped to user and community, expires after 60 seconds, and is consumed atomically with Redis GETDEL. A replay, expired ticket, wrong community, banned/suspended user, revoked session, non-HTTPS production transport, or unapproved Origin is rejected. Validate Origin before consuming the ticket because CORS middleware does not protect WebSockets. Access and refresh tokens must never appear in the WebSocket URL.

- [ ] **Step 2: Define the wire protocol**

Client frames:

~~~json
{"type":"message.send","client_message_id":"uuid-v4","body":"hello"}
{"type":"ping"}
~~~

Server frames:

~~~json
{"type":"ready","community_slug":"quiet-storm","server_time":"ISO-8601"}
{"type":"message.created","message":{"id":123,"client_message_id":"uuid-v4","body":"hello","author":{"id":"uuid","display_name":"A"},"created_at":"ISO-8601"}}
{"type":"message.rejected","client_message_id":"uuid-v4","code":"rate_limited","retry_after":3}
{"type":"pong"}
~~~

Use client_message_id plus sender_id as the idempotency key. A retry returns the already-persisted message. Set an 8 KB maximum inbound frame so a valid 1000-code-point UTF-8 body and its JSON envelope fit; close malformed or oversized connections with a documented application close code.

- [ ] **Step 3: Implement persist-before-publish**

For each accepted send:

1. authenticate the consumed ticket and load membership.
2. normalize, moderate, and rate-limit content.
3. insert the message in PostgreSQL with the idempotency constraint.
4. publish the committed message envelope to Redis channel community:<id>.
5. query block relationships once for the author and locally connected recipient IDs.
6. fan it out only to local sockets with no block in either direction.

Never publish an uncommitted message. Never rely on in-process memory for cross-instance delivery. Use one local connection manager that shares Redis subscriptions instead of opening one Redis subscription per socket.

- [ ] **Step 4: Add liveness and backpressure**

Send a server ping every 25 seconds, require activity within 60 seconds, cap each connection's outbound queue at 100 frames, and close a slow consumer instead of growing memory. Record connection counts, rejected frames, send latency, and Redis errors without message bodies.

- [ ] **Step 5: Support immediate ban enforcement**

When an administrator bans a user, revoke sessions and publish a control event containing only the user ID. Every app instance closes that user's active sockets with code 4403. New ticket creation and history reads also reject the banned account.

- [ ] **Step 6: Run unit and two-instance integration tests**

Start two API instances against one test PostgreSQL and Redis, connect one client to each, and prove exactly one persisted message reaches both. Also prove replay protection, reconnect idempotency, blocked-message filtering, and ban disconnect.

Run:

~~~powershell
pytest tests/test_api/test_realtime.py tests/test_integration/test_realtime_redis.py -v
pytest -q
~~~

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
feat: add durable realtime community chat
~~~

## Task 20: Add moderator review and enforcement APIs

**Files:**

- Create: frinq-backend/migrations/013_admin_moderation.sql
- Modify: frinq-backend/app/api/v1/admin.py
- Modify: frinq-backend/app/api/deps.py
- Modify: frinq-backend/app/api/v1/otp.py
- Modify: frinq-backend/app/config.py
- Modify: frinq-backend/.env.example
- Create: frinq-backend/tests/test_api/test_admin_moderation.py
- Modify: frinq-admin/app/page.tsx
- Create: frinq-admin/app/moderation/page.tsx
- Modify: frinq-admin/app/lib/adminFetch.ts

**Produces:** A usable report queue and documented enforcement controls before public chat exists.

- [ ] **Step 1: Write failing backend tests**

Cover paginated open reports, report detail, resolve-with-no-action, delete-message, suspend-user-until, and permanent-ban actions. Require Authorization and X-Action-Password for every enforcement write. Store moderator ID, action, reason, and timestamp in an append-only audit record.

- [ ] **Step 2: Write migration 013**

Create moderation_actions exactly as defined in Target Database Shape. Add indexes on moderation_actions(created_at DESC), moderation_actions(target_user_id, created_at DESC), and users(suspended_until). Require ADMIN_ACTOR_ID beside ADMIN_KEY and derive actor_id from that server configuration; never accept actor identity from a request field. If the launch needs multiple moderators, issue separately attributable credentials before adding staff rather than sharing one key.

- [ ] **Step 3: Implement least-data moderator responses**

Show the reported message, limited surrounding context from the same community, report category/details, prior action count, and public account data. Do not expose phone numbers by default. Any exceptional phone lookup must be a separate audited endpoint.

- [ ] **Step 4: Implement enforcement transactions**

Deleting a message sets deleted_at and deleted_by; it does not erase the audit relation. Extend CurrentAccount/get_current_account and OTP login to expose/check suspended_until and reject a still-active suspension with stable code account_suspended and its end time; permanent bans return account_banned without exposing internal notes. Suspending or banning a user revokes all sessions in the same transaction and publishes the control event from Task 19 after commit.

- [ ] **Step 5: Build the admin review queue**

Add filters for open/resolved, category, and age; keyboard-accessible actions; explicit confirmation for destructive actions; and success/error feedback. Do not place any moderation UI in frinq-frontend.

- [ ] **Step 6: Verify**

Run:

~~~powershell
pytest tests/test_api/test_admin_moderation.py -v
Push-Location ..\frinq-admin
npm run lint
npm run build
Pop-Location
~~~

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
feat: add moderator report workflow
~~~

### Phase 5 Gate

- [ ] Community membership is server-derived and limited to the user's assigned archetype.
- [ ] Message history is cursor-paginated, block-aware, and excludes deleted content.
- [ ] Report, block, mute, and admin enforcement tests pass.
- [ ] WebSocket tokens are single-use, short-lived, and contain no bearer credential in the URL.
- [ ] Two API instances exchange one persisted message through Redis without duplicates.
- [ ] Ban enforcement revokes HTTP and active WebSocket access.
- [ ] Full backend tests pass.

Stop and obtain review before Phase 6.

# Phase 6: Consumer chat, profile, legal, and deletion flows

## Task 21: Build the accessible community chat screen

**Files:**

- Modify: frinq-frontend/app/(app)/community/page.tsx
- Create: frinq-frontend/app/components/chat/CommunityHeader.tsx
- Create: frinq-frontend/app/components/chat/MessageList.tsx
- Create: frinq-frontend/app/components/chat/MessageBubble.tsx
- Create: frinq-frontend/app/components/chat/MessageComposer.tsx
- Create: frinq-frontend/app/lib/realtime.ts
- Create: frinq-frontend/app/lib/realtime.test.ts
- Modify: frinq-frontend/app/components/AppShell.tsx

**Produces:** A focused text-only archetype community with deterministic reconnect behavior.

- [ ] **Step 1: Write client-state tests**

Test state transitions for disconnected, connecting, connected, retrying, offline, auth-expired, suspended, and banned. Suspended/banned screens link to public support and never reconnect automatically. Test exponential reconnect delays of 1, 2, 4, 8, 16, and 30 seconds with full jitter, reset after a stable connection, and no retry while the browser or native shell reports offline.

- [ ] **Step 2: Implement ticketed connection setup**

Fetch a single-use ticket through apiFetch, open the WebSocket with only that ticket, and request a new ticket for every reconnect. On access-token expiry, refresh once through the central session coordinator, then reconnect. Never put a bearer token in a query string, analytics event, error message, or log.

- [ ] **Step 3: Implement history and optimistic sends**

Load the newest 50 messages, prepend older pages when requested, and maintain scroll position. Give each outbound message a UUID client_message_id. Render it as sending, replace it on message.created, mark retryable on disconnect, and retry with the same client_message_id to prevent duplicates.

- [ ] **Step 4: Keep rendering deliberately small**

Cap the in-memory list at 300 messages and offer Load older instead of adding a virtualization dependency for beta. Render text only; escape all content; do not support HTML, Markdown, URLs as anchors, images, audio, GIFs, reactions, threads, typing indicators, read receipts, or online-presence UI.

- [ ] **Step 5: Meet mobile accessibility basics**

Use a 44 by 44 CSS-pixel minimum touch target, visible focus, screen-reader labels, aria-live polite only for connection state, reduced-motion support, 16 px minimum composer font to avoid iOS zoom, keyboard-safe bottom spacing, and a high-contrast retry state. Do not announce every incoming message.

- [ ] **Step 6: Verify**

Run:

~~~powershell
npm test
npm run lint
npm run build
~~~

Manually verify on 320 px, 390 px, 768 px, and desktop widths with keyboard-only navigation.

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
feat: build resilient community chat UI
~~~

## Task 22: Add user-facing report, block, and mute controls

**Files:**

- Create: frinq-frontend/app/components/chat/MessageActions.tsx
- Create: frinq-frontend/app/components/chat/ReportDialog.tsx
- Create: frinq-frontend/app/components/chat/BlockDialog.tsx
- Modify: frinq-frontend/app/(app)/community/page.tsx
- Create: frinq-frontend/app/(app)/settings/community/page.tsx
- Create: frinq-frontend/app/components/chat/MessageActions.test.tsx

**Produces:** Store-visible safety tools accessible directly from user-generated content.

- [ ] **Step 1: Write interaction tests**

Assert that another user's message exposes Report and Block, the user's own message does not, report reasons are keyboard accessible, submission is idempotent, block confirmation explains the immediate effect, and muted state survives reload through the API.

- [ ] **Step 2: Implement message actions**

Use a clear action menu on each eligible message. After block succeeds, remove that user's visible messages immediately and close the dialog. After report succeeds, show a neutral acknowledgement without promising a specific enforcement outcome.

- [ ] **Step 3: Add community mute preference**

The setting affects push notifications only, not membership or in-app messages. Default to muted until the user explicitly opts in to notifications in Task 29.

- [ ] **Step 4: Verify**

Run component tests, lint, build, and a keyboard/screen-reader smoke test.

- [ ] **Step 5: Checkpoint**

Suggested commit if authorized:

~~~text
feat: expose report block and mute controls
~~~

## Task 23: Add a minimal editable public profile

**Files:**

- Modify: frinq-backend/app/schemas/user.py
- Modify: frinq-backend/app/api/v1/users.py
- Create: frinq-backend/tests/test_api/test_profile_edit.py
- Modify: frinq-frontend/app/(app)/profile/page.tsx
- Create: frinq-frontend/app/(app)/profile/edit/page.tsx
- Create: frinq-frontend/app/(app)/profile/edit/page.test.tsx

**Produces:** A user-controlled public identity without adding media uploads.

- [ ] **Step 1: Write backend contract tests**

Define GET /api/v1/users/me and PATCH /api/v1/users/me. Allow display_name only, normalized to 2..40 code points. Apply the same text-safety policy as chat, reserve impersonation/admin terms, reject unknown fields, and return only the authenticated user's own full response.

- [ ] **Step 2: Preserve archetype truth**

Show archetype, result summary, and profile fields derived from the completed quiz as read-only. A user cannot change archetype_slug through the profile endpoint. Avatar remains a deterministic bundled archetype asset; defer photo upload.

- [ ] **Step 3: Build view and edit screens**

Provide Save/Cancel, dirty-state confirmation, server error mapping, character count, and optimistic UI only after server acceptance. Ensure a first-time user gets a safe generated display name and is prompted to edit it before entering chat.

- [ ] **Step 4: Verify**

Run backend tests, frontend component tests, lint, and build.

- [ ] **Step 5: Checkpoint**

Suggested commit if authorized:

~~~text
feat: add minimal editable public profile
~~~

## Task 24: Add Terms acceptance, support, and complete account deletion

**Files:**

- Create: frinq-backend/migrations/014_legal_and_deletion.sql
- Create: frinq-backend/app/api/v1/legal.py
- Modify: frinq-backend/app/api/v1/auth.py
- Modify: frinq-backend/app/api/v1/otp.py
- Modify: frinq-backend/app/api/v1/users.py
- Modify: frinq-backend/app/api/v1/communities.py
- Modify: frinq-backend/app/api/v1/realtime.py
- Modify: frinq-backend/app/config.py
- Modify: frinq-backend/.env.example
- Modify: frinq-backend/app/main.py
- Create: frinq-backend/tests/test_api/test_legal_deletion.py
- Create: frinq-frontend/app/terms/page.tsx
- Create: frinq-frontend/app/terms/accept/page.tsx
- Create: frinq-frontend/app/privacy/page.tsx
- Create: frinq-frontend/app/community-rules/page.tsx
- Create: frinq-frontend/app/support/page.tsx
- Create: frinq-frontend/app/(app)/settings/account/page.tsx
- Create: frinq-frontend/app/delete-account/page.tsx
- Modify: frinq-frontend/app/page.tsx
- Modify: frinq-frontend/app/(quiz)/layout.tsx
- Modify: frinq-frontend/app/(quiz)/verify/page.tsx
- Modify: frinq-frontend/app/lib/session.ts
- Modify: frinq-frontend/app/components/AccountGate.tsx

**Produces:** Versioned consent, accessible support/legal pages, and deletion both inside and outside the app.

- [ ] **Step 1: Approve legal inputs before coding the gate**

The owner supplies counsel-reviewed Terms, Privacy Policy, community rules, support email, business identity/address requirements, retention periods, and countries excluded by providers or legal review. Engineering must not invent these documents or claim legal compliance.

- [ ] **Step 2: Write failing legal-gate tests**

Define GET /api/v1/legal/current and POST /api/v1/legal/accept. Store exact terms_version, privacy_version, accepted_at, locale, and source. Add one require_current_legal dependency to community history/preferences and WebSocket-ticket creation; the WebSocket handshake rechecks the current versions. A user who has not accepted the current required versions may access legal/support/deletion/session routes but cannot enter community chat.

The first-run splash must route to /terms/accept before any name, city, birth date, phone, quiz answer, or voice capture. Show separate, unchecked 18+ confirmation and Terms/Privacy agreement controls with working document links. Before authentication, store the explicit legal-version acknowledgement in sessionStorage only; after OTP creates the account, POST it immediately to /api/v1/legal/accept and clear the pending value. If persistence fails or the server versions changed, route back to the acceptance page. Returning users accept new versions before protected app routes. The server-side DOB check from Task 6 remains authoritative.

- [ ] **Step 3: Write failing deletion and re-verification tests**

Define authenticated POST /api/v1/auth/reverify/request, POST /api/v1/auth/reverify/verify, and DELETE /api/v1/users/me. The request endpoint sends an OTP only to the account's stored phone and accepts no phone field. Successful verification returns a single-purpose reauth token bound to user ID, session ID, action account_delete, and a five-minute expiry. DELETE accepts that token in a JSON body, consumes its jti once through Redis, and rejects login access tokens or tokens for another action. Apply the OTP limits from Task 18. Test that deletion:

- revokes all sessions and WebSocket tickets.
- deletes push tokens, blocks, memberships, quiz inputs, AI outputs, questionnaire data, tracking rows, RSVP/feedback records, matches/meetups, and unneeded raw exports.
- anonymizes retained moderation evidence and authored chat messages to a non-reversible deleted-user identity when retention is legally required.
- a later OTP registration with the same phone creates a fresh user ID and never reconnects deleted quiz, chat identity, analytics, or profile data.
- is idempotent and leaves an audit event containing no phone number.

Deleted data may remain only in encrypted backups for the counsel-approved backup retention period. Privacy copy must disclose that period. The protected operations audit retains deletion_id, former user UUID, and completed_at without phone/content so post-backup deletions can be replayed after a restore.

Migration 014 adds users.privacy_version and users.privacy_accepted_at plus a legal_acceptances history table containing user_id, terms_version, privacy_version, locale, source, and accepted_at. Inspect every foreign key before writing migration 014; use ON DELETE CASCADE only where deletion semantics are correct and an explicit transaction everywhere else.

- [ ] **Step 4: Implement in-app deletion**

Settings > Account must contain Delete account, explain irreversible effects, require fresh OTP, require typing DELETE, call the endpoint, clear secure storage, close realtime connections, and return to the signed-out screen. Do not hide deletion behind support contact.

- [ ] **Step 5: Implement the external deletion path**

The statically hosted https://app.frinq.in/delete-account page explains the same process, links to sign-in/re-verification, identifies Frinq and the developer, lists deleted/retained data categories and retention periods, and works outside the native shell. Use this exact URL in Google Play Console.

- [ ] **Step 6: Add legal and support navigation**

Terms, Privacy, Community Rules, Support, and Delete Account must be reachable before login and from Settings. Use real owner-supplied contact details. Hide community access until current acceptance succeeds.

- [ ] **Step 7: Verify**

Run:

~~~powershell
pytest tests/test_api/test_legal_deletion.py -v
pytest -q
Push-Location ..\frinq-frontend
npm test
npm run lint
npm run build
Pop-Location
~~~

Complete one deletion test against a disposable staging account and verify it cannot reconnect, refresh, or receive push.

- [ ] **Step 8: Checkpoint**

Suggested commit if authorized:

~~~text
feat: add legal acceptance support and account deletion
~~~

## Task 25: Add consented, privacy-safe product analytics

**Files:**

- Modify: frinq-frontend/app/lib/analytics.ts
- Create: frinq-frontend/app/(app)/settings/privacy/page.tsx
- Modify: frinq-frontend/app/privacy/page.tsx
- Modify: frinq-backend/app/api/v1/tracking.py
- Create: frinq-backend/tests/test_api/test_tracking_privacy.py
- Create: frinq-frontend/app/lib/analytics.test.ts

**Produces:** A small event system whose behavior matches store disclosures.

- [ ] **Step 1: Define the allowlist**

Permit only named events with minimal properties: screen_view, otp_requested, otp_verified, quiz_started, quiz_completed, result_viewed, community_opened, message_sent, report_submitted, block_created, notification_opt_in, and account_deleted. Never include phone, message text, voice content, quiz free text, names, access/refresh tokens, WebSocket tickets, IP addresses, or user-agent strings in client event properties.

- [ ] **Step 2: Test consent behavior**

Before opt-in, record only strictly necessary server security/audit events. Product analytics are off by default, remain off if dismissed, can be enabled or disabled in Privacy Settings, and stop immediately when disabled. Deletion removes user-linked product analytics as specified in Task 24.

- [ ] **Step 3: Replace raw Clarity calls**

Route all events through the allowlisted adapter. Remove every call that sends raw phone numbers or arbitrary payload objects. Disable text/input capture and session replay for OTP, profile, quiz, voice, chat, report, and deletion screens; if those exclusions cannot be proven in staging, do not ship Clarity in the native app.

- [ ] **Step 4: Keep disclosures synchronized**

Create a checked data inventory in the Privacy page source that maps each collected field to purpose, processor, retention, deletion behavior, App Privacy category, and Play Data Safety category. Product/legal review signs off before submission.

- [ ] **Step 5: Verify**

Run tests, inspect staging network requests, search built assets for a test phone and message string, then run lint and build.

- [ ] **Step 6: Checkpoint**

Suggested commit if authorized:

~~~text
privacy: gate analytics and remove PII payloads
~~~

### Phase 6 Gate

- [ ] Chat reconnect, optimistic-send, cursor-history, and accessibility tests pass.
- [ ] Report and block are reachable from each eligible message.
- [ ] Public profile exposes no phone or internal identifiers.
- [ ] Current Terms/Privacy acceptance gates chat.
- [ ] In-app and web account deletion pass with a disposable staging account.
- [ ] Analytics are opt-in and network inspection shows no prohibited data.
- [ ] Frontend lint, tests, and static build pass.

Stop and obtain product, moderation, privacy, and engineering review before Phase 7.

# Phase 7: Bare React Native foundation and native design system

## Task 26: Preserve the completed baseline and scaffold the production native app

**Files:**

- Modify: frinq-backend/docs/launch/execution-ledger.md
- Create: frinq-mobile/
- Create: frinq-mobile/package.json
- Create: frinq-mobile/package-lock.json
- Create: frinq-mobile/.nvmrc
- Create: frinq-mobile/.ruby-version
- Create: frinq-mobile/Gemfile
- Create: frinq-mobile/README.md
- Create: frinq-mobile/scripts/verify-native-config.mjs
- Create: frinq-mobile/scripts/verify-no-webview.mjs
- Create: frinq-mobile/docs/route-parity-matrix.md
- Create: frinq-mobile/docs/dependency-compatibility.md
- Modify: .gitignore

**Interfaces:**

- `verify-native-config.mjs` exits nonzero when identifiers, OS targets, cleartext policy, or New Architecture settings drift.
- `verify-no-webview.mjs` exits nonzero when Expo, Capacitor, Ionic, WebView, HTML-renderer, or live-development-server dependencies/configuration appear.

**Produces:** A reproducible React Native 0.86 Community CLI project for `in.frinq.app`, isolated from the completed web/admin/backend applications.

- [ ] **Step 1: Record and protect the real Phase 6 baseline**

From the repository root, record `git status --short`, `git diff --stat`, `git log -8 --oneline`, Node/npm/Python/Java versions, and the exact untracked Figma/font assets in the execution ledger. Run the current backend, frontend, and admin verification commands without modifying failures. The ledger must distinguish owner-declared completion from fresh verification evidence. Do not stage or commit the dirty Phase 6 tree.

- [ ] **Step 2: Initialize without a framework**

Run from the repository root:

~~~powershell
npx @react-native-community/cli@latest init FrinqMobile --version 0.86.0 --directory frinq-mobile
~~~

Expected: `frinq-mobile/android`, `frinq-mobile/ios`, a React Native package lock, Metro, Jest, TypeScript, and no Expo or Capacitor package.

If the CLI does not recognize `--directory`, stop and record its help output. Do not generate elsewhere and recursively move an unverified tree.

- [ ] **Step 3: Freeze project identity and supported platforms**

Change the generated Android namespace/application ID and iOS bundle identifier to `in.frinq.app`; set display name `Frinq`. Set Android minSdk 24, compileSdk 36, targetSdk 36, JDK 21, edge-to-edge support, and `usesCleartextTraffic=false` for release. Set iOS deployment target 15.1. Keep Hermes and New Architecture enabled.

`verify-native-config.mjs` must assert these values by reading the actual Gradle, manifest, Xcode project, plist, Podfile, and React Native configuration files.

- [ ] **Step 4: Add deterministic scripts**

`package.json` must provide:

~~~json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "jest",
    "verify:config": "node scripts/verify-native-config.mjs",
    "verify:no-webview": "node scripts/verify-no-webview.mjs",
    "verify": "npm run typecheck && npm run lint && npm test -- --runInBand && npm run verify:config && npm run verify:no-webview",
    "android:debug": "react-native run-android",
    "android:release-check": "cd android && gradlew.bat lintRelease testReleaseUnitTest assembleRelease"
  }
}
~~~

Use `bundle exec pod install` on macOS; do not invoke CocoaPods from Windows.

- [ ] **Step 5: Write the negative dependency/configuration tests**

Test the verification scripts against fixtures containing `@capacitor/core`, `expo`, `react-native-webview`, an `http://` production endpoint, a wrong bundle ID, old architecture disabled/enabled drift, and wrong SDK floors. Each fixture must fail with one precise reason.

- [ ] **Step 6: Establish the parity matrix**

List all 52 current Next.js routes. For each, record purpose, native destination/template, API calls, storage keys to replace, browser-only APIs, analytics events, loading/error/empty states, and whether the route remains public web after cutover. Mark screenshot-only matching fields as excluded.

- [ ] **Step 7: Verify on Windows/Android**

Run:

~~~powershell
Push-Location frinq-mobile
npm ci
npm run verify
Push-Location android
.\gradlew.bat clean assembleDebug lintDebug testDebugUnitTest
Pop-Location
Pop-Location
~~~

Expected: all checks pass and a debug APK is created. Record that iOS is scaffolded but not built.

- [ ] **Step 8: Checkpoint**

Suggested commit if separately authorized:

~~~text
build: scaffold bare react native app
~~~

## Task 27: Import licensed visual assets and build the native design primitives

**Files:**

- Create: frinq-mobile/src/design/tokens/colors.ts
- Create: frinq-mobile/src/design/tokens/typography.ts
- Create: frinq-mobile/src/design/tokens/spacing.ts
- Create: frinq-mobile/src/design/tokens/motion.ts
- Create: frinq-mobile/src/design/components/
- Create: frinq-mobile/src/design/motion/
- Create: frinq-mobile/src/assets/fonts/
- Create: frinq-mobile/src/assets/illustrations/
- Create: frinq-mobile/scripts/verify-assets.mjs
- Create: frinq-mobile/src/design/__tests__/tokens.test.ts
- Create: frinq-mobile/src/design/__tests__/components.test.tsx
- Create: frinq-mobile/THIRD_PARTY_NOTICES.md

**Interfaces:**

- `colors`: `brand.maroon`, `brand.cream`, `brand.peach`, `brand.brown` plus named accessible state tokens.
- `motion`: `enter`, `select`, `milestone`, and `reduced` recipes.
- Primitives expose semantic props and accessibility state; screens cannot pass arbitrary brand colors.

**Produces:** A tested native component and motion system derived from the supplied Figma references.

- [ ] **Step 1: Gate font and artwork provenance**

Inventory every asset under `App/Figma/Assets/`, `App/Figma/New folder/`, and the selected font folders. Keep source path, intended use, dimensions, checksum, and license/provenance. Add Borel plus its OFL notice. Add Vastago and record the owner's 2026-07-23 confirmation that the organization purchased it and its developer supplied this folder for building the app. Include any distributable notice required by the organization's license, but do not commit receipts, order details, license keys, or other confidential commercial records.

- [ ] **Step 2: Optimize native assets**

Remove duplicate Figma exports, status-bar crops, and obsolete matching-only art. Preserve original source files outside generated platform resource folders. Optimize approved PNGs without changing visible appearance, and use `react-native-svg` for waves/arrows/icons that must recolor or scale.

- [ ] **Step 3: Install compatible UI foundations**

Resolve lockfile versions compatible with React Native 0.86:

~~~powershell
npm install @react-navigation/native@7 @react-navigation/native-stack@7 @react-navigation/bottom-tabs@7
npm install react-native-screens@4 react-native-safe-area-context@5
npm install react-native-gesture-handler@3 react-native-reanimated@4.6 react-native-worklets@0.12
npm install react-native-svg react-native-haptic-feedback
~~~

Do not install NativeWind, Tailwind, a browser CSS runtime, or React Navigation 8 prerelease.

- [ ] **Step 4: Write token and primitive tests first**

Assert exact approved palette values, no raw hex values outside token files, 48 dp preferred touch targets, selected/disabled/busy/error accessibility state, large-text wrapping, decorative-art hiding, and reduced-motion behavior.

- [ ] **Step 5: Implement the component families**

Create `Screen`, `BrandHeading`, `BodyText`, `ArrowButton`, `PrimaryButton`, `TextField`, `PhoneField`, `OtpField`, `ChoicePill`, `ChoiceCard`, `ChoiceListRow`, `TagPicker`, `QuizHeader`, `QuizProgress`, `RapidFireTimer`, `OfflineBanner`, `Sheet`, `Dialog`, `Toast`, `EmptyState`, `ErrorState`, and `Skeleton`.

Reconstruct layouts natively; never use the full-screen screenshot PNGs as screen backgrounds.

- [ ] **Step 6: Implement motion and haptic recipes**

Use Reanimated worklets for press, selection, staggered entry, progress, wave/illustration, and milestone transitions. Query the platform reduced-motion setting and replace spatial/looping motion with a crossfade or immediate state. Pause indefinite animations in the background.

- [ ] **Step 7: Verify representative states**

Render cream form, cream choice, maroon milestone, long text, 200% text, reduced motion, and screen-reader states in component tests and the Android app. Compare against the reference language, not screenshot pixel coordinates.

- [ ] **Step 8: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: add native frinq design system
~~~

## Task 28: Add the native composition root, navigation, lifecycle, and safe telemetry

**Files:**

- Create: frinq-mobile/src/app/App.tsx
- Create: frinq-mobile/src/app/AppProviders.tsx
- Create: frinq-mobile/src/app/AppErrorBoundary.tsx
- Create: frinq-mobile/src/app/boot/bootMachine.ts
- Create: frinq-mobile/src/navigation/RootNavigator.tsx
- Create: frinq-mobile/src/navigation/AuthNavigator.tsx
- Create: frinq-mobile/src/navigation/QuizNavigator.tsx
- Create: frinq-mobile/src/navigation/MainTabs.tsx
- Create: frinq-mobile/src/services/lifecycle/appLifecycle.ts
- Create: frinq-mobile/src/services/network/networkState.ts
- Create: frinq-mobile/src/services/telemetry/analytics.ts
- Create: frinq-mobile/src/services/telemetry/crashReporter.ts
- Create: frinq-mobile/src/app/__tests__/bootMachine.test.ts
- Create: frinq-mobile/src/navigation/__tests__/routing.test.tsx

**Interfaces:**

- `BootState = checking | authRequired | legalRequired | quizInProgress | processing | active | error | suspended | banned`.
- `routeForUser(user): RootRoute`.
- `track(event: AllowedEvent): void`; arbitrary event names/properties are impossible at the type boundary.

**Produces:** One deterministic native root that cannot flash a protected screen before session/legal state is known.

- [ ] **Step 1: Write boot and route tests**

Cover no credential, refresh success/failure/reuse, stale legal version, each onboarding state, missing membership, suspended/banned state, offline boot, and notification deep link received before restoration.

- [ ] **Step 2: Compose native providers once**

Root order is `GestureHandlerRootView`, `SafeAreaProvider`, error boundary, query provider, session provider, analytics-consent provider, and navigation container. Do not nest navigation containers.

- [ ] **Step 3: Implement lifecycle and reachability**

Install NetInfo 12 and TanStack Query 5. Connect NetInfo to the query online manager and React Native AppState to the focus manager. Background transitions pause timers/motion and notify session/realtime/audio adapters. Resume revalidates session before protected reconnection.

- [ ] **Step 4: Implement native navigation**

Use native stacks for auth/legal/quiz/detail flows and three bottom tabs: Community, Profile, Settings. The Vibe report is reachable from Profile. Android Back closes transient UI, then navigates, and confirms before discarding unsaved data.

- [ ] **Step 5: Add privacy-minimal telemetry**

Use the Phase 6 event allowlist and explicit consent. Add React Native Firebase Crashlytics only as redacted operational reporting; disable Firebase Analytics and session replay. Scrub custom keys and global handlers of phone, tokens, quiz/message/report text, voice paths, and push tokens.

- [ ] **Step 6: Verify**

Run native verification and Android process-background/resume/offline/back smoke tests. Assert no protected content renders while `BootState=checking`.

- [ ] **Step 7: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: add native app root and navigation
~~~

### Phase 7 Gate

- [ ] The preserved Phase 6 baseline and untracked user assets are recorded without being overwritten.
- [ ] `frinq-mobile/` builds a debug APK from `npm ci` and contains no Expo, Capacitor, or WebView path.
- [ ] Bundle/application ID is `in.frinq.app`; SDK floors/targets and cleartext policy pass deterministic checks.
- [ ] Design primitives match the approved visual language and pass accessibility/reduced-motion tests.
- [ ] The native asset manifest records the owner-confirmed Vastago license provenance and any required distributable notice.
- [ ] Root navigation, lifecycle, offline banner, and telemetry consent tests pass.
- [ ] iOS is truthfully recorded as not yet built.

Continue to Phase 8 after recording the gate. Stop only for a real blocker or new product decision.

# Phase 8: Native sessions, legal gate, and the complete quiz

## Task 29: Implement secure rotating sessions, typed API access, and encrypted drafts

**Files:**

- Create: frinq-mobile/src/services/api/contracts.ts
- Create: frinq-mobile/src/services/api/apiClient.ts
- Create: frinq-mobile/src/services/api/apiError.ts
- Create: frinq-mobile/src/services/session/SessionCoordinator.ts
- Create: frinq-mobile/src/storage/secureCredentials.ts
- Create: frinq-mobile/src/storage/encryptedStorage.ts
- Create: frinq-mobile/src/storage/quizDraftRepository.ts
- Create: frinq-mobile/src/services/api/__tests__/apiClient.test.ts
- Create: frinq-mobile/src/services/session/__tests__/SessionCoordinator.test.ts
- Create: frinq-mobile/src/storage/__tests__/quizDraftRepository.test.ts

**Interfaces:**

- `saveRefreshToken(token: string): Promise<void>`
- `loadRefreshToken(): Promise<string | null>`
- `clearRefreshToken(): Promise<void>`
- `apiRequest<T>(request: ApiRequest): Promise<T>`
- `restoreSession(): Promise<BootSession>`
- `QuizDraftRepository.load/save/clear/migrate`

**Produces:** One concurrency-safe session/API boundary and bounded encrypted quiz recovery.

- [ ] **Step 1: Install secure storage**

Resolve compatible versions:

~~~powershell
npm install react-native-keychain@10 react-native-mmkv@4 react-native-nitro-modules
~~~

Store only the refresh token and a random draft-encryption key in Keychain/Keystore. Access tokens remain in module memory. MMKV uses AES-256 with the separate secure key; it never stores tokens, voice bytes, chat, or AI results.

- [ ] **Step 2: Freeze API models**

Derive TypeScript models from the running FastAPI OpenAPI document and compare them with actual Phase 1-6 response fixtures. Commit a reviewed contract snapshot and a script that fails when protected mobile endpoints drift incompatibly.

- [ ] **Step 3: Write session failure/concurrency tests**

Cover first boot, rotation, exactly one shared refresh for concurrent 401s, persistence before request retry, reuse/failure clearing, second-401 rejection, logout, ban, deletion, offline boot, and prohibited-value log redaction.

- [ ] **Step 4: Implement API/session boundaries**

Add Authorization only when an access token exists; add JSON headers only for JSON. Retry exactly once after a successful coordinated refresh. Never retry validation, 403, 404, or a second 401. Map server request IDs and safe codes without response-body leakage.

- [ ] **Step 5: Implement versioned encrypted quiz drafts**

Persist `schemaVersion`, owned `submissionId`, `lastRoute`, structured bounded answers, `updatedAt`, and sync metadata. Reject unknown versions, wrong users, invalid answer keys, and oversized strings/arrays. Local clear is mandatory on account change, logout-all, deletion, or safe restart.

- [ ] **Step 6: Verify**

Run Jest with mocked native modules, then Android instrumentation smoke for Keychain/Keystore persistence, process restart, logout clearing, and corrupted-draft recovery.

- [ ] **Step 7: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: add secure native sessions and drafts
~~~

## Task 30: Rebuild legal acceptance, phone OTP, and server-authoritative routing

**Files:**

- Create: frinq-mobile/src/features/legal/screens/LegalAcceptanceScreen.tsx
- Create: frinq-mobile/src/features/legal/screens/LegalDocumentScreen.tsx
- Create: frinq-mobile/src/features/auth/screens/LandingScreen.tsx
- Create: frinq-mobile/src/features/auth/screens/PhoneScreen.tsx
- Create: frinq-mobile/src/features/auth/screens/OtpScreen.tsx
- Create: frinq-mobile/src/features/auth/authService.ts
- Create: frinq-mobile/src/features/auth/__tests__/authFlow.test.tsx
- Create: frinq-mobile/src/features/legal/__tests__/legalGate.test.tsx

**Produces:** Native first-run and returning-user auth that cannot bypass current legal versions.

- [ ] **Step 1: Write full state tests**

Test current/new legal version, 18+ unchecked/checked, invalid/expired OTP, resend cooldown, provider failure, returning active user, processing user, error user, banned user, deep link, and offline state.

- [ ] **Step 2: Implement reference-driven native screens**

Use the supplied maroon landing and cream phone/OTP visual language with Borel/Vastago tokens, native keyboard types, autofill/one-time-code hints, accessible errors, and 48 dp controls. Do not reuse screenshot status bars or matching copy.

- [ ] **Step 3: Preserve the legal transaction**

Fetch current legal versions before collecting personal/quiz data. Keep pre-auth acceptance in process/encrypted bounded state, post it immediately after OTP account creation, and clear it only after server acknowledgement. A version race routes back to acceptance.

- [ ] **Step 4: Route from server state**

After OTP or refresh, route only from `onboarding_state`, legal state, and membership. Never persist an assessment-complete boolean or infer active status from a cached Vibe result.

- [ ] **Step 5: Verify**

Run component/journey tests plus Android manual checks for keyboard, OTP paste/autofill, resend timer, airplane mode, process kill, large text, TalkBack, and screenshots at compact/current phone sizes.

- [ ] **Step 6: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: rebuild native legal and otp flow
~~~

## Task 31: Define the quiz domain and reusable native screen registry

**Files:**

- Create: frinq-mobile/src/features/quiz/domain/quizDefinition.ts
- Create: frinq-mobile/src/features/quiz/domain/answerSchema.ts
- Create: frinq-mobile/src/features/quiz/domain/quizMachine.ts
- Create: frinq-mobile/src/features/quiz/screens/templates/
- Create: frinq-mobile/src/features/quiz/components/
- Create: frinq-mobile/src/features/quiz/__tests__/quizDefinition.test.ts
- Create: frinq-mobile/src/features/quiz/__tests__/quizMachine.test.ts
- Modify: frinq-mobile/docs/route-parity-matrix.md

**Interfaces:**

- `QuizStep` is a closed discriminated union for intro, text, date, single choice, multi choice, tags, card choice, rapid fire, voice/text, and milestone.
- `validateAnswer(step, value): ValidationResult`
- `nextStep(stepId, answers): StepId`
- `quizMachine.transition(event): QuizState`

**Produces:** A typed native representation of the actual 38-step product without a server-editable-question feature.

- [ ] **Step 1: Audit every web route before encoding it**

For each quiz route, record exact copy, answer key, option values, branch rules, API/storage behavior, analytics event, illustration, back behavior, and error state. Treat the current backend accepted payload as authoritative when web code and screenshots differ.

- [ ] **Step 2: Write structural tests**

Assert unique IDs/answer keys, reachable nonterminal steps, no dead-end branch, correct first/last step, valid progress ordering, backend payload compatibility, excluded matching-only fields, and parity for all existing web routes.

- [ ] **Step 3: Implement tested templates**

Build native templates from Task 27 primitives. Templates own layout, focus, keyboard avoidance, selection semantics, Continue enablement, motion, large-text scrolling, and error presentation; definitions own copy/options/assets/branch metadata.

- [ ] **Step 4: Implement one quiz state machine**

Local answer update saves encrypted draft first, then debounces an owned partial save. Navigation waits only when the next step requires confirmed server state. Back edits the same submission and does not create another user/submission.

- [ ] **Step 5: Verify**

Run definition/state tests and render every registered step at compact/current phone widths, 200% text, reduced motion, and offline state. No screen may import browser storage, `window`, `document`, or Next routing.

- [ ] **Step 6: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: define native quiz domain and templates
~~~

## Task 32: Implement every quiz screen, synchronization, and recovery path

**Files:**

- Create: frinq-mobile/src/features/quiz/screens/
- Create: frinq-mobile/src/features/quiz/quizSyncService.ts
- Create: frinq-mobile/src/features/quiz/quizSubmissionService.ts
- Create: frinq-mobile/src/features/quiz/__tests__/quizJourney.test.tsx
- Create: frinq-mobile/src/features/quiz/__tests__/quizRecovery.test.tsx
- Modify: frinq-mobile/docs/route-parity-matrix.md

**Produces:** Native parity for the full questionnaire, including branching and rapid-fire behavior.

- [ ] **Step 1: Write critical journey tests before screens**

Cover first answer to final answer, every conditional branch, rapid-fire timer expiry, app background during timer, offline edit/reconnect, process kill/restore, server conflict, invalid draft, retry, back navigation, and final payload equality with a known web fixture.

- [ ] **Step 2: Implement all registered screens**

Use supplied reference styling for name, single/multi choice, tags, date, rapid fire, and milestone families. Reuse existing Frinq quiz copy/choices and approved existing illustrations where the screenshots have no equivalent. Do not add screenshot-only profile/matching questions.

- [ ] **Step 3: Implement resilient synchronization**

Save locally on each valid edit; debounce partial server saves; expose syncing/saved/offline/error state without blocking ordinary navigation; retry with the owned submission ID; and reject a response tied to another user or submission.

- [ ] **Step 4: Finalize exactly once**

Validate the complete payload locally, send through the authenticated owned endpoint, store returned processing state, clear editable draft only after server acknowledgement, and route to processing. A repeated tap/retry must not enqueue duplicate durable work.

- [ ] **Step 5: Verify**

Run native tests, backend quiz tests, Android full journey with provider-approved test OTP/AI stubs, memory/process recreation, TalkBack, large text, and slow/offline network.

- [ ] **Step 6: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: complete native quiz journey
~~~

## Task 33: Add optional native voice answers and durable processing states

**Files:**

- Create: frinq-mobile/src/services/audio/AudioRecorderAdapter.ts
- Create: frinq-mobile/src/features/quiz/components/VoiceAnswer.tsx
- Create: frinq-mobile/src/features/quiz/screens/StoryScreen.tsx
- Create: frinq-mobile/src/features/vibe-report/screens/ProcessingScreen.tsx
- Create: frinq-mobile/src/services/audio/__tests__/AudioRecorderAdapter.test.ts
- Create: frinq-mobile/src/features/vibe-report/__tests__/processing.test.tsx
- Modify: frinq-backend/app/api/v1/voice.py
- Create: frinq-backend/tests/test_api/test_voice_formats.py
- Modify: frinq-mobile/android/app/src/main/AndroidManifest.xml
- Modify: frinq-mobile/ios/FrinqMobile/Info.plist

**Produces:** Foreground-only optional native recording with text fallback and truthful durable-processing recovery.

- [ ] **Step 1: Prove the audio dependency before feature code**

Install `react-native-audio-api@0.12` and build its minimal file-recording example on Android with React Native 0.86/New Architecture/API 24 and API 36. Record version, architectures, 16 KB page result, MIME/container, and interruption behavior. A compatibility failure blocks this task; do not switch to Expo or an unreviewed recorder package.

- [ ] **Step 2: Write adapter/component tests**

Cover idle/requesting/recording/stopping/uploading/success/error/cancelled, denial/permanent denial, 120-second cap, interruption, background stop, cleanup, retry, and text fallback.

- [ ] **Step 3: Implement foreground recording**

Request microphone only after Record. Use a cache file with a generated name, supported native M4A/AAC settings, no background audio entitlement/service, and guaranteed stop/cleanup on unmount/background/cancel. Delete the local file after upload or abandonment.

- [ ] **Step 4: Enforce backend upload rules**

Accept only tested native formats, verify size/signature, cap 10 MB/120 seconds, generate server-side names, and never serve uploaded bytes as active content. Preserve the PII pipeline and ownership checks.

- [ ] **Step 5: Implement processing/error recovery**

Poll/back off or use the existing status endpoint; pause in background/offline; restore after process death; show success only when the server returns active membership; expose bounded retry/support for exhausted jobs.

- [ ] **Step 6: Verify**

Run all native/backend tests and Android real-device microphone checks. Record iOS microphone/interruptions as pending for Task 42.

- [ ] **Step 7: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: add native voice and processing flow
~~~

### Phase 8 Gate

- [ ] Refresh rotation, concurrent 401, logout, banned, and secure-storage tests pass.
- [ ] Current legal acceptance cannot be bypassed.
- [ ] All actual quiz routes/branches map to native screens; matching-only screenshot fields remain excluded.
- [ ] Encrypted draft recovery works across offline/process-restart cases without storing tokens or voice.
- [ ] Final submission is idempotent and server-authoritative.
- [ ] Android voice grant/deny/record/upload/cleanup and text fallback pass.
- [ ] Processing resumes and reaches active only after canonical membership exists.
- [ ] iOS remains explicitly pending Task 42.

Continue to Phase 9 after recording the gate.

# Phase 9: Native Vibe report, app shell, profile, legal, and deletion

## Task 34: Build the collectible Vibe card and complete native report

**Files:**

- Create: frinq-mobile/src/features/vibe-report/components/VibeCard.tsx
- Create: frinq-mobile/src/features/vibe-report/components/ReportSection.tsx
- Create: frinq-mobile/src/features/vibe-report/screens/VibeReportScreen.tsx
- Create: frinq-mobile/src/features/vibe-report/vibeReportService.ts
- Create: frinq-mobile/src/features/vibe-report/shareVibeCard.ts
- Create: frinq-mobile/src/features/vibe-report/__tests__/VibeReportScreen.test.tsx
- Create: frinq-mobile/src/features/vibe-report/__tests__/shareVibeCard.test.ts

**Interfaces:**

- `loadVibeReport(): Promise<VibeReport>`
- `shareVibeCard(cardRef, archetype): Promise<ShareResult>`

**Produces:** A native accessible report with one shareable, collectible archetype card.

- [ ] **Step 1: Freeze the report contract**

Map every server field currently rendered by `vibe-box/page.tsx`, all 24 canonical archetypes, illustration fallback, processing/error states, and share-safe text. No native code derives or edits `archetype_slug`.

- [ ] **Step 2: Write report/card tests**

Cover loading, active, missing optional sections, unknown asset fallback, long localized-like text expansion, retry, stale membership, sharing cancellation/error, 200% text, screen reader, and reduced motion.

- [ ] **Step 3: Implement the native card**

Use approved maroon/cream/peach tokens, canonical illustration, archetype title, short descriptor, and Frinq mark. The on-screen card is responsive; the share capture renders a separate fixed-size, noninteractive composition with no phone/user ID/token.

- [ ] **Step 4: Implement the full report**

Render labeled editorial sections below the card, preserve server order/content, and provide deterministic loading/error states. Avoid a monolithic screen by splitting report section types.

- [ ] **Step 5: Add image sharing**

Resolve compatible `react-native-view-shot` and `react-native-share` versions. Capture only on explicit user action, remove temporary files after share completion/cancel, and provide a text-only fallback.

- [ ] **Step 6: Verify**

Test all 24 archetype fixtures, compact/current Android phones, large text, TalkBack, reduced motion, offline cached display policy, and share artifact absence of private strings.

- [ ] **Step 7: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: add native vibe card and report
~~~

## Task 35: Build the native app shell, profile, and settings

**Files:**

- Create: frinq-mobile/src/features/community/screens/CommunityPlaceholderScreen.tsx
- Create: frinq-mobile/src/features/profile/screens/ProfileScreen.tsx
- Create: frinq-mobile/src/features/profile/screens/EditProfileScreen.tsx
- Create: frinq-mobile/src/features/profile/profileService.ts
- Create: frinq-mobile/src/features/settings/screens/SettingsScreen.tsx
- Create: frinq-mobile/src/features/settings/screens/CommunitySettingsScreen.tsx
- Create: frinq-mobile/src/features/settings/screens/PrivacySettingsScreen.tsx
- Create: frinq-mobile/src/features/settings/__tests__/settings.test.tsx
- Create: frinq-mobile/src/features/profile/__tests__/profile.test.tsx

**Produces:** Native Community/Profile/Settings tabs with safe identity and settings behavior.

- [ ] **Step 1: Write navigation/profile/settings tests**

Cover tab state, deep links, active membership requirement, profile fetch/edit validation, immutable archetype, dirty exit confirmation, community mute, analytics opt-in/out, logout, suspended/banned state, and API error mapping.

- [ ] **Step 2: Implement the branded tab shell**

Use native bottom tabs, safe areas, keyboard hiding, accessible selected state, and brand-controlled icons. Community is the initial active destination; Profile exposes Vibe report; Settings exposes all account/privacy controls.

- [ ] **Step 3: Implement profile**

Show safe display name, canonical archetype, bundled archetype asset, and report entry. Edit only the server-approved display name. Never show phone, internal IDs, or matching fields.

- [ ] **Step 4: Implement settings**

Add community mute, notifications entry, analytics consent, Terms, Privacy, Community Rules, Support, logout, and Delete Account. Logout closes realtime, deregisters the caller installation when available, clears session/draft/query state, and routes to signed-out root.

- [ ] **Step 5: Verify**

Run tests and Android manual navigation/profile/settings/large-text/TalkBack/offline/error checks.

- [ ] **Step 6: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: add native app shell profile and settings
~~~

## Task 36: Complete native legal documents, support, and account deletion

**Files:**

- Create: frinq-mobile/src/features/legal/screens/LegalHubScreen.tsx
- Create: frinq-mobile/src/features/legal/screens/SupportScreen.tsx
- Create: frinq-mobile/src/features/settings/screens/AccountScreen.tsx
- Create: frinq-mobile/src/features/settings/screens/DeleteAccountScreen.tsx
- Create: frinq-mobile/src/features/settings/deleteAccountService.ts
- Create: frinq-mobile/src/features/settings/__tests__/deleteAccount.test.tsx
- Modify: frinq-frontend/app/terms/page.tsx
- Modify: frinq-frontend/app/privacy/page.tsx
- Modify: frinq-frontend/app/community-rules/page.tsx
- Modify: frinq-frontend/app/support/page.tsx
- Modify: frinq-frontend/app/delete-account/page.tsx

**Produces:** Native and public-web legal/support/deletion paths that agree with backend behavior and store declarations.

- [ ] **Step 1: Write re-verification/deletion tests**

Cover OTP request bound to stored phone, invalid/expired/replayed reauth token, typing DELETE, cancellation, server failure, successful deletion, local credential/draft/query/push cleanup, WebSocket closure, and fresh registration not reconnecting prior data.

- [ ] **Step 2: Implement legal/support navigation**

Render accessible native summaries/current acceptance state and open canonical HTTPS public documents only after explicit user action. Do not embed a WebView. Keep all documents available before login and from Settings.

- [ ] **Step 3: Implement destructive deletion flow**

Explain irreversibility, require fresh OTP and typed confirmation, call the existing deletion endpoint, wait for acknowledgement, then clear all local identity and return to signed-out root. Never hide deletion behind support.

- [ ] **Step 4: Keep public pages truthful**

Update public pages only as needed to reflect native navigation, exact deletion behavior, retention, support contact, and store URLs. Follow `frinq-frontend/AGENTS.md` and current local Next.js docs.

- [ ] **Step 5: Verify**

Run backend deletion tests, native tests, public frontend lint/test/build, and one disposable staging deletion journey on Android.

- [ ] **Step 6: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: complete native legal and deletion flows
~~~

### Phase 9 Gate

- [ ] All 24 canonical archetypes render the correct Vibe card/report asset and content.
- [ ] Shared card artifacts contain no private data and temporary files are removed.
- [ ] Community/Profile/Settings navigation and server-authoritative guards pass.
- [ ] Profile cannot mutate archetype or expose phone/internal IDs.
- [ ] Legal/support/deletion are reachable before login and from Settings without WebView.
- [ ] Disposable Android deletion revokes access and clears native state.
- [ ] Public legal-site verification passes.

Continue to Phase 10 after recording the gate.

# Phase 10: Native community thread and privacy-safe push

## Task 37: Implement the ticketed native realtime client and message store

**Files:**

- Create: frinq-mobile/src/services/realtime/CommunitySocket.ts
- Create: frinq-mobile/src/services/realtime/realtimeMachine.ts
- Create: frinq-mobile/src/features/community/communityMessageStore.ts
- Create: frinq-mobile/src/services/realtime/__tests__/CommunitySocket.test.ts
- Create: frinq-mobile/src/services/realtime/__tests__/realtimeMachine.test.ts

**Interfaces:**

- `connect(): Promise<void>`
- `disconnect(reason): void`
- `send(body, clientMessageId): Promise<PendingMessage>`
- `loadHistory(cursor?): Promise<MessagePage>`
- Realtime states: disconnected, connecting, connected, retrying, offline, authExpired, suspended, banned.

**Produces:** A deterministic ticket-only WebSocket boundary with deduplicated optimistic sends.

- [ ] **Step 1: Port and strengthen the web state tests**

Cover single-use ticket fetch, 1/2/4/8/16/30-second full-jitter backoff, stable reset, offline pause, app background/resume, refresh-before-reconnect, ticket rejection, suspended/banned terminal state, duplicate event, out-of-order history, and listener cleanup.

- [ ] **Step 2: Implement ticketed connection**

Fetch a fresh ticket for each connection/reconnect. Put only the single-use ticket in the URL. Never include access/refresh tokens, phone, or message content in logs/errors/telemetry.

- [ ] **Step 3: Implement history and optimistic identity**

Load newest 50, render oldest-to-newest, prepend by opaque cursor, cap in-memory state at the approved bound, and use one UUID `client_message_id` across retries so the server resolves duplicates.

- [ ] **Step 4: Integrate lifecycle and sessions**

Offline pauses reconnect. Background closes after the approved grace period. Resume revalidates session/legal/membership before requesting a new ticket. Logout/ban/deletion disconnect immediately and discard pending state.

- [ ] **Step 5: Verify**

Run fake-clock/unit tests and Android two-client staging tests for send, reconnect, duplicate prevention, history, offline, background, and auth rotation.

- [ ] **Step 6: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: add native community realtime client
~~~

## Task 38: Build the accessible community-thread UI and safety controls

**Files:**

- Create: frinq-mobile/src/features/community/screens/CommunityScreen.tsx
- Create: frinq-mobile/src/features/community/components/CommunityHeader.tsx
- Create: frinq-mobile/src/features/community/components/MessageList.tsx
- Create: frinq-mobile/src/features/community/components/CommunityMessage.tsx
- Create: frinq-mobile/src/features/community/components/MessageComposer.tsx
- Create: frinq-mobile/src/features/community/components/MessageActionSheet.tsx
- Create: frinq-mobile/src/features/community/components/ReportSheet.tsx
- Create: frinq-mobile/src/features/community/components/BlockDialog.tsx
- Create: frinq-mobile/src/features/community/__tests__/CommunityScreen.test.tsx
- Create: frinq-mobile/src/features/community/__tests__/safetyActions.test.tsx

**Produces:** The approved calm community-thread design with direct report/block/mute access.

- [ ] **Step 1: Write UI behavior/accessibility tests**

Cover grouped author context, own-message accent, timestamps/actions on demand, sending/retry state, pagination scroll preservation, keyboard composer, empty/error/offline/banned state, report reason, block removal, mute, screen-reader order, and large text.

- [ ] **Step 2: Implement the thread layout**

Use a virtualized native list with stable keys and measured prepend behavior. Do not use private-chat left/right bubbles, post cards, Markdown, HTML, auto-linking, images, reactions, typing, receipts, or presence.

- [ ] **Step 3: Implement composer and optimistic recovery**

Plain text only, 1-1000 code points, native keyboard-safe placement, send disabled for invalid/offline/terminal state, and retry with the original client ID. Pending messages are process-memory only.

- [ ] **Step 4: Implement report/block/mute**

Expose actions on each eligible other-user message. Report is idempotent and neutral. Block immediately removes blocked-user messages after server success. Mute affects push, not membership/in-app history.

- [ ] **Step 5: Verify**

Run tests plus Android TalkBack, 200% text, keyboard/emoji switching, pagination, rapid incoming messages, offline/reconnect, report/block/mute, and low-memory process recreation.

- [ ] **Step 6: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: build native community thread and safety ui
~~~

## Task 39: Add opt-in native push and durable backend delivery

**Files:**

- Create: frinq-mobile/src/services/push/pushService.ts
- Create: frinq-mobile/src/features/settings/screens/NotificationSettingsScreen.tsx
- Create: frinq-mobile/src/services/push/__tests__/pushService.test.ts
- Modify: frinq-mobile/android/app/src/main/AndroidManifest.xml
- Modify: frinq-mobile/ios/FrinqMobile/AppDelegate.swift
- Create: frinq-backend/app/core/push.py
- Create: frinq-backend/app/api/v1/push.py
- Create: frinq-backend/app/workers/tasks/push.py
- Modify: frinq-backend/app/workers/queue.py
- Modify: frinq-backend/app/core/realtime.py
- Modify: frinq-backend/app/api/v1/sessions.py
- Modify: frinq-backend/app/config.py
- Modify: frinq-backend/.env.example
- Modify: frinq-backend/app/main.py
- Modify: frinq-backend/requirements.txt
- Create: frinq-backend/tests/test_api/test_push.py
- Create: frinq-backend/tests/test_core/test_push.py
- Create: frinq-backend/tests/test_workers/test_push.py

**Produces:** Generic, throttled community-activity notifications with complete opt-out and cleanup.

- [ ] **Step 1: Install native Firebase packages**

Resolve current React Native Firebase app, messaging, and Crashlytics packages compatible with React Native 0.86/New Architecture/API 24/16 KB pages. Never commit `GoogleService-Info.plist`, `google-services.json`, APNs keys, or service-account credentials; provide documented local/CI injection.

- [ ] **Step 2: Write backend contracts**

Implement/test:

~~~text
POST   /api/v1/push/tokens
DELETE /api/v1/push/tokens/{installation_id}
PATCH  /api/v1/push/preferences
~~~

Preserve the encrypted-token/HMAC lookup, ownership transfer, logout/ban/deletion cleanup, provider invalid-token removal, and idempotency requirements from the original Task 29.

- [ ] **Step 3: Ask only after community value**

Show Not now / Enable notifications after community entry. Request OS permission only after Enable. Denial leaves the app usable and Settings explains OS configuration.

- [ ] **Step 4: Deliver privately and durably**

Use generic community activity copy without message/author/phone/quiz content. Enqueue after message commit/broadcast; provider failure never rejects the message. Suppress author, muted, banned, active-community socket, and non-opted users; throttle once per user/community/15 minutes.

- [ ] **Step 5: Handle installation/token/deep-link lifecycle**

Generate a non-secret installation UUID once, register on grant/token refresh, remove on caller logout, remove all on deletion/ban, and wait for boot/session/legal/membership validation before routing a tap to Community.

- [ ] **Step 6: Verify**

Run backend/native tests. On Android test foreground/background/terminated, grant/deny, token refresh, mute, active-socket suppression, tap routing, logout, deletion, and invalid token cleanup. Record iOS push as pending Task 42.

- [ ] **Step 7: Checkpoint**

Suggested commit if separately authorized:

~~~text
feat: add private native community notifications
~~~

### Phase 10 Gate

- [ ] Ticketed native realtime passes reconnect, auth, lifecycle, history, and duplicate tests.
- [ ] Community thread matches the approved interaction model and safety actions are directly reachable.
- [ ] No user content is rendered as HTML/Markdown or captured in telemetry.
- [ ] Android push is opt-in, generic, throttled, mute-aware, deep-link-safe, and cleaned on logout/deletion.
- [ ] Backend push tests and full backend suite pass.
- [ ] iOS realtime/push remain explicitly pending Task 42.

Continue to Phase 11 after recording the gate.

# Phase 11: Native parity, release configuration, final iPhone gate, and web cutover

## Task 40: Prove native parity, accessibility, and Android release quality

**Files:**

- Modify: frinq-mobile/docs/route-parity-matrix.md
- Create: frinq-mobile/docs/device-test-matrix.md
- Create: frinq-mobile/docs/accessibility-checklist.md
- Create: frinq-mobile/scripts/verify-release-artifact.mjs
- Create: frinq-mobile/src/__tests__/criticalJourneys.test.tsx

**Produces:** Traceable proof that the native app replaces every required consumer behavior.

- [ ] **Step 1: Close every parity row**

Each required web route/behavior maps to a native screen/state/test or an explicitly retained public page. Compare copy, answer keys, API payloads, legal/safety actions, analytics events, error/loading/empty/offline behavior, and archetype assets. No row may say “similar,” “later,” or “not tested.”

- [ ] **Step 2: Run automated accessibility gates**

Assert roles/names/state/focus, 48 dp targets, color contrast, 200% text, reduced motion, no color-only meaning, keyboard-safe controls, decorative-art hiding, and no announcement of every incoming message.

- [ ] **Step 3: Test Android device classes**

At minimum cover API 24 representative emulator/device, Android 13+, current Android/API 36, compact/current phones, tablet compatibility width, TalkBack, large text/display, reduced motion, slow network, airplane mode, process kill, app upgrade, microphone, notifications, and low-memory recreation.

- [ ] **Step 4: Measure release performance**

Record cold/warm start, JS/native crash-free run, quiz transition smoothness, long-report scroll, 300-message list scroll, memory after repeated navigation, APK/AAB sizes, ANRs, and release endpoint/network behavior. Fix measured regressions; do not add speculative optimization.

- [ ] **Step 5: Scan Android release artifact**

Build Release AAB/APK and fail on localhost, HTTP production endpoints, source maps if disallowed, test phone/OTP, server secrets, service-account keys, WebView/Capacitor/Expo strings attributable to dependencies/config, wrong app ID, debug signing, or missing 16 KB compatibility.

- [ ] **Step 6: Verify**

Run all native/backend/public-web/admin suites from locked installs plus Android lint/unit/release build. Attach the matrix and command outputs to the ledger.

- [ ] **Step 7: Checkpoint**

Suggested commit if separately authorized:

~~~text
test: prove native parity and android release
~~~

## Task 41: Add production identity, permissions, privacy metadata, and store assets

**Files:**

- Create: frinq-mobile/ios/FrinqMobile/PrivacyInfo.xcprivacy
- Modify: frinq-mobile/ios/FrinqMobile/Info.plist
- Modify: frinq-mobile/ios/FrinqMobile/Images.xcassets/
- Modify: frinq-mobile/android/app/src/main/AndroidManifest.xml
- Modify: frinq-mobile/android/app/src/main/res/
- Create: frinq-mobile/store/metadata/en-IN.md
- Create: frinq-mobile/store/privacy-data-inventory.md
- Create: frinq-mobile/store/reviewer-notes.md
- Create: frinq-mobile/store/territory-review.md
- Create: frinq-mobile/scripts/verify-store-assets.mjs

**Produces:** Complete native identity and metadata ready for final device/archive validation.

- [ ] **Step 1: Freeze owner-controlled identity**

Approve product name, subtitle/short description, category, support/privacy/deletion URLs, copyright, seller/developer name, support email, and `in.frinq.app`. Confirm the owner-approved Vastago provenance record and resolve any remaining trademark or asset-license issues before final asset work.

- [ ] **Step 2: Generate native assets**

Use one approved opaque 1024x1024 icon, Android adaptive foreground/background, launch artwork, notification icon/channel, and truthful store screenshots later captured from the native release binary. No Capacitor/Expo branding.

- [ ] **Step 3: Declare only used permissions/capabilities**

Add microphone explanation, push entitlements/capabilities, orientations, backup exclusions for credentials/drafts, export-compliance value based on approved guidance, and no location/camera/photos/background-microphone capability.

- [ ] **Step 4: Build privacy evidence from actual dependencies**

Inventory Required Reason APIs and collected/transmitted data from the React Native runtime, secure storage, MMKV, Firebase messaging/Crashlytics, audio, API, and app code. Add only documented Apple reason codes and reconcile with Apple App Privacy/Play Data Safety.

- [ ] **Step 5: Add deterministic metadata checks**

Verify icon dimensions/alpha, application IDs, versions, permission strings, privacy manifest, URL schemes, release endpoint, backup rules, font notices/license evidence, and absence of forbidden permissions.

- [ ] **Step 6: Checkpoint**

Suggested commit if separately authorized:

~~~text
release: add native identity privacy and store metadata
~~~

## Task 42: Run the one consolidated Mac, Xcode, and physical-iPhone gate

**Files:**

- Create: frinq-mobile/docs/ios-final-test-runbook.md
- Modify: frinq-backend/docs/launch/execution-ledger.md

**Produces:** The first and final authoritative iOS build/device evidence for the completed native feature set.

- [ ] **Step 1: Prepare an exact handoff**

Record the exact Git commit/working-tree patch, Node/npm/Ruby/Bundler/CocoaPods/Xcode versions, required locally injected Firebase files, signing team, bundle ID, API environment, test accounts, commands, expected output, and rollback/cleanup. Do not send secrets through the document.

- [ ] **Step 2: Bootstrap on the physical Mac**

Run:

~~~bash
git status --short
cd frinq-mobile
npm ci
bundle install
cd ios
bundle exec pod install --repo-update
cd ..
npm run verify
open ios/FrinqMobile.xcworkspace
~~~

Expected: locked dependencies install, pods resolve, verification passes, and the workspace opens. A failure is copied verbatim into the ledger and returned to implementation.

- [ ] **Step 3: Build and install Debug on the connected iPhone**

Enable Developer Mode, trust the Mac, select the physical iPhone and approved signing team, build, install, and launch. Confirm `in.frinq.app`, Frinq name/icon/splash, production-like HTTPS environment, and no Metro/live-server requirement for Release.

- [ ] **Step 4: Execute the complete iPhone journey**

Test legal acceptance, OTP new/returning account, every quiz family/branch, encrypted resume, offline/reconnect, voice grant/deny/interruption/background/cleanup, processing/retry, all 24-asset fallback rules, Vibe card/share, tabs, profile, settings, community history/send/reconnect, report/block/mute, push grant/deny/background/terminated/tap, logout, fresh login, and disposable account deletion.

- [ ] **Step 5: Execute iOS accessibility/lifecycle checks**

Test VoiceOver, 200% text, Increase Contrast, Reduce Motion, keyboard/autofill, safe areas, app background/foreground, screen lock, process kill/restore, notification tap during cold start, and compact/current iPhone layouts.

- [ ] **Step 6: Archive Release**

Archive with current Xcode 26/iOS 26 SDK, validate in Organizer, resolve every compile/privacy/entitlement/symbol warning, run store-asset/artifact scans, and record archive checksum. Do not upload without separate authorization.

- [ ] **Step 7: Handle failures honestly**

Any failure reopens its owning task. Fix on Windows/Mac as appropriate, rerun impacted automated/Android checks, and repeat the consolidated iOS gate. Never mark iOS verified from static review or simulator-only output.

- [ ] **Step 8: Checkpoint**

Suggested commit if separately authorized:

~~~text
test: verify final native ios candidate
~~~

## Task 43: Cut the consumer web app down to public legal/support pages

**Files:**

- Remove after parity: frinq-frontend/app/(quiz)/
- Remove after parity: frinq-frontend/app/(app)/
- Remove after parity: frinq-frontend/app/components/ consumer-only components
- Remove after parity: frinq-frontend/app/lib/ consumer-session/realtime modules
- Modify: frinq-frontend/package.json
- Modify: frinq-frontend/package-lock.json
- Modify: frinq-frontend/app/page.tsx
- Preserve: frinq-frontend/app/terms/
- Preserve: frinq-frontend/app/privacy/
- Preserve: frinq-frontend/app/community-rules/
- Preserve: frinq-frontend/app/support/
- Preserve: frinq-frontend/app/delete-account/
- Modify: frinq-frontend/README.md

**Produces:** A minimal public site and no competing Capacitor/consumer release path.

- [ ] **Step 1: Require native acceptance evidence**

Do not begin removal until Tasks 40-42 pass and the owner approves the native cutover. Save a tagged/committed reference revision if authorized so behavior history remains recoverable.

- [ ] **Step 2: Write public-route tests first**

Assert Terms, Privacy, Community Rules, Support, deletion information, and landing/download links build and work without authentication. Assert former consumer/auth/quiz routes redirect to approved app-download/help destinations or return a deliberate not-found response.

- [ ] **Step 3: Remove consumer and Capacitor runtime**

Remove Capacitor packages/config/calls, secure-storage web shims, consumer chat/quiz/profile code, browser analytics/session replay, and obsolete E2E journeys. Keep only dependencies required by the public site. Follow current local Next.js documentation.

- [ ] **Step 4: Preserve deletion access**

The public deletion page remains useful without the native app, explains sign-in/reverification, exact deleted/retained data, support, and store-required URL behavior.

- [ ] **Step 5: Verify**

Run:

~~~powershell
Push-Location frinq-frontend
npm ci
npm test
npm run lint
npm run build
Pop-Location
~~~

Search the retained site/package lock for Capacitor and consumer token storage. Review the diff to ensure legal/support assets were not removed.

- [ ] **Step 6: Checkpoint**

Suggested commit if separately authorized:

~~~text
refactor: retain public legal site after native cutover
~~~

### Phase 11 Gate

- [ ] Every parity-matrix row is closed with native/public-web evidence.
- [ ] Android release/device/accessibility/performance/artifact gates pass.
- [ ] Native identity, permissions, privacy manifest, store metadata, and font licenses are complete.
- [ ] The consolidated Mac/iPhone Debug, full journey, accessibility, push/voice, and Release archive checks pass.
- [ ] `frinq-frontend` is reduced only after native acceptance and contains no Capacitor consumer runtime.
- [ ] No Expo, Capacitor, WebView, live-server, matching, or DM behavior exists in the native release.

Continue to Phase 12 after recording product, mobile, privacy, and engineering acceptance.

# Phase 12: Security, operations, and release-candidate hardening

## Task 44: Harden HTTP, native secrets, uploads, and production configuration

**Files:**

- Modify: frinq-backend/app/main.py
- Modify: frinq-backend/app/config.py
- Modify: frinq-backend/.env.example
- Modify: frinq-backend/app/api/deps.py
- Modify: frinq-backend/.do/app.yaml
- Create: frinq-backend/app/core/security_headers.py
- Create: frinq-backend/tests/test_api/test_security_boundaries.py
- Create: frinq-backend/scripts/verify_production_config.py
- Create: frinq-mobile/scripts/verify-release-artifact.mjs
- Modify: frinq-mobile/package.json
- Modify: frinq-frontend/.do/app.yaml
- Modify: frinq-admin/.do/app.yaml

**Produces:** A release configuration that fails before deployment when a security boundary is missing.

- [ ] **Step 1: Write boundary tests**

Test exact CORS origins, allowed methods/headers, request body limits, upload limits, trusted proxy handling, production docs policy, exception redaction, auth header parsing, banned-user rejection, no-store on token/account responses, and security headers on web/admin/API responses.

- [ ] **Step 2: Set response and edge headers**

For the retained public pages and admin pages, configure HSTS after HTTPS is proven, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin or stricter, frame-ancestors none, a least-privilege Permissions-Policy, and a CSP derived from observed production requests. Do not copy a generic CSP or permit unsafe-eval in release.

- [ ] **Step 3: Bound requests**

At the edge and application, cap JSON request bodies to 64 KB, WebSocket frames to 8 KB, report details to their schema limit, and voice uploads to the Task 33 limits. Apply timeouts to database, Redis, AI, WhatsApp, Firebase, and HTTP calls. Bound all pagination and array inputs.

- [ ] **Step 4: Verify secret separation**

Production requires strong unique JWT signing material, SESSION_HASH_PEPPER, RATE_LIMIT_PEPPER, PUSH_TOKEN_KEY, ADMIN_KEY, ADMIN_ACTION_PASSWORD, a non-empty ADMIN_ACTOR_ID, database credentials, Redis credentials, AI/provider secrets, Firebase credentials, and WhatsApp credentials where used. The config validator rejects default/example values, DEBUG, localhost endpoints, wildcard CORS, missing HTTPS, and overlapping admin secrets.

- [ ] **Step 5: Scan source and artifacts**

Use the repository's approved secret scanner or gitleaks in CI. Also scan the retained public-site output, admin build output, unpacked Android AAB/APK, and the iOS archive/export for server secrets, test phones, bearer-token examples, disallowed source maps, development signing/configuration, and localhost. Public API origins and Firebase client identifiers are not server secrets but still must point to production. Fail when an Expo, Capacitor, Ionic, WebView, or remote-JavaScript bootstrap path is present in the native application.

- [ ] **Step 6: Verify**

Run:

~~~powershell
Push-Location frinq-backend
pytest tests/test_api/test_security_boundaries.py -v
python scripts/verify_production_config.py --env-file .env.staging
pytest -q
Pop-Location

Push-Location frinq-mobile
npm ci
npm run verify:release
Pop-Location
~~~

Run the retained public-site/admin lint and release builds and confirm their header configuration with curl against staging.

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
security: enforce production boundaries
~~~

## Task 45: Prove end-to-end release journeys and native accessibility

**Files:**

- Create: frinq-mobile/docs/release-journeys.md
- Create: frinq-mobile/docs/device-test-matrix.md
- Create: frinq-mobile/src/test/releaseFixtures.ts
- Create: frinq-mobile/src/test/releaseJourneys.test.tsx
- Create: frinq-mobile/src/test/chatSafety.test.tsx
- Create: frinq-mobile/src/test/accountDeletion.test.tsx
- Modify: frinq-mobile/package.json
- Create: frinq-backend/scripts/seed_release_test_data.py
- Create: frinq-backend/tests/test_scripts/test_seed_release_test_data.py
- Modify: frinq-frontend/tests/e2e/legal-public-pages.spec.ts

**Produces:** Repeatable proof of the critical customer, safety, deletion, and accessibility journeys.

- [ ] **Step 1: Create isolated test-data helpers**

Generate uniquely tagged staging users through an explicit test-only script or endpoint protected by both an environment flag and admin authentication. The path must not be enabled in production. Cleanup uses explicit tagged IDs, never a broad delete.

- [ ] **Step 2: Automate the portable state and component journeys**

At the store, hook, navigation, and screen-component layers, cover new OTP account, Terms acceptance, quiz resume after process death, durable processing, active result, assigned community, two-user thread, reconnect without duplicate, report, block, mute, profile edit, logout/login, refresh rotation, revoked-session rejection, and account deletion. Stub external AI, OTP, and push only in isolated automated environments.

- [ ] **Step 3: Add native accessibility assertions**

Use React Native Testing Library roles, accessible names, and state assertions plus platform accessibility APIs. Fail on missing accessible names, unlabeled controls, incorrect selection state, inaccessible modal focus, controls below the approved token minimum, and screens that cannot scroll at large text. Do not use DOM-only accessibility assumptions for native screens.

- [ ] **Step 4: Keep browser tests only for retained public pages**

Use the existing Playwright stack only for the retained Terms, Privacy, Community Rules, Support, and deletion-information pages. Cover navigation, document versions, support links, deletion instructions, narrow viewport, keyboard use, and serious/critical axe violations.

- [ ] **Step 5: Complete the real-device matrix**

Use the Task 42 signed iPhone evidence and test at least one API 24-class Android device or representative lab device plus one current Android phone. Cover slow/lost/restored network, VoiceOver/TalkBack, maximum supported text, light and dark system settings while the app stays brand-light, portrait lock, push states, microphone states, background/terminated restore, low-memory recreation, and upgrade from the prior internal build.

- [ ] **Step 6: Avoid a second mobile automation stack for beta**

Use Jest/React Native Testing Library, Android instrumentation already supplied by the template where valuable, retained-public-page Playwright, and the signed device matrix. Add Maestro, Detox, or Appium only through a separately approved plan after repeated regression evidence justifies its ownership cost.

- [ ] **Step 7: Verify**

From clean installs, run backend, native unit/integration/component, Android lint/test/release, public-site Playwright/accessibility, and admin checks. Attach exact commands, exit codes, test counts, artifacts, and the signed device matrix to the release candidate.

- [ ] **Step 8: Checkpoint**

Suggested commit if authorized:

~~~text
test: cover release and safety journeys
~~~

## Task 46: Add observability without collecting message content

**Files:**

- Create: frinq-backend/app/core/metrics.py
- Modify: frinq-backend/app/utils/logger.py
- Modify: frinq-backend/app/main.py
- Modify: frinq-backend/app/workers/queue.py
- Create: frinq-backend/app/api/v1/health.py
- Create: frinq-backend/tests/test_api/test_health.py
- Create: frinq-backend/docs/runbooks/incident-response.md
- Create: frinq-backend/docs/runbooks/moderation.md
- Create: frinq-backend/docs/runbooks/provider-outage.md
- Modify: frinq-mobile/src/services/telemetry/crashReporter.ts
- Create: frinq-mobile/src/services/telemetry/crashReporter.test.ts

**Produces:** Actionable health signals and owner-operated incident procedures with redacted data.

- [ ] **Step 1: Separate liveness and readiness**

GET /health/live proves the process loop responds and has no dependencies. GET /health/ready checks a short PostgreSQL query and Redis ping with strict timeouts. AI, OTP, WhatsApp, and push providers appear in a protected dependency-status endpoint but do not make the API unready.

- [ ] **Step 2: Use structured redacted logs**

Include request ID, route template, status, latency, deployment version, job name, sanitized error code, and hashed internal actor ID where needed. Exclude Authorization, cookies, refresh tokens, WebSocket tickets, phone numbers, OTPs, message/report text, quiz answers, voice bytes/URLs, push tokens, and provider secrets. Test the redactor against nested data and exception strings.

- [ ] **Step 3: Add minimum viable metrics and alerts**

Track request count/latency/errors, database pool saturation, Redis failures, OTP success/failure/limit counts, refresh reuse detection, quiz queue age/success/failure, active WebSockets, message accept/reject latency, reports awaiting review, push success/invalid tokens, and account-deletion failures. Alert on sustained 5xx, readiness failure, quiz queue age, elevated OTP abuse, moderation backlog, and backup failure.

- [ ] **Step 4: Prove mobile crash redaction**

Crash reports may include app/build/OS/device class, screen identifier, lifecycle state, network class, and an allowlisted error code. They must not include phone numbers, tokens, push tokens, quiz answers, voice paths or audio, message/report text, profile content, community content, or raw request/response bodies. Plant representative secrets and user content in automated tests and prove the reporter replaces or drops them before transport.

- [ ] **Step 5: Write operational runbooks**

Document severity/owner/escalation, secret rotation, token-signing-key incident, database/Redis/provider outage, abusive community response, emergency read-only/chat-disable flags, rollback, user communication approval, and evidence preservation. Set and staff a moderation review target before public chat; if no trained moderator is available, disable new messages rather than leave reports unattended.

- [ ] **Step 6: Verify**

Force each dependency failure in staging, confirm expected readiness and user behavior, inspect logs for planted sensitive values, fire test alerts, and rehearse the chat-disable flag.

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
ops: add redacted observability and incident runbooks
~~~

## Task 47: Prove backup, restore, capacity, and rollback

**Files:**

- Create: frinq-backend/docs/runbooks/backup-restore.md
- Create: frinq-backend/docs/runbooks/deploy-rollback.md
- Create: frinq-backend/scripts/smoke_release.py
- Create: frinq-backend/scripts/load_chat.py
- Create: frinq-backend/tests/test_scripts/test_smoke_release.py

**Produces:** Evidence that the beta can survive a failed deploy and its expected initial load.

- [ ] **Step 1: Define beta capacity and service targets**

Owner records expected invited users, daily active users, peak concurrent sockets, messages per second, quiz completions per hour, moderation staffing, and acceptable latency/error targets. If values are unknown, use a documented initial test target of 500 concurrent sockets, 20 accepted messages per second across communities, and 50 concurrent quiz jobs, then revise from real staged data.

- [ ] **Step 2: Test representative load safely**

Run load only against a dedicated staging environment with provider calls stubbed and synthetic content. Ramp gradually; measure API p95/p99, WebSocket delivery and duplication, Redis and DB utilization, queue age, memory, reconnect storm behavior, and rate-limit correctness. Stop at the agreed resource threshold; do not target production or third-party OTP/AI/push services.

- [ ] **Step 3: Verify backup and restore**

Enable managed PostgreSQL point-in-time recovery or daily backups with the owner-approved retention. Restore into an isolated database, run migrations, replay every deletion audit event newer than the restored backup before allowing traffic, and run integrity queries. Validate a synthetic account/community/history plus the continued absence of a previously deleted synthetic account, then destroy the isolated restore through the provider's approved process. Record recovery point and recovery time achieved.

- [ ] **Step 4: Rehearse application rollback**

Deploy one reversible staging change, run smoke_release.py, roll back the app image while leaving forward-compatible migrations in place, and rerun smoke tests. Every migration in this release must be backward compatible with the immediately prior app until rollout is stable; destructive column removal waits for a later release.

- [ ] **Step 5: Define failure switches**

Provide server-side, audited flags for new OTP requests, quiz starts, chat sends, and push sends. Reads, legal/support, logout, and deletion stay available whenever technically possible. Defaults are safe and the runbook names who may change each flag.

- [ ] **Step 6: Verify**

Attach load graphs, restored-data checks, smoke output, rollback timings, and flag rehearsal to the release ledger.

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
ops: prove capacity restore and rollback
~~~

### Phase 12 Gate

- [ ] Production config validation, secret scans, and security-boundary tests pass.
- [ ] All critical user, safety, deletion, and accessibility journeys pass.
- [ ] Real-device matrix is signed off for iOS and Android.
- [ ] Logs and metrics contain no planted sensitive values.
- [ ] Moderation and incident ownership is staffed and rehearsed.
- [ ] Load target, backup restore, deployment rollback, and emergency flags are proven.
- [ ] No unresolved P0/P1 defect remains; accepted lower-severity defects have owner and release decision.

Stop and obtain engineering, security, operations, moderation, privacy, mobile, and product release-candidate approval before Phase 13.

# Phase 13: Store submission and staged worldwide release

## Task 48: Freeze the release candidate and complete disclosure evidence

**Files:**

- Create: frinq-mobile/store/release-checklist.md
- Create: frinq-mobile/store/privacy-data-inventory.md
- Create: frinq-mobile/store/reviewer-notes.md
- Create: frinq-mobile/store/territory-review.md
- Create: frinq-mobile/CHANGELOG.md

**Produces:** One traceable build whose binaries, disclosures, screenshots, and backend version match.

- [ ] **Step 1: Freeze versions**

Choose one semantic app version and monotonically increasing iOS build number/Android versionCode. Record the exact mobile, public frontend, backend, admin, migration, and worker revisions in the release ledger. Any code or configuration change after archive generation invalidates the candidate and requires the affected checks again. Do not create a tag or push without owner authorization.

- [ ] **Step 2: Reconcile the data inventory**

For every collected or transmitted data type, record purpose, optional/required status, user linkage, tracking status, encryption in transit/at rest, processor, retention, deletion, and whether it appears in Apple App Privacy or Google Data Safety. Inspect network traffic and backend schema rather than answering from memory.

- [ ] **Step 3: Complete UGC safety evidence**

Reviewer notes identify community-rules acceptance, proactive filtering, report/block entry points, moderator workflow, support contact, and account ban capability. Provide a stable review account/OTP procedure that does not expose a real person's phone and remains available throughout review.

- [ ] **Step 4: Approve territories**

Release in all App Store and Google Play territories that are supported by the OTP, AI, database, Redis, push, analytics, and support providers and approved by legal/tax/content review. Record exclusions and reasons. Do not describe the release as literally every country when a store, provider, sanction, age, language, or legal restriction prevents it.

- [ ] **Step 5: Produce truthful screenshots and copy**

Capture the release binary on required device sizes. Show real app UI, assigned archetype community, privacy/safety tools, and no fabricated functionality. Copy must not promise dating, therapy, guaranteed compatibility, or features deferred from beta.

- [ ] **Step 6: Final pre-submission suite**

From clean checkouts, run every Phase 12 automated command and the full signed device matrix against the frozen staging backend. Record checksums for the candidate AAB and iOS archive/export.

## Task 49: Submit and validate the iOS build

**External systems:** Apple Developer, App Store Connect, TestFlight.

**Produces:** A TestFlight-proven iOS build submitted with complete review information.

- [ ] **Step 1: Confirm account and signing**

Owner completes Apple Developer enrollment, agreements, tax/banking where applicable, bundle ID in.frinq.app, App Store Connect app record, distribution signing, and push entitlement. Use automatic signing only if the team accepts it; keep certificates/profiles out of Git.

- [ ] **Step 2: Archive with the required SDK**

Use Xcode 26 or a later App-Store-supported Xcode and the iOS 26 SDK or later, with iOS deployment target 15.1. Archive Release, validate in Organizer, resolve every privacy/entitlement/symbol warning, then obtain explicit owner authorization before upload and confirm processing.

- [ ] **Step 3: Complete App Store Connect**

Provide approved metadata, privacy-policy/support URLs, age-rating answers reflecting UGC and messaging, App Privacy answers from Task 48, encryption/export answers, content rights, pricing/availability, screenshots, reviewer account, OTP instructions, microphone explanation, community-safety explanation, and deletion navigation.

- [ ] **Step 4: Run TestFlight rings**

First internal testers, then an external beta group after Beta App Review. Require at least one full new-user journey and one returning-user/update journey on each supported iOS class, plus report/block/deletion/push tests. Fix crashes and store-blocking issues before submission.

- [ ] **Step 5: Submit for review**

With explicit owner authorization, use manual release or phased release, not immediate automatic worldwide release. Monitor App Review messages and answer from the approved reviewer notes. A rejection becomes a tracked defect/change; do not conceal behavior or instruct reviewers to bypass policy.

## Task 50: Submit and validate the Android build

**External systems:** Google Play Console, Firebase Console.

**Produces:** A closed-test-proven Android App Bundle submitted with complete policy declarations.

- [ ] **Step 1: Confirm account and signing**

Owner completes Play developer verification, payments profile/agreements, app record, Firebase Android app, Play App Signing, upload key backup, and application ID in.frinq.app. Keep keystores and passwords out of Git and the web bundle.

- [ ] **Step 2: Build the policy-compatible AAB**

Compile and target API 36, build Release, and run lint and bundle validation. Obtain explicit owner authorization before uploading the AAB. Review the pre-launch report and resolve permission, crash, ANR, security, and device-compatibility findings.

- [ ] **Step 3: Complete Play Console declarations**

Provide store listing, support/privacy/deletion URLs, Data Safety answers from Task 48, content rating, target audience 18+, ads declaration, app access/OTP instructions, UGC policy evidence, account deletion, permissions declarations, and availability/pricing. Mark financial/health/dating/social claims only according to actual product behavior and counsel-reviewed copy.

- [ ] **Step 4: Satisfy testing eligibility**

Run internal testing first. If the developer account is a personal account created after 13 November 2023, complete the currently required closed test with at least 12 opted-in testers continuously for 14 days and obtain production access before rollout. Re-check Play Console because eligibility rules can change.

- [ ] **Step 5: Validate closed testing**

Test clean install, upgrade, OTP, quiz, chat, report/block, push grant/deny/tap, microphone grant/deny, offline/reconnect, logout, deletion, low-memory process recreation, and the supported device matrix. Fix pre-launch and tester P0/P1 issues before production submission.

## Task 51: Deploy production services and perform staged rollout

**External systems:** DigitalOcean App Platform, DNS/TLS provider, Apple App Store, Google Play.

**Produces:** A controlled public launch with measurable stop and rollback points.

- [ ] **Step 1: Deploy in dependency order**

1. verify managed database backup and Redis health.
2. run the deterministic PRE_DEPLOY migration job once.
3. deploy backend with chat/push writes disabled.
4. deploy ARQ worker and verify queue health.
5. deploy the retained public legal/support site and admin service.
6. verify DNS, TLS, headers, CORS, health, legal/support/deletion URLs, and admin access gate.
7. run production smoke checks using owner-approved test accounts.
8. enable quiz, then chat, then push separately while watching metrics.

- [ ] **Step 2: Release by rings**

Use store internal availability first, then 5%, 25%, 50%, and 100% phased/staged rollout across approved territories. Hold each ring long enough to observe one peak usage period or at least 24 hours, whichever is longer. The release owner may accelerate only with documented approval and healthy evidence.

- [ ] **Step 3: Define automatic stop conditions**

Pause rollout for any confirmed account crossover, token leakage, unauthorized message access, deletion failure, unmoderated severe safety report, crash-free sessions below the approved threshold, sustained API 5xx above 2%, WebSocket duplicate/loss regression, OTP failure spike, or data disclosure mismatch. Disable the affected write path and follow the incident runbook.

- [ ] **Step 4: Monitor and support**

Staff support and moderation for the announced launch window. Review crashes, ANRs, 5xx, readiness, queue age, OTP, realtime, reports, push, deletion, reviews, and support tickets at least daily during rollout. Publish only owner-approved service communication.

- [ ] **Step 5: Close the launch**

After 100% of approved territories remains healthy for seven days, record the deployed versions, store statuses, unresolved lower-severity defects, capacity data, moderation data, user feedback, and next decision. Keep emergency flags, rollback artifacts, and on-call ownership active.

## Task 52: Sign the final acceptance matrix

All rows require evidence and a named approver. A blank or waived row blocks public release unless the accountable owner documents the reason and risk acceptance.

| Area | Required evidence | Approver |
|---|---|---|
| Product scope | Beta inclusions/exclusions and truthful store copy | Product owner |
| Identity | Bundle IDs, names, icons, versions, signing | iOS and Android owners |
| Backend | Migrations, API tests, worker tests, health | Backend owner |
| Sessions | Rotation, replay revocation, logout, ban | Security owner |
| Quiz | Resume, durable job, retry, one canonical community | Product and backend owners |
| Chat | Persistence, two-instance delivery, reconnect, rate limits | Backend and mobile owners |
| UGC safety | Rules, filter, report, block, moderation staffing | Trust and safety owner |
| Privacy | Data inventory, consent, disclosures, deletion | Privacy/legal owner |
| Accessibility | Automated report and real-device checks | QA owner |
| iOS | TestFlight matrix and App Store fields | iOS release owner |
| Android | Closed-test matrix, pre-launch report, Play fields | Android release owner |
| Operations | Alerts, backup restore, load, rollback, incident drill | Operations owner |
| Territories | Provider/legal/store availability review | Business/legal owner |

### Phase 13 Gate: Public beta launched

- [ ] Apple approved the exact iOS candidate and rollout is healthy at 100% of approved territories.
- [ ] Google approved the exact Android candidate and rollout is healthy at 100% of approved territories.
- [ ] Production native apps, public web, admin, API, worker, PostgreSQL, Redis, OTP, AI, moderation, and push paths are healthy.
- [ ] Legal/support/deletion URLs are public and match both store declarations.
- [ ] Seven-day launch report is signed and no active stop condition remains.

# Definition of Done

The beta is done only when:

- a new 18+ user can accept current legal terms, verify phone, complete/resume the quiz, survive durable AI processing, receive one canonical archetype, edit a safe display name, and enter exactly one community.
- a returning user can restore a rotating session without exposing tokens in URLs or insecure persistent storage.
- community text chat persists before broadcast, works across instances, reconnects without duplicates, and exposes filter/report/block/mute/moderator controls.
- voice recording works or cleanly falls back to text on supported real devices.
- notifications are explicit opt-in, generic, throttled, and removable.
- logout, ban, and account deletion revoke access across HTTP, WebSocket, secure storage, and push.
- the bare React Native app, retained public web, admin web, API, worker, iOS, and Android are separately reproducible from locked dependencies.
- the mobile app has no Expo, Capacitor, Ionic, WebView shell, or remote-JavaScript runtime path; the former consumer web experience is not shipped as the app.
- all tests, scans, accessibility checks, device checks, load targets, backup restore, rollback drill, disclosures, reviewer paths, and signed acceptance rows pass.
- both stores approve the same release candidate and staged rollout completes in all approved territories.

# Features explicitly deferred until after beta evidence

Do not add these while executing this plan: public events, ticketing/payments, direct messages, photos/media uploads, reactions, nested chat replies, typing indicators, read receipts, public presence, community switching, editable quiz answers after activation, AI matching, dating/matching behavior, location matching, gender/pronoun collection, social verification, user-selectable themes, dark mode, or a second native automation framework. Add one only through a separately approved design and plan.

# Exact prompt for the coding agent

Prefer giving the coding agent the handoff file at `frinq-backend/docs/launch/react-native-rewrite-handoff.md`. If a direct prompt is required, copy this into a fresh coding-agent session started from the repository root:

~~~text
Continue the Frinq bare React Native rewrite from:
F:\Project\Test\FrinqFull\Frinq

Before changing code, read in this order:
1. frinq-backend/docs/launch/react-native-rewrite-handoff.md
2. frinq-backend/docs/superpowers/specs/2026-07-23-frinq-bare-react-native-design.md
3. frinq-backend/docs/superpowers/plans/2026-07-22-frinq-global-mobile-launch.md
4. every applicable AGENTS.md and repository-local instruction file.

The product owner reports Phases 0-6 complete. Their implementation and the Figma/font assets are currently dirty or untracked and must be preserved. Begin at Phase 7 / Task 26 only; do not replay Phases 0-6.

Confirm the root contains frinq-backend, frinq-frontend, frinq-admin, App/Figma, and the location where frinq-mobile will be created. Record git status, diff summary, tool versions, baseline verification, assumptions, and blockers in the execution ledger without staging, committing, deleting, or rewriting user work.

Execution rules:
- Build the production consumer app only in a new parallel frinq-mobile/ directory with the React Native Community CLI.
- Do not use Expo, Expo Router, Capacitor, Ionic, a WebView shell, HTML renderers, or a live website as the app runtime.
- Treat App/Figma screenshots/assets as visual references only. Do not infer matching, DMs, location matching, gender/pronouns, or social-verification features from them.
- Treat frinq-frontend as the behavior/copy/API reference until Task 43. Do not remove the consumer web routes before native parity and the consolidated iOS gate pass.
- Treat the design spec as authoritative for native architecture, theme, motion, accessibility, secure storage, encrypted quiz drafts, telemetry, and dependencies.
- Vastago Grotesk is approved for this app: on 2026-07-23 the owner confirmed the organization purchased it and its developer supplied the folder for the build. Record that provenance in the asset manifest, include any required distributable notice, and keep commercial purchase records or license secrets out of Git.
- Follow task order and the named contracts, tests, and commands. Use test-driven development: add the stated failing test, record the expected failure, write the smallest production change that passes, then run task and phase verification.
- Keep changes surgical. Do not add deferred features, speculative abstractions, or unapproved dependencies.
- Never overwrite or discard unrelated user work. Never use git reset --hard or broad recursive deletion. Validate any generated/build directory before cleaning it.
- Never log or commit secrets, phone numbers, OTPs, tokens, message/report content, quiz answers, voice data, push tokens, or service-account credentials.
- Do not bypass a failing test, lint rule, migration, store requirement, security gate, legal prerequisite, provider requirement, or real-device check. Record the blocker with exact evidence.
- Do not perform external irreversible actions such as production deployment, DNS changes, provider account changes, certificate creation, store upload/submission, tester invitation, or public rollout without explicit owner authorization at that step.
- Do not commit unless the owner authorizes commits. If authorized, use the suggested checkpoint commits and include only files for that task.
- Re-read the plan at the start of each phase because later tasks depend on the exact earlier contracts.
- The owner wants one consolidated Mac/Xcode/physical-iPhone session only, after feature completion. Until Task 42 passes, label iOS unverified. Give the owner the exact commit, setup commands, Xcode actions, device actions, expected results, and evidence to return.

Checkpoint behavior:
- Complete tasks sequentially and keep each phase independently reviewable.
- At every gate, run the listed verification from fresh state and update the ledger with commands, exit codes, test counts, artifacts, remaining risks, and git diff/status.
- Run the applicable code-review workflow at each phase boundary and resolve findings before continuing.
- Continue automatically from Phase 7 through Task 41 while gates pass. Stop only for a real blocker, a new product decision, required authority for an external action, or the manual Task 42 Mac/iPhone gate.
- At Task 42, give the owner one consolidated, exact Mac/Xcode/physical-iPhone checklist and wait for returned evidence. After Task 42 passes, complete Task 43 and the Phase 11 gate.
- Phases 12-13 require the security/release approvals and explicit external-action authorization stated in those phases.

Start with Phase 7 / Task 26 only. Do not modify native feature screens until its baseline and scaffold checks pass.
~~~

# Official references frozen for this revision on 2026-07-23

Re-check these sources at execution/submission time because platform rules change:

- React Native release status: https://reactnative.dev/versions
- React Native Community CLI setup: https://reactnative.dev/docs/getting-started-without-a-framework
- React Native environment setup: https://reactnative.dev/docs/next/set-up-your-environment
- React Native 0.86 release notes: https://reactnative.dev/blog/2026/06/11/react-native-0.86
- React Native minimum iOS/Android support context: https://reactnative.dev/blog/2024/10/23/release-0.76-new-architecture
- React Navigation 7: https://reactnavigation.org/docs/getting-started/
- React Navigation 8 prerelease status: https://reactnavigation.org/docs/8.x/upgrading-from-7.x/
- Reanimated compatibility: https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/
- Gesture Handler installation/compatibility: https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/installation/
- Safe Area Context support: https://appandflow.github.io/react-native-safe-area-context/
- React Native Audio API recorder: https://docs.swmansion.com/react-native-audio-api/docs/inputs/audio-recorder/
- React Native Audio API compatibility: https://docs.swmansion.com/react-native-audio-api/docs/guides/compatibility/
- React Native Firebase messaging: https://rnfirebase.io/messaging/usage
- React Native Keychain: https://github.com/oblador/react-native-keychain
- React Native MMKV: https://github.com/mrousavy/react-native-mmkv
- Firebase Cloud Messaging: https://firebase.google.com/docs/cloud-messaging
- Apple April 2026 submission SDK requirement: https://developer.apple.com/news/?id=ueeok6yw
- Apple Xcode support matrix: https://developer.apple.com/support/xcode
- Apple App Review Guidelines, including UGC: https://developer.apple.com/app-store/review/guidelines/
- Apple in-app account deletion: https://developer.apple.com/support/offering-account-deletion-in-your-app
- Apple App Privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Google Play target API requirements: https://developer.android.com/google/play/requirements/target-sdk
- Google Play personal-account testing requirements: https://support.google.com/googleplay/android-developer/answer/14151465?hl=en
- Google Play UGC policy: https://support.google.com/googleplay/android-developer/answer/9876937?hl=en-IN
- Google Play account deletion policy: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
- Google Play Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469?hl=en
- DigitalOcean App Platform pre-deploy jobs: https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/
- DigitalOcean App Spec/static sites: https://docs.digitalocean.com/products/app-platform/reference/app-spec/
