# Provider Outage Runbook

Per-dependency: how to detect it's down, what the app does automatically
(fail-open vs fail-closed — this is a deliberate per-feature decision made
in code, not a blanket policy), what breaks for users, and what to actually
do about it. `GET /health/dependencies` (admin-protected) reports
**configuration presence** for the four external providers below — it is
NOT a live connectivity probe (deliberately: pinging Twilio/Anthropic/
Firebase on every health check would be slow, cost real money, and risk
tripping their own rate limits). Live connectivity is inferred from the
actual failure signals in this doc instead.

## PostgreSQL (Supabase pooler)

- **Detect:** `GET /health/ready` → `checks.database: "error"`. This is a
  real `SELECT 1` against the pool with a 2s timeout
  (`app/api/v1/health.py`'s `_database_ready`), not just "did `init_pool()`
  run once at boot."
- **Behavior:** fails closed everywhere — nearly every route needs the DB.
  This is effectively a full outage, not a degraded mode.
- **What still works:** `/health/live` (no dependencies at all).
- **Recovery:** check Supabase's own status/dashboard first (this is a
  managed pooler, not self-hosted). If Supabase is healthy but this app
  still reports not-ready, check `DATABASE_URL` hasn't rotated/expired and
  that `asyncpg`'s pool wasn't exhausted (`GET /health/metrics`'s
  `db_pool_connections_in_use` vs `db_pool_connections_max` — currently
  min=1/max=10, `app/database.py`'s `init_pool`).

## Redis

- **Detect:** `GET /health/ready` → `checks.redis: "error"` (a real `PING`,
  1.5s timeout). Also watch `redis_failures_total` by `source` label
  (`app/core/metrics.py`) — `queue.connect`, `redis_client.connect`,
  `redis_client.pubsub_connect`, and `rate_limit.<limiter_name>` each
  identify exactly which subsystem is failing.
- **Behavior is per-feature, not blanket** (`app/core/rate_limit.py`'s own
  docstring is the source of truth):

  | Feature | Redis down → | Why |
  |---|---|---|
  | OTP request/verify | **fails closed** (503) | Unbounded SMS cost / brute-force risk if rate limiting can't be enforced |
  | WS-ticket issuance | **fails closed** (503) | Same reasoning as OTP |
  | Chat send | **fails open** (allowed, unlimited) | A brief Redis outage taking down all of chat would be a larger regression than the small abuse window it risks |
  | Report submission | **fails open** | Same reasoning |
  | Push (`push_community` limiter) | **fails open** (extra push allowed) | Sending one extra notification is far cheaper than silently dropping real ones |
  | Community pub/sub (message delivery) | **degraded** — `persist_before_publish` still inserts the message (durable), but `redis.publish()` inside the same try/except can fail, returning `internal_error` to the sender even though the message may already be persisted (client retry is safe — idempotent on `client_message_id`) | See `app/core/realtime.py` |
  | ARQ job queue (`enqueue_*`) | Returns `None` (job not queued) — callers already treat this as a soft failure (503 for quiz-insights, silently skipped for push) | `app/workers/queue.py` |

- **Recovery:** once Redis is back, `get_redis()`/`get_queue()` reconnect
  lazily on the next call (5s failure cooldown between attempts,
  `app/core/redis_client.py`) — no manual restart needed.

## Twilio (OTP + WhatsApp)

- **Detect:** `otp_requests_total{outcome="send_failed"}` rising
  (`app/api/v1/otp.py`'s `send_otp_route` catches a `RuntimeError` from
  `app/core/otp.py`'s `send_otp` and returns 503). Verify-side timeouts
  surface as `outcome="verify_timeout"` (504).
- **Behavior:** OTP send/verify fails closed — there's no fallback channel.
  New account creation and login are blocked until Twilio recovers.
- **What still works:** everything not requiring a fresh OTP — already-
  authenticated sessions, chat, refresh-token rotation.
- **Recovery:** check Twilio's own status page and the configured
  `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` haven't expired/rotated.

## Anthropic (AI quiz insights)

- **Detect:** `quiz_jobs_total{outcome="failed"}` rising, `quiz_job_wait_seconds`
  growing (jobs queuing but not completing). `app/core/ai/claude_client.py`
  has an explicit 60s timeout — a hung provider fails the job rather than
  hanging a worker slot indefinitely.
- **Behavior:** fails the specific job; `_mark_error` (`app/workers/tasks/
  quiz_insights.py`) sets `quiz_submissions.status='error'` and
  `users.onboarding_state='error'` — the affected user sees an error state,
  not a silent hang. Every OTHER user/feature is completely unaffected
  (this runs in the worker, not the request path).
- **Recovery:** once Anthropic recovers, affected users need to retry their
  submission (no automatic re-enqueue exists for jobs already marked
  errored) — there's no backfill script for this specific case today
  (`scripts/backfill_quiz_activation.py` handles a different scenario:
  completed-but-not-activated submissions, not AI-call failures).

## Firebase (push notifications)

- **Detect:** `push_send_outcomes_total` by outcome (`success`,
  `invalid_token`, `error`, `timeout`) — a spike in `error`/`timeout`
  relative to `success` indicates a Firebase-side problem rather than
  normal invalid-token churn.
- **Behavior:** fails open, per-recipient — `app/workers/tasks/push.py`'s
  `_send_sync` catches everything except `UnregisteredError` and logs a
  warning without crashing the worker or blocking other recipients in the
  same batch; a 10s timeout (`_SEND_TIMEOUT_SECONDS`) bounds each attempt.
  Push is already documented as best-effort everywhere it's called from
  (`app/api/v1/realtime.py`'s reader loop never awaits the enqueue).
- **What still works:** everything — push failure is invisible to the
  sender and the recipient just doesn't get notified (they'll still see
  the message next time they open the app).
- **Recovery:** none needed beyond Firebase recovering on its own side —
  no queued/retried pushes to replay (this is fire-and-forget by design).

## Supabase Auth (legacy `CurrentUser` path only)

Only used by endpoints not yet migrated to the OTP-native `CurrentAccount`
system (`app/api/deps.py`'s `get_current_user`/`_decode_supabase_jwt`). If
`SUPABASE_JWT_SECRET` is unset or Supabase's JWKS is unreachable, those
specific legacy endpoints return 503 (`auth not configured`) or 401
(`invalid token`) — the OTP-native session system
(`get_current_account`) is entirely independent and unaffected.
