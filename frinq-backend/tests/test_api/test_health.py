"""Task 46 Step 1 — liveness vs readiness, and the protected dependency-status
endpoint never gating readiness.
"""

from __future__ import annotations

import pytest

from app.api.v1 import health
from app.config import settings
from app.main import app as fastapi_app
from tests.conftest import FakePool


async def _ok(*_a, **_kw):
    return None


class _FakeRedis:
    def __init__(self, healthy: bool) -> None:
        self.healthy = healthy

    async def ping(self):
        if not self.healthy:
            raise ConnectionError("redis down")
        return True


async def test_live_never_touches_a_dependency(client) -> None:
    res = await client.get("/health/live")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


async def test_ready_reports_200_when_db_and_redis_are_both_healthy(
    monkeypatch: pytest.MonkeyPatch, client,
) -> None:
    pool = FakePool()
    pool.store.fetchval_handler = lambda query, args: 1
    monkeypatch.setattr(health, "_get_raw_pool", lambda: pool)
    monkeypatch.setattr(health, "get_redis", lambda: _fake_redis(_FakeRedis(True)))

    res = await client.get("/health/ready")
    assert res.status_code == 200
    body = res.json()
    assert body == {"status": "ready", "checks": {"database": "ok", "redis": "ok"}}


async def test_ready_reports_503_when_the_database_query_fails(
    monkeypatch: pytest.MonkeyPatch, client,
) -> None:
    class _BrokenPool:
        def acquire(self):
            raise RuntimeError("boom")

    monkeypatch.setattr(health, "_get_raw_pool", lambda: _BrokenPool())
    monkeypatch.setattr(health, "get_redis", lambda: _fake_redis(_FakeRedis(True)))

    res = await client.get("/health/ready")
    assert res.status_code == 503
    body = res.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["database"] == "error"
    assert body["checks"]["redis"] == "ok"


async def test_ready_reports_503_when_redis_is_unreachable(
    monkeypatch: pytest.MonkeyPatch, client,
) -> None:
    pool = FakePool()
    pool.store.fetchval_handler = lambda query, args: 1
    monkeypatch.setattr(health, "_get_raw_pool", lambda: pool)
    monkeypatch.setattr(health, "get_redis", lambda: _fake_redis(None))

    res = await client.get("/health/ready")
    assert res.status_code == 503
    assert res.json()["checks"]["redis"] == "error"


async def test_ready_reports_not_ready_when_the_pool_was_never_initialised(
    monkeypatch: pytest.MonkeyPatch, client,
) -> None:
    def _raise():
        raise RuntimeError("Database pool not initialised — call init_pool() first")

    monkeypatch.setattr(health, "_get_raw_pool", _raise)
    monkeypatch.setattr(health, "get_redis", lambda: _fake_redis(_FakeRedis(True)))

    res = await client.get("/health/ready")
    assert res.status_code == 503
    assert res.json()["checks"]["database"] == "error"


async def test_dependencies_endpoint_requires_admin_auth(client) -> None:
    res = await client.get("/health/dependencies")
    assert res.status_code == 401


async def test_dependencies_endpoint_reports_configuration_presence_never_secrets(
    monkeypatch: pytest.MonkeyPatch, client,
) -> None:
    monkeypatch.setattr(settings, "INSIGHTS_PROVIDER", "openai")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-real-key")
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "")
    monkeypatch.setattr(settings, "ADMIN_KEY", "test-admin-key")

    res = await client.get("/health/dependencies", headers={"Authorization": "Bearer test-admin-key"})
    assert res.status_code == 200
    body = res.json()
    assert body["ai"]["configured"] is True
    assert body["ai"]["provider"] == "openai"  # reflects the ACTIVE provider, not a fixed key
    assert body["otp_whatsapp"]["configured"] is False
    assert "sk-real-key" not in res.text  # only a boolean, never the actual key


async def test_dependencies_reports_gemini_configuration(monkeypatch: pytest.MonkeyPatch, client) -> None:
    monkeypatch.setattr(settings, "INSIGHTS_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "AIza-real-key")
    monkeypatch.setattr(settings, "ADMIN_KEY", "test-admin-key")

    res = await client.get("/health/dependencies", headers={"Authorization": "Bearer test-admin-key"})
    assert res.status_code == 200
    assert res.json()["ai"] == {"provider": "gemini", "configured": True}
    assert "AIza-real-key" not in res.text


async def test_dependencies_status_never_affects_readiness_or_liveness(
    monkeypatch: pytest.MonkeyPatch, client,
) -> None:
    # Everything unconfigured — /health/dependencies would report all-false —
    # but /health/live and /health/ready must be unaffected by that.
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "")
    monkeypatch.setattr(settings, "FCM_SERVICE_ACCOUNT_JSON", "")

    live_res = await client.get("/health/live")
    assert live_res.status_code == 200

    pool = FakePool()
    pool.store.fetchval_handler = lambda query, args: 1
    monkeypatch.setattr(health, "_get_raw_pool", lambda: pool)
    monkeypatch.setattr(health, "get_redis", lambda: _fake_redis(_FakeRedis(True)))
    ready_res = await client.get("/health/ready")
    assert ready_res.status_code == 200


async def test_observability_reports_dependency_latency_and_runtime_status(
    monkeypatch: pytest.MonkeyPatch, client,
) -> None:
    monkeypatch.setattr(settings, "ADMIN_KEY", "test-admin-key")
    pool = FakePool()
    pool.store.fetchval_handler = lambda query, args: 1
    monkeypatch.setattr(health, "_get_raw_pool", lambda: pool)
    monkeypatch.setattr(health, "get_redis", lambda: _fake_redis(_FakeRedis(True)))

    res = await client.get(
        "/health/observability",
        headers={"Authorization": "Bearer test-admin-key"},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"]["status"] == "ok"
    assert isinstance(body["checks"]["database"]["latency_ms"], (int, float))
    assert body["checks"]["redis"]["status"] == "ok"
    assert isinstance(body["checks"]["redis"]["latency_ms"], (int, float))
    assert body["runtime"]["deployment_version"] == settings.DEPLOYMENT_VERSION
    assert body["runtime"]["checked_at"]


async def test_observability_requires_admin_auth(client) -> None:
    res = await client.get("/health/observability")
    assert res.status_code == 401


async def test_metrics_endpoint_requires_admin_auth(client) -> None:
    res = await client.get("/health/metrics")
    assert res.status_code == 401


async def test_metrics_endpoint_returns_prometheus_text_format(
    monkeypatch: pytest.MonkeyPatch, client,
) -> None:
    monkeypatch.setattr(settings, "ADMIN_KEY", "test-admin-key")

    class _FakeMetricsPool:
        def get_size(self): return 5
        def get_idle_size(self): return 3
        def get_max_size(self): return 10

        def acquire(self):
            return _acquire_ctx()

    monkeypatch.setattr(health, "_get_raw_pool", lambda: _FakeMetricsPool())

    res = await client.get("/health/metrics", headers={"Authorization": "Bearer test-admin-key"})
    assert res.status_code == 200
    assert "http_requests_total" in res.text
    assert "db_pool_connections_in_use" in res.text


def _fake_redis(value):
    async def _inner():
        return value
    return _inner()


def _acquire_ctx():
    class _Ctx:
        async def __aenter__(self):
            class _Conn:
                async def fetchval(self, *_a, **_kw):
                    return 2
            return _Conn()

        async def __aexit__(self, *exc):
            return False

    return _Ctx()
