from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg
from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt

from app.config import settings
from app.database import get_pool as _get_pool
from app.utils.logger import logger


class CurrentUser:
    """Lightweight container for the authenticated user row.

    We avoid importing the Pydantic response schema here to keep deps decoupled
    from the wire layer — routes convert this into `UserResponse` themselves.
    """

    __slots__ = ("id", "supabase_uid", "row")

    def __init__(self, id: UUID, supabase_uid: UUID, row: dict[str, Any]) -> None:
        self.id = id
        self.supabase_uid = supabase_uid
        self.row = row


async def get_pool() -> asyncpg.Pool:
    pool = _get_pool()
    if pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database unavailable",
        )
    return pool


def _decode_supabase_jwt(token: str) -> dict[str, Any]:
    if not settings.SUPABASE_JWT_SECRET:
        # In dev with no JWT secret configured, refuse rather than silently accept.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="auth not configured",
        )
    try:
        return jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
            options={"verify_aud": True},
        )
    except JWTError as exc:
        logger.info("auth.jwt_invalid", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
        ) from exc


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )
    return authorization.split(" ", 1)[1].strip()


async def get_supabase_claims(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Decode the Supabase JWT without requiring a `users` row.

    Used by the register endpoint, which runs *before* the row exists.
    """
    token = _extract_bearer(authorization)
    return _decode_supabase_jwt(token)


async def get_current_user(
    claims: dict[str, Any] = Depends(get_supabase_claims),
    pool: asyncpg.Pool = Depends(get_pool),
) -> CurrentUser:
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token missing sub claim",
        )
    try:
        supabase_uid = UUID(sub)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid sub claim",
        ) from exc

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM users WHERE supabase_uid = $1 AND deleted_at IS NULL",
            supabase_uid,
        )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user not registered",
        )
    data = dict(row)
    return CurrentUser(id=data["id"], supabase_uid=data["supabase_uid"], row=data)
