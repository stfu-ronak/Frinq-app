"""Terms/Privacy acceptance.

GET  /legal/current — the currently-required version strings.
POST /legal/accept  — records acceptance + stamps users.terms_version/
                      privacy_version so require_current_legal (deps.py)
                      passes on the next request.

DRAFT placeholder versions (settings.CURRENT_TERMS_VERSION/
CURRENT_PRIVACY_VERSION) — real counsel-reviewed Terms/Privacy text has
not been written yet. This module's job is the acceptance MECHANISM
(versioning, audit trail), never the legal content itself.
"""

from __future__ import annotations

from typing import Literal
from uuid import uuid4

import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from app.api.deps import CurrentAccount, get_current_account, get_pool
from app.config import settings

router = APIRouter(tags=["legal"])


class CurrentLegalResponse(BaseModel):
    terms_version: str
    privacy_version: str


class AcceptLegalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    terms_version: str
    privacy_version: str
    locale: str
    source: Literal["ios", "android", "web"]


@router.get("/legal/current", response_model=CurrentLegalResponse)
async def get_current_legal() -> CurrentLegalResponse:
    return CurrentLegalResponse(
        terms_version=settings.CURRENT_TERMS_VERSION,
        privacy_version=settings.CURRENT_PRIVACY_VERSION,
    )


@router.post("/legal/accept", status_code=201)
async def accept_legal(
    body: AcceptLegalRequest,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """INSERT INTO legal_acceptances (id, user_id, terms_version, privacy_version, locale, source)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   ON CONFLICT (user_id, terms_version, privacy_version) DO NOTHING""",
                uuid4(), account.id, body.terms_version, body.privacy_version, body.locale, body.source,
            )
            await conn.execute(
                """UPDATE users SET terms_version = $2, terms_accepted_at = now(),
                       privacy_version = $3, privacy_accepted_at = now(), updated_at = now()
                   WHERE id = $1""",
                account.id, body.terms_version, body.privacy_version,
            )
    return {"ok": True}
