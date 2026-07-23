from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt

from app.config import settings
from app.core.communities import get_user_community
from app.core.session import decode_access_token
from app.database import get_pool as _get_pool
from app.utils.logger import logger


class CurrentAccount:
    """Auth principal for the OTP-native session system (app/core/session.py).

    Distinct from CurrentUser (legacy Supabase-JWT auth, kept only for
    endpoints not yet migrated) — every new endpoint depends on this instead.
    """

    __slots__ = (
        "id", "phone", "row", "session_id", "onboarding_state", "community_slug",
        "banned", "suspended_until",
    )

    def __init__(
        self,
        id: UUID,
        phone: str | None,
        row: dict[str, Any],
        session_id: UUID,
        onboarding_state: str,
        community_slug: str | None,
        banned: bool,
        suspended_until: datetime | None = None,
    ) -> None:
        self.id = id
        self.phone = phone
        self.row = row
        self.session_id = session_id
        self.onboarding_state = onboarding_state
        self.community_slug = community_slug
        self.banned = banned
        self.suspended_until = suspended_until


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


async def get_current_account(
    authorization: str | None = Header(default=None),
    pool: asyncpg.Pool = Depends(get_pool),
) -> CurrentAccount:
    """Auth dependency for the rotating-session system. Rejects missing,
    expired, or wrong-type access tokens, revoked/expired sessions, deleted
    users (401), and banned users (403 — a real, addressable account state,
    not an invalid-credential response)."""
    token = _extract_bearer(authorization)
    try:
        claims = decode_access_token(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid access token",
        ) from exc

    async with pool.acquire() as conn:
        session_row = await conn.fetchrow(
            "SELECT * FROM user_sessions WHERE id = $1", claims.sid
        )
        if session_row is None or session_row["revoked_at"] is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="session revoked",
            )
        expires_at = session_row["expires_at"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(tz=timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="session expired",
            )
        if session_row["user_id"] != claims.sub:
            # Defense in depth: sid and sub are minted together and the JWT
            # is signature-verified, so this shouldn't diverge — but never
            # trust a session row for a user other than the one the token claims.
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="session does not match token",
            )

        user_row = await conn.fetchrow(
            "SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL", claims.sub
        )
        if user_row is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="account not found",
            )

        data = dict(user_row)
        if data["banned"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "account_banned"},
            )

        suspended_until = data.get("suspended_until")
        if suspended_until is not None:
            if suspended_until.tzinfo is None:
                suspended_until = suspended_until.replace(tzinfo=timezone.utc)
            if suspended_until > datetime.now(tz=timezone.utc):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"code": "account_suspended", "suspended_until": suspended_until.isoformat()},
                )

        membership = await get_user_community(conn, data["id"])

    return CurrentAccount(
        id=data["id"],
        phone=data.get("phone"),
        row=data,
        session_id=claims.sid,
        onboarding_state=data["onboarding_state"],
        community_slug=membership.archetype_slug if membership is not None else None,
        banned=data["banned"],
        suspended_until=data.get("suspended_until"),
    )
