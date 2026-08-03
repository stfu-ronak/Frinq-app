"""Canonical community sync + immutable membership assignment.

communities is synced from app/core/ai/archetypes.py's ARCHETYPES — the
18-role taxonomy; nothing here re-declares names/descriptions. The 24 old
communities (pre-2026-07-31, keyed on the legacy kebab-case slugs) are no
longer synced here but are never deleted either — assignment is permanent
(see assign_user_to_community below), so they stay inert with their
existing members rather than being force-migrated to a new role.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from app.core.ai.archetypes import ARCHETYPES, get_archetype


class UnknownArchetypeError(Exception):
    """Raised when an archetype_slug isn't a known taxonomy entry (current
    18-role set or the legacy 24-entry set — see get_archetype)."""


class CommunityAssignmentError(Exception):
    """Raised when a user with an existing membership is assigned a
    different community — assignment is one-time and permanent."""


@dataclass(frozen=True, slots=True)
class CommunityRow:
    archetype_slug: str
    user_id: UUID
    muted: bool
    joined_at: datetime


async def sync_communities(conn: Any) -> int:
    """Upsert all 18 canonical communities by slug. Returns the count synced.
    Legacy (pre-taxonomy-swap) community rows are untouched — not upserted,
    not deleted."""
    for slug, archetype in ARCHETYPES.items():
        await conn.execute(
            "INSERT INTO communities (archetype_slug, name, description) "
            "VALUES ($1, $2, $3) "
            "ON CONFLICT (archetype_slug) DO UPDATE "
            "SET name = EXCLUDED.name, description = EXCLUDED.description",
            slug, archetype["display_name"], archetype["meaning"],
        )
    return len(ARCHETYPES)


async def get_user_community(conn: Any, user_id: UUID) -> CommunityRow | None:
    row = await conn.fetchrow(
        "SELECT archetype_slug, user_id, muted, joined_at "
        "FROM community_members WHERE user_id = $1",
        user_id,
    )
    if row is None:
        return None
    return CommunityRow(**dict(row))


async def assign_user_to_community(conn: Any, user_id: UUID, archetype_slug: str) -> CommunityRow:
    """Idempotent for the same slug; raises for a different one. A user
    must never silently move between communities once assigned."""
    if get_archetype(archetype_slug) is None:
        raise UnknownArchetypeError(archetype_slug)

    existing = await get_user_community(conn, user_id)
    if existing is not None:
        if existing.archetype_slug != archetype_slug:
            raise CommunityAssignmentError(
                f"user {user_id} already belongs to {existing.archetype_slug}, "
                f"cannot reassign to {archetype_slug}"
            )
        return existing

    row = await conn.fetchrow(
        "INSERT INTO community_members (archetype_slug, user_id) "
        "VALUES ($1, $2) "
        "RETURNING archetype_slug, user_id, muted, joined_at",
        archetype_slug, user_id,
    )
    return CommunityRow(**dict(row))
