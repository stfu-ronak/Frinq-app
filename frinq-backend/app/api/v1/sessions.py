"""Session lifecycle for OTP-native accounts.

POST /api/v1/auth/refresh — rotate a refresh token, get a new pair back.
POST /api/v1/auth/logout  — revoke the caller's current session.
"""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import CurrentAccount, get_current_account, get_pool
from app.core.session import SessionReuseError, revoke_session, rotate_session

router = APIRouter(prefix="/auth", tags=["auth"])


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    body: RefreshRequest,
    pool: asyncpg.Pool = Depends(get_pool),
) -> RefreshResponse:
    """Refresh tokens are accepted only in the JSON body — never as a query
    param or header, both of which risk ending up in access logs."""
    async with pool.acquire() as conn:
        try:
            pair = await rotate_session(conn, body.refresh_token)
        except SessionReuseError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid or reused refresh token",
            ) from exc

    return RefreshResponse(access_token=pair.access_token, refresh_token=pair.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def logout(
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> None:
    async with pool.acquire() as conn:
        await revoke_session(conn, account.session_id)
