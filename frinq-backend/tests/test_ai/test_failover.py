from __future__ import annotations

from app.core.ai import failover


async def test_primary_failure_opens_cooldown_and_success_closes_it(monkeypatch):
    failover.reset_for_tests()
    monkeypatch.setattr(failover, "_redis", False)

    assert await failover.is_primary_suppressed("openai:gpt-primary") is False
    await failover.mark_primary_failure("openai:gpt-primary")
    assert await failover.is_primary_suppressed("openai:gpt-primary") is True

    await failover.mark_primary_success("openai:gpt-primary")
    assert await failover.is_primary_suppressed("openai:gpt-primary") is False


async def test_failover_status_never_exposes_keys(monkeypatch):
    failover.reset_for_tests()
    monkeypatch.setattr(failover, "_redis", False)
    await failover.mark_primary_failure("gemini:primary-secret-model")

    status = await failover.get_status("gemini", "primary-secret-model")
    assert status["active_route"] == "fallback"
    assert "primary-secret-model" not in status["key"]
