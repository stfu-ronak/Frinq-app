from __future__ import annotations

import asyncpg
from supabase import Client, create_client

from app.config import settings
from app.utils.logger import logger

_pool: asyncpg.Pool | None = None
_supabase: Client | None = None


def _asyncpg_dsn(url: str) -> str:
    # asyncpg expects a plain postgresql:// DSN — strip the SQLAlchemy +asyncpg suffix if present
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool
    if not settings.DATABASE_URL:
        logger.warning("database.init_pool.skipped", reason="DATABASE_URL not set")
        return None  # type: ignore[return-value]
    _pool = await asyncpg.create_pool(
        dsn=_asyncpg_dsn(settings.DATABASE_URL),
        min_size=1,
        max_size=10,
        command_timeout=30,
        # DATABASE_URL points at Supabase's transaction-mode pgbouncer pooler,
        # which does not support server-side prepared statements — a pooled
        # connection can be handed to a different client mid-session, so a
        # statement prepared earlier may no longer exist. Without this,
        # asyncpg intermittently raises InvalidSQLStatementNameError.
        statement_cache_size=0,
    )
    logger.info("database.pool_initialised")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("database.pool_closed")


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool not initialised — call init_pool() first")
    return _pool


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY required")
        _supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _supabase
