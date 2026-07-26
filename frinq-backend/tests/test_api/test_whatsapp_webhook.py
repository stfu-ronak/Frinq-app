"""Twilio inbound webhook must reject forged (unsigned) requests.

Without X-Twilio-Signature validation anyone can POST /whatsapp/inbound and
forge RSVP rows / inject stored content into the admin inbox for any phone.
"""
from __future__ import annotations

import pytest
from twilio.request_validator import RequestValidator

from app.config import settings

INBOUND = "/api/v1/whatsapp/inbound"
_FORM = {"From": "whatsapp:+919999999999", "ButtonPayload": "rsvp_yes"}


async def test_inbound_rejects_forged_request_when_token_set(client, fake_pool, monkeypatch):
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "real-token")
    monkeypatch.setattr(settings, "APP_ENV", "production")

    resp = await client.post(INBOUND, data=_FORM)  # no signature header

    assert resp.status_code == 403
    # Fail closed BEFORE any DB write.
    assert fake_pool.store.queries == []


async def test_inbound_rejects_bad_signature(client, fake_pool, monkeypatch):
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "real-token")
    monkeypatch.setattr(settings, "APP_ENV", "production")

    resp = await client.post(INBOUND, data=_FORM, headers={"X-Twilio-Signature": "wrong"})

    assert resp.status_code == 403
    assert fake_pool.store.queries == []


async def test_inbound_accepts_valid_signature(client, fake_pool, monkeypatch):
    token = "real-token"
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", token)
    monkeypatch.setattr(settings, "APP_ENV", "production")

    # Handler rebuilds the URL from proto+host; ASGITransport uses http://test.
    url = "http://test" + INBOUND
    signature = RequestValidator(token).compute_signature(url, _FORM)

    resp = await client.post(INBOUND, data=_FORM, headers={"X-Twilio-Signature": signature})

    assert resp.status_code == 200
    assert "xml" in resp.headers["content-type"]
    # The RSVP was recorded → the DB was written.
    assert any("quiz_submissions" in q for q, _ in fake_pool.store.queries)


async def test_inbound_allowed_without_token_in_dev(client, monkeypatch):
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "")
    monkeypatch.setattr(settings, "APP_ENV", "development")

    resp = await client.post(INBOUND, data=_FORM)

    assert resp.status_code == 200
