from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from httpx import AsyncClient

from tests.conftest import FakePool


def _fmt(d) -> str:
    return d.strftime("%d/%m/%Y")


async def test_partial_rejects_invalid_calendar_date(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    response = await client.patch(
        f"/api/v1/quiz/partial/{uuid4()}",
        json={"answers": {"dob": "31/02/2000"}},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_date"


async def test_partial_rejects_future_date(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    tomorrow = datetime.now(timezone.utc).date() + timedelta(days=1)
    response = await client.patch(
        f"/api/v1/quiz/partial/{uuid4()}",
        json={"answers": {"dob": _fmt(tomorrow)}},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_date"


async def test_complete_rejects_under_18(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    today = datetime.now(timezone.utc).date()
    seventeen_years_ago = today.replace(year=today.year - 17)
    response = await client.patch(
        f"/api/v1/quiz/complete/{uuid4()}",
        json={"answers": {"dob": _fmt(seventeen_years_ago)}},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "must_be_18"


async def test_complete_accepts_18th_birthday_today(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    today = datetime.now(timezone.utc).date()
    exactly_18 = today.replace(year=today.year - 18)

    fake_pool.store.fetchrow_handler = lambda query, args: {"status": "pending"}

    def _execute_handler(query: str, args: tuple[Any, ...]) -> str:
        return "UPDATE 1"

    fake_pool.store.execute_handler = _execute_handler

    response = await client.patch(
        f"/api/v1/quiz/complete/{uuid4()}",
        json={"answers": {"dob": _fmt(exactly_18)}},
    )
    assert response.status_code == 202, response.text


async def test_submit_rejects_under_18(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    today = datetime.now(timezone.utc).date()
    seventeen_years_ago = today.replace(year=today.year - 17)
    response = await client.post(
        "/api/v1/quiz/submit",
        json={"answers": {"dob": _fmt(seventeen_years_ago)}, "is_complete": True},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "must_be_18"


async def test_partial_without_dob_field_is_unaffected(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    def _execute_handler(query: str, args: tuple[Any, ...]) -> str:
        return "UPDATE 1"

    fake_pool.store.execute_handler = _execute_handler

    response = await client.patch(
        f"/api/v1/quiz/partial/{uuid4()}",
        json={"answers": {"some_other_field": "value"}},
    )
    assert response.status_code == 200, response.text
