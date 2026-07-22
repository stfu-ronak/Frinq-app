# Frinq Global Mobile Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking. Execute one numbered task at a time. Stop at every phase gate for review and fresh verification.

**Goal:** Ship Frinq as a stable, secure, English-language iOS and Android social app that can be downloaded in all App Store and Google Play territories approved by the product owner, service providers, and legal review.

**Architecture:** The existing Next.js questionnaire is statically exported and embedded in Capacitor 8 native shells. FastAPI owns OTP authentication, rotating sessions, the durable quiz-to-archetype pipeline, profile data, community membership, WebSocket chat, moderation, account deletion, and push registration. PostgreSQL is the system of record, Redis/ARQ provides durable jobs, rate limits, WebSocket tickets, and cross-instance fan-out, and a separate Next.js admin app provides internal moderation.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript 5.8.2, Node.js 22 LTS, Capacitor 8, iOS 15+ built with Xcode 26+, Android minSdk 24 / compileSdk 36 / targetSdk 36, Python 3.12, FastAPI 0.115, asyncpg, PostgreSQL/Supabase, Redis 5, ARQ 0.25, Firebase Cloud Messaging, Twilio Verify WhatsApp OTP.

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
- A React Native rewrite.
- Speculative message virtualization.
- Matching or meetup expansion.

These exclusions are deliberate. Add them only through a separately approved design and plan after launch.

## Global Constraints

- Work from F:\Project\Test\FrinqFull\Frinq with access to frinq-backend, frinq-frontend, and frinq-admin.
- App/frinq-mobile is an existing Expo 57 prototype with a different com.frinq.app identifier and a separate questionnaire implementation. Preserve it unchanged and do not treat it as the launch app. This plan deliberately ships the already integrated 38-step Next.js flow through Capacitor; never mix Expo and Capacitor dependencies or submit both binaries.
- Preserve existing user changes and untracked files. The untracked frinq-frontend/FRINQ_PROJECT_ANALYSIS.md belongs to the user.
- Never output, copy, log, or commit values from .env files.
- The superseded plan contains an exposed credential. Treat it as compromised, never repeat it, and require external rotation before any production deploy.
- Never commit .env, Firebase service-account JSON, GoogleService-Info.plist, google-services.json, APNs keys, signing certificates, keystores, provisioning profiles, or store credentials.
- Use npm ci in verification and deployment. Package-lock.json is authoritative.
- Before changing Next.js code/configuration, follow frinq-frontend/AGENTS.md and read the relevant versioned guide under frinq-frontend/node_modules/next/dist/docs/; do not rely on older Next.js conventions.
- Use the current Capacitor 8 release and keep Capacitor core, CLI, iOS, Android, and official plugin packages on the same major.
- Capacitor 8 requires Node.js 22+, Xcode 26+, iOS deployment target 15, Android minSdk 24, compileSdk 36, and targetSdk 36.
- App identifier and Android applicationId are in.frinq.app.
- User-facing production traffic is HTTPS/WSS only.
- The app is 18+; date/age validation is enforced server-side, not only through UI copy.
- English is the only supported launch language. Worldwide distribution means availability, not localization.
- All model calls continue through app/core/ai/pii.py. Chat moderation must not bypass the PII rule by sending raw chat messages to an LLM.
- The canonical community key is the 24-value slug from app/core/ai/archetypes.py, never the display-name spirit_animal value.
- A user becomes active only after the AI result and community membership are committed successfully.
- Refresh tokens are never stored in localStorage. Native builds use Keychain/Keystore secure preferences; browser fallback uses sessionStorage and requires OTP again after the browser session ends.
- WebSocket URLs never contain a long-lived access or refresh token.
- React rendering must continue to escape chat text. Do not add dangerouslySetInnerHTML for user content.
- Destructive account and moderation actions require explicit confirmation and server authorization.
- Store release is blocked until report, block, filter, account deletion, privacy policy, community rules, and support contact all work.
- Do not claim iOS build or device verification from Windows. iOS verification requires macOS, Xcode 26+, and a physical iPhone.
- Do not commit, push, deploy, rotate secrets, or submit store builds unless the user separately authorizes those external actions.
- Command convention: start each mixed-repository command block from F:\Project\Test\FrinqFull\Frinq and use Push-Location/Pop-Location exactly as shown. A single-repository pytest block runs from frinq-backend; a single-repository npm/native block runs from frinq-frontend; an admin-only npm block runs from frinq-admin. Check Get-Location before a destructive or deployment command.

## Current Verified Baseline

