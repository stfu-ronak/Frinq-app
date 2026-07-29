from datetime import datetime, timezone
from typing import Any

import pytest

from app.core.ai.model_config import (
    InvalidModelConfigError,
    get_active_model_config,
    get_all_model_configs,
    set_model_config,
)


class _FakeModelConfigConnection:
    """In-memory ai_model_config table, one row per step."""

    def __init__(self, rows: dict[str, dict[str, Any]]) -> None:
        self.rows = rows

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        q = query.strip()
        if q.startswith("SELECT step, provider, model_id, effort, updated_at, updated_by\n        FROM ai_model_config") or \
           q.startswith("SELECT step, provider, model_id, effort, updated_at, updated_by "):
            (step,) = args
            row = self.rows.get(step)
            return dict(row) if row is not None else None
        if q.startswith("UPDATE ai_model_config"):
            step, provider, model_id, effort, updated_by = args
            if step not in self.rows:
                return None
            row = {
                "step": step, "provider": provider, "model_id": model_id,
                "effort": effort, "updated_at": datetime.now(timezone.utc),
                "updated_by": updated_by,
            }
            self.rows[step] = row
            return dict(row)
        return None

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        return [dict(r) for r in sorted(self.rows.values(), key=lambda r: r["step"])]


def _seeded_conn() -> _FakeModelConfigConnection:
    return _FakeModelConfigConnection({
        "insights": {
            "step": "insights", "provider": "openai", "model_id": "gpt-5.5",
            "effort": "medium", "updated_at": datetime.now(timezone.utc), "updated_by": "seed",
        },
        "deep_report": {
            "step": "deep_report", "provider": "openai", "model_id": "gpt-5.5",
            "effort": "medium", "updated_at": datetime.now(timezone.utc), "updated_by": "seed",
        },
    })


async def test_get_active_model_config_returns_seeded_row():
    conn = _seeded_conn()
    config = await get_active_model_config(conn, "insights")
    assert config["provider"] == "openai"
    assert config["model_id"] == "gpt-5.5"


async def test_get_active_model_config_raises_when_missing():
    conn = _FakeModelConfigConnection({})
    with pytest.raises(InvalidModelConfigError):
        await get_active_model_config(conn, "insights")


async def test_get_all_model_configs_returns_both_steps():
    conn = _seeded_conn()
    configs = await get_all_model_configs(conn)
    assert {c["step"] for c in configs} == {"insights", "deep_report"}


async def test_set_model_config_rejects_unknown_model_id():
    conn = _seeded_conn()
    with pytest.raises(InvalidModelConfigError):
        await set_model_config(conn, "insights", "claude", "claude-nonexistent", "medium", "admin")


async def test_set_model_config_rejects_unsupported_effort_for_model():
    conn = _seeded_conn()
    with pytest.raises(InvalidModelConfigError):
        await set_model_config(conn, "insights", "claude", "claude-haiku-4-5-20251001", "high", "admin")


async def test_set_model_config_rejects_provider_model_mismatch():
    # A client claiming provider="claude" while naming an actual OpenAI
    # model_id (or vice versa) must be rejected at write time — never
    # persisted and left to fail later at the real provider API boundary.
    conn = _seeded_conn()
    with pytest.raises(InvalidModelConfigError):
        await set_model_config(conn, "insights", "claude", "gpt-5.5", None, "admin")
    with pytest.raises(InvalidModelConfigError):
        await set_model_config(conn, "insights", "openai", "claude-sonnet-5", "high", "admin")


async def test_set_model_config_canonicalizes_alias_before_persisting():
    conn = _seeded_conn()
    updated = await set_model_config(conn, "insights", "claude", "claude-haiku-4-5", None, "admin")
    assert updated["model_id"] == "claude-haiku-4-5-20251001"
    reread = await get_active_model_config(conn, "insights")
    assert reread["model_id"] == "claude-haiku-4-5-20251001"


async def test_set_model_config_accepts_haiku_with_no_effort():
    conn = _seeded_conn()
    updated = await set_model_config(conn, "insights", "claude", "claude-haiku-4-5-20251001", None, "admin")
    assert updated["model_id"] == "claude-haiku-4-5-20251001"
    assert updated["effort"] is None


async def test_set_model_config_accepts_valid_claude_switch():
    conn = _seeded_conn()
    updated = await set_model_config(conn, "deep_report", "claude", "claude-sonnet-5", "high", "admin")
    assert updated["provider"] == "claude"
    assert updated["model_id"] == "claude-sonnet-5"
    assert updated["effort"] == "high"
    # Persisted — a subsequent read sees the new value.
    reread = await get_active_model_config(conn, "deep_report")
    assert reread["model_id"] == "claude-sonnet-5"


async def test_set_model_config_accepts_gemini_switch():
    conn = _seeded_conn()
    updated = await set_model_config(
        conn, "deep_report", "gemini", "gemini-3.5-flash-lite", "minimal", "admin"
    )
    assert updated["provider"] == "gemini"
    assert updated["model_id"] == "gemini-3.5-flash-lite"


async def test_set_model_config_does_not_affect_other_step():
    conn = _seeded_conn()
    await set_model_config(conn, "insights", "claude", "claude-sonnet-5", "high", "admin")
    deep_report = await get_active_model_config(conn, "deep_report")
    assert deep_report["provider"] == "openai"
    assert deep_report["model_id"] == "gpt-5.5"
