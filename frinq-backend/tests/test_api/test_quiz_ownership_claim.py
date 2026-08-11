"""/quiz/start is pre-auth and inserts `user_id IS NULL`; OTP verify backfills
it by phone. Reordering the journey so the quiz begins AFTER auth broke that
handoff silently — the backfill had already run by the time the row existed, so
it stayed unowned and every /quiz/complete answered 404 forever ("Couldn't
submit your answers", with no retry path because retry_quiz needs status
'error'). Three rows in the dev DB were stuck exactly this way.

These cover the claim's SAFETY property, which is the part worth pinning: it
adopts a row only when the phone is the caller's own.
"""

import re
from uuid import uuid4

import pytest

from app.api.v1.quiz import _claim_unowned_submission


class _FakeAccount:
    def __init__(self, phone):
        self.id = uuid4()
        self.phone = phone


class _FakeConn:
    """Records the UPDATE and evaluates its WHERE against one in-memory row."""

    def __init__(self, row):
        self.row = row
        self.executed = 0

    async def execute(self, sql, user_id, submission_id, digits):
        self.executed += 1
        r = self.row
        row_digits = re.sub(r"\D", "", r["phone"] or "")[-10:]
        if r["id"] == submission_id and r["user_id"] is None and row_digits == digits:
            r["user_id"] = user_id


def _row(phone, user_id=None):
    return {"id": uuid4(), "phone": phone, "user_id": user_id}


@pytest.mark.asyncio
async def test_claims_an_unowned_row_whose_phone_matches():
    account = _FakeAccount("8000000001")
    row = _row("8000000001")
    conn = _FakeConn(row)

    await _claim_unowned_submission(conn, row["id"], account)

    assert row["user_id"] == account.id


@pytest.mark.asyncio
async def test_matches_on_the_last_ten_digits_so_formatting_never_blocks_it():
    account = _FakeAccount("+91 80000-00001")
    row = _row("8000000001")
    conn = _FakeConn(row)

    await _claim_unowned_submission(conn, row["id"], account)

    assert row["user_id"] == account.id


@pytest.mark.asyncio
async def test_never_claims_another_phones_submission():
    """Without the phone check this would be a way to take over any unowned
    submission by guessing its UUID."""
    account = _FakeAccount("8000000001")
    row = _row("9999999999")
    conn = _FakeConn(row)

    await _claim_unowned_submission(conn, row["id"], account)

    assert row["user_id"] is None


@pytest.mark.asyncio
async def test_never_steals_a_row_that_already_has_an_owner():
    owner = uuid4()
    account = _FakeAccount("8000000001")
    row = _row("8000000001", user_id=owner)
    conn = _FakeConn(row)

    await _claim_unowned_submission(conn, row["id"], account)

    assert row["user_id"] == owner


@pytest.mark.asyncio
async def test_does_not_even_issue_the_update_without_a_caller_phone():
    account = _FakeAccount("")
    row = _row("8000000001")
    conn = _FakeConn(row)

    await _claim_unowned_submission(conn, row["id"], account)

    assert conn.executed == 0
    assert row["user_id"] is None
