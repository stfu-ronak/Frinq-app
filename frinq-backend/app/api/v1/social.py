"""Social verification — LinkedIn OAuth (OpenID Connect).

GET  /api/v1/social/linkedin/start?phone=<digits>   → returns OAuth URL
POST /api/v1/social/linkedin/verify                  → exchange code, store verification
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import asyncpg
import httpx
from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel

from app.api.deps import get_pool
from app.config import settings
from app.utils.logger import logger

router = APIRouter(prefix="/social", tags=["social"])

_JWT_ALG = "HS256"
_LI_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
_LI_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
_LI_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"


def _make_state(phone: str) -> str:
    now = datetime.now(tz=timezone.utc)
    return jwt.encode(
        {"sub": phone, "type": "li_state", "exp": int((now + timedelta(minutes=15)).timestamp())},
        settings.SECRET_KEY,
        algorithm=_JWT_ALG,
    )


def _decode_state(state: str) -> str:
    try:
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[_JWT_ALG])
        if payload.get("type") != "li_state":
            raise ValueError("wrong type")
        return str(payload["sub"])
    except (JWTError, ValueError, KeyError):
        raise HTTPException(status_code=400, detail="Invalid OAuth state — try again.")


def _verify_phone_token(token: str, expected_phone: str) -> None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[_JWT_ALG])
        if payload.get("sub") != expected_phone or payload.get("type") != "phone_verified":
            raise ValueError
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Phone token invalid or expired.")


# ─── Schemas ──────────────────────────────────────────────────────────────────

class LinkedInStartResponse(BaseModel):
    url: str


class LinkedInVerifyRequest(BaseModel):
    code: str
    state: str
    phone_token: str


class LinkedInVerifyResponse(BaseModel):
    verified: bool
    linkedin_name: str | None = None


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/linkedin/start", response_model=LinkedInStartResponse)
async def linkedin_start(phone: str) -> LinkedInStartResponse:
    """Generate LinkedIn OAuth authorization URL."""
    if not settings.LINKEDIN_CLIENT_ID:
        raise HTTPException(status_code=503, detail="LinkedIn OAuth not configured.")

    state = _make_state(phone)
    params = {
        "response_type": "code",
        "client_id": settings.LINKEDIN_CLIENT_ID,
        "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
        "scope": "openid profile email",
        "state": state,
    }
    return LinkedInStartResponse(url=f"{_LI_AUTH_URL}?{urlencode(params)}")


@router.post("/linkedin/verify", response_model=LinkedInVerifyResponse)
async def linkedin_verify(
    body: LinkedInVerifyRequest,
    pool: asyncpg.Pool = Depends(get_pool),
) -> LinkedInVerifyResponse:
    # 1. Decode state → phone
    phone = _decode_state(body.state)

    # 2. Validate phone token
    _verify_phone_token(body.phone_token, phone)

    # 3. Exchange authorization code for access token
    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(
            _LI_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": body.code,
                "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
                "client_id": settings.LINKEDIN_CLIENT_ID,
                "client_secret": settings.LINKEDIN_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if not token_resp.is_success:
            logger.error("linkedin.token_exchange_failed", status=token_resp.status_code)
            raise HTTPException(status_code=400, detail="LinkedIn token exchange failed.")

        access_token: str = token_resp.json()["access_token"]

        # 4. Fetch user info (OIDC userinfo endpoint)
        info_resp = await client.get(
            _LI_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if not info_resp.is_success:
            raise HTTPException(status_code=400, detail="Could not fetch LinkedIn profile.")

        info = info_resp.json()

    linkedin_sub: str = info.get("sub", "")
    linkedin_name: str | None = info.get("name") or info.get("given_name")

    # 5. Persist verification on most recent quiz submission for this phone
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE quiz_submissions
               SET linkedin_verified = TRUE, linkedin_sub = $2, updated_at = now()
               WHERE id = (
                   SELECT id FROM quiz_submissions
                   WHERE phone = $1
                   ORDER BY created_at DESC
                   LIMIT 1
               )""",
            phone,
            linkedin_sub,
        )

    logger.info("linkedin.verified", phone=phone[:4] + "****")
    return LinkedInVerifyResponse(verified=True, linkedin_name=linkedin_name)
