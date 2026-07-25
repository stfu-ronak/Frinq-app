from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

from app.core.push import (
    decrypt_token,
    encrypt_token,
    eligible_recipient_tokens,
    hash_token,
    invalidate_token,
    register_token,
    remove_all_for_user,
    remove_token,
    set_enabled,
)
from tests.conftest import FakePool


def test_encrypt_decrypt_roundtrip() -> None:
    ciphertext = encrypt_token("real-fcm-token-value")
    assert ciphertext != "real-fcm-token-value"
    assert decrypt_token(ciphertext) == "real-fcm-token-value"


def test_decrypt_garbage_returns_none_not_an_exception() -> None:
    assert decrypt_token("not-a-real-fernet-token") is None


def test_hash_token_is_deterministic_and_never_reveals_the_token() -> None:
    h1 = hash_token("abc")
    h2 = hash_token("abc")
    assert h1 == h2
    assert "abc" not in h1


async def test_register_token_deletes_the_prior_row_for_the_installation_first(fake_pool: FakePool) -> None:
    user_id = uuid4()
    installation_id = uuid4()
    async with fake_pool.acquire() as conn:
        await register_token(
            conn, user_id=user_id, installation_id=installation_id,
            token="tok", platform="android", app_version="1.0.0",
        )
    queries = [q for q, _ in fake_pool.store.queries]
    assert any("DELETE FROM push_tokens" in q and "installation_id = $1 AND token_hash != $2" in q for q in queries)
    assert any("INSERT INTO push_tokens" in q and "ON CONFLICT (token_hash) DO UPDATE" in q for q in queries)


async def test_remove_token_scoped_to_caller_returns_false_when_nothing_matched(fake_pool: FakePool) -> None:
    fake_pool.store.execute_handler = lambda q, a: "DELETE 0"
    async with fake_pool.acquire() as conn:
        removed = await remove_token(conn, user_id=uuid4(), installation_id=uuid4())
    assert removed is False


async def test_remove_token_returns_true_when_a_row_was_deleted(fake_pool: FakePool) -> None:
    fake_pool.store.execute_handler = lambda q, a: "DELETE 1"
    async with fake_pool.acquire() as conn:
        removed = await remove_token(conn, user_id=uuid4(), installation_id=uuid4())
    assert removed is True


async def test_set_enabled_returns_false_when_token_not_found(fake_pool: FakePool) -> None:
    fake_pool.store.execute_handler = lambda q, a: "UPDATE 0"
    async with fake_pool.acquire() as conn:
        updated = await set_enabled(conn, user_id=uuid4(), installation_id=uuid4(), enabled=False)
    assert updated is False


async def test_remove_all_for_user_deletes_by_user_id(fake_pool: FakePool) -> None:
    user_id = uuid4()
    async with fake_pool.acquire() as conn:
        await remove_all_for_user(conn, user_id)
    query, args = fake_pool.store.queries[-1]
    assert "DELETE FROM push_tokens WHERE user_id" in query
    assert args == (user_id,)


async def test_invalidate_token_deletes_by_hash(fake_pool: FakePool) -> None:
    async with fake_pool.acquire() as conn:
        await invalidate_token(conn, "some-hash")
    query, args = fake_pool.store.queries[-1]
    assert "DELETE FROM push_tokens WHERE token_hash" in query
    assert args == ("some-hash",)


async def test_eligible_recipient_tokens_decrypts_and_excludes_active_connections(fake_pool: FakePool) -> None:
    author_id = uuid4()
    active_user = uuid4()
    excluded_by_activity = str(active_user)
    real_ciphertext = encrypt_token("real-token-1")

    def _fetch(query: str, args: tuple[Any, ...]) -> list[dict[str, Any]]:
        return [
            {"token_hash": "hash-1", "token_ciphertext": real_ciphertext, "platform": "android", "user_id": uuid4()},
            {"token_hash": "hash-2", "token_ciphertext": real_ciphertext, "platform": "ios", "user_id": active_user},
            {"token_hash": "hash-3", "token_ciphertext": "garbage-undecryptable", "platform": "android", "user_id": uuid4()},
        ]

    fake_pool.store.fetch_handler = _fetch
    async with fake_pool.acquire() as conn:
        recipients = await eligible_recipient_tokens(
            conn, community_slug="quiet-storm", author_id=author_id, exclude_user_ids={active_user},
        )
    # Active-connection user excluded, undecryptable-token row excluded — only the first row survives.
    assert len(recipients) == 1
    assert recipients[0].token == "real-token-1"
    assert str(recipients[0].user_id) != excluded_by_activity


async def test_eligible_recipient_tokens_query_excludes_author_and_muted_and_banned(fake_pool: FakePool) -> None:
    captured: dict[str, Any] = {}

    def _fetch(query: str, args: tuple[Any, ...]) -> list[dict[str, Any]]:
        captured["query"] = query
        captured["args"] = args
        return []

    fake_pool.store.fetch_handler = _fetch
    async with fake_pool.acquire() as conn:
        await eligible_recipient_tokens(conn, community_slug="quiet-storm", author_id=uuid4(), exclude_user_ids=set())
    assert "cm.muted = FALSE" in captured["query"]
    assert "cm.user_id != $2" in captured["query"]
    assert "u.banned = FALSE" in captured["query"]
    assert "u.deleted_at IS NULL" in captured["query"]
    assert "pt.enabled = TRUE" in captured["query"]
