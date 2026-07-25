# Incident Response Runbook

Owner-operated — Frinq is a solo-dev project with no on-call rotation or
paging service. Every step below assumes one person (the owner) doing this
by hand from a laptop, not a team with dashboards and pagers. Where a step
says "alert," it means "a human should be looking at this regularly," not an
automated page — there is no PagerDuty/Slack-webhook integration wired up
(flagged, not silently assumed).

## Severity

| Severity | Definition | Example |
|---|---|---|
| SEV1 | Data loss/exposure risk, or the app is fully down for all users | DB unreachable, a secret leaked publicly, mass account takeover |
| SEV2 | A core feature is broken for most users but the app is otherwise up | OTP send failing, chat send failing, push entirely down |
| SEV3 | Degraded but workable | Elevated latency, a non-critical provider (AI insights) down |

## Owner and escalation

One person: the project owner. There is no second responder. If the owner
is unavailable during a SEV1, the correct action is degrading gracefully
(see "Emergency chat-disable flag" and provider-outage.md's fail-open/
fail-closed table) rather than leaving the app in an unknown state.

## Detecting an incident

- `GET /health/live` — process up at all.
- `GET /health/ready` — DB (`SELECT 1`, 2s timeout) + Redis (`PING`, 1.5s
  timeout). A rolling deploy on DigitalOcean App Platform already gates
  traffic on this (`.do/app.yaml`'s `health_check.http_path`).
- `GET /health/dependencies` (admin-bearer-protected) — AI/OTP-WhatsApp/push
  provider **configuration presence** only, never a live probe on every
  check (see `app/api/v1/health.py`'s own docstring for why). Never gates
  readiness — a misconfigured/exhausted provider must never take the whole
  API down.
- `GET /health/metrics` (admin-bearer-protected) — Prometheus text format
  (`app/core/metrics.py`). No scrape/dashboard is wired up yet (no
  Prometheus/Grafana instance exists for this solo project) — this is
  designed to be curl'd by hand during an incident, or wired to a real
  scraper later without changing the app.
- Structured logs (`app/utils/logger.py`) — JSON in non-dev environments,
  one line per request (`http.request`) with `request_id`/`route`/`status`/
  `latency_ms`/`deployment_version`. Every line is redacted before it's
  written (`redact_processor`) — safe to grep/share without a second
  scrubbing pass.

## What to watch (maps to `app/core/metrics.py`)

| Signal | Metric | Investigate when |
|---|---|---|
| Sustained 5xx | `http_requests_total{status=~"5.."}` | Rising relative to total requests over several minutes, not a single blip |
| Readiness failure | `/health/ready` returns 503 | Any sustained failure — see provider-outage.md |
| Quiz queue age | `quiz_job_wait_seconds` | A job waiting materially longer than the P95 you've observed historically — the worker may be stuck or Redis/ARQ backed up |
| OTP abuse | `otp_requests_total{outcome="rate_limited"}` | A spike relative to `sent`/`verified` — possible phone-number enumeration or SMS-pumping attempt |
| Moderation backlog | `moderation_reports_open` | Growing with no one reviewing — see moderation.md |
| Backup failure | (no automated backup job exists in this repo yet) | Supabase's own backup/PITR settings are managed in their dashboard, outside this codebase — verify there, not here |

## Emergency chat-disable flag

`CHAT_DISABLED` (`app/config.py`) — set to `true` in `.do/app.yaml`'s API
service env and redeploy. Every new chat send is rejected with code
`chat_disabled` (checked first in `app/core/realtime.py`'s
`persist_before_publish`, before rate-limiting or moderation — it still
works even if Redis is also down). Membership, history reads, and existing
messages are completely unaffected. Use this when:
- No trained moderator is available to work the report queue (see
  moderation.md's staffing policy), or
- An active abuse incident needs new messages stopped immediately while
  it's investigated.

## Secret rotation

Every real secret lives in `.do/app.yaml`'s `envs` (type `SECRET`) or the
owner's local `.env` for dev. To rotate any of `SECRET_KEY`,
`SESSION_HASH_PEPPER`, `RATE_LIMIT_PEPPER`, `PUSH_TOKEN_HASH_PEPPER`,
`ADMIN_KEY`, `ADMIN_ACTION_PASSWORD`, `TWILIO_AUTH_TOKEN`,
`ANTHROPIC_API_KEY`, `FCM_SERVICE_ACCOUNT_JSON`, `DATABASE_URL`:
1. Generate/obtain the new value from the provider's own console (Twilio,
   Anthropic, Firebase, Supabase) or a real random generator — never reuse
   a value that appeared in chat, a screenshot, or any non-secret channel.
2. Update the value in `.do/app.yaml` (or DO's app dashboard directly) and
   redeploy.
3. `SESSION_HASH_PEPPER`/`SECRET_KEY` rotation invalidates every existing
   session (refresh tokens are HMACed with the pepper; access tokens are
   signed with `SECRET_KEY`) — every user is logged out. This is expected,
   not a bug; communicate it (see "User communication" below) if it's a
   planned rotation, not an incident response.
4. `PUSH_TOKEN_ENCRYPTION_KEY` rotation invalidates every stored push
   token (they're Fernet-encrypted at rest) — every device needs to
   re-register. `app/core/production_guard.py` already refuses to boot in
   production if this isn't a real Fernet key.
5. Run `python scripts/verify_production_config.py --env-file <path>`
   against the new values before deploying — it runs the exact same checks
   `app/main.py`'s boot-time guard does, without booting the app or
   touching the real DB/Redis.
6. Confirm nothing leaked into git history: `python scripts/scan_for_secrets.py`.

## Token-signing-key incident (SECRET_KEY compromised)

If `SECRET_KEY` (access-token signing) is suspected leaked:
1. Rotate `SECRET_KEY` immediately (see above) — every access token in the
   wild becomes invalid the instant this deploys.
2. Rotate `SESSION_HASH_PEPPER` too if there's any chance refresh tokens
   were also exposed (they're stored HMACed with this pepper, not in
   plaintext, but rotating both closes the incident cleanly).
3. `revoke_all_sessions` (`app/core/session.py`) is available per-user if
   only specific accounts are suspected compromised, without a full rotation.

## Database/Redis/provider outage

See `docs/runbooks/provider-outage.md` for the per-provider detection/
fail-open-or-closed/recovery table. Summary: DB down → `/health/ready`
reports `database: error`, the whole API is effectively down (every route
needs the DB). Redis down → `/health/ready` reports `redis: error`; OTP
send/verify and WS-ticket issuance fail closed (503, by design — see
`app/core/rate_limit.py`'s own docstring); chat send and most reads fail
open (degraded, not blocked).

## Abusive community response

See `docs/runbooks/moderation.md`. Fast options while the report queue is
worked: ban/suspend the specific account (`app/api/v1/admin.py`'s
ban/suspend endpoints — publishes a ban event that force-closes their live
WebSocket immediately), or flip `CHAT_DISABLED` if the abuse is widespread
enough that per-account action isn't keeping up.

## Rollback

DigitalOcean App Platform keeps deployment history per app — roll back to
the last known-good deployment from the DO dashboard (Apps → this app →
Activity → select a prior deployment → Rollback), or redeploy the last
good commit SHA from `.do/app.yaml`'s connected repo. There is no
separate rollback tooling in this codebase; this is entirely a DO-console
action. Database migrations (`migrations/*.sql`) are forward-only in this
repo — a rollback that depends on schema having NOT yet changed only works
if the bad deploy didn't also run a new migration. Check
`migrations/` for anything newer than the last known-good deploy before
rolling back code alone.

## User communication approval

Never send any user-facing communication (in-app banner, push, email) about
an incident without explicit owner approval first — this is a single-owner
project and there is no comms/PR function separate from the owner. Draft
the message, get approval, then send. This mirrors the project's standing
rule that nothing gets committed/pushed/deployed without a fresh, separate
ask — the same discipline applies to anything users see.

## Evidence preservation

- Structured logs are already redacted before being written — safe to
  export/share for a postmortem without a second scrub.
- Account deletions log a `deletion_id` + former user UUID + timestamp
  only (`app/api/v1/users.py`'s `users.deleted` log line) — never phone/
  content. Use `deletion_id` to correlate an incident to a specific
  deletion if one's relevant.
- Bans/moderation actions are recorded in `moderation_actions`
  (`app/api/v1/admin.py`) with actor/target/reason — query this table
  directly via `psql`/Supabase's SQL editor for a timeline, don't rely on
  logs alone for anything that needs to survive log rotation.
- Don't delete/modify any of the above while an incident is still being
  investigated, even if it's tempting to "clean up."
