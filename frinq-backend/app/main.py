from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import admin as admin_routes
from app.api.v1 import auth as auth_routes
from app.api.v1 import communities as communities_routes
from app.api.v1 import events as events_routes
from app.api.v1 import health as health_routes
from app.api.v1 import legal as legal_routes
from app.api.v1 import moderation as moderation_routes
from app.api.v1 import otp as otp_routes
from app.api.v1 import profile as profile_routes
from app.api.v1 import push as push_routes
from app.api.v1 import questionnaire as questionnaire_routes
from app.api.v1 import quiz as quiz_routes
from app.api.v1 import realtime as realtime_routes
from app.api.v1 import sessions as sessions_routes
from app.api.v1 import tracking as tracking_routes
from app.api.v1 import users as users_routes
from app.api.v1 import voice as voice_routes
from app.api.v1 import whatsapp as whatsapp_routes
from app.config import settings
from app.core import metrics
from app.core.production_guard import validate_production_settings
from app.core.redis_client import close_redis
from app.core.security_headers import SecurityHeadersMiddleware
from app.database import close_pool, init_pool
from app.utils.logger import logger
from app.workers.queue import close_queue

API_V1_PREFIX = "/api/v1"


def _docs_urls(app_env: str) -> tuple[str | None, str | None, str | None]:
    """Interactive docs leak the full route/schema surface and aren't behind
    any auth of their own — real in dev/staging, never in production. A pure
    function (not inlined into the FastAPI() call below) so tests can check
    the decision itself without needing to reconstruct the whole app with a
    different APP_ENV — the real `app` singleton is already built with
    whatever env this process actually booted with by the time any test
    runs."""
    if app_env == "production":
        return None, None, None
    return "/docs", "/redoc", "/openapi.json"


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.APP_ENV == "production":
        errors = validate_production_settings(settings)
        if errors:
            raise RuntimeError("; ".join(errors))
    logger.info("app.startup", env=settings.APP_ENV)
    try:
        await init_pool()
    except Exception as exc:  # noqa: BLE001 — boot should not crash on missing DB in dev
        logger.warning("app.startup.pool_failed", error=str(exc))
    yield
    await close_pool()
    await close_queue()
    await realtime_routes.shutdown_realtime()
    await close_redis()
    logger.info("app.shutdown")


_docs_url, _redoc_url, _openapi_url = _docs_urls(settings.APP_ENV)

app = FastAPI(
    title="Frinq Backend",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
)

app.add_middleware(SecurityHeadersMiddleware)


# Request body size limit — voice routes have their own 10MB cap inside
# the handler (app/api/v1/voice.py's _MAX_AUDIO_BYTES). For everything else
# (JSON quiz answers, admin patches), cap at 1MB. Anything bigger is almost
# certainly an attack or accident.
_MAX_REQUEST_BYTES = 1_000_000  # 1MB
_VOICE_UPLOAD_LIMIT = 11_000_000  # 11MB: 10MB audio cap + multipart encoding headroom


@app.middleware("http")
async def _observe_request(request, call_next):
    """Task 46 Step 2/3: one structured, redacted log line per request plus
    the matching HTTP metrics — request ID, route TEMPLATE (never the raw
    path with its interpolated IDs, which would blow up metric cardinality),
    status, and latency. The request ID is also echoed back as a response
    header so client-side error reports can be correlated to this exact
    server-side log line."""
    request_id = uuid.uuid4().hex[:16]
    start = time.monotonic()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    try:
        response = await call_next(request)
    finally:
        structlog.contextvars.unbind_contextvars("request_id")
    latency_ms = (time.monotonic() - start) * 1000

    route = request.scope.get("route")
    route_template = route.path if route is not None else "unmatched"

    response.headers["X-Request-Id"] = request_id
    metrics.http_requests_total.labels(method=request.method, route=route_template, status=str(response.status_code)).inc()
    metrics.http_request_duration_seconds.labels(route=route_template).observe(latency_ms / 1000)
    logger.info(
        "http.request",
        method=request.method,
        route=route_template,
        status=response.status_code,
        latency_ms=round(latency_ms, 2),
        request_id=request_id,
    )
    return response


@app.middleware("http")
async def _enforce_body_size(request, call_next):
    cl = request.headers.get("content-length")
    if cl and cl.isdigit():
        size = int(cl)
        # Voice upload has a higher limit so we allow it; everywhere else
        # uses the strict cap.
        limit = _VOICE_UPLOAD_LIMIT if "/api/v1/voice" in request.url.path else _MAX_REQUEST_BYTES
        if size > limit:
            return JSONResponse(status_code=413, content={"detail": "request body too large"})
    return await call_next(request)


# CORS — allow frontend origins
_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    # Explicit headers list so client can send Authorization / X-Action-Password
    # (the previous "*" worked but is rejected by some browsers in
    # credentialed mode).
    allow_headers=["Content-Type", "Authorization", "X-Action-Password"],
)

app.include_router(auth_routes.router, prefix=API_V1_PREFIX)
app.include_router(communities_routes.router, prefix=API_V1_PREFIX)
app.include_router(events_routes.router, prefix=API_V1_PREFIX)
app.include_router(legal_routes.router, prefix=API_V1_PREFIX)
app.include_router(moderation_routes.router, prefix=API_V1_PREFIX)
app.include_router(otp_routes.router, prefix=API_V1_PREFIX)
app.include_router(users_routes.router, prefix=API_V1_PREFIX)
app.include_router(questionnaire_routes.router, prefix=API_V1_PREFIX)
app.include_router(profile_routes.router, prefix=API_V1_PREFIX)
app.include_router(push_routes.router, prefix=API_V1_PREFIX)
app.include_router(quiz_routes.router, prefix=API_V1_PREFIX)
app.include_router(realtime_routes.router, prefix=API_V1_PREFIX)
app.include_router(sessions_routes.router, prefix=API_V1_PREFIX)
app.include_router(tracking_routes.router, prefix=API_V1_PREFIX)
app.include_router(voice_routes.router, prefix=API_V1_PREFIX)
app.include_router(whatsapp_routes.router, prefix=API_V1_PREFIX)
app.include_router(admin_routes.router, prefix=API_V1_PREFIX)
app.include_router(health_routes.router)
