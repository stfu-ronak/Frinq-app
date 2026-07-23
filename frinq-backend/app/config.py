from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # Database (asyncpg)
    DATABASE_URL: str = ""

    # Anthropic
    ANTHROPIC_API_KEY: str = ""

    # OpenAI / ChatGPT — primary generator for the quiz reveal (profile +
    # deep report). OPENAI_MODEL is a plain setting rather than hardcoded in
    # prompt files so a bad/renamed model id is a one-line env fix, not a
    # code change.
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-5.5"
    # Reasoning effort for GPT-5-series models (minimal|low|medium|high).
    # Empty string = omit the param (for non-reasoning models). GPT-5
    # reasoning models only accept the default temperature, so when this is
    # set the client drops the custom temperature (see openai_client.py).
    OPENAI_REASONING_EFFORT: str = "medium"

    # Voyage (embeddings)
    VOYAGE_API_KEY: str = ""

    # Which provider generates the hero-card profile fields (archetype,
    # headline, nickname, stats, tags). Claude's call path (app/core/ai/
    # insights.py) is kept fully intact but idle — flip this back to
    # "claude" to reactivate it with zero code changes. The deep-report
    # half (mirror/hidden-pattern/etc.) is OpenAI-only, no toggle.
    INSIGHTS_PROVIDER: Literal["openai", "claude"] = "openai"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Twilio Verify (OTP) — OTP_CHANNEL selects Twilio's sms vs whatsapp channel,
    # not WhatsApp Cloud API. The Cloud API integration was never built.
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_VERIFY_SERVICE_SID: str = ""   # VAc6e72c...
    OTP_CHANNEL: str = "whatsapp"          # sms | whatsapp
    DUMMY_OTP: str = ""                   # if set, always accepted for DEV_PHONE
    DEV_PHONE: str = ""                   # e.g. 9876543210
    # Explicit, auditable opt-in to allow the DEV_PHONE/DUMMY_OTP bypass in
    # production. Defaults False so a stray DUMMY_OTP in prod env can never be
    # a silent backdoor — someone has to deliberately flip this. Only affects
    # the single DEV_PHONE account. Turn OFF again after testing on live.
    ALLOW_TEST_OTP_IN_PROD: bool = False
    # Testing-phase kill switch: skip Twilio entirely for EVERY phone number —
    # /otp/send no-ops and /otp/verify accepts DUMMY_OTP for any 10-digit
    # number, so testers can walk the quiz as different "users". HARD-IGNORED
    # in production regardless of value (see otp.py); remove from env before
    # launch anyway.
    SKIP_OTP_VERIFICATION: bool = False
    # Multi-phone test bypass (dev/staging only) — every phone in this list
    # accepts DUMMY_OTP, so testers don't have to fight over one DEV_PHONE.
    # Hard-ignored in production, same as SKIP_OTP_VERIFICATION.
    TEST_PHONES: str = ""  # comma-separated 10-digit numbers

    # App Store / Play Store reviewer bypass — the only OTP shortcut allowed
    # in production. One phone/code pair, valid only while
    # REVIEW_OTP_EXPIRES_AT is set, in the future, and no more than 30 days
    # out. main.py's production boot guard refuses to start if
    # REVIEW_PHONE/REVIEW_OTP are set without an expiry.
    REVIEW_PHONE: str = ""
    REVIEW_OTP: str = ""
    REVIEW_OTP_EXPIRES_AT: str = ""  # ISO 8601, e.g. 2026-08-15T00:00:00+00:00

    # Twilio Messaging API — proactive WhatsApp send after quiz complete.
    # TWILIO_WHATSAPP_FROM = WhatsApp-enabled Twilio number with prefix,
    #   e.g. "whatsapp:+14155238886".
    # TWILIO_WHATSAPP_TEMPLATE_SID = Meta-approved Content Template SID (HX...).
    #   Outbound WhatsApp outside the 24h session window REQUIRES a template.
    # If either is empty, send is skipped (logged only) so the rest of the
    # app keeps working until Meta approves the template.
    TWILIO_WHATSAPP_FROM: str = ""
    TWILIO_WHATSAPP_TEMPLATE_SID: str = ""
    # Approved 'first_follow_up' template — sent to users who dropped off
    # mid-quiz to nudge them back. Separate SID from the launch notice so
    # we can iterate on either independently.
    TWILIO_WHATSAPP_FOLLOWUP_TEMPLATE_SID: str = ""

    # LinkedIn OAuth
    LINKEDIN_CLIENT_ID: str = ""
    LINKEDIN_CLIENT_SECRET: str = ""
    LINKEDIN_REDIRECT_URI: str = ""

    # Admin
    ADMIN_KEY: str = Field(default="frinq-admin")
    # Second-factor password gating destructive admin actions (delete,
    # bulk-delete, re-fire WhatsApp, etc). MUST be set explicitly in env
    # in production — empty default fails closed instead of silently
    # accepting the well-known historical password.
    ADMIN_ACTION_PASSWORD: str = Field(default="")

    # Attributable identity for moderation_actions.actor_id — server
    # config only, NEVER accepted from a request field, so an audit row
    # can't be forged to point at someone else. If multiple moderators
    # ever share this deployment, issue each one a separately configured
    # instance/credential rather than trying to multiplex actor identity
    # through a single shared ADMIN_KEY.
    ADMIN_ACTOR_ID: str = Field(default="admin")

    # CORS — comma-separated allowed origins. Empty default = deny all so
    # a missing/dropped env var doesn't silently open CORS to everyone.
    CORS_ORIGINS: str = Field(default="")

    # App
    APP_ENV: Literal["development", "staging", "production"] = "development"
    SECRET_KEY: str = Field(default="dev-secret-change-me")

    # Sessions — refresh-token secrets are HMACed with this pepper before
    # storage (never the JWT signing key, so rotating one doesn't invalidate
    # the other). Deliberately separate from SECRET_KEY.
    SESSION_HASH_PEPPER: str = Field(default="dev-pepper-change-me")

    # Rate limiting — phone/IP hashes use this pepper before becoming Redis
    # key material (never SECRET_KEY/SESSION_HASH_PEPPER, same "separate
    # pepper per purpose" reasoning).
    RATE_LIMIT_PEPPER: str = Field(default="dev-rate-limit-pepper-change-me")

    # Chat moderation — comma-separated substrings, case-insensitive. Empty
    # by default (beta ships with only the deterministic structural checks
    # in app/core/moderation.py; this list is an ops-configurable add-on).
    MODERATION_BLOCKED_TERMS: str = Field(default="")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
