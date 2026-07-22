from __future__ import annotations

from typing import Any
from uuid import UUID

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.config import settings
from app.utils.logger import logger

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
        logger.warning("queue.connect_failed", error=str(exc))
        return None


async def close_queue() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def enqueue_build_profile(user_id: UUID) -> str | None:
    """Placeholder enqueue — the worker function `build_profile` is added in a
    later session. We only need the job to be persisted in Redis.
    """
    queue = await get_queue()
    if queue is None:
        return None
    job: Any = await queue.enqueue_job("build_profile", str(user_id))
    if job is None:
        return None
    return str(job.job_id)
