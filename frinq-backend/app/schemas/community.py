from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CommunityMeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    archetype_slug: str
    name: str
    description: str
    muted: bool
    joined_at: datetime


class CommunityPreferencesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    muted: bool
