from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

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
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    age: int | None = Field(default=None, ge=18, le=65)
    gender: Gender | None = None
    ncr_zone: NCRZone | None = None
    max_travel_km: int | None = Field(default=None, ge=1, le=100)
    schedule: list[ScheduleSlot] | None = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    supabase_uid: UUID
    phone: str | None = None
    display_name: str | None = None
    gender: Gender | None = None
    age: int | None = None
    ncr_zone: NCRZone | None = None
    max_travel_km: int | None = None
    schedule: list[str] = Field(default_factory=list)
    onboarding_complete: bool = False
    created_at: datetime
    updated_at: datetime


class UserDeleteResponse(BaseModel):
    id: UUID
    deleted_at: datetime
