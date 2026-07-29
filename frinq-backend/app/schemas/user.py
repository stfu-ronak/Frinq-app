from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.moderation import moderate

# Reserved so a display name can't impersonate admin/moderation staff or
# the product itself. Matched as a substring, case-insensitive, against
# the NFKC-normalized name — deliberately simple (beta scope), not a full
# confusable-character/homoglyph defense.
RESERVED_DISPLAY_NAME_TERMS = frozenset({
    "admin", "administrator", "moderator", "mod", "frinq", "support", "staff", "official", "system",
})
DISPLAY_NAME_MIN_CODEPOINTS = 2
DISPLAY_NAME_MAX_CODEPOINTS = 40

Gender = Literal["male", "female", "non_binary", "other"]
NCRZone = Literal[
    "gurgaon",
    "south_delhi",
    "noida",
    "east_delhi",
    "west_delhi",
    "faridabad",
    "other_ncr",
]
ScheduleSlot = Literal[
    "weekday_morn",
    "weekday_eve",
    "saturday",
    "sunday",
]


class RegisterRequest(BaseModel):
    """Called once on first login after Supabase Auth issues a JWT.

    The Supabase UID and phone come from the JWT itself — only the user-supplied
    fields appear in the body.
    """

    display_name: str = Field(min_length=1, max_length=80)
    age: int | None = Field(default=None, ge=18, le=65)
    gender: Gender | None = None
    ncr_zone: NCRZone | None = None
    max_travel_km: int = Field(default=15, ge=1, le=100)
    schedule: list[ScheduleSlot] = Field(default_factory=list)


class UserPatchRequest(BaseModel):
    # `phone` is deliberately NOT patchable here. It's the login identity, and
    # OTP account lookup matches on the normalized last-10-digits form
    # (otp.py), not the exact stored string — so letting a user rewrite their
    # own phone to a differently-formatted copy of someone else's number
    # creates two rows that normalize identically and lets a later OTP login
    # resolve to the wrong account (cross-account login confusion / data
    # exposure). Any phone change must go through an OTP-verified flow. With
    # extra="forbid", a client that still sends `phone` gets a clean 422.
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None)
    age: int | None = Field(default=None, ge=18, le=65)
    gender: Gender | None = None
    ncr_zone: NCRZone | None = None
    max_travel_km: int | None = Field(default=None, ge=1, le=100)
    schedule: list[ScheduleSlot] | None = None

    @field_validator("display_name")
    @classmethod
    def _validate_display_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        # Same deterministic text-safety policy as chat (NFKC normalize,
        # control-char/excessive-repetition/URL-count rejection) — just a
        # much shorter max length, since this is a name, not a message.
        result = moderate(v, max_length=DISPLAY_NAME_MAX_CODEPOINTS)
        if result.verdict != "accepted":
            raise ValueError(f"display_name_{result.reason}")
        normalized = result.normalized_body
        assert normalized is not None  # guaranteed by verdict == "accepted"
        if len(normalized) < DISPLAY_NAME_MIN_CODEPOINTS:
            raise ValueError("display_name_too_short")
        lowered = normalized.lower()
        for term in RESERVED_DISPLAY_NAME_TERMS:
            if term in lowered:
                raise ValueError("display_name_reserved_term")
        return normalized


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    supabase_uid: UUID | None = None
    phone: str | None = None
    display_name: str | None = None
    display_name_updated_at: datetime | None = None
    gender: Gender | None = None
    age: int | None = None
    ncr_zone: NCRZone | None = None
    max_travel_km: int | None = None
    schedule: list[str] = Field(default_factory=list)
    onboarding_complete: bool = False
    onboarding_state: str = "quiz_in_progress"
    community_slug: str | None = None
    banned: bool = False
    terms_version: str | None = None
    terms_accepted_at: datetime | None = None
    privacy_version: str | None = None
    privacy_accepted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class UserDeleteResponse(BaseModel):
    id: UUID
    deleted_at: datetime


class DeleteAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reauth_token: str
