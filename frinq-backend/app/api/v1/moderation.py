"""User-facing message reporting.

POST /messages/{message_id}/report — idempotent (a retry returns the
existing report, never a duplicate row), never reveals the reporter's
identity to the reported user (nothing in this file, or anywhere in the
consumer-facing API, exposes message_reports rows to a non-admin).
"""

from __future__ import annotations

from uuid import uuid4

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentAccount, get_current_account, get_pool
from app.core.rate_limit import check_rate_limit
from app.core.redis_client import get_redis
from app.schemas.message import MessageReportRequest
from app.utils.logger import logger

router = APIRouter(tags=["moderation"])


@router.post("/messages/{message_id}/report", status_code=status.HTTP_201_CREATED)
async def report_message(
    message_id: int,
    body: MessageReportRequest,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    redis = await get_redis()
    limit_result = await check_rate_limit("report", str(account.id), redis)
    if not limit_result.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="too many reports, try again later",
            headers={"Retry-After": str(limit_result.retry_after)},
        )

    async with pool.acquire() as conn:
        msg = await conn.fetchrow(
            "SELECT user_id FROM messages WHERE id = $1 AND deleted_at IS NULL", message_id
        )
        if msg is None:
            raise HTTPException(status_code=404, detail="message not found")
        if msg["user_id"] == account.id:
            raise HTTPException(status_code=400, detail="cannot report your own message")

        row = await conn.fetchrow(
            """INSERT INTO message_reports (id, message_id, reporter_user_id, reason, details)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (message_id, reporter_user_id) DO NOTHING
               RETURNING id, status""",
            uuid4(), message_id, account.id, body.reason, body.details,
        )
        if row is None:
            # Already reported by this user — return the existing state,
            # never create a duplicate or error on the retry.
            row = await conn.fetchrow(
                "SELECT id, status FROM message_reports WHERE message_id = $1 AND reporter_user_id = $2",
                message_id, account.id,
            )

    logger.info("message.reported", message_id=message_id, reporter_id=str(account.id), reason=body.reason)
    return {"report_id": str(row["id"]), "status": row["status"]}
