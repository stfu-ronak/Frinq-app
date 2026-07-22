from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_pool, get_supabase_claims
from app.schemas.user import RegisterRequest, UserResponse
from app.utils.logger import logger

router = APIRouter(prefix="/auth", tags=["auth"])


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
