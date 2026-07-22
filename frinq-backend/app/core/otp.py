"""OTP via Twilio Verify Service.

Twilio Verify handles: code generation, SMS delivery, rate limiting,
expiry (10 min), and attempt counting — we don't store anything ourselves.

Dev mode: if phone == DEV_PHONE and DUMMY_OTP is set, bypass Twilio entirely.

Latency notes:
  - The Twilio Python SDK uses `requests` under the hood, which has NO
    default HTTP timeout. Without explicit limits a slow Twilio response
    can hang the worker indefinitely, locking up the FastAPI worker pool
    and freezing the verify screen on the client.
  - We pin the underlying HTTP client to (3s connect, 8s read) and also
    wrap the awaited call in `asyncio.wait_for(..., timeout=9.0)` as a
    belt-and-braces ceiling.
  - The Twilio Client is created once at import time and reused — building
    a fresh Client per request was burning ~150ms on every call setting up
    a new requests Session.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from app.config import settings
from app.utils.logger import logger


# ─── Singleton Twilio client + bounded asyncio waits ─────────────────────────

# Outer ceiling on each awaited Twilio call. Note: asyncio.wait_for cancels
# the asyncio task but the underlying thread running the sync Twilio HTTP
# call keeps running until its own internal timeout (or the OS gives up).
# That's acceptable — FastAPI has plenty of worker threads and the user-facing
# request returns quickly with a clean 504/503.
_AWAIT_TIMEOUT: float = 9.0

_client_instance: Any = None


def _client() -> Any:
    """Return a process-wide Twilio Client. Lazy so a missing creds at
    import time doesn't crash the process — only fails when actually used.
    """
    global _client_instance
    if _client_instance is not None:
        return _client_instance
    from twilio.rest import Client
    _client_instance = Client(
        settings.TWILIO_ACCOUNT_SID,
        settings.TWILIO_AUTH_TOKEN,
    )
    return _client_instance


def _e164(phone: str) -> str:
    """Convert 10-digit Indian number to E.164 format."""
    digits = phone.replace("+91", "").replace(" ", "").strip()
    return f"+91{digits}"


def _skip_all_otp() -> bool:
    """Testing-phase global bypass — every phone, no Twilio. NEVER active in
    production, even if the env var is set there by mistake."""
    return settings.SKIP_OTP_VERIFICATION and settings.APP_ENV != "production"


def _dev_bypass_allowed() -> bool:
    """Whether the DEV_PHONE/DUMMY_OTP bypass may fire.

    Normally ONLY valid outside production — this stops a stray DUMMY_OTP in
    prod env from becoming an instant 'log in as DEV_PHONE' backdoor. To test
    on live, an operator must ALSO flip ALLOW_TEST_OTP_IN_PROD explicitly;
    setting DUMMY_OTP alone is never enough in prod. Turn the flag off again
    once live testing is done. The bypass only ever grants the single
    DEV_PHONE account, never arbitrary users."""
    env_ok = settings.APP_ENV != "production" or settings.ALLOW_TEST_OTP_IN_PROD
    return (
        env_ok
        and bool(settings.DUMMY_OTP)
        and bool(settings.DEV_PHONE)
    )


async def send_otp(phone: str) -> None:
    """Send OTP via Twilio Verify. Raises RuntimeError on failure."""
    if _skip_all_otp():
        logger.info("otp.skip_all_bypass", phone=phone[:4] + "****")
        return
    if _dev_bypass_allowed() and phone == settings.DEV_PHONE:
        logger.info("otp.dev_bypass")
        return

    to = _e164(phone)
    started = time.perf_counter()
    try:
        await asyncio.wait_for(
            asyncio.to_thread(
                _client()
                .verify.v2
                .services(settings.TWILIO_VERIFY_SERVICE_SID)
                .verifications
                .create,
                to=to,
                channel=settings.OTP_CHANNEL,
            ),
            timeout=_AWAIT_TIMEOUT,
        )
        logger.info(
            "otp.sent",
            phone=phone[:4] + "****",
            ms=int((time.perf_counter() - started) * 1000),
        )
    except asyncio.TimeoutError as exc:
        logger.error(
            "otp.send_timeout",
            phone=phone[:4] + "****",
            ms=int((time.perf_counter() - started) * 1000),
        )
        raise RuntimeError("sms_timeout") from exc
    except Exception as exc:
        logger.error(
            "otp.send_failed",
            phone=phone[:4] + "****",
            error=str(exc),
            ms=int((time.perf_counter() - started) * 1000),
        )
        raise RuntimeError("sms_failed") from exc


async def verify_otp(phone: str, code: str) -> None:
    """Verify code via Twilio Verify. Raises ValueError with reason on failure.

    Distinct exception types so the route can return distinct HTTP codes:
      - TimeoutError("twilio_timeout") → 504 Gateway Timeout
      - ValueError("expired")          → 410 Gone (code already used / 404 from Twilio)
      - ValueError("invalid_code")     → 400 Bad Request (wrong code, generic)

    Every Twilio rejection is logged with the real Twilio status + error code
    so we can debug "OTP says wrong but I typed it right" reports — without
    this, the catch-all just hid the real reason.
    """
    if _skip_all_otp():
        if code == settings.DUMMY_OTP:
            logger.info("otp.skip_all_verified", phone=phone[:4] + "****")
            return
        raise ValueError("invalid_code")

    if _dev_bypass_allowed() and phone == settings.DEV_PHONE:
        if code == settings.DUMMY_OTP:
            return
        raise ValueError("invalid_code")

    to = _e164(phone)
    started = time.perf_counter()
    try:
        check = await asyncio.wait_for(
            asyncio.to_thread(
                _client()
                .verify.v2
                .services(settings.TWILIO_VERIFY_SERVICE_SID)
                .verification_checks
                .create,
                to=to,
                code=code,
            ),
            timeout=_AWAIT_TIMEOUT,
        )
    except asyncio.TimeoutError as exc:
        logger.error(
            "otp.verify_timeout",
            phone=phone[:4] + "****",
            ms=int((time.perf_counter() - started) * 1000),
        )
        raise TimeoutError("twilio_timeout") from exc
    except Exception as exc:
        # Surface the actual Twilio error code if available. A 404 means the
        # verification doesn't exist on Twilio (expired, never created, or
        # already approved — code can't be reused).
        from twilio.base.exceptions import TwilioRestException
        ms = int((time.perf_counter() - started) * 1000)
        if isinstance(exc, TwilioRestException):
            twilio_status = getattr(exc, "status", None)
            twilio_code = getattr(exc, "code", None)
            twilio_msg = getattr(exc, "msg", str(exc))
            logger.error(
                "otp.verify_twilio_error",
                phone=phone[:4] + "****",
                twilio_status=twilio_status,
                twilio_code=twilio_code,
                twilio_msg=twilio_msg,
                ms=ms,
            )
            if twilio_status == 404:
                raise ValueError("expired") from exc
        else:
            logger.error(
                "otp.verify_unknown_error",
                phone=phone[:4] + "****",
                error_type=type(exc).__name__,
                error=str(exc),
                ms=ms,
            )
        raise ValueError("invalid_code") from exc

    if check.status != "approved":
        logger.warning(
            "otp.verify_not_approved",
            phone=phone[:4] + "****",
            twilio_status=check.status,
            ms=int((time.perf_counter() - started) * 1000),
        )
        raise ValueError("invalid_code")

    logger.info(
        "otp.approved",
        phone=phone[:4] + "****",
        ms=int((time.perf_counter() - started) * 1000),
    )
