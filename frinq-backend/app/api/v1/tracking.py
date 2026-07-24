"""Tracking endpoint — stores allowlisted, property-free analytics events."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from app.api.deps import get_pool
from app.utils.logger import logger

router = APIRouter(prefix="/track", tags=["tracking"])

# Client-side allowlist lives in app/lib/analytics.ts — kept in sync by hand.
# Validated again here so a compromised/rogue client can't smuggle arbitrary
# event names into the table.
ALLOWED_EVENTS = frozenset({
    "screen_view", "otp_requested", "otp_verified", "quiz_started",
    "quiz_completed", "result_viewed", "community_opened", "message_sent",
    "report_submitted", "block_created", "notification_opt_in", "account_deleted",
})


class TrackPayload(BaseModel):
    # No free-form `data`/`element`/`identity` fields — every allowlisted
    # event is deliberately property-free (session_id/page/action only) so
    # there's no field left for a rogue or careless client to smuggle
    # free-text/PII through. Extra fields are ignored, not rejected —
    # tracking must never break the client over a schema mismatch.
    model_config = ConfigDict(extra="ignore")

    session_id: str
    page: str
    action: str


@router.post("")
async def track_event(
    payload: TrackPayload,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, bool]:
    """Insert into tracking_events. Never raises — tracking failures must not
    break the client. Logs server-side and returns ok=False if DB write fails
    or the event isn't on the allowlist. Never accepts phone/name from the
    client — those columns are legacy and stay unpopulated from this path."""
    if payload.action not in ALLOWED_EVENTS:
        logger.warning("track.rejected_event", action=payload.action, page=payload.page)
        return {"ok": False}

    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO tracking_events (session_id, page, action)
                   VALUES ($1, $2, $3)""",
                payload.session_id,
                payload.page,
                payload.action,
            )
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        logger.warning("track.insert_failed", error=str(exc), page=payload.page)
        return {"ok": False}
