from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.core.age_gate import AgeGateError, validate_frinq_dob


def _fmt(d) -> str:
    return d.strftime("%d/%m/%Y")


def test_rejects_impossible_calendar_date() -> None:
    with pytest.raises(AgeGateError) as exc_info:
        validate_frinq_dob("31/02/2000")
    assert exc_info.value.code == "invalid_date"


def test_rejects_garbage_input() -> None:
    with pytest.raises(AgeGateError) as exc_info:
        validate_frinq_dob("not-a-date")
    assert exc_info.value.code == "invalid_date"


def test_rejects_future_date() -> None:
    tomorrow = datetime.now(timezone.utc).date() + timedelta(days=1)
    with pytest.raises(AgeGateError) as exc_info:
        validate_frinq_dob(_fmt(tomorrow))
    assert exc_info.value.code == "invalid_date"


def test_rejects_under_18() -> None:
    today = datetime.now(timezone.utc).date()
    seventeen_years_ago = today.replace(year=today.year - 17)
    with pytest.raises(AgeGateError) as exc_info:
        validate_frinq_dob(_fmt(seventeen_years_ago))
    assert exc_info.value.code == "must_be_18"


def test_accepts_18th_birthday_today() -> None:
    today = datetime.now(timezone.utc).date()
    exactly_18 = today.replace(year=today.year - 18)
    validate_frinq_dob(_fmt(exactly_18))  # must not raise


def test_accepts_well_over_18() -> None:
    today = datetime.now(timezone.utc).date()
    thirty_years_ago = today.replace(year=today.year - 30)
    validate_frinq_dob(_fmt(thirty_years_ago))  # must not raise
