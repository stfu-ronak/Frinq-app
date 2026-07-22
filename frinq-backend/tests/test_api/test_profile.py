from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.conftest import FakePool


pytestmark = pytest.mark.asyncio


def _profile_row(user_id: Any) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "id": uuid4(),
        "user_id": user_id,
        "primary_goals": ["new_friendships"],
        "secondary_goals": [],
        "openness": 0.7,
        "conscientiousness": 0.55,
        "extraversion": 0.55,
        "agreeableness": 0.6,
        "neuroticism": 0.4,
        "honesty_humility": 0.65,
        "connection_anxiety": 0.3,
        "connection_avoidance": 0.25,
        "reliability": 0.8,
        "bonding_style": "secure",
        "val_self_direction": 0.6, "val_stimulation": 0.7,
        "val_achievement": 0.5, "val_security": 0.4,
        "val_tradition": 0.3, "val_universalism": 0.6,
        "openness_to_change": 0.65, "conservation": 0.35,
        "loved_activities": [{"id": "chess", "intensity": 4, "want_with_others": True}],
        "open_to_try": ["pottery"],
        "anti_preferences": [],
        "activity_archetype": "B",
        "riasec_R": 0.2, "riasec_I": 0.6, "riasec_A": 0.5,
        "riasec_S": 0.4, "riasec_E": 0.3, "riasec_C": 0.4,
        "affiliative_humor": 0.7, "self_enhancing_humor": 0.5,
        "aggressive_humor": 0.2, "directness": 0.6, "depth_preference": 0.7,
        "chronotype": "evening", "group_pref": "small",
        "drinks": "socially", "smokes": "never",
        "drinks_tolerance": "any", "smokes_tolerance": "prefer_non",
        "diet": "non_veg", "languages": ["english", "hinglish"],
        "ai_summary": "thoughtful ambivert who plays chess",
        "latent_tags": ["chess_curious", "intentional"],
        "vibe_check_raw": None,
        "social_type": "ambivert",
        "saturday_archetype": "dinner",
        "substance_scene": "social",
        "connection_signals": ["parallel", "weird"],
        "red_flags": ["always late"],
        "red_flag_normalised": ["chronic_lateness"],
        "show_up_style": "i make plans before they ask",
        "looking_for_text": "low ego curious people",
        "hobbies_text": "fermenting things in jars",
        "storytime_transcript": "we met at a bookstore queue",
        "rapid_fire": {"RAPID1": "A"},
        "slider_depth": 0.8,
        "slider_fun_get": 0.7,
        "slider_frequency": 0.6,
        "extraction_confidence": {"vibe": "high"},
        "meetups_attended": 0,
        "meetups_no_show": 0,
        "created_at": now,
        "updated_at": now,
    }


async def test_get_me_returns_profile(
    client: AsyncClient,
    fake_pool: FakePool,
    user_row: dict[str, Any],
) -> None:
    fake_pool.store.next_rows = [_profile_row(user_row["id"])]
    resp = await client.get("/api/v1/profile/me")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["user_id"] == str(user_row["id"])
    assert body["ai_summary"].startswith("thoughtful")
    assert body["social_type"] == "ambivert"
    assert "embedding" not in body


async def test_get_me_404_when_not_built(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    fake_pool.store.next_rows = [None]
    resp = await client.get("/api/v1/profile/me")
    assert resp.status_code == 404


async def test_get_summary(
    client: AsyncClient,
    fake_pool: FakePool,
    user_row: dict[str, Any],
) -> None:
    fake_pool.store.next_rows = [
        {
            "ai_summary": "thoughtful ambivert",
            "latent_tags": ["chess_curious"],
            "updated_at": datetime.now(timezone.utc),
        }
    ]
    resp = await client.get("/api/v1/profile/me/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["user_id"] == str(user_row["id"])
    assert body["latent_tags"] == ["chess_curious"]


async def test_rebuild_requires_questionnaire(
    client: AsyncClient, fake_pool: FakePool
) -> None:
    fake_pool.store.next_rows = [None]  # no questionnaire row
    resp = await client.post("/api/v1/profile/rebuild")
    assert resp.status_code == 409


async def test_rebuild_queues_job(
    client: AsyncClient,
    fake_pool: FakePool,
    user_row: dict[str, Any],
) -> None:
    fake_pool.store.next_rows = [{"exists": 1}]
    resp = await client.post("/api/v1/profile/rebuild")
    assert resp.status_code == 200
    body = resp.json()
    assert body["job_id"]
    assert body["user_id"] == str(user_row["id"])
