"""Server-side authority for the quiz's date-of-birth field. The frontend
mirrors these rules for immediate feedback, but only this check can reject
a submission — never infer adulthood from a year alone."""

from __future__ import annotations

from datetime import datetime, timezone


class AgeGateError(Exception):
    """Raised with a stable code the client can key UI copy off of:
    'invalid_date' (unparseable or impossible calendar date, or in the
    future) or 'must_be_18' (a real, past date but under 18)."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def validate_frinq_dob(raw: str) -> None:
    try:
        dob = datetime.strptime(raw.strip(), "%d/%m/%Y").date()
    except ValueError as exc:
        raise AgeGateError("invalid_date") from exc

    today = datetime.now(tz=timezone.utc).date()
    if dob > today:
        raise AgeGateError("invalid_date")

    # Tuple comparison sidesteps constructing a Feb-29 18th-birthday date
    # (which would raise ValueError in a non-leap year) — a birthday-today
    # match still satisfies >=, per the server-UTC-date requirement.
    eighteenth = (dob.year + 18, dob.month, dob.day)
    current = (today.year, today.month, today.day)
    if current < eighteenth:
        raise AgeGateError("must_be_18")
