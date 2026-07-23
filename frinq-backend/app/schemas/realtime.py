from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WsTicketResponse(BaseModel):
    ticket: str
    expires_in: int = 60


# ─── Client -> server frames ────────────────────────────────────────────

class ClientMessageSend(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["message.send"] = "message.send"
    client_message_id: UUID
    body: str = Field(min_length=1, max_length=1000)


class ClientPing(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["ping"] = "ping"


# ─── Server -> client frames ─────────────────────────────────────────────

class RealtimeAuthor(BaseModel):
    id: UUID
    display_name: str | None = None


class RealtimeMessage(BaseModel):
    id: int
    client_message_id: UUID
    body: str
    author: RealtimeAuthor
    created_at: datetime


class ServerReady(BaseModel):
    type: Literal["ready"] = "ready"
    community_slug: str
    server_time: datetime


class ServerMessageCreated(BaseModel):
    type: Literal["message.created"] = "message.created"
    message: RealtimeMessage


class ServerMessageRejected(BaseModel):
    type: Literal["message.rejected"] = "message.rejected"
    client_message_id: UUID
    code: str
    retry_after: int | None = None


class ServerPong(BaseModel):
    type: Literal["pong"] = "pong"
