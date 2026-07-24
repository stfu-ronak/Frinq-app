"""Single-purpose, short-lived reauth tokens — used to gate account deletion
behind a fresh OTP re-verification.

Hybrid of the two existing token precedents in this codebase: a signed JWT
(like app/core/session.py's access tokens — SECRET_KEY, offline-verifiable
claims) whose jti is then consumed exactly once via Redis (same atomic
"mark used, reject a replay" idiom as app/core/realtime.py's WS tickets,
just SET NX instead of GETDEL since there's no payload to retrieve — the
JWT itself already carries everything needed). Neither existing precedent
alone covers "signed AND single-use": sessions never track jti in Redis,
and WS tickets aren't JWTs at all.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from jose import JWTError, jwt

from app.config import settings

_ALG = "HS256"
_ISSUER = "frinq-api"
_AUDIENCE = "frinq-reauth"

ACCOUNT_DELETE_ACTION = "account_delete"


class ReauthTokenError(Exception):
    """Invalid, expired, wrong-action, wrong-account, or already-used token."""


def create_reauth_token(*, user_id: UUID, session_id: UUID, action: str) -> str:
    now = datetime.now(tz=timezone.utc)
    claims = {
        "sub": str(user_id),
        "sid": str(session_id),
        "action": action,
        "jti": secrets.token_hex(16),
        "iss": _ISSUER,
        "aud": _AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.REAUTH_TOKEN_TTL_SECONDS)).timestamp()),
    }
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=_ALG)


def _decode(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[_ALG], audience=_AUDIENCE, issuer=_ISSUER)
    except JWTError as exc:
        raise ReauthTokenError("invalid or expired token") from exc


async def consume_reauth_token(
    redis: Any, token: str, *, user_id: UUID, session_id: UUID, action: str
) -> None:
    """Verifies signature/expiry/claims match, then atomically consumes the
    token's jti — a replay of the same token always raises. Never raises
    for a login access token or a token minted for a different action:
    those simply fail the `action`/audience checks the same as any other
    invalid token, no special-casing needed."""
    claims = _decode(token)
    if claims.get("action") != action:
        raise ReauthTokenError("wrong action")
    if claims.get("sub") != str(user_id):
        raise ReauthTokenError("wrong account")
    if claims.get("sid") != str(session_id):
        raise ReauthTokenError("wrong session")
    jti = claims.get("jti")
    if not jti:
        raise ReauthTokenError("malformed token")

    key = f"reauth_used:{jti}"
    # SET NX — the first caller to successfully set this key "wins" the
    # single use; a replay finds the key already present and is rejected.
    # TTL matches the token's own lifetime — no need to remember it any
    # longer than the token itself could possibly still be valid.
    was_new = await redis.set(key, "1", ex=settings.REAUTH_TOKEN_TTL_SECONDS, nx=True)
    if not was_new:
        raise ReauthTokenError("token already used")
