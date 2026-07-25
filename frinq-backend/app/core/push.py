"""Push token storage + eligibility. push_tokens (migration 012) is keyed by
token_hash (HMAC, one-way lookup key) with token_ciphertext (Fernet,
reversible) alongside it — a DB read or backup leak never exposes a usable
token, but the delivery worker can still get the plaintext back to call the
provider. installation_id is UNIQUE per row: re-registering the same
installation under a different user (a fresh login on a shared/reused
device) transfers ownership rather than leaving an orphaned row.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

Platform = Literal["ios", "android"]


def _fernet() -> Fernet:
    return Fernet(settings.PUSH_TOKEN_ENCRYPTION_KEY.encode("utf-8"))


def hash_token(token: str) -> str:
    return hmac.new(settings.PUSH_TOKEN_HASH_PEPPER.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def encrypt_token(token: str) -> str:
    return _fernet().encrypt(token.encode("utf-8")).decode("utf-8")


def decrypt_token(ciphertext: str) -> str | None:
    """None (not an exception) on a key mismatch/corrupt row — callers treat
    an undecryptable token the same as one that no longer exists."""
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return None


async def register_token(
    conn: Any, *, user_id: UUID, installation_id: UUID, token: str, platform: Platform, app_version: str,
) -> None:
    """Upsert-by-installation. A token refresh (same installation, new FCM
    token value) or an ownership transfer (same installation, different
    user — a fresh login on a device someone else was using) both replace
    the prior row for that installation; token_hash is the table's primary
    key, so the old row must go first when the hash itself is changing."""
    token_hash = hash_token(token)
    token_ciphertext = encrypt_token(token)
    await conn.execute(
        "DELETE FROM push_tokens WHERE installation_id = $1 AND token_hash != $2",
        installation_id, token_hash,
    )
    await conn.execute(
        """INSERT INTO push_tokens
               (token_hash, token_ciphertext, user_id, platform, installation_id, app_version, enabled)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)
           ON CONFLICT (token_hash) DO UPDATE SET
               user_id = EXCLUDED.user_id,
               token_ciphertext = EXCLUDED.token_ciphertext,
               platform = EXCLUDED.platform,
               installation_id = EXCLUDED.installation_id,
               app_version = EXCLUDED.app_version,
               enabled = TRUE,
               last_seen_at = now(),
               updated_at = now()""",
        token_hash, token_ciphertext, user_id, platform, installation_id, app_version,
    )


async def remove_token(conn: Any, *, user_id: UUID, installation_id: UUID) -> bool:
    """Scoped to the caller's own token — a client can never remove someone
    else's registration by guessing an installation_id."""
    result = await conn.execute(
        "DELETE FROM push_tokens WHERE user_id = $1 AND installation_id = $2",
        user_id, installation_id,
    )
    return result != "DELETE 0"


async def set_enabled(conn: Any, *, user_id: UUID, installation_id: UUID, enabled: bool) -> bool:
    result = await conn.execute(
        "UPDATE push_tokens SET enabled = $3, updated_at = now() WHERE user_id = $1 AND installation_id = $2",
        user_id, installation_id, enabled,
    )
    return result != "UPDATE 0"


async def remove_all_for_user(conn: Any, user_id: UUID) -> None:
    """Ban cleanup — account deletion already cascades via the table's own
    ON DELETE CASCADE FK, so this is only ever called for ban (permanent,
    but not a row deletion elsewhere)."""
    await conn.execute("DELETE FROM push_tokens WHERE user_id = $1", user_id)


async def invalidate_token(conn: Any, token_hash: str) -> None:
    """Called by the delivery worker when the provider reports the token is
    no longer registered/valid — never worth retrying."""
    await conn.execute("DELETE FROM push_tokens WHERE token_hash = $1", token_hash)


@dataclass(frozen=True, slots=True)
class RecipientToken:
    user_id: UUID
    token_hash: str
    token: str
    platform: Platform


async def eligible_recipient_tokens(
    conn: Any, *, community_slug: str, author_id: UUID, exclude_user_ids: set[UUID],
) -> list[RecipientToken]:
    """Every enabled, decryptable token for community members who are: not
    the author, not muted for this community, not banned/deleted (the
    users JOIN + WHERE excludes them), and not already actively connected
    (exclude_user_ids — passed by the caller from ConnectionManager, since
    this module must not import realtime.py)."""
    rows = await conn.fetch(
        """SELECT pt.token_hash, pt.token_ciphertext, pt.platform, cm.user_id
           FROM community_members cm
           JOIN users u ON u.id = cm.user_id AND u.deleted_at IS NULL AND u.banned = FALSE
           JOIN push_tokens pt ON pt.user_id = cm.user_id AND pt.enabled = TRUE
           WHERE cm.archetype_slug = $1 AND cm.muted = FALSE AND cm.user_id != $2""",
        community_slug, author_id,
    )
    out: list[RecipientToken] = []
    for r in rows:
        if r["user_id"] in exclude_user_ids:
            continue
        plaintext = decrypt_token(r["token_ciphertext"])
        if plaintext is None:
            continue
        out.append(RecipientToken(user_id=r["user_id"], token_hash=r["token_hash"], token=plaintext, platform=r["platform"]))
    return out
