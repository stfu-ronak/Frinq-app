"""Task 46 Step 2 — proves the structured-log redactor actually strips
planted secrets/user content, not just that it exists. Exercises the
processor function directly (structlog processors are pure event_dict ->
event_dict transforms) rather than capturing real stdout output.
"""

from __future__ import annotations

from app.utils.logger import redact_processor


def test_forbidden_keys_are_replaced_regardless_of_value() -> None:
    event = {
        "event": "auth.login",
        "authorization": "Bearer super-secret-access-token",
        "refresh_token": "r-abc123",
        "phone": "+919876543210",
        "password": "hunter2",
        "push_token": "fcm-device-token-xyz",
        "message_body": "hey, are you free tonight?",
        "answers": {"q1": "yes"},
    }
    out = redact_processor(None, "info", event)
    assert out["authorization"] == "[redacted]"
    assert out["refresh_token"] == "[redacted]"
    assert out["phone"] == "[redacted]"
    assert out["password"] == "[redacted]"
    assert out["push_token"] == "[redacted]"
    assert out["message_body"] == "[redacted]"
    assert out["answers"] == "[redacted]"
    assert out["event"] == "auth.login"  # untouched, not a sensitive key


def test_a_real_error_code_survives_untouched() -> None:
    # The plan explicitly requires "sanitized error code" to be LOGGED, not
    # redacted — a naive substring match on "code" would wrongly eat this.
    event = {"event": "otp.verify_failed", "error_code": "invalid_code", "status_code": 400}
    out = redact_processor(None, "info", event)
    assert out["error_code"] == "invalid_code"
    assert out["status_code"] == 400


def test_a_phone_number_embedded_in_a_plain_string_value_is_redacted() -> None:
    # The realistic leak path: not a field literally named "phone", but a
    # phone number pasted into an unrelated string (an exception message).
    event = {"event": "otp.send_failed", "exception": "ValueError: invalid phone +919876543210 supplied"}
    out = redact_processor(None, "info", event)
    assert "9876543210" not in out["exception"]
    assert "[redacted]" in out["exception"]


def test_a_bearer_token_embedded_in_a_plain_string_value_is_redacted() -> None:
    event = {"event": "debug", "note": "outbound call used Bearer sk-live-abcdefghijklmnopqrstuvwxyz"}
    out = redact_processor(None, "info", event)
    assert "abcdefghijklmnopqrstuvwxyz" not in out["note"]


def test_a_jwt_shaped_value_is_redacted() -> None:
    jwt_like = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc123signature"
    event = {"event": "debug", "note": f"token was {jwt_like}"}
    out = redact_processor(None, "info", event)
    assert jwt_like not in out["note"]
    assert "[redacted]" in out["note"]


def test_a_pem_private_key_is_redacted() -> None:
    pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC\n-----END PRIVATE KEY-----"
    event = {"event": "debug", "note": f"leaked: {pem}"}
    out = redact_processor(None, "info", event)
    assert "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC" not in out["note"]


def test_redaction_is_recursive_into_nested_dicts_and_lists() -> None:
    event = {
        "event": "webhook.payload",
        "context": {"user": {"authorization": "Bearer abc", "note": "call +919876543210 now"}},
        "history": [{"refresh_token": "r1"}, {"safe_field": "fine"}],
    }
    out = redact_processor(None, "info", event)
    assert out["context"]["user"]["authorization"] == "[redacted]"
    assert "9876543210" not in out["context"]["user"]["note"]
    assert out["history"][0]["refresh_token"] == "[redacted]"
    assert out["history"][1]["safe_field"] == "fine"


def test_a_key_variant_with_hyphens_or_different_case_is_still_caught() -> None:
    event = {"event": "http.request", "Authorization": "Bearer abc", "Refresh-Token": "r1"}
    out = redact_processor(None, "info", event)
    assert out["Authorization"] == "[redacted]"
    assert out["Refresh-Token"] == "[redacted]"
