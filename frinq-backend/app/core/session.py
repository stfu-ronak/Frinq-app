"""Rotating refresh-token sessions for OTP-native accounts.

Refresh token wire format: "<session-uuid>.<url-safe-secret>". Only the
HMAC-SHA256 of the secret (keyed by SESSION_HASH_PEPPER, never SECRET_KEY)
is stored — the plaintext secret exists only in the token itself. Access
tokens are short-lived HS256 JWTs signed with SECRET_KEY.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from jose import JWTError, jwt

from app.config import settings

_JWT_ALG = "HS256"
_ISSUER = "frinq-api"
_AUDIENCE = "frinq-app"
_ACCESS_TOKEN_TTL = timedelta(minutes=15)
_REFRESH_TOKEN_TTL = timedelta(days=30)

Platform = Literal["ios", "android", "web"]


class SessionReuseError(Exception):
    """Raised when a refresh token is invalid, expired, revoked, or reused."""


@dataclass(frozen=True, slots=True)
class TokenPair:
    access_token: str
    refresh_token: str


@dataclass(frozen=True, slots=True)
class AccessClaims:
    sub: UUID
    sid: UUID
    jti: str
    type: str
    iat: int
    exp: int


def _hash_secret(secret: str) -> str:
    return hmac.new(
        settings.SESSION_HASH_PEPPER.encode("utf-8"),
        secret.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _make_access_token(user_id: UUID, session_id: UUID) -> str:
    now = datetime.now(tz=timezone.utc)
    claims = {
        "sub": str(user_id),
        "sid": str(session_id),
        "iss": _ISSUER,
        "aud": _AUDIENCE,
        "jti": secrets.token_hex(16),
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + _ACCESS_TOKEN_TTL).timestamp()),
    }
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=_JWT_ALG)


def decode_access_token(token: str) -> AccessClaims:
    """Validate and decode an access JWT. Raises SessionReuseError-free
    JWTError on any structural problem — callers translate to HTTP errors."""
    claims = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[_JWT_ALG],
        audience=_AUDIENCE,
        issuer=_ISSUER,
        options={"verify_aud": True, "verify_iss": True},
    )
    if claims.get("type") != "access":
        raise JWTError("not an access token")
    return AccessClaims(
        sub=UUID(claims["sub"]),
        sid=UUID(claims["sid"]),
        jti=claims["jti"],
        type=claims["type"],
        iat=claims["iat"],
        exp=claims["exp"],
    )


async def create_session(conn: Any, user_id: UUID, platform: Platform) -> TokenPair:
    session_id = uuid4()
    secret = secrets.token_urlsafe(48)
    expires_at = datetime.now(tz=timezone.utc) + _REFRESH_TOKEN_TTL

    await conn.execute(
        "INSERT INTO user_sessions (id, user_id, refresh_secret_hash, platform, expires_at) "
        "VALUES ($1, $2, $3, $4, $5)",
        session_id, user_id, _hash_secret(secret), platform, expires_at,
    )

    return TokenPair(
        access_token=_make_access_token(user_id, session_id),
        refresh_token=f"{session_id}.{secret}",
    )


async def rotate_session(conn: Any, refresh_token: str) -> TokenPair:
    """Rotate the refresh secret in place (same session id). A mismatched
    or already-revoked/expired secret revokes the session and raises
    SessionReuseError rather than issuing new tokens."""
    try:
        raw_id, secret = refresh_token.split(".", 1)
        session_id = UUID(raw_id)
    except ValueError as exc:
        raise SessionReuseError("malformed refresh token") from exc

    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT * FROM user_sessions WHERE id = $1 FOR UPDATE", session_id
        )
        if row is None:
            raise SessionReuseError("session not found")

        now = datetime.now(tz=timezone.utc)
        expires_at = row["expires_at"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if row["revoked_at"] is not None or expires_at < now:
            raise SessionReuseError("session revoked or expired")

        if not hmac.compare_digest(row["refresh_secret_hash"], _hash_secret(secret)):
            await conn.execute(
                "UPDATE user_sessions SET revoked_at = now() WHERE id = $1", session_id
            )
            raise SessionReuseError("refresh secret mismatch")

        new_secret = secrets.token_urlsafe(48)
        new_expires_at = now + _REFRESH_TOKEN_TTL
        await conn.execute(
            "UPDATE user_sessions SET refresh_secret_hash = $1, expires_at = $2, "
            "last_used_at = now() WHERE id = $3",
            _hash_secret(new_secret), new_expires_at, session_id,
        )

    return TokenPair(
        access_token=_make_access_token(row["user_id"], session_id),
        refresh_token=f"{session_id}.{new_secret}",
    )


async def revoke_session(conn: Any, session_id: UUID) -> None:
    await conn.execute(
        "UPDATE user_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
        session_id,
    )


async def revoke_all_sessions(conn: Any, user_id: UUID) -> None:
    await conn.execute(
        "UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        user_id,
    )
