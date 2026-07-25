# Deploy & Rollback Runbook

## Beta capacity and service targets (Task 47 Step 1)

The owner hasn't recorded real invited-user/DAU/peak-concurrency numbers as
of this writing — per the plan's own fallback, this documents the **initial
test targets** to use until real staged data replaces them:

| Target | Value | Source |
|---|---|---|
| Peak concurrent WebSocket connections | 500 | Plan's documented default |
| Accepted messages/second across communities | 20 | Plan's documented default |
| Concurrent quiz-insights jobs | 50 | Plan's documented default |
| Invited users, DAU, moderation staffing, latency/error targets | **not yet recorded** | Owner action — update this table once real numbers exist |

`scripts/load_chat.py` (Step 2) defaults to a **much smaller** synthetic
load than the 500/20/50 targets above — see that script's own docstring for
why (this environment has no isolated staging tier; the default is sized to
be safe against the shared dev database, not to validate the real target).

## Deploying

Every deploy goes through DigitalOcean App Platform, driven by
`.do/app.yaml` (git-push-to-`main` triggers a build via `deploy_on_push:
true`). The `PRE_DEPLOY` job runs `scripts/predeploy.py` (migrations +
community sync) before the new version starts serving traffic — a nonzero
exit there blocks the deploy entirely (see the Task 44 ledger entry for the
real `PYTHONPATH` bug found and fixed in this exact job). The API service's
own `health_check.http_path` is `/health/ready` (Task 46) — DO won't route
traffic to a new instance that can't reach its DB/Redis.

## Smoke-testing a deploy

`scripts/smoke_release.py` (Task 47 Step 4) — run immediately after any
deploy (staging or production) to confirm the new version is actually
healthy, not just that DO's own health check passed once:

```
PYTHONPATH=. python scripts/smoke_release.py --base-url <deployed-url> --admin-key <ADMIN_KEY> --seed
```

Checks (in order): `/health/live`, `/health/ready`, `/health/dependencies`
(if `--admin-key` given), and — with `--seed` — a real database write+delete
roundtrip via `seed_release_test_data.py` (proves the write path works, not
just that reads succeed). `--seed` refuses to run against a production
`DATABASE_URL` (the seed script's own boot-guard) — safe to always pass it
against staging, never worry about accidentally running it against prod.

Exit code 0 = every check passed; 1 = at least one failed, with which one
printed. Suitable as a CI gate once/if this project gets a CI pipeline (it
doesn't today — this is a manual, owner-run step).

## Rollback

DigitalOcean App Platform keeps deployment history per app component.
1. Go to the DO dashboard → Apps → this app → the affected component →
   **Activity** tab.
2. Find the last deployment that was known-good (before the regression).
3. **Rollback** to that deployment from the dashboard, or redeploy the same
   commit SHA manually if the dashboard rollback option isn't available for
   that deployment age.
4. Run `scripts/smoke_release.py` again against the rolled-back instance to
   confirm it's actually healthy post-rollback, not just that the rollback
   action itself succeeded.

**Migration compatibility is the one thing that can make a rollback unsafe.**
Every migration in `migrations/*.sql` must stay backward-compatible with
the immediately-prior app version until the new release is confirmed
stable — this repo's migrations are forward-only (no down-migrations exist
anywhere in `migrations/`), so a rollback only works cleanly if the bad
deploy's own migration (if it ran one) doesn't remove/rename anything the
prior app code still reads. Before rolling back, check `migrations/` for
anything newer than the last known-good deploy:
- **Additive changes** (new nullable column, new table) — safe, old code
  ignores what it doesn't know about.
- **Destructive changes** (dropped/renamed column, `NOT NULL` added without
  a default) — rolling back code alone is NOT enough; the destructive
  migration itself would need a hand-written reversal, which doesn't exist
  as tooling in this repo. This is exactly why "destructive column removal
  waits for a later release" (Step 4's own wording) — never ship a
  destructive migration in the same release as risky new code.

## Rollback rehearsal (Task 47 Step 4)

The plan's exact ask: "Deploy one reversible staging change, run
smoke_release.py, roll back the app image while leaving forward-compatible
migrations in place, and rerun smoke tests." This requires a real staging
App Platform component distinct from production — **this project has no
staging tier today** (confirmed: `.do/app.yaml` defines exactly one `api`
service and one `worker`, both `production`-env, no staging component).
Rehearsing the actual DO-dashboard rollback action is therefore an
owner-execution step once a staging component exists, not something
runnable from this dev environment.

What WAS rehearsed and verified from this environment: `smoke_release.py`
itself, run twice against a real local server (once healthy, confirming all
4 checks pass including a real DB seed+cleanup roundtrip) — proving the
smoke-test tooling itself is correct and ready for the day a real staging
rollback rehearsal happens. The rollback mechanism description above is
DigitalOcean's documented dashboard behavior, not independently re-verified
against a live rollback in this session (no internet/doc access to confirm
exact current DO dashboard wording — flagged, not guessed, same convention
as Task 44/45's DO-platform-specific unknowns).
