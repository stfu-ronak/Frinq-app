"""Push token lifecycle.

POST   /api/v1/push/tokens             — register/refresh this installation's token
DELETE /api/v1/push/tokens/{install_id} — remove the caller's own token (logout)
PATCH  /api/v1/push/preferences        — enable/disable push for this installation
"""

from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentAccount, get_current_account, get_pool
from app.core.push import register_token, remove_token, set_enabled
from app.schemas.push import PushPreferencesRequest, RegisterTokenRequest
from app.utils.logger import logger

router = APIRouter(prefix="/push", tags=["push"])


@router.post("/tokens", status_code=status.HTTP_201_CREATED)
async def register_push_token(
    body: RegisterTokenRequest,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    async with pool.acquire() as conn:
        await register_token(
            conn, user_id=account.id, installation_id=body.installation_id,
            token=body.token, platform=body.platform, app_version=body.app_version,
        )
    logger.info("push.token_registered", user_id=str(account.id), platform=body.platform)
    return {"ok": True}


@router.delete("/tokens/{installation_id}")
async def remove_push_token(
    installation_id: UUID,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    async with pool.acquire() as conn:
        removed = await remove_token(conn, user_id=account.id, installation_id=installation_id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="token not found")
    return {"ok": True}


@router.patch("/preferences")
async def update_push_preferences(
    body: PushPreferencesRequest,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    async with pool.acquire() as conn:
        updated = await set_enabled(conn, user_id=account.id, installation_id=body.installation_id, enabled=body.enabled)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="token not found")
    return {"enabled": body.enabled}
