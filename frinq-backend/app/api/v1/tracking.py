"""Tracking endpoint — stores identity-aware events from the frontend."""

from __future__ import annotations

import json
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_pool
from app.utils.logger import logger

router = APIRouter(prefix="/track", tags=["tracking"])


class TrackPayload(BaseModel):
    session_id: str
    page: str
    action: str
    element: str | None = None
    identity: dict[str, Any] | None = None
    data: dict[str, Any] | None = None


@router.post("")
async def track_event(
    payload: TrackPayload,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, bool]:
    """Insert into tracking_events. Never raises — tracking failures must not
    break the client. Logs server-side and returns ok=False if DB write fails."""
    identity = payload.identity or {}
    phone_raw = identity.get("phone")
    name_raw = identity.get("name")
    phone = str(phone_raw).strip() if phone_raw else None
    name = str(name_raw).strip() if name_raw else None
    data_json = json.dumps(payload.data) if payload.data is not None else None

    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO tracking_events
                   (session_id, phone, name, page, action, element, data)
                   VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)""",
                payload.session_id,
                phone or None,
                name or None,
                payload.page,
                payload.action,
                payload.element or None,
                data_json,
            )
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        logger.warning("track.insert_failed", error=str(exc), page=payload.page)
        return {"ok": False}
