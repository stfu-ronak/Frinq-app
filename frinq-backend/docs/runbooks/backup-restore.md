# Backup & Restore Runbook

**Environment limitation, stated upfront:** this project's database is a
managed Supabase Postgres instance with no isolated staging tier or second
project provisioned. Actually restoring into an isolated database (this
runbook's Step 3) requires the owner's Supabase dashboard/API access and
very likely incurs cost (a second restored project) — it cannot be
rehearsed from this dev environment. What follows is the real, documented
procedure to run once that access is available, written so it's ready to
execute rather than invented at the moment it's needed.

## What Supabase actually provides (verify against the current dashboard —
not independently re-confirmed live in this session, no internet/dashboard
access from this environment; Supabase's backup offering is tied to the
project's paid tier)

- **Daily backups**: available on Supabase's paid compute tiers, retained
  for a plan-dependent window. Restoring from one recovers to that backup's
  point in time (once per day granularity).
- **Point-in-time recovery (PITR)**: available on higher tiers, recovers to
  any point within the retention window, not just a daily snapshot.
- **Action needed from the owner:** confirm which of the above is actually
  enabled on this project's current plan, and the owner-approved retention
  window, before relying on either in a real incident. This runbook
  describes the PROCEDURE; it does not confirm this project is currently
  configured for it.

## Restore procedure

1. **Never restore in place onto the live project for a drill or a
   verification pass.** Supabase's restore flow can create a fresh,
   separate project from a backup/PITR point — use that path so production
   is never touched by a test restore. (A REAL production-loss incident is
   the one case where restoring the live project itself may be the correct
   call — that's a judgment call for the owner at the time, not something
   this runbook can decide in advance.)
2. Once the isolated restored database is up, point a throwaway
   `DATABASE_URL` at it (never reuse the real one) and run migrations
   forward to the current schema:
   ```
   PYTHONPATH=. python -c "
   import asyncio
   from app.migrations import run_migrations
   from app.database import init_pool, close_pool
   async def main():
       pool = await init_pool()
       applied = await run_migrations(pool)
       print('applied:', applied)
       await close_pool()
   asyncio.run(main())
   "
   ```
   (Same migration runner `scripts/predeploy.py` uses in every real deploy
   — reused, not reinvented, so restore-then-migrate is exercised through
   the identical code path as a real deploy.)
3. **Replay every deletion audit event newer than the restored backup —
   the plan's explicit requirement, and the reason a naive restore is
   unsafe:** a restore rolls back time, which means any account deleted
   AFTER the backup's recovery point would reappear in the restored data.
   `app/api/v1/users.py`'s `delete_me` logs a `users.deleted` structured
   line (`deletion_id`, `former_user_id`, `completed_at`) for every real
   deletion — never phone/content, safe to grep directly. Procedure:
   - Grep application logs for `event="users.deleted"` (or the JSON
     equivalent in production) with `completed_at` after the backup's
     recovery point.
   - For each, `DELETE FROM users WHERE id = '<former_user_id>'` against the
     restored database directly (the same real hard-delete the original
     action performed — cascades apply identically).
   - **No automated tool does this today** — there is no log-aggregation
     platform in this project (no ELK/Datadog/equivalent), so this is a
     manual grep-and-delete pass, not a script. If deletion volume ever
     makes this impractical by hand, that's the trigger to build a real
     tool — not before, per the project's own "don't build for a
     hypothetical" convention.
4. **Validate the restore** before it's trusted:
   - A synthetic account/community/history round-trip:
     `scripts/seed_release_test_data.py seed --tag restore-check-<date>`
     against the restored DB, confirm the row + community assignment exist
     and read back correctly, then `cleanup --tag restore-check-<date>`.
   - Confirm the **continued absence** of a previously-deleted synthetic
     account: seed one, delete it via the real `DELETE /users/me` flow (or
     directly via SQL) BEFORE ever taking a restore-test backup, then after
     restoring, confirm that account's `id` is genuinely gone — not merely
     soft-deleted — from the restored data. This is the direct test of
     step 3's replay logic actually working.
   - Integrity queries: row counts on `users`/`quiz_submissions`/
     `community_members`/`messages` in the restored DB should be sane
     relative to the source (not zero, not wildly divergent) — an exact
     match isn't expected if PITR captured a slightly earlier point.
5. **Destroy the isolated restore through Supabase's own approved process**
   once validation is done — never leave a second live copy of user data
   sitting around indefinitely; that's its own data-handling liability.
6. **Record the recovery point and recovery time actually achieved**: how
   far back the restore's data reflects (RPO) and how long the whole
   restore-migrate-replay-validate cycle took (RTO). These numbers only
   exist once this has actually been run once for real — not estimated
   here.

## Why this matters even though it can't be executed here

Task 47's own framing is "evidence that the beta can survive a failed
deploy and its expected initial load" — a written, ready-to-run procedure
is real progress toward that even without the owner's dashboard access to
execute it end-to-end. The alternative (inventing a "verified" claim without
ever having run a real restore) would be worse than an honest gap: an
un-rehearsed backup strategy that everyone believes is rehearsed is more
dangerous than one everyone knows still needs a real drill.
