from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import admin as admin_routes
from app.api.v1 import auth as auth_routes
from app.api.v1 import otp as otp_routes
from app.api.v1 import profile as profile_routes
from app.api.v1 import questionnaire as questionnaire_routes
from app.api.v1 import quiz as quiz_routes
from app.api.v1 import tracking as tracking_routes
from app.api.v1 import users as users_routes
from app.api.v1 import voice as voice_routes
from app.api.v1 import whatsapp as whatsapp_routes
from app.config import settings
from app.database import close_pool, init_pool
from app.utils.logger import logger
from app.workers.queue import close_queue

API_V1_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.APP_ENV == "production":
        if settings.SECRET_KEY == "dev-secret-change-me":
            raise RuntimeError("SECRET_KEY must be set in production")
        if settings.ADMIN_KEY == "frinq-admin":
            raise RuntimeError("ADMIN_KEY must be set in production")
        if not settings.ADMIN_ACTION_PASSWORD:
            raise RuntimeError("ADMIN_ACTION_PASSWORD must be set in production")
        if not settings.CORS_ORIGINS:
            raise RuntimeError("CORS_ORIGINS must be set in production")
    logger.info("app.startup", env=settings.APP_ENV)
    try:
        await init_pool()
    except Exception as exc:  # noqa: BLE001 — boot should not crash on missing DB in dev
        logger.warning("app.startup.pool_failed", error=str(exc))
    yield
    await close_pool()
    await close_queue()
    logger.info("app.shutdown")


app = FastAPI(
    title="Frinq Backend",
    version="0.1.0",
    lifespan=lifespan,
)


# Request body size limit — voice routes have their own 5MB cap inside
# the handler. For everything else (JSON quiz answers, admin patches),
# cap at 1MB. Anything bigger is almost certainly an attack or accident.
_MAX_REQUEST_BYTES = 1_000_000  # 1MB
_VOICE_UPLOAD_LIMIT = 6_000_000  # 6MB to leave headroom over the voice handler's 5MB cap


@app.middleware("http")
async def _enforce_body_size(request, call_next):
    cl = request.headers.get("content-length")
    if cl and cl.isdigit():
        size = int(cl)
        # Voice upload has a higher limit so we allow it; everywhere else
        # uses the strict cap.
        limit = _VOICE_UPLOAD_LIMIT if "/api/v1/voice" in request.url.path else _MAX_REQUEST_BYTES
        if size > limit:
            from fastapi.responses import JSONResponse
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
app.include_router(otp_routes.router, prefix=API_V1_PREFIX)
app.include_router(users_routes.router, prefix=API_V1_PREFIX)
app.include_router(questionnaire_routes.router, prefix=API_V1_PREFIX)
app.include_router(profile_routes.router, prefix=API_V1_PREFIX)
app.include_router(quiz_routes.router, prefix=API_V1_PREFIX)
app.include_router(tracking_routes.router, prefix=API_V1_PREFIX)
app.include_router(voice_routes.router, prefix=API_V1_PREFIX)
app.include_router(whatsapp_routes.router, prefix=API_V1_PREFIX)
app.include_router(admin_routes.router, prefix=API_V1_PREFIX)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.APP_ENV}