- frinq-backend: pytest -q passes 77 tests with two warnings.
- frinq-frontend: npm run lint currently fails with 27 errors.
- frinq-frontend next.config.ts currently uses headers(), which static export does not support.
- app/page.tsx, app/(quiz)/vibe-box/page.tsx, and admin pages currently declare force-dynamic.
- frinq-frontend contains request-dependent app/api route handlers.
- users.supabase_uid is UUID UNIQUE NOT NULL, which conflicts with OTP-created accounts.
- quiz_submissions has no user_id or canonical archetype_slug.
- the active quiz insight pipeline runs in FastAPI BackgroundTasks, not in the existing ARQ worker.
- app/core/ai/archetypes.py contains 24 canonical slugs.
- app/core/ai/openai_client.py uses httpx directly; do not add the OpenAI Python SDK.
- frontend analytics currently sends a raw phone value to Microsoft Clarity; this must be removed.
- App/frinq-mobile exists as a separate Expo prototype; it is not the implementation target for this launch plan and must not be deleted.

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
- [ ] Provide a macOS machine with Xcode 26+ and at least one physical iPhone running iOS 15 or later.
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

# Phase 7: Capacitor iOS and Android applications

## Task 26: Create native projects from the verified static export

**Files:**

- Modify: frinq-frontend/package.json
- Create: frinq-frontend/capacitor.config.ts
- Create: frinq-frontend/ios/
- Create: frinq-frontend/android/
- Create: frinq-frontend/scripts/verify-native-config.mjs
- Modify: frinq-frontend/.gitignore
- Modify: frinq-frontend/README.md

**Produces:** Reproducible Capacitor 8 projects for bundle ID in.frinq.app.

- [ ] **Step 1: Confirm toolchain on the build machines**

Require Node 22+, npm from the lockfile workflow, macOS with Xcode 26+ for iOS, Android Studio with JDK 21 and Android SDK 36 for Android, CocoaPods supported by the installed Capacitor version, and a real iOS and Android device. Record versions in the execution ledger. Do not attempt an iOS store build from Windows.

- [ ] **Step 2: Add native scripts**

Add:

~~~json
{
  "scripts": {
    "native:sync": "npm run build && npx cap sync",
    "native:ios": "npm run native:sync && npx cap open ios",
    "native:android": "npm run native:sync && npx cap open android",
    "verify:native": "node scripts/verify-native-config.mjs"
  }
}
~~~

The build must emit frinq-frontend/out before cap sync. No native project may point to a live development server for release.

- [ ] **Step 3: Configure Capacitor**

Use:

~~~typescript
const config: CapacitorConfig = {
  appId: "in.frinq.app",
  appName: "Frinq",
  webDir: "out",
  server: {
    androidScheme: "https",
    iosScheme: "capacitor"
  }
};
~~~

Initialize once with npx cap add ios and npx cap add android, then commit the generated native projects. Do not hand-edit generated dependency files when a Capacitor config or native IDE setting is the correct source.

- [ ] **Step 4: Set supported OS levels**

Set iOS deployment target 15.0. Set Android minSdk 24, compileSdk 36, and targetSdk 36. The verification script must fail if app ID, app name, webDir, OS targets, cleartext traffic policy, or release server URL differs from the approved values.

- [ ] **Step 5: Configure navigation and network policy**

Allow only bundled navigation plus HTTPS calls to api.frinq.in and required approved processors. Keep Android usesCleartextTraffic false and do not add arbitrary navigation allowlists. External legal/support links open in the approved OS browser surface only after explicit user action.

- [ ] **Step 6: Verify clean regeneration**

From a clean checkout on both build machines:

~~~powershell
npm ci
npm run build
npm run native:sync
npm run verify:native
~~~

Open the projects, build Debug, install on one real device per platform, and record the build output in the ledger.

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
build: add reproducible capacitor projects
~~~

## Task 27: Make voice recording correct on Safari, iOS, and Android

**Files:**

- Modify: frinq-frontend/app/components/VoiceRecorder.tsx
- Modify: frinq-frontend/app/(quiz)/story/page.tsx
- Modify: frinq-frontend/app/lib/api.ts
- Modify: frinq-backend/app/api/v1/voice.py
- Create: frinq-frontend/app/lib/audio.ts
- Create: frinq-frontend/app/lib/audio.test.ts
- Create: frinq-backend/tests/test_api/test_voice_formats.py
- Modify: frinq-frontend/ios/App/App/Info.plist
- Modify: frinq-frontend/android/app/src/main/AndroidManifest.xml

**Produces:** One tested recorder path that does not assume audio/webm.

- [ ] **Step 1: Write MIME-selection tests**

Choose the first supported MediaRecorder type from audio/webm;codecs=opus, audio/mp4, audio/aac, and the browser default. Derive the extension from the actual Blob MIME type. Never name every upload .webm.

- [ ] **Step 2: Consolidate duplicate recorder logic**

Use VoiceRecorder for both story and opinions flows. It owns permission request, MediaRecorder lifecycle, chunk assembly, preview URL cleanup, upload progress, retry, cancellation, and stopping every MediaStream track on completion/unmount.

- [ ] **Step 3: Enforce server upload rules**

Accept only the tested MIME allowlist, verify the file signature when practical, cap uploads at 10 MB and 120 seconds, generate server-side object names, and reject a filename or Content-Type mismatch. Store the detected MIME and byte count. Never execute or serve uploads as active content.

