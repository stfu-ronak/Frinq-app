from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse

import asyncpg
from fastapi import APIRouter, Depends, Header, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.deps import get_pool

router = APIRouter(prefix="/events", tags=["events"])


def _http_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("http_url_required")
    return value


class EventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image_url: str = Field(min_length=1, max_length=2000)
    name: str = Field(min_length=1, max_length=160)
    quote: str = Field(max_length=500)
    details: str = Field(max_length=5000)
    registration_url: str = Field(min_length=1, max_length=2000)
    starts_at: datetime
    ends_at: datetime | None = None
    sort_order: int = Field(default=0, ge=0, le=10000)
    status: Literal["draft", "published", "archived"] = "draft"

    @field_validator("image_url", "registration_url")
    @classmethod
    def validate_http_urls(cls, value: str) -> str:
        return _http_url(value)

    @field_validator("ends_at")
    @classmethod
    def validate_end_after_start(cls, value: datetime | None, info) -> datetime | None:
        if value is not None and info.data.get("starts_at") and value < info.data["starts_at"]:
            raise ValueError("ends_at_before_starts_at")
        return value


def serialize_event(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "image_url": row["image_url"],
        "name": row["name"],
        "quote": row["quote"],
        "details": row["details"],
        "registration_url": row["registration_url"],
        "starts_at": row["starts_at"].isoformat(),
        "ends_at": row["ends_at"].isoformat() if row["ends_at"] else None,
        "sort_order": int(row["sort_order"]),
        "status": row["status"],
    }


_EVENT_COLUMNS = "id, image_url, name, quote, details, registration_url, starts_at, ends_at, sort_order, status"


@router.get("", response_model=None)
async def list_published_events(
    response: Response,
    pool: asyncpg.Pool = Depends(get_pool),
    if_none_match: str | None = Header(default=None),
) -> dict[str, Any] | Response:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT {_EVENT_COLUMNS} FROM events
                WHERE status = 'published'
                  AND (ends_at IS NULL OR ends_at >= now() - interval '30 days')
                ORDER BY starts_at ASC, sort_order ASC"""
        )
    payload = {"events": [serialize_event(row) for row in rows]}
    etag = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    response.headers["ETag"] = etag
    if if_none_match == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return payload
