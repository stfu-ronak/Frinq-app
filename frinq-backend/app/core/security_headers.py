"""Security response headers for every API response. This is a pure JSON/WS
API (no server-rendered HTML of its own outside the optional /docs Swagger
UI, which is disabled entirely in production — see app/main.py) — the CSP is
therefore the strictest possible (`default-src 'none'`) everywhere except
the docs routes, which need their own CDN-script-friendly policy to render
at all and only exist in non-production environments.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.config import settings
from app.utils.logger import logger

_DOCS_PATHS = {"/docs", "/redoc", "/openapi.json"}

# Swagger UI/ReDoc load their own JS/CSS from a CDN and use inline styles —
# a permissive-but-still-real policy, scoped to the docs paths only, present
# only in non-production environments where those routes even exist.
_DOCS_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' cdn.jsdelivr.net fonts.googleapis.com; "
    "img-src 'self' data: fastapi.tiangolo.com; "
    "font-src fonts.gstatic.com; "
    "frame-ancestors 'none'"
)
_API_CSP = "default-src 'none'; frame-ancestors 'none'"

# Responses that carry a token or account data must never be cached (a shared
# proxy/browser cache holding onto a refresh token or another user's account
# row is exactly the kind of thing that turns a minor bug into a real leak).
_NO_STORE_PREFIXES = (
    "/api/v1/auth",
    "/api/v1/otp",
    "/api/v1/sessions",
    "/api/v1/users/me",
    "/api/v1/push",
)

# Least-privilege — this API never needs any browser capability directly.
_PERMISSIONS_POLICY = (
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
    "magnetometer=(), microphone=(), payment=(), usb=()"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        response = await self._safe_call(request, call_next)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Permissions-Policy"] = _PERMISSIONS_POLICY
        response.headers["Content-Security-Policy"] = (
            _DOCS_CSP if request.url.path in _DOCS_PATHS else _API_CSP
        )
        if request.url.path.startswith(_NO_STORE_PREFIXES):
            response.headers["Cache-Control"] = "no-store"
        # HSTS only makes sense once HTTPS is actually proven in front of this
        # service (a dev server on plain HTTP should never send it — browsers
        # cache HSTS aggressively and it can't be un-sent by accident later).
        if settings.APP_ENV == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    @staticmethod
    async def _safe_call(request: Request, call_next) -> Response:
        # A real stack trace/exception message must never reach a client.
        # Caught here (rather than via @app.exception_handler) because a
        # plain BaseHTTPMiddleware's call_next() doesn't reliably surface an
        # already-handled response back up through this class's dispatch()
        # in every Starlette version — catching directly is the robust path,
        # confirmed by this module's own test coverage.
        try:
            return await call_next(request)
        except Exception as exc:  # noqa: BLE001 — this IS the last-resort catch-all
            logger.error(
                "app.unhandled_exception",
                path=request.url.path,
                error=str(exc),
                error_type=type(exc).__name__,
            )
            return JSONResponse(status_code=500, content={"detail": "internal server error"})
