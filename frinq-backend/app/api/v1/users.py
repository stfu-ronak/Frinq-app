from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentUser, get_current_user, get_pool
from app.schemas.user import UserDeleteResponse, UserPatchRequest, UserResponse
from app.utils.logger import logger

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_me(user: CurrentUser = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(user.row)


@router.patch("/me", response_model=UserResponse)
async def patch_me(
    body: UserPatchRequest,
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> UserResponse:
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return UserResponse.model_validate(user.row)

    set_clauses: list[str] = []
    values: list[object] = []
    for idx, (key, value) in enumerate(updates.items(), start=1):
        set_clauses.append(f"{key} = ${idx}")
        values.append(value)
    set_clauses.append("updated_at = now()")
    values.append(user.id)

    query = (
        f"UPDATE users SET {', '.join(set_clauses)} "
        f"WHERE id = ${len(values)} AND deleted_at IS NULL RETURNING *"
    )
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, *values)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user not found",
        )
    logger.info("users.patch", user_id=str(user.id), fields=list(updates.keys()))
    return UserResponse.model_validate(dict(row))


@router.delete("/me", response_model=UserDeleteResponse)
async def delete_me(
    user: CurrentUser = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
) -> UserDeleteResponse:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE users SET deleted_at = now(), updated_at = now() "
            "WHERE id = $1 AND deleted_at IS NULL RETURNING id, deleted_at",
            user.id,
        )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user not found",
        )
    logger.info("users.delete", user_id=str(user.id))
    return UserDeleteResponse(id=row["id"], deleted_at=row["deleted_at"])
