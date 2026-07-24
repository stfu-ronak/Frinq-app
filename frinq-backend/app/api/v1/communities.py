"""Community membership, message history, block, and preference endpoints.

GET    /community/me           — the caller's own archetype community (server-derived, no arbitrary joining)
GET    /community/messages     — cursor-paginated history, block-aware, excludes deleted
PATCH  /community/preferences  — mute toggle only, never membership/role
POST   /users/{user_id}/block  — idempotent
DELETE /users/{user_id}/block  — idempotent

All routes require a valid access token (CurrentAccount). Membership is
always resolved from the authenticated account — never a client-supplied
user/community id.
"""

from __future__ import annotations

import base64
from datetime import datetime
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import CurrentAccount, get_current_account, get_pool, require_current_legal
from app.schemas.community import CommunityMeResponse, CommunityPreferencesRequest
from app.schemas.message import MessageHistoryResponse, MessageOut, PublicAuthor
from app.utils.logger import logger

router = APIRouter(tags=["community"])


def _encode_cursor(created_at: datetime, message_id: int) -> str:
    raw = f"{created_at.isoformat()}|{message_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[datetime, int]:
    padded = cursor + "=" * (-len(cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded.encode()).decode()
        ts_part, id_part = raw.rsplit("|", 1)
        return datetime.fromisoformat(ts_part), int(id_part)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="invalid cursor") from exc


async def _blocked_counterparts(conn: asyncpg.Connection, user_id: UUID) -> set[UUID]:
    """Every user connected to `user_id` by a block row in either direction."""
    rows = await conn.fetch(
        """SELECT CASE WHEN blocker_user_id = $1 THEN blocked_user_id ELSE blocker_user_id END AS other_id
           FROM user_blocks WHERE blocker_user_id = $1 OR blocked_user_id = $1""",
        user_id,
    )
    return {r["other_id"] for r in rows}


@router.get("/community/me", response_model=CommunityMeResponse)
async def get_my_community(
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> CommunityMeResponse:
    if account.community_slug is None:
        raise HTTPException(status_code=404, detail="no community assigned yet")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT c.archetype_slug, c.name, c.description, cm.muted, cm.joined_at
               FROM community_members cm
               JOIN communities c ON c.archetype_slug = cm.archetype_slug
               WHERE cm.user_id = $1""",
            account.id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="no community assigned yet")
    return CommunityMeResponse(**dict(row))


@router.get("/community/messages", response_model=MessageHistoryResponse)
async def get_messages(
    before: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    account: CurrentAccount = Depends(require_current_legal),
    pool: asyncpg.Pool = Depends(get_pool),
) -> MessageHistoryResponse:
    if account.community_slug is None:
        raise HTTPException(status_code=404, detail="no community assigned yet")

    cursor = _decode_cursor(before) if before else None

    async with pool.acquire() as conn:
        blocked = await _blocked_counterparts(conn, account.id)
        if cursor is not None:
            cursor_created_at, cursor_id = cursor
            rows = await conn.fetch(
                """SELECT m.id, m.client_message_id, m.body, m.created_at,
                          u.id AS author_id, u.display_name AS author_name
                   FROM messages m
                   LEFT JOIN users u ON u.id = m.user_id
                   WHERE m.archetype_slug = $1 AND m.deleted_at IS NULL
                     AND (m.created_at, m.id) < ($2, $3)
                   ORDER BY m.created_at DESC, m.id DESC
                   LIMIT $4""",
                account.community_slug, cursor_created_at, cursor_id, limit,
            )
        else:
            rows = await conn.fetch(
                """SELECT m.id, m.client_message_id, m.body, m.created_at,
                          u.id AS author_id, u.display_name AS author_name
                   FROM messages m
                   LEFT JOIN users u ON u.id = m.user_id
                   WHERE m.archetype_slug = $1 AND m.deleted_at IS NULL
                   ORDER BY m.created_at DESC, m.id DESC
                   LIMIT $2""",
                account.community_slug, limit,
            )

    # Cursor continuity is based on the raw DB page (`rows`), not the
    # block-filtered subset — blocking a user must never corrupt pagination
    # for everyone else reading the same community.
    next_cursor = _encode_cursor(rows[-1]["created_at"], rows[-1]["id"]) if len(rows) == limit else None

    visible = [r for r in rows if r["author_id"] not in blocked]
    visible.reverse()  # DB order is newest-first; render oldest-first

    messages = [
        MessageOut(
            id=r["id"],
            client_message_id=r["client_message_id"],
            body=r["body"],
            created_at=r["created_at"],
            author=PublicAuthor(
                id=r["author_id"],
                display_name=r["author_name"],
                archetype_slug=account.community_slug,
            ),
        )
        for r in visible
        if r["author_id"] is not None
    ]
    return MessageHistoryResponse(messages=messages, next_cursor=next_cursor)


@router.patch("/community/preferences")
async def update_preferences(
    body: CommunityPreferencesRequest,
    account: CurrentAccount = Depends(require_current_legal),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    if account.community_slug is None:
        raise HTTPException(status_code=404, detail="no community assigned yet")
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE community_members SET muted = $3 WHERE archetype_slug = $1 AND user_id = $2",
            account.community_slug, account.id, body.muted,
        )
    return {"muted": body.muted}


@router.post("/users/{user_id}/block", status_code=status.HTTP_201_CREATED)
async def block_user(
    user_id: UUID,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    if user_id == account.id:
        raise HTTPException(status_code=400, detail="cannot block yourself")
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
               VALUES ($1, $2) ON CONFLICT DO NOTHING""",
            account.id, user_id,
        )
    logger.info("user.blocked", blocker_id=str(account.id), blocked_id=str(user_id))
    return {"blocked": True}


@router.delete("/users/{user_id}/block")
async def unblock_user(
    user_id: UUID,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM user_blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2",
            account.id, user_id,
        )
    return {"blocked": False}