- [ ] **Step 4: Add native permission text**

Set NSMicrophoneUsageDescription to a plain explanation that voice answers are optional and used for the personality quiz. Add Android RECORD_AUDIO only; do not request microphone permission at launch. Request it when the user taps Record, provide a text-answer fallback after denial, and show platform-specific system-settings instructions only after a repeated denial.

- [ ] **Step 5: Verify on real devices**

Test first grant, denial, permanent denial, interruption by a phone call, backgrounding, screen lock, 120-second cap, cancel, failed upload and retry, Bluetooth input, and successful server playback on current iOS and Android. Confirm no microphone indicator remains after leaving the screen.

- [ ] **Step 6: Verify automated suites**

Run frontend audio tests, backend voice tests, full lint/build, and full backend tests.

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
fix: support native voice recording formats
~~~

## Task 28: Handle native lifecycle, keyboard, offline state, and navigation

**Files:**

- Modify: frinq-frontend/package.json
- Modify: frinq-frontend/package-lock.json
- Create: frinq-frontend/app/lib/native.ts
- Create: frinq-frontend/app/components/NetworkBanner.tsx
- Modify: frinq-frontend/app/components/AppShell.tsx
- Modify: frinq-frontend/app/lib/realtime.ts
- Modify: frinq-frontend/app/globals.css
- Create: frinq-frontend/tests/native-lifecycle.test.ts
- Modify: frinq-frontend/ios/App/App/Info.plist
- Modify: frinq-frontend/android/app/src/main/AndroidManifest.xml

**Produces:** App-like behavior across pauses, resumes, lost connectivity, safe areas, and Android back navigation.

- [ ] **Step 1: Install the required official plugins**

Run npm install @capacitor/network@8 @capacitor/browser@8 and commit the resolved lockfile. Use Network for connection state and Browser only for explicit legal/support external links.

- [ ] **Step 2: Add lifecycle tests**

Mock Capacitor App and Network events. Assert that backgrounding closes chat cleanly after a short grace period, resume restores/refreshes session then reconnects, offline pauses requests and retries, and event listeners are removed on unmount.

- [ ] **Step 3: Implement one native adapter**

All Capacitor calls go through app/lib/native.ts and degrade safely in a browser. It exposes platform, app state, network state, and explicit external-link helpers. React components must not scatter direct plugin calls.

- [ ] **Step 4: Implement Android back behavior**

Close an open dialog or menu first; otherwise navigate within app history; on the signed-in root, require a second back press within two seconds to exit. Never exit while an unsaved quiz/profile form is active without confirmation.

- [ ] **Step 5: Handle safe areas and keyboard**

Use env(safe-area-inset-*) on shell, nav, composer, dialogs, and full-screen states. Verify the composer remains visible with iOS and Android keyboards, large text, rotation, and display cutouts. Use System Bars configuration with legible light/dark contrast.

- [ ] **Step 6: Add honest offline behavior**

Show an offline banner, retain unsent chat items only in memory for the current process, and retry them with their original client_message_id after reconnection. Do not imply offline quiz completion or durable offline messaging. If the app is killed, unsent messages may be lost and the UI must say so before exit when any exist.

- [ ] **Step 7: Verify**

Run unit tests, lint, static build, native sync, and manual device tests for Wi-Fi/cellular switching, airplane mode, background/resume, process kill, keyboard, rotation, safe areas, and Android back.

- [ ] **Step 8: Checkpoint**

Suggested commit if authorized:

~~~text
feat: handle native lifecycle and offline state
~~~

## Task 29: Add opt-in, privacy-preserving push notifications

**Files:**

- Modify: frinq-frontend/package.json
- Modify: frinq-frontend/package-lock.json
- Create: frinq-frontend/app/lib/push.ts
- Create: frinq-frontend/app/(app)/settings/notifications/page.tsx
- Create: frinq-frontend/app/lib/push.test.ts
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
- Modify: frinq-frontend/ios/App/App/AppDelegate.swift
- Modify: frinq-frontend/android/app/src/main/AndroidManifest.xml

**Produces:** Generic, throttled community-activity notifications with complete opt-out and token cleanup.

- [ ] **Step 1: Install matched messaging dependencies**

Install @capacitor-firebase/messaging@8 and resolve its exact compatible version into package-lock.json. Add and pin firebase-admin in requirements.txt after verifying it supports the repository's Python version. Configure Firebase iOS and Android apps for the same production bundle/application ID. Store GoogleService-Info.plist, google-services.json, and service-account secrets according to repository and provider secret policy; never expose the service-account JSON in the web bundle or Git history.

- [ ] **Step 2: Write backend contract tests**

Define:

~~~text
POST   /api/v1/push/tokens
DELETE /api/v1/push/tokens/{installation_id}
PATCH  /api/v1/push/preferences
~~~

