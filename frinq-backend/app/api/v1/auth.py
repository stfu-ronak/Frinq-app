from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict

from app.api.deps import CurrentAccount, get_current_account, get_pool, get_supabase_claims
from app.config import settings
from app.core.otp import send_otp, verify_otp
from app.core.rate_limit import RateLimitUnavailable, check_rate_limit
from app.core.redis_client import get_redis
from app.core.reverify import ACCOUNT_DELETE_ACTION, create_reauth_token
from app.schemas.user import RegisterRequest, UserResponse
from app.utils.logger import logger

router = APIRouter(prefix="/auth", tags=["auth"])


class ReverifyVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str


class ReauthTokenResponse(BaseModel):
    reauth_token: str
    expires_in: int


@router.post("/reverify/request", status_code=status.HTTP_202_ACCEPTED)
async def reverify_request(account: CurrentAccount = Depends(get_current_account)) -> dict:
    """Sends an OTP to the account's own stored phone only — never accepts
    a phone field, so this can't be used to send an OTP to someone else's
    number under an authenticated session."""
    if not account.phone:
        raise HTTPException(status_code=400, detail="no phone on file for this account")

    redis = await get_redis()
    try:
        limit_result = await check_rate_limit("otp_request", str(account.id), redis)
    except RateLimitUnavailable:
        raise HTTPException(status_code=503, detail="try again shortly")
    if not limit_result.allowed:
        raise HTTPException(
            status_code=429, detail="too many requests",
            headers={"Retry-After": str(limit_result.retry_after)},
        )

    try:
        await send_otp(account.phone)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="could not send code, try again")
    return {"ok": True}


@router.post("/reverify/verify", response_model=ReauthTokenResponse)
async def reverify_verify(
    body: ReverifyVerifyRequest,
    account: CurrentAccount = Depends(get_current_account),
) -> ReauthTokenResponse:
    """On success, returns a single-purpose reauth token bound to this user
    ID, session ID, and the account_delete action — 5-minute expiry,
    single-use (app/core/reverify.py). Never a general-purpose login token."""
    if not account.phone:
        raise HTTPException(status_code=400, detail="no phone on file for this account")

    redis = await get_redis()
    try:
        limit_result = await check_rate_limit("otp_verify", str(account.id), redis)
    except RateLimitUnavailable:
        raise HTTPException(status_code=503, detail="try again shortly")
    if not limit_result.allowed:
        raise HTTPException(
            status_code=429, detail="too many attempts",
            headers={"Retry-After": str(limit_result.retry_after)},
        )

    try:
        await verify_otp(account.phone, body.code.strip())
    except TimeoutError:
        raise HTTPException(status_code=504, detail="verification took too long, try again")
    except ValueError as exc:
        if str(exc) == "expired":
            raise HTTPException(status_code=410, detail="code expired, request a new one")
        raise HTTPException(status_code=400, detail="incorrect code")

    token = create_reauth_token(user_id=account.id, session_id=account.session_id, action=ACCOUNT_DELETE_ACTION)
    logger.info("auth.reverify_verified", user_id=str(account.id))
    return ReauthTokenResponse(reauth_token=token, expires_in=settings.REAUTH_TOKEN_TTL_SECONDS)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    body: RegisterRequest,
    claims: dict[str, Any] = Depends(get_supabase_claims),
    pool: asyncpg.Pool = Depends(get_pool),
) -> UserResponse:
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token missing sub claim",
        )
    try:
        supabase_uid = UUID(sub)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid sub claim",
        ) from exc

    phone = claims.get("phone") or claims.get("user_metadata", {}).get("phone")

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT * FROM users WHERE supabase_uid = $1",
            supabase_uid,
        )
        if existing is not None:
            if existing["deleted_at"] is not None:
                raise HTTPException(
                    status_code=status.HTTP_410_GONE,
                    detail="account previously deleted",
                )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="user already registered",
            )
        row = await conn.fetchrow(
            """
            INSERT INTO users (
                supabase_uid, phone, display_name, gender, age,
                ncr_zone, max_travel_km, schedule, onboarding_complete
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
            RETURNING *
            """,
            supabase_uid,
            phone,
            body.display_name,
            body.gender,
            body.age,
            body.ncr_zone,
            body.max_travel_km,
            body.schedule,
        )
    logger.info("auth.register", user_id=str(row["id"]))
    return UserResponse.model_validate(dict(row))
