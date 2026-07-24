from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import FakePool

pytestmark = pytest.mark.asyncio


async def test_allowed_event_is_recorded(client: AsyncClient, fake_pool: FakePool) -> None:
    res = await client.post(
        "/api/v1/track",
        json={"session_id": "s1", "page": "/community", "action": "community_opened"},
    )
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    assert len(fake_pool.store.queries) == 1
    query, args = fake_pool.store.queries[0]
    assert "INSERT INTO tracking_events" in query
    assert "s1" in args
    assert "community_opened" in args


async def test_disallowed_event_is_rejected_not_inserted(client: AsyncClient, fake_pool: FakePool) -> None:
    res = await client.post(
        "/api/v1/track",
        json={"session_id": "s1", "page": "/city", "action": "select_option", "data": {"choice": "Delhi"}},
    )
    assert res.status_code == 200
    assert res.json() == {"ok": False}
    assert len(fake_pool.store.queries) == 0


async def test_identity_field_is_no_longer_accepted(client: AsyncClient, fake_pool: FakePool) -> None:
    """A client that still sends the old `identity` shape is simply ignored —
    extra fields aren't rejected (no `extra=forbid` here, tracking must never
    break the client), but nothing PII-shaped ever reaches the INSERT args."""
    res = await client.post(
        "/api/v1/track",
        json={
            "session_id": "s1",
            "page": "/name",
            "action": "quiz_started",
            "identity": {"phone": "+911234567890", "name": "Jane"},
        },
    )
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    _, args = fake_pool.store.queries[0]
    assert "+911234567890" not in args
    assert "Jane" not in args
