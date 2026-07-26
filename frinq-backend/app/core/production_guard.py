"""Production configuration validation — a pure function so both
`app/main.py`'s boot-time `lifespan()` and the standalone
`scripts/verify_production_config.py` (which validates a `.env` file without
booting the full app: no DB/Redis connection needed) can share exactly one
set of rules. Returns a list of human-readable error strings; empty means
the config is safe to run in production. Never raises — the caller decides
what to do with the list (raise RuntimeError at boot, print and exit(1) in
the script).
"""

from __future__ import annotations

from cryptography.fernet import Fernet

_DEV_DEFAULTS = {
    "SECRET_KEY": "dev-secret-change-me",
    "SESSION_HASH_PEPPER": "dev-pepper-change-me",
    "RATE_LIMIT_PEPPER": "dev-rate-limit-pepper-change-me",
    "PUSH_TOKEN_HASH_PEPPER": "dev-push-pepper-change-me",
    "ADMIN_KEY": "frinq-admin",
}


def validate_production_settings(settings: object) -> list[str]:
    errors: list[str] = []

    for field, default in _DEV_DEFAULTS.items():
        if getattr(settings, field) == default:
            errors.append(f"{field} must be set in production")

    if not settings.ADMIN_ACTION_PASSWORD:
        errors.append("ADMIN_ACTION_PASSWORD must be set in production")

    if not settings.ADMIN_ACTOR_ID or settings.ADMIN_ACTOR_ID == "admin":
        errors.append(
            "ADMIN_ACTOR_ID must be set to a real, distinct identity in production "
            "(the default 'admin' would attribute every moderation action to the same generic actor)"
        )

    if settings.ADMIN_KEY and settings.ADMIN_KEY == settings.ADMIN_ACTION_PASSWORD:
        errors.append("ADMIN_KEY and ADMIN_ACTION_PASSWORD must not be the same value")

    if not settings.CORS_ORIGINS:
        errors.append("CORS_ORIGINS must be set in production")
    else:
        origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
        if "*" in origins:
            errors.append("CORS_ORIGINS must not be a wildcard in production")
        for origin in origins:
            # capacitor://localhost and similar app-scheme origins are the
            # native-shell equivalent of "localhost" and are fine; only flag
            # a real http:// web origin.
            if origin.startswith("http://"):
                errors.append(f"CORS_ORIGINS must not contain a cleartext http:// origin in production: {origin}")

    if (settings.REVIEW_PHONE or settings.REVIEW_OTP) and not settings.REVIEW_OTP_EXPIRES_AT:
        errors.append(
            "REVIEW_OTP_EXPIRES_AT must be set when REVIEW_PHONE/REVIEW_OTP are configured in production"
        )

    if settings.PUSH_TOKEN_ENCRYPTION_KEY:
        try:
            Fernet(settings.PUSH_TOKEN_ENCRYPTION_KEY.encode("utf-8"))
        except (ValueError, TypeError):
            errors.append("PUSH_TOKEN_ENCRYPTION_KEY is not a valid Fernet key")

    if not settings.DATABASE_URL:
        errors.append("DATABASE_URL must be set in production")
    if not settings.REDIS_URL or settings.REDIS_URL == "redis://localhost:6379/0":
        errors.append("REDIS_URL must be set to a real production instance")

    # Test/dev-only OTP bypasses must never be reachable in production.
    if settings.SKIP_OTP_VERIFICATION:
        errors.append("SKIP_OTP_VERIFICATION must be false in production")
    if settings.TEST_PHONES:
        errors.append("TEST_PHONES must be empty in production")

    # The ACTIVE AI insight provider must actually be configured, or every quiz
    # reveal 500s in production. Which key matters depends on INSIGHTS_PROVIDER,
    # so a blanket "both keys" check would wrongly demand the idle provider's.
    provider = (getattr(settings, "INSIGHTS_PROVIDER", "") or "openai").strip().lower()
    if provider == "openai" and not getattr(settings, "OPENAI_API_KEY", ""):
        errors.append("OPENAI_API_KEY must be set when INSIGHTS_PROVIDER=openai in production")
    elif provider in ("claude", "anthropic") and not getattr(settings, "ANTHROPIC_API_KEY", ""):
        errors.append("ANTHROPIC_API_KEY must be set when INSIGHTS_PROVIDER=claude in production")

    return errors
