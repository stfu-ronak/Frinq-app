from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RegisterTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    installation_id: UUID
    token: str = Field(min_length=1, max_length=4096)
    platform: Literal["ios", "android"]
    app_version: str = Field(min_length=1, max_length=32)


class PushPreferencesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    installation_id: UUID
    enabled: bool