Registration accepts platform ios or android, token, installation_id, and app_version. Store an HMAC-SHA-256 token hash for lookup plus ciphertext encrypted with a dedicated PUSH_TOKEN_KEY because FCM needs the original. A token and installation move atomically to the currently authenticated user. DELETE resolves the caller-owned installation ID rather than exposing a token-derived identifier. Reject invalid platform/size, revoke tokens rejected by FCM, and delete all tokens on logout-all, ban, or account deletion.

- [ ] **Step 3: Ask only after value is visible**

Do not prompt on first launch. After the user has entered their community, show an in-app explanation with Not now and Enable notifications. Request OS permission only after Enable. Denial leaves the app fully usable and Settings shows how to change the OS preference.

- [ ] **Step 4: Use private notification content**

Send only a generic title/body such as New activity in Quiet Storm. Do not include message text, author name, phone, quiz answer, or sensitive archetype explanation on the lock screen. A tap routes to the community only after session restoration and membership validation.

- [ ] **Step 5: Deliver through the existing durable worker**

After a chat message commits and broadcasts, enqueue send_community_activity_push(message_id). The ARQ task loads eligible members at execution time and calls the provider with bounded retry. Queue/provider failure records a metric but never rolls back or rejects the message. Add the task to WorkerSettings rather than creating a second worker framework.

- [ ] **Step 6: Throttle and suppress**

Send no push to the author, muted users, banned users, users currently connected to that community, or users without opt-in. Use Redis to permit at most one community-activity push per user per community in 15 minutes. Presence is an internal short-lived connection signal only; do not expose online status in the product.

- [ ] **Step 7: Handle token lifecycle**

Register on grant and token refresh; update app_version and last_seen_at; remove invalid provider tokens; and retry provider failures with bounded exponential backoff. The authenticated logout request includes the non-secret installation_id and revokes that session plus its caller-owned push row in one backend transaction; the client also clears native registration state. Notification failure must never fail message persistence or WebSocket delivery.

- [ ] **Step 8: Verify on both platforms**

Test foreground, background, terminated, permission grant/deny, token rotation, logout, account deletion, muted community, active-socket suppression, tap routing, invalid token cleanup, and throttling. Confirm release builds contain no service-account private key.

- [ ] **Step 9: Checkpoint**

Suggested commit if authorized:

~~~text
feat: add private opt-in community notifications
~~~

## Task 30: Add production identity, privacy manifests, and native metadata

**Files:**

- Create: frinq-frontend/ios/App/App/PrivacyInfo.xcprivacy
- Modify: frinq-frontend/ios/App/App/Info.plist
- Modify: frinq-frontend/ios/App/App/Assets.xcassets/
- Modify: frinq-frontend/android/app/src/main/AndroidManifest.xml
- Modify: frinq-frontend/android/app/src/main/res/
- Create: frinq-frontend/store/metadata/en-IN.md
- Create: frinq-frontend/store/privacy-data-inventory.md
- Create: frinq-frontend/store/reviewer-notes.md
- Create: frinq-frontend/scripts/verify-store-assets.mjs

**Produces:** Complete native metadata and source assets ready for store packaging.

- [ ] **Step 1: Freeze product identity**

Owner approves Frinq name, subtitle/short description, category, support URL, marketing URL if used, privacy-policy URL, copyright, developer/seller name, support email, and bundle/application ID. Search and resolve trademark conflicts before spending on final assets.

- [ ] **Step 2: Create source-controlled assets**

Use one approved 1024 by 1024 opaque app icon source without transparency or rounded corners, plus adaptive Android foreground/background assets and launch-screen artwork. Generate platform sizes through the native asset pipeline, not by manually maintaining dozens of unrelated files. Verify there is no old Capacitor branding.

- [ ] **Step 3: Build the Apple privacy manifest from actual dependencies**

Run the current Capacitor privacy-manifest workflow, inventory Required Reason APIs used by Capacitor, secure preferences, Firebase messaging, and app code, and add only documented reason codes. Treat PrivacyInfo.xcprivacy and App Store privacy answers as separate requirements that must agree with runtime behavior.

- [ ] **Step 4: Complete native metadata**

Set display name, versions, orientations actually supported, microphone purpose string, background modes only if required by push, URL schemes only if used, export-compliance values based on counsel/Apple guidance, Android labels/themes, notification icon/channel, and backup rules that exclude refresh tokens and sensitive local data.

- [ ] **Step 5: Add deterministic asset checks**

verify-store-assets.mjs checks required icon/splash dimensions, alpha rules where applicable, application IDs, version strings, permission text, privacy manifest presence, and absence of localhost/development endpoints in release configuration.

- [ ] **Step 6: Verify on release builds**

Build signed-candidate archives locally, inspect the installed icon/name/launch screen, inspect permissions, run the asset check, and scan the unpacked artifacts for localhost, test phones, source maps, admin keys, service-account private keys, and development certificates.

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
release: add native identity privacy manifest and metadata
~~~

### Phase 7 Gate

