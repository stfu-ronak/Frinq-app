from __future__ import annotations

from typing import Any
from uuid import UUID

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.config import settings
from app.core import metrics
from app.database import close_pool, init_pool
from app.utils.logger import logger
from app.workers.tasks.push import send_community_push
from app.workers.tasks.quiz_insights import generate_quiz_insights

_pool: ArqRedis | None = None


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.REDIS_URL)


async def get_queue() -> ArqRedis | None:
    """Return the ARQ Redis pool, or None if Redis is unreachable.

    Connection failures are downgraded to a warning so the API stays usable in
    dev environments without Redis; callers must treat a `None` return as
    "job not queued".
    """
    global _pool
    if _pool is not None:
        return _pool
    try:
        _pool = await create_pool(_redis_settings())
        logger.info("queue.connected", url=settings.REDIS_URL)
        return _pool
    except Exception as exc:  # noqa: BLE001 — Redis may be absent in dev
        metrics.redis_failures_total.labels(source="queue.connect").inc()
        logger.warning("queue.connect_failed", error=str(exc))
        return None


async def close_queue() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def enqueue_quiz_insights(submission_id: UUID) -> str | None:
    """Returns None if Redis is unreachable — callers must treat that as
    'job not queued' (503)."""
    queue = await get_queue()
    if queue is None:
        return None
    job: Any = await queue.enqueue_job("generate_quiz_insights", str(submission_id))
    if job is None:
        return None
    return str(job.job_id)


async def enqueue_community_push(community_slug: str, author_id: UUID, active_user_ids: set[UUID]) -> str | None:
    """Fire-and-forget after a chat message is persisted+published. Returns
    None if Redis is unreachable — the caller must never let that affect
    the sender's WS response, push is best-effort by design."""
    queue = await get_queue()
    if queue is None:
        return None
    job: Any = await queue.enqueue_job(
        "send_community_push", community_slug, str(author_id), [str(u) for u in active_user_ids],
    )
    if job is None:
        return None
    return str(job.job_id)


async def _on_startup(ctx: dict[str, Any]) -> None:
    await init_pool()


async def _on_shutdown(ctx: dict[str, Any]) -> None:
    await close_pool()


class WorkerSettings:
    functions = [generate_quiz_insights, send_community_push]
    redis_settings = _redis_settings()
    on_startup = _on_startup
    on_shutdown = _on_shutdown
    max_jobs = 4
    # Must exceed the real worst-case latency of generate_quiz_insights, else
    # ARQ cancels a healthy job mid-AI-call and re-delivers it (max_tries), and
    # the retry re-runs the paid OpenAI/Claude calls. Worst case ≈ insights'
    # two 180s attempts (sequential) running concurrently with the 180s deep
    # report ≈ 360s, plus DB/community work. 420s leaves headroom without
    # letting a genuinely stuck job hold a worker slot indefinitely.
    job_timeout = 420
    max_tries = 3
