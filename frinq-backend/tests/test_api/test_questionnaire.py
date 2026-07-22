from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.conftest import FakePool


pytestmark = pytest.mark.asyncio


def _valid_v2_answers() -> dict[str, Any]:
    return {
        "Q01": "Alice",
        "Q02": "gurgaon",
        "Q03": 27,
        "Q07": "ambivert",
        "Q10": "social",
        "Q08": "dinner",
        "Q_HOBBIES": "fermenting things in jars",
        "Q39": ["chess", "running", "vinyl"],
        "Q22": "annoyed",
        "Q40": {
            "transcript": "i met her at a bookstore queue and we never stopped",
            "language": "en",
            "duration_seconds": 18.4,
        },
        "Q_SIGNALS": ["parallel", "weird"],
        "Q_REDFLG": ["always late", "phone always out", "never asks back"],
        "Q35_OPEN": "i make plans before they ask",
        "RAPID1": "A", "RAPID2": "B", "RAPID3": "A", "RAPID4": "B",
        "RAPID5": "A", "RAPID6": "A", "RAPID7": "B", "RAPID8": "A",
        "RAPID9": "B", "RAPID10": "B", "RAPID11": "B", "RAPID12": "A",
        "Q_SLIDER_1": 20,
        "Q_SLIDER_2": 70,
        "Q_SLIDER_3": 60,
        "Q06_OPEN": "low ego, curious, plays at least one instrument poorly",
    }


async def test_submit_inserts_and_queues(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    fake_pool.store.next_rows = [
        {"id": uuid4(), "submitted_at": datetime.now(timezone.utc)}
    ]
    resp = await client.post(
        "/api/v1/questionnaire/submit",
        json={"version": "2.0", "answers": _valid_v2_answers()},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["job_id"]  # placeholder job id from override
    assert "response_id" in body

    last_query, _ = fake_pool.store.queries[-1]
    assert "INSERT INTO questionnaire_responses" in last_query
    assert "ON CONFLICT" in last_query


async def test_submit_rejects_invalid_rapid_choice(client: AsyncClient) -> None:
    bad = _valid_v2_answers()
    bad["RAPID1"] = "C"
    resp = await client.post(
        "/api/v1/questionnaire/submit",
        json={"version": "2.0", "answers": bad},
    )
    assert resp.status_code == 422


async def test_submit_caps_three_interests(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    answers = _valid_v2_answers()
    answers["Q39"] = ["a", "b", "c", "d", "e"]
    fake_pool.store.next_rows = [
        {"id": uuid4(), "submitted_at": datetime.now(timezone.utc)}
    ]
    resp = await client.post(
        "/api/v1/questionnaire/submit",
        json={"version": "2.0", "answers": answers},
    )
    assert resp.status_code == 200


async def test_status_reports_submitted_and_profile_ready(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    submitted = datetime.now(timezone.utc)
    fake_pool.store.next_rows = [
        {"submitted_at": submitted},
        {"ai_summary": "a thoughtful introvert who collects bookstores"},
    ]
    resp = await client.get("/api/v1/questionnaire/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_submitted"] is True
    assert body["profile_ready"] is True


async def test_status_when_nothing_submitted(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    fake_pool.store.next_rows = [None, None]
    resp = await client.get("/api/v1/questionnaire/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_submitted"] is False
    assert body["profile_ready"] is False