- [ ] Clean iOS and Android native builds work from npm ci plus native:sync.
- [ ] Real-device voice recording succeeds with platform-native MIME output and denial fallback.
- [ ] Lifecycle, offline, safe-area, keyboard, and Android-back tests pass.
- [ ] Push is opt-in, generic, throttled, mute-aware, and cleaned up on logout/deletion.
- [ ] Privacy manifest, permissions, icon, launch assets, and release endpoint scans pass.
- [ ] No release native project uses a live development server.

Stop and obtain iOS, Android, privacy, and product review before Phase 8.

# Phase 8: Security, operations, and release-candidate hardening

## Task 31: Harden HTTP, secrets, uploads, and production configuration

**Files:**

- Modify: frinq-backend/app/main.py
- Modify: frinq-backend/app/config.py
- Modify: frinq-backend/.env.example
- Modify: frinq-backend/app/api/deps.py
- Modify: frinq-backend/.do/app.yaml
- Create: frinq-backend/app/core/security_headers.py
- Create: frinq-backend/tests/test_api/test_security_boundaries.py
- Create: frinq-backend/scripts/verify_production_config.py
- Modify: frinq-frontend/.do/app.yaml
- Modify: frinq-admin/.do/app.yaml

**Produces:** A release configuration that fails before deployment when a security boundary is missing.

- [ ] **Step 1: Write boundary tests**

Test exact CORS origins, allowed methods/headers, request body limits, upload limits, trusted proxy handling, production docs policy, exception redaction, auth header parsing, banned-user rejection, no-store on token/account responses, and security headers on web/admin/API responses.

- [ ] **Step 2: Set response and edge headers**

For static consumer pages and admin pages, configure HSTS after HTTPS is proven, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin or stricter, frame-ancestors none, a least-privilege Permissions-Policy, and a CSP derived from observed production requests. Do not copy a generic CSP that breaks Capacitor or permits unsafe-eval in release.

- [ ] **Step 3: Bound requests**

At the edge and application, cap JSON request bodies to 64 KB, WebSocket frames to 8 KB, report details to their schema limit, and voice uploads to Task 27 limits. Apply timeouts to database, Redis, AI, WhatsApp, Firebase, and HTTP calls. Bound all pagination and array inputs.

- [ ] **Step 4: Verify secret separation**

Production requires strong unique JWT signing material, SESSION_HASH_PEPPER, RATE_LIMIT_PEPPER, PUSH_TOKEN_KEY, ADMIN_KEY, ADMIN_ACTION_PASSWORD, a non-empty ADMIN_ACTOR_ID, database credentials, Redis credentials, AI/provider secrets, Firebase credentials, and WhatsApp credentials where used. The config validator rejects default/example values, DEBUG, localhost endpoints, wildcard CORS, missing HTTPS, and overlapping admin secrets.

- [ ] **Step 5: Scan source and artifacts**

Use the repository's approved secret scanner or gitleaks in CI. Also scan frinq-frontend/out, admin build output, Android AAB contents, and iOS archive contents for server secrets, test phones, bearer-token examples, source maps, and localhost. Public API origins and Firebase client identifiers are not server secrets but still must point to production.

- [ ] **Step 6: Verify**

Run:

~~~powershell
pytest tests/test_api/test_security_boundaries.py -v
python scripts/verify_production_config.py --env-file .env.staging
pytest -q
~~~

Run the frontend/admin lint and release builds and confirm their header configuration with curl against staging.

- [ ] **Step 7: Checkpoint**

Suggested commit if authorized:

~~~text
security: enforce production boundaries
~~~

## Task 32: Add end-to-end release journeys and accessibility checks

**Files:**

- Modify: frinq-frontend/package.json
- Modify: frinq-frontend/package-lock.json
- Create: frinq-frontend/tests/e2e/release-journeys.spec.ts
- Create: frinq-frontend/tests/e2e/chat-safety.spec.ts
- Create: frinq-frontend/tests/e2e/account-deletion.spec.ts
- Modify: frinq-frontend/playwright.config.ts
- Create: frinq-frontend/tests/e2e/fixtures.ts
- Create: frinq-frontend/docs/device-test-matrix.md

**Produces:** Repeatable proof of the critical customer and safety journeys.

- [ ] **Step 1: Install the accessibility integration**

Run npm install -D @axe-core/playwright@4 and commit the resolved lockfile. Use it inside the existing Playwright suite; do not introduce a second browser runner.

- [ ] **Step 2: Create isolated test data helpers**

Generate uniquely tagged staging users through a test-only seed path protected by an environment flag and admin authentication. The path must not exist in production. Cleanup uses explicit tagged IDs, never a broad delete.

- [ ] **Step 3: Automate browser journeys**

Cover new OTP account, Terms acceptance, quiz resume after refresh, durable processing, active result, assigned community, two-user chat, reconnect without duplicate, report, block, mute, profile edit, logout/login, refresh rotation, revoked-session rejection, and account deletion. Stub external AI/OTP/push only in the isolated CI environment; staging smoke tests use provider-approved test mechanisms.

- [ ] **Step 4: Add automated accessibility assertions**

