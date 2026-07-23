from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ReportReason = Literal[
    "spam", "harassment", "hate", "sexual", "self_harm",
    "violence", "impersonation", "privacy", "other",
]


class PublicAuthor(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    display_name: str | None = None
    # No avatar system exists yet — always null until one is built. Kept in
    # the contract now (per plan's public-field allowlist) so clients don't
    # need a breaking schema change once avatars ship.
    avatar_key: str | None = None
    archetype_slug: str | None = None


class MessageOut(BaseModel):
    id: int
    client_message_id: UUID
    body: str
    created_at: datetime
    author: PublicAuthor


class MessageHistoryResponse(BaseModel):
    messages: list[MessageOut]
    next_cursor: str | None = None


class MessageReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: ReportReason
    details: str | None = Field(default=None, max_length=500)
