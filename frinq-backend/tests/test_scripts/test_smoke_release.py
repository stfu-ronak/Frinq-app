from __future__ import annotations

import httpx
import pytest

from scripts.smoke_release import check_seed_roundtrip, run_smoke


def _transport(handler):
    return httpx.MockTransport(handler)


async def test_all_checks_pass_against_a_healthy_deployment() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health/live":
            return httpx.Response(200, json={"status": "ok"})
        if request.url.path == "/health/ready":
            return httpx.Response(200, json={"status": "ready", "checks": {"database": "ok", "redis": "ok"}})
        return httpx.Response(404)

    results = await run_smoke("http://test", admin_key=None, do_seed=False, transport=_transport(handler))

    by_name = {name: ok for name, ok, _ in results}
    assert by_name["health/live"] is True
    assert by_name["health/ready"] is True
    assert by_name["health/dependencies"] is True  # skipped (no admin key) counts as pass


async def test_ready_failure_is_reported_not_swallowed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health/live":
            return httpx.Response(200, json={"status": "ok"})
        if request.url.path == "/health/ready":
            return httpx.Response(503, json={"status": "not_ready", "checks": {"database": "error", "redis": "ok"}})
        return httpx.Response(404)

    results = await run_smoke("http://test", admin_key=None, do_seed=False, transport=_transport(handler))

    by_name = {name: ok for name, ok, _ in results}
    assert by_name["health/live"] is True
    assert by_name["health/ready"] is False


async def test_dependencies_check_uses_the_admin_key_when_given() -> None:
    seen_auth = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health/dependencies":
            seen_auth.append(request.headers.get("authorization"))
            return httpx.Response(200, json={"ai": {"configured": True}})
        return httpx.Response(200, json={"status": "ok"})

    await run_smoke("http://test", admin_key="real-admin-key", do_seed=False, transport=_transport(handler))
    assert seen_auth == ["Bearer real-admin-key"]


async def test_seed_roundtrip_reports_failure_when_cleanup_deletes_the_wrong_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import scripts.smoke_release as smoke_module

    async def _fake_seed(tag, count, archetype):
        return [{"id": "u1", "phone": "+917000000000", "tag": tag}]

    async def _fake_cleanup_by_tag(tag):
        return 0  # wrong — should have deleted exactly 1

    monkeypatch.setattr("scripts.seed_release_test_data.seed", _fake_seed)
    monkeypatch.setattr("scripts.seed_release_test_data.cleanup_by_tag", _fake_cleanup_by_tag)

    ok, detail = await check_seed_roundtrip("smoke-test-tag")
    assert ok is False
    assert "expected 1" in detail


async def test_seed_roundtrip_passes_on_a_clean_create_and_delete(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_seed(tag, count, archetype):
        return [{"id": "u1", "phone": "+917000000000", "tag": tag}]

    async def _fake_cleanup_by_tag(tag):
        return 1

    monkeypatch.setattr("scripts.seed_release_test_data.seed", _fake_seed)
    monkeypatch.setattr("scripts.seed_release_test_data.cleanup_by_tag", _fake_cleanup_by_tag)

    ok, detail = await check_seed_roundtrip("smoke-test-tag")
    assert ok is True