Run axe or the existing accessibility tool against sign-in, Terms, quiz, processing, result, community, report dialog, profile, settings, and deletion. Fail on serious/critical violations, missing labels, focus traps, inaccessible names, invalid heading order, and color contrast failures.

- [ ] **Step 5: Complete the real-device matrix**

At minimum test the oldest supported iPhone/iOS 15 class device available, one current iPhone, one minSdk 24-class Android device or representative lab device, one current Pixel-class Android, slow network, screen reader, 200% text, dark/light system modes, rotation, push states, microphone states, and app upgrade from the prior internal build.

- [ ] **Step 6: Avoid a second mobile automation stack for beta**

Use Playwright for web logic and the documented real-device matrix for native-only behavior. Add Maestro/Appium only after a repeated regression proves the maintenance cost is justified.

- [ ] **Step 7: Verify**

Run unit, integration, Playwright, accessibility, lint, static build, backend, and native configuration checks from clean installs. Attach command output and the signed device matrix to the release candidate.

- [ ] **Step 8: Checkpoint**

Suggested commit if authorized:

~~~text
test: cover release and safety journeys
~~~

## Task 33: Add observability without collecting message content

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

**Produces:** Actionable health signals and owner-operated incident procedures with redacted data.

- [ ] **Step 1: Separate liveness and readiness**

GET /health/live proves the process loop responds and has no dependencies. GET /health/ready checks a short PostgreSQL query and Redis ping with strict timeouts. AI, OTP, WhatsApp, and push providers appear in a protected dependency-status endpoint but do not make the API unready.

- [ ] **Step 2: Use structured redacted logs**

Include request ID, route template, status, latency, deployment version, job name, sanitized error code, and hashed internal actor ID where needed. Exclude Authorization, cookies, refresh tokens, WebSocket tickets, phone numbers, OTPs, message/report text, quiz answers, voice bytes/URLs, push tokens, and provider secrets. Test the redactor against nested data and exception strings.

- [ ] **Step 3: Add minimum viable metrics and alerts**

Track request count/latency/errors, database pool saturation, Redis failures, OTP success/failure/limit counts, refresh reuse detection, quiz queue age/success/failure, active WebSockets, message accept/reject latency, reports awaiting review, push success/invalid tokens, and account-deletion failures. Alert on sustained 5xx, readiness failure, quiz queue age, elevated OTP abuse, moderation backlog, and backup failure.

- [ ] **Step 4: Write operational runbooks**

Document severity/owner/escalation, secret rotation, token-signing-key incident, database/Redis/provider outage, abusive community response, emergency read-only/chat-disable flags, rollback, user communication approval, and evidence preservation. Set and staff a moderation review target before public chat; if no trained moderator is available, disable new messages rather than leave reports unattended.

- [ ] **Step 5: Verify**

Force each dependency failure in staging, confirm expected readiness and user behavior, inspect logs for planted sensitive values, fire test alerts, and rehearse the chat-disable flag.

- [ ] **Step 6: Checkpoint**

Suggested commit if authorized:

~~~text
ops: add redacted observability and incident runbooks
~~~

## Task 34: Prove backup, restore, capacity, and rollback

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

### Phase 8 Gate

- [ ] Production config validation, secret scans, and security-boundary tests pass.
- [ ] All critical user, safety, deletion, and accessibility journeys pass.
- [ ] Real-device matrix is signed off for iOS and Android.
- [ ] Logs and metrics contain no planted sensitive values.
- [ ] Moderation and incident ownership is staffed and rehearsed.
- [ ] Load target, backup restore, deployment rollback, and emergency flags are proven.
- [ ] No unresolved P0/P1 defect remains; accepted lower-severity defects have owner and release decision.

Stop and obtain engineering, security, operations, moderation, privacy, and product release-candidate approval before Phase 9.

# Phase 9: Store submission and staged worldwide release

## Task 35: Freeze the release candidate and complete disclosure evidence

**Files:**

- Create: frinq-frontend/store/release-checklist.md
- Modify: frinq-frontend/store/privacy-data-inventory.md
- Modify: frinq-frontend/store/reviewer-notes.md
- Create: frinq-frontend/store/territory-review.md
- Create: frinq-frontend/CHANGELOG.md

**Produces:** One traceable build whose binaries, disclosures, screenshots, and backend version match.

- [ ] **Step 1: Freeze versions**

Choose one semantic app version and monotonically increasing iOS build number/Android versionCode. Tag the exact frontend, backend, admin, migration, worker, and native revisions in the release ledger. Any code or configuration change after archive generation invalidates the candidate and requires the relevant checks again.

- [ ] **Step 2: Reconcile the data inventory**

For every collected or transmitted data type, record purpose, optional/required status, user linkage, tracking status, encryption in transit/at rest, processor, retention, deletion, and whether it appears in Apple App Privacy or Google Data Safety. Inspect network traffic and backend schema rather than answering from memory.

- [ ] **Step 3: Complete UGC safety evidence**

