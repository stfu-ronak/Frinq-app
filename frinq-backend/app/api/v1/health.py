"""Task 46 Step 1 — liveness vs readiness, and a protected dependency-status
endpoint that never gates readiness.

/health/live:   proves the process/event loop responds. No dependencies at
                all — if this endpoint can run, the process is alive.
/health/ready:  a short DB query + Redis ping, strict timeouts. This is what
                a load balancer/rolling deploy should gate traffic on.
/health/dependencies: AI/OTP/WhatsApp/push provider CONFIGURATION presence
                (never a live call to a paid provider on every health check).
                Admin-protected, informational only — its result must never
                make /health/ready (or /health/live) fail.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Response

from app.api.deps import require_admin
from app.config import settings
from app.core import metrics
from app.core.redis_client import get_redis
from app.database import get_pool as _get_raw_pool
from app.utils.logger import logger

router = APIRouter(prefix="/health", tags=["health"])

_DB_TIMEOUT_SECONDS = 2.0
_REDIS_TIMEOUT_SECONDS = 1.5


@router.get("/live")
async def live() -> dict[str, str]:
    return {"status": "ok", "deployment_version": settings.DEPLOYMENT_VERSION}


async def _database_ready() -> bool:
    try:
        pool = _get_raw_pool()
    except RuntimeError:
        return False
    try:
        async with pool.acquire() as conn:
            await asyncio.wait_for(conn.fetchval("SELECT 1"), timeout=_DB_TIMEOUT_SECONDS)
        return True
    except Exception as exc:  # noqa: BLE001 — any failure means "not ready"
        logger.warning("health.database_not_ready", error=str(exc))
        return False


async def _redis_ready() -> bool:
    client = await get_redis()
    if client is None:
        return False
    try:
        await asyncio.wait_for(client.ping(), timeout=_REDIS_TIMEOUT_SECONDS)
        return True
    except Exception as exc:  # noqa: BLE001 — any failure means "not ready"
        logger.warning("health.redis_not_ready", error=str(exc))
        return False


@router.get("/ready")
async def ready(response: Response) -> dict[str, Any]:
    db_ok, redis_ok = await asyncio.gather(_database_ready(), _redis_ready())
    all_ok = db_ok and redis_ok
    response.status_code = 200 if all_ok else 503
    return {
        "status": "ready" if all_ok else "not_ready",
        "checks": {
            "database": "ok" if db_ok else "error",
            "redis": "ok" if redis_ok else "error",
        },
    }


def _configured(*values: str | None) -> bool:
    return all(bool(v) for v in values)


@router.get("/dependencies", dependencies=[Depends(require_admin)])
async def dependencies() -> dict[str, Any]:
    """Configuration-presence only — NOT a live provider call on every health
    check (that would be slow, costly against paid APIs, and rate-limit-risky
    against Twilio/Anthropic/Firebase). A real connectivity probe belongs in
    a manual/on-demand runbook step (docs/runbooks/provider-outage.md), not a
    routinely-scraped endpoint."""
    return {
        "ai": {"configured": _configured(settings.ANTHROPIC_API_KEY)},
        "otp_whatsapp": {"configured": _configured(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)},
        "push": {"configured": _configured(settings.FCM_SERVICE_ACCOUNT_JSON)},
    }


@router.get("/metrics", dependencies=[Depends(require_admin)])
async def metrics_endpoint() -> Response:
    try:
        pool = _get_raw_pool()
        metrics.db_pool_connections_in_use.set(pool.get_size() - pool.get_idle_size())
        metrics.db_pool_connections_max.set(pool.get_max_size())
        async with pool.acquire() as conn:
            open_reports = await conn.fetchval("SELECT COUNT(*) FROM message_reports WHERE status = 'open'")
        metrics.moderation_reports_open.set(open_reports or 0)
    except RuntimeError:
        pass
    body, content_type = metrics.render()
    return Response(content=body, media_type=content_type)
