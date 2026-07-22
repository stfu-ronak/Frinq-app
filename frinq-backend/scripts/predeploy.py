"""Pre-deploy job entrypoint.

Applies database migrations before the new app version starts serving
traffic. Runs as a blocking DigitalOcean PRE_DEPLOY job (see .do/app.yaml)
— a non-zero exit here blocks the deploy.
"""

from __future__ import annotations

import asyncio
import sys

from app.core.communities import sync_communities
from app.database import close_pool, init_pool
from app.migrations import run_migrations
from app.utils.logger import logger


async def _main() -> int:
    pool = await init_pool()
    if pool is None:
        logger.error("predeploy.failed", reason="DATABASE_URL not set")
        return 1
    try:
        applied = await run_migrations(pool)
        logger.info("predeploy.migrations_applied", count=len(applied))
        async with pool.acquire() as conn:
            synced = await sync_communities(conn)
        logger.info("predeploy.communities_synced", count=synced)
    except Exception as exc:  # noqa: BLE001 — any failure here blocks the deploy
        logger.error("predeploy.failed", error=str(exc))
        return 1
    finally:
        await close_pool()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_main()))