Reviewer notes identify community rules acceptance, proactive filtering, report/block entry points, moderator workflow, support contact, and account ban capability. Provide a stable review account/OTP procedure that does not expose a real person's phone and remains available throughout review.

- [ ] **Step 4: Approve territories**

Release in all App Store and Google Play territories that are supported by the OTP, AI, database, Redis, push, analytics, and support providers and approved by legal/tax/content review. Record exclusions and reasons. Do not describe the release as literally every country when a store, provider, sanction, age, language, or legal restriction prevents it.

- [ ] **Step 5: Produce truthful screenshots and copy**

Capture the release binary on required device sizes. Show real app UI, assigned archetype community, privacy/safety tools, and no fabricated functionality. Copy must not promise dating, therapy, guaranteed compatibility, or features deferred from beta.

- [ ] **Step 6: Final pre-submission suite**

From clean checkouts, run every Phase 8 automated command and the full signed device matrix against the frozen staging backend. Record checksums for submitted AAB and iOS archive/export.

## Task 36: Submit and validate the iOS build

**External systems:** Apple Developer, App Store Connect, TestFlight.

**Produces:** A TestFlight-proven iOS build submitted with complete review information.

- [ ] **Step 1: Confirm account and signing**

Owner completes Apple Developer enrollment, agreements, tax/banking where applicable, bundle ID in.frinq.app, App Store Connect app record, distribution signing, and push entitlement. Use automatic signing only if the team accepts it; keep certificates/profiles out of Git.

- [ ] **Step 2: Archive with the required SDK**

Use Xcode 26 or newer and the iOS 26 SDK or newer, with iOS deployment target 15. Archive Release, validate in Organizer, resolve every privacy/entitlement/symbol warning, upload, and confirm processing.

- [ ] **Step 3: Complete App Store Connect**

Provide approved metadata, privacy-policy/support URLs, age-rating answers reflecting UGC and messaging, App Privacy answers from Task 35, encryption/export answers, content rights, pricing/availability, screenshots, reviewer account, OTP instructions, microphone explanation, community-safety explanation, and deletion navigation.

- [ ] **Step 4: Run TestFlight rings**

First internal testers, then an external beta group after Beta App Review. Require at least one full new-user journey and one returning-user/update journey on each supported iOS class, plus report/block/deletion/push tests. Fix crashes and store-blocking issues before submission.

- [ ] **Step 5: Submit for review**

Use manual release or phased release, not immediate automatic worldwide release. Monitor App Review messages daily and answer from the approved reviewer notes. A rejection becomes a tracked defect/change; do not conceal behavior or instruct reviewers to bypass policy.

## Task 37: Submit and validate the Android build

**External systems:** Google Play Console, Firebase Console.

**Produces:** A closed-test-proven Android App Bundle submitted with complete policy declarations.

- [ ] **Step 1: Confirm account and signing**

Owner completes Play developer verification, payments profile/agreements, app record, Firebase Android app, Play App Signing, upload key backup, and application ID in.frinq.app. Keep keystores and passwords out of Git and the web bundle.

- [ ] **Step 2: Build the policy-compatible AAB**

Compile and target API 36, build Release, run lint and bundle validation, upload the AAB, review the pre-launch report, and resolve permission, crash, ANR, security, and device-compatibility findings.

- [ ] **Step 3: Complete Play Console declarations**

Provide store listing, support/privacy/deletion URLs, Data Safety answers from Task 35, content rating, target audience 18+, ads declaration, app access/OTP instructions, UGC policy evidence, account deletion, permissions declarations, and availability/pricing. Mark financial/health/dating/social claims only according to actual product behavior and counsel-reviewed copy.

- [ ] **Step 4: Satisfy testing eligibility**

Run internal testing first. If the developer account is a personal account created after 13 November 2023, complete the currently required closed test with at least 12 opted-in testers continuously for 14 days and obtain production access before rollout. Re-check Play Console because eligibility rules can change.

- [ ] **Step 5: Validate closed testing**

Test clean install, upgrade, OTP, quiz, chat, report/block, push grant/deny/tap, microphone grant/deny, offline/reconnect, logout, deletion, low-memory process recreation, and the supported device matrix. Fix pre-launch and tester P0/P1 issues before production submission.

## Task 38: Deploy production services and perform staged rollout

**External systems:** DigitalOcean App Platform, DNS/TLS provider, Apple App Store, Google Play.

**Produces:** A controlled public launch with measurable stop and rollback points.

- [ ] **Step 1: Deploy in dependency order**

1. verify managed database backup and Redis health.
2. run the deterministic PRE_DEPLOY migration job once.
3. deploy backend with chat/push writes disabled.
4. deploy ARQ worker and verify queue health.
5. deploy consumer static site and admin service.
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

## Task 39: Sign the final acceptance matrix

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

### Phase 9 Gate: Public beta launched

