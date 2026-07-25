from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

import scripts.seed_release_test_data as seed_script
from tests.conftest import FakePool


async def _async_return(value: Any) -> Any:
    return value


def _install_fake_pool(monkeypatch: pytest.MonkeyPatch) -> FakePool:
    pool = FakePool()
    monkeypatch.setattr(seed_script, "init_pool", lambda: _async_return(pool))
    monkeypatch.setattr(seed_script, "close_pool", lambda: _async_return(None))
    return pool


def _seed_handler(created_ids: dict[str, UUID]):
    def handler(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
        if "INSERT INTO users" in query:
            phone = args[0]
            user_id = created_ids.setdefault(phone, uuid4())
            return {"id": user_id, "phone": phone}
        if "community_members" in query and "SELECT" in query.upper():
            return None  # not yet assigned
        if "INSERT INTO community_members" in query:
            return {"archetype_slug": args[1], "user_id": args[0], "muted": False, "joined_at": None}
        return None

    return handler


async def test_refuses_to_seed_against_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(seed_script.settings, "APP_ENV", "production")
    with pytest.raises(RuntimeError, match="production"):
        await seed_script.seed("smoke", 1, "quiet-storm")


async def test_refuses_to_cleanup_against_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(seed_script.settings, "APP_ENV", "production")
    with pytest.raises(RuntimeError, match="production"):
        await seed_script.cleanup([uuid4()])


async def test_same_tag_produces_the_same_phone_numbers() -> None:
    a = [seed_script._phone_for("smoke-2026-07-25", i) for i in range(3)]
    b = [seed_script._phone_for("smoke-2026-07-25", i) for i in range(3)]
    assert a == b
    assert len(set(a)) == 3  # distinct per index
    assert all(p.startswith("7") and len(p) == 10 for p in a)


async def test_different_tags_do_not_collide() -> None:
    a = seed_script._phone_for("tag-a", 0)
    b = seed_script._phone_for("tag-b", 0)
    assert a != b


async def test_seed_creates_tagged_users_and_assigns_community(monkeypatch: pytest.MonkeyPatch) -> None:
    pool = _install_fake_pool(monkeypatch)
    created_ids: dict[str, UUID] = {}
    pool.store.fetchrow_handler = _seed_handler(created_ids)

    result = await seed_script.seed("smoke", 2, "quiet-storm")

    assert len(result) == 2
    assert all(r["tag"] == "smoke" for r in result)
    assert all(r["phone"].startswith("+917") for r in result)
    assert len({r["id"] for r in result}) == 2  # unique rows, not one reused id


async def test_cleanup_deletes_only_the_given_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    pool = _install_fake_pool(monkeypatch)
    seen: list[tuple[str, tuple[Any, ...]]] = []

    def handler(query: str, args: tuple[Any, ...]) -> str:
        seen.append((query, args))
        return "DELETE 2"

    pool.store.execute_handler = handler

    ids = [uuid4(), uuid4()]
    deleted = await seed_script.cleanup(ids)

    assert deleted == 2
    assert len(seen) == 1
    query, args = seen[0]
    assert "DELETE FROM users WHERE id = ANY" in query
    assert args[0] == ids


async def test_cleanup_with_no_ids_never_touches_the_database(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(seed_script, "init_pool", lambda: calls.append("init") or _async_return(None))

    deleted = await seed_script.cleanup([])

    assert deleted == 0
    assert calls == []


async def test_cleanup_by_tag_scopes_the_delete_to_that_tags_display_names(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pool = _install_fake_pool(monkeypatch)
    seen: list[tuple[str, tuple[Any, ...]]] = []

    def handler(query: str, args: tuple[Any, ...]) -> str:
        seen.append((query, args))
        return "DELETE 3"

    pool.store.execute_handler = handler

    deleted = await seed_script.cleanup_by_tag("smoke")

    assert deleted == 3
    query, args = seen[0]
    assert "display_name LIKE" in query
    assert args[0] == "release-test-smoke-%"
