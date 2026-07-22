"""One-off backfill: enqueue durable insights processing for legacy
profile_processing users who completed their quiz before Phase 2's
community-assignment worker existed, and therefore have no membership yet.

Defaults to --dry-run (report counts only). --apply actually enqueues, using
a deterministic ARQ job ID per submission so reruns don't duplicate work.

Production execution requires separate deployment authorization — this
script only prepares the capability; running it against the real database
is a deploy-time decision, not something this session does automatically.
"""

from __future__ import annotations

import argparse
import asyncio
from typing import Any

from app.database import close_pool, init_pool
from app.utils.logger import logger
from app.workers.queue import get_queue


async def _find_eligible(conn: Any) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT DISTINCT ON (u.id) u.id AS user_id, qs.id AS submission_id
        FROM users u
        JOIN quiz_submissions qs ON qs.user_id = u.id AND qs.is_complete = TRUE
        LEFT JOIN community_members cm ON cm.user_id = u.id
        WHERE u.onboarding_state = 'profile_processing' AND cm.user_id IS NULL
        ORDER BY u.id, qs.completed_at DESC NULLS LAST, qs.created_at DESC
        """
    )
    return [dict(row) for row in rows]


async def _main(apply: bool) -> int:
    pool = await init_pool()
    if pool is None:
        logger.error("backfill_quiz_activation.failed", reason="DATABASE_URL not set")
        return 1
    try:
        async with pool.acquire() as conn:
            eligible = await _find_eligible(conn)

        logger.info("backfill_quiz_activation.found", count=len(eligible))

        if not apply:
            for row in eligible:
                logger.info(
                    "backfill_quiz_activation.dry_run_candidate",
                    user_id=str(row["user_id"]),
                    submission_id=str(row["submission_id"]),
                )
            return 0

        queue = await get_queue()
        if queue is None:
            logger.error("backfill_quiz_activation.failed", reason="Redis unreachable")
            return 1

        enqueued = 0
        for row in eligible:
            submission_id = str(row["submission_id"])
            job = await queue.enqueue_job(
                "generate_quiz_insights",
                submission_id,
                _job_id=f"quiz_insights_backfill_{submission_id}",
            )
            if job is not None:
                enqueued += 1
        logger.info("backfill_quiz_activation.enqueued", count=enqueued, total=len(eligible))
    finally:
        await close_pool()
    return 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true",
        help="Actually enqueue jobs (default: dry-run, report counts only)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    raise SystemExit(asyncio.run(_main(apply=args.apply)))