- [ ] Apple approved the exact iOS candidate and rollout is healthy at 100% of approved territories.
- [ ] Google approved the exact Android candidate and rollout is healthy at 100% of approved territories.
- [ ] Production web, admin, API, worker, PostgreSQL, Redis, OTP, AI, moderation, and push paths are healthy.
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
- consumer web, admin web, API, worker, iOS, and Android are separately reproducible from locked dependencies.
- all tests, scans, accessibility checks, device checks, load targets, backup restore, rollback drill, disclosures, reviewer paths, and signed acceptance rows pass.
- both stores approve the same release candidate and staged rollout completes in all approved territories.

# Features explicitly deferred until after beta evidence

Do not add these while executing this plan: public events, ticketing/payments, direct messages, photos/media uploads, reactions, threads, typing indicators, read receipts, public presence, community switching, editable quiz answers after activation, AI matching, a native UI rewrite, a custom design system, message-list virtualization, or a second native automation framework. Add one only through a separately approved design and plan.

# Exact prompt for the coding agent

Copy the following prompt into a fresh coding-agent session started from the directory that contains both frinq-backend and frinq-frontend:

~~~text
Execute the Frinq mobile beta plan at:
frinq-backend/docs/superpowers/plans/2026-07-22-frinq-global-mobile-launch.md

Your job is to implement the plan exactly, one phase at a time, beginning with Phase 0. Before changing anything:
1. Read the entire plan, every applicable AGENTS.md, and the repository instructions.
2. Inspect git status in every repository and preserve all existing user changes, including the out-of-scope App/frinq-mobile Expo prototype.
3. Create or update the execution ledger required by Task 0 with the current commit hashes, tool versions, baseline command output, assumptions, and blockers.
4. Confirm you are working from the parent directory that contains frinq-backend and frinq-frontend. Do not invent paths if a repository is absent.

Execution rules:
- Follow the task order and the named files, interfaces, tests, and commands. Treat the database and API contracts in the plan as authoritative.
- Use test-driven development: add the stated failing test, run it and record the expected failure, write the smallest production change that passes, then run the task and phase verification.
- Keep changes surgical. Do not add deferred features, speculative abstractions, a native rewrite, or dependencies not required by the plan.
- Implement the native release only in frinq-frontend/ios and frinq-frontend/android through Capacitor. Do not modify App/frinq-mobile, copy its direct-Supabase design, or combine Expo packages with the launch app.
- Never overwrite or discard unrelated user work. Never use git reset --hard or broad recursive deletion. Validate any generated/build directory before cleaning it.
- Never log or commit secrets, phone numbers, OTPs, tokens, message/report content, quiz answers, voice data, push tokens, or service-account credentials.
- Do not bypass a failing test, lint rule, migration, store requirement, security gate, legal prerequisite, provider requirement, or real-device check. Record the blocker with exact evidence.
- Do not perform external irreversible actions such as production deployment, DNS changes, provider account changes, certificate creation, store upload/submission, tester invitation, or public rollout without explicit owner authorization at that step.
- Do not commit unless the owner authorizes commits. If authorized, use the suggested checkpoint commits and include only files for that task.
- Re-read the plan at the start of each phase because later tasks depend on the exact earlier contracts.

Checkpoint behavior:
- Complete only one phase at a time.
- At its gate, run every listed verification from fresh state and update the ledger with commands, exit codes, test counts, artifacts, remaining risks, and git diff/status.
- Request a code review for the phase. Stop and report: completed tasks, changed files, verification evidence, manual checks still required, blockers, and the next phase.
- Continue to the next phase only after the owner explicitly approves the gate.

Start now with Phase 0 only. Do not begin Phase 1 in this session unless I explicitly approve the Phase 0 gate.
~~~

# Official references frozen for this plan on 2026-07-22

Re-check these sources at execution/submission time because platform rules change:

- Capacitor 8 upgrade requirements: https://capacitorjs.com/docs/updating/8-0
- Capacitor iOS privacy manifest: https://capacitorjs.com/docs/ios/privacy-manifest
- Capacitor Secure Preferences compatibility and storage behavior: https://capawesome.io/docs/plugins/secure-preferences/
- Capacitor Firebase Messaging compatibility and API: https://capawesome.io/docs/plugins/firebase/cloud-messaging/
- Firebase Cloud Messaging: https://firebase.google.com/docs/cloud-messaging
- Apple submission SDK requirements: https://developer.apple.com/news/upcoming-requirements/
- Apple App Review Guidelines, including UGC: https://developer.apple.com/app-store/review/guidelines/
- Apple in-app account deletion: https://developer.apple.com/support/offering-account-deletion-in-your-app
- Apple App Privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Google Play target API requirements: https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-GB
- Google Play personal-account testing requirements: https://support.google.com/googleplay/android-developer/answer/14151465?hl=en
- Google Play UGC policy: https://support.google.com/googleplay/android-developer/answer/9876937?hl=en-IN
- Google Play account deletion policy: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
- Google Play Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469?hl=en
- DigitalOcean App Platform pre-deploy jobs: https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/
- DigitalOcean App Spec/static sites: https://docs.digitalocean.com/products/app-platform/reference/app-spec/
