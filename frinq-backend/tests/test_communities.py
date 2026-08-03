from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.core.ai.archetypes import ARCHETYPES
from app.core.communities import (
    CommunityAssignmentError,
    UnknownArchetypeError,
    assign_user_to_community,
    get_user_community,
    sync_communities,
)
from app.migrations import MIGRATIONS_DIR, discover_migrations


def _migration_012_sql() -> str:
    return (MIGRATIONS_DIR / "012_communities_and_chat.sql").read_text(encoding="utf-8")


def test_migration_012_is_discovered_after_011() -> None:
    versions = [version for version, _, _ in discover_migrations()]
    assert 12 in versions
    names = {name for _, name, _ in discover_migrations()}
    assert "012_communities_and_chat.sql" in names


def test_communities_table_exists_before_fk_and_dependents_reference_it() -> None:
    """Same bug class Phase 1's review caught: a forward reference to a
    not-yet-created table/column would fail the whole migration (one
    transaction) against real Postgres. No live Postgres here to execute
    the SQL directly, so assert statement order instead."""
    sql = _migration_012_sql()
    communities_pos = sql.index("CREATE TABLE communities")
    for forward_ref in (
        "FOREIGN KEY (archetype_slug) REFERENCES communities(archetype_slug)",
        "CREATE TABLE community_members",
        "CREATE TABLE messages",
    ):
        assert communities_pos < sql.index(forward_ref)


class _FakeCommunitiesConnection:
    """In-memory communities + community_members — real sequential
    SELECT-then-INSERT-or-conflict behavior, not canned single returns."""

    def __init__(self) -> None:
        self.communities: dict[str, dict[str, Any]] = {}
        self.memberships: dict[UUID, dict[str, Any]] = {}

    async def execute(self, query: str, *args: Any) -> str:
        if query.strip().startswith("INSERT INTO communities"):
            slug, name, description = args
            self.communities[slug] = {"name": name, "description": description}
        return "OK"

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        if query.strip().startswith("SELECT archetype_slug, user_id, muted, joined_at"):
            (user_id,) = args
            membership = self.memberships.get(user_id)
            return dict(membership) if membership is not None else None
        if query.strip().startswith("INSERT INTO community_members"):
            archetype_slug, user_id = args
            row = {
                "archetype_slug": archetype_slug,
                "user_id": user_id,
                "muted": True,
                "joined_at": datetime.now(timezone.utc),
            }
            self.memberships[user_id] = row
            return dict(row)
        return None


async def test_sync_creates_exactly_the_taxonomy_communities() -> None:
    conn = _FakeCommunitiesConnection()
    count = await sync_communities(conn)
    assert count == len(ARCHETYPES) == 18
    assert len(conn.communities) == 18


async def test_assignment_replaces_no_existing_membership() -> None:
    conn = _FakeCommunitiesConnection()
    user_id = uuid4()
    await assign_user_to_community(conn, user_id, "quiet-storm")
    with pytest.raises(CommunityAssignmentError):
        await assign_user_to_community(conn, user_id, "soft-anchor")


async def test_unknown_archetype_is_rejected() -> None:
    conn = _FakeCommunitiesConnection()
    with pytest.raises(UnknownArchetypeError):
        await assign_user_to_community(conn, uuid4(), "made-up-type")


async def test_assignment_is_idempotent_for_same_slug() -> None:
    conn = _FakeCommunitiesConnection()
    user_id = uuid4()
    first = await assign_user_to_community(conn, user_id, "quiet-storm")
    second = await assign_user_to_community(conn, user_id, "quiet-storm")
    assert first == second


async def test_get_user_community_returns_none_when_unassigned() -> None:
    conn = _FakeCommunitiesConnection()
    assert await get_user_community(conn, uuid4()) is None
