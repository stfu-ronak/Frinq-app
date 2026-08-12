from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.deps import CurrentAccount, get_current_account, get_pool
from app.config import settings
from app.core import metrics
from app.core.realtime import publish_ban_event
from app.core.redis_client import get_redis
from app.core.reverify import ACCOUNT_DELETE_ACTION, ReauthTokenError, consume_reauth_token
from app.core.session import revoke_all_sessions
from app.core.test_fixtures import is_test_phone, reset_test_account
from app.schemas.user import DeleteAccountRequest, UserDeleteResponse, UserPatchRequest, UserResponse
from app.utils.logger import logger

router = APIRouter(prefix="/users", tags=["users"])

# New design spec (2026-07-27): display_name may change at most once every
# 3 months. Nullable display_name_updated_at (migration 017) means the very
# first change is always allowed, regardless of account age.
DISPLAY_NAME_COOLDOWN_DAYS = 90


@router.get("/me", response_model=UserResponse)
async def get_me(account: CurrentAccount = Depends(get_current_account)) -> UserResponse:
    return UserResponse.model_validate({**account.row, "community_slug": account.community_slug})


@router.patch("/me", response_model=UserResponse)
async def patch_me(
    body: UserPatchRequest,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> UserResponse:
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return UserResponse.model_validate({**account.row, "community_slug": account.community_slug})

    if "display_name" in updates:
        last_changed = account.row.get("display_name_updated_at")
        if last_changed is not None:
            if last_changed.tzinfo is None:
                last_changed = last_changed.replace(tzinfo=timezone.utc)
            next_eligible = last_changed + timedelta(days=DISPLAY_NAME_COOLDOWN_DAYS)
            if datetime.now(tz=timezone.utc) < next_eligible:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "display_name_rate_limited", "next_eligible_at": next_eligible.isoformat()},
                )
        # Set alongside display_name in the SAME update — never a separate
        # query, so a crash between the two can't record a name change
        # without also starting its cooldown (or vice versa).
        updates["display_name_updated_at"] = datetime.now(tz=timezone.utc)

    set_clauses: list[str] = []
    values: list[object] = []
    for idx, (key, value) in enumerate(updates.items(), start=1):
        set_clauses.append(f"{key} = ${idx}")
        values.append(value)
    set_clauses.append("updated_at = now()")
    values.append(account.id)

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
    logger.info("users.patch", user_id=str(account.id), fields=list(updates.keys()))
    return UserResponse.model_validate({**dict(row), "community_slug": account.community_slug})


@router.delete("/me", response_model=UserDeleteResponse)
async def delete_me(
    body: DeleteAccountRequest,
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> UserDeleteResponse:
    """Requires a fresh reauth token (POST /auth/reverify/request + /verify)
    bound to this exact user+session — a login access token or a token for
    a different action is rejected by consume_reauth_token itself.

    A real hard delete, not a soft-delete flag: quiz_submissions/
    user_sessions/community_members/user_blocks/push_tokens/
    legal_acceptances all CASCADE; messages.user_id/
    message_reports.reporter_user_id/moderation_actions.target_user_id all
    SET NULL, preserving chat/audit history while permanently disconnecting
    it from this account (voice_clips cascades transitively via
    quiz_submissions). tracking_events has no FK to users at all (bare
    phone column) and is cleaned explicitly below.
    """
    redis = await get_redis()
    if redis is None:
        metrics.account_deletion_failures_total.labels(reason="redis_unavailable").inc()
        raise HTTPException(status_code=503, detail="try again shortly")
    try:
        await consume_reauth_token(
            redis, body.reauth_token,
            user_id=account.id, session_id=account.session_id, action=ACCOUNT_DELETE_ACTION,
        )
    except ReauthTokenError:
        metrics.account_deletion_failures_total.labels(reason="reverification_required").inc()
        raise HTTPException(status_code=401, detail="reverification required")

    deletion_id = uuid4()
    deleted_at = datetime.now(tz=timezone.utc)
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Revoke first — even if anything below the line fails, no
            # session should ever remain usable past this point.
            await revoke_all_sessions(conn, account.id)
            if account.phone:
                await conn.execute("DELETE FROM tracking_events WHERE phone = $1", account.phone)
            result = await conn.execute("DELETE FROM users WHERE id = $1", account.id)
            if result == "DELETE 0":
                metrics.account_deletion_failures_total.labels(reason="not_found").inc()
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="user not found",
                )

    # Force any still-active WebSocket connection closed immediately —
    # reuses the exact same control channel Phase 5's ban enforcement uses.
    redis_after = await get_redis()
    if redis_after is not None:
        try:
            await publish_ban_event(redis_after, account.id)
        except Exception as exc:  # noqa: BLE001 — best-effort, deletion already committed
            logger.warning("users.delete_ban_event_failed", deletion_id=str(deletion_id), error=type(exc).__name__)

    # Audit trail per the plan: deletion_id + former user UUID + completed_at
    # only — never phone/content — via the same structured-logging
    # convention used everywhere else in this codebase, not a new table.
    logger.info(
        "users.deleted", deletion_id=str(deletion_id),
        former_user_id=str(account.id), completed_at=deleted_at.isoformat(),
    )
    return UserDeleteResponse(id=account.id, deleted_at=deleted_at)


@router.post("/me/reset-for-testing", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def reset_me_for_testing(
    account: CurrentAccount = Depends(get_current_account),
    pool: asyncpg.Pool = Depends(get_pool),
) -> Response:
    """One-tap wipe for a TEST_PHONES account — no reauth token, no typed
    confirmation. Intentionally NOT the real DELETE /me: that flow exists so a
    genuine user can't have their account removed by a stolen access token
    alone, and this endpoint would defeat that protection for a real account.
    It stays safe by construction rather than by only being reachable from a
    hidden screen:

      - 404s outright when APP_ENV=='production' (same fail-closed shape as
        every other test-only affordance: SKIP_OTP_VERIFICATION, TEST_PHONES
        itself, DEV_PHONE — all hard-ignored in prod regardless of value).
      - 404s for any account whose phone isn't in the configured TEST_PHONES
        list, so even a leaked build pointed at a real backend can only ever
        wipe the handful of numbers an operator explicitly listed.

    Reuses reset_test_account — the exact function OTP verify already runs
    for TEST_RESET_PHONE — so "sign in again with 8000000001" and "tap Reset"
    leave the account in the identical state.
    """
    if settings.APP_ENV == "production" or not is_test_phone(account.phone or ""):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    async with pool.acquire() as conn:
        async with conn.transaction():
            await reset_test_account(conn, account.id)
            await revoke_all_sessions(conn, account.id)

    logger.info("users.reset_for_testing", user_id=str(account.id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
