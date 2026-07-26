from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest

from app.workers.tasks import quiz_insights as quiz_insights_module
from app.workers.tasks.quiz_insights import generate_quiz_insights


class _NoopTransaction:
    async def __aenter__(self) -> "_NoopTransaction":
        return self

    async def __aexit__(self, *exc: Any) -> bool:
        return False


class _FakeQuizInsightsConnection:
    """In-memory quiz_submissions row + users.onboarding_state + community
    membership, mutated by the real SQL the task issues — mirrors the
    _FakeSessionConnection pattern used for session tests."""

    def __init__(self, submission: dict[str, Any], user_states: dict[Any, str]) -> None:
        self.submission = submission
        self.user_states = user_states
        self.communities: dict[Any, dict[str, Any]] = {}

    def transaction(self) -> _NoopTransaction:
        return _NoopTransaction()

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        q = query.strip()
        if q.startswith("SELECT id, user_id, answers, status, share_card"):
            return dict(self.submission)
        if q.startswith("SELECT archetype_slug, user_id, muted, joined_at"):
            (user_id,) = args
            membership = self.communities.get(user_id)
            return dict(membership) if membership is not None else None
        if q.startswith("INSERT INTO community_members"):
            archetype_slug, user_id = args
            row = {
                "archetype_slug": archetype_slug,
                "user_id": user_id,
                "muted": True,
                "joined_at": datetime.now(timezone.utc),
            }
            self.communities[user_id] = row
            return dict(row)
        return None

    async def execute(self, query: str, *args: Any) -> str:
        q = query.strip()
        if q.startswith("UPDATE quiz_submissions SET status='processing'"):
            self.submission["status"] = "processing"
        elif q.startswith("UPDATE users SET onboarding_state='profile_processing'"):
            (user_id,) = args
            self.user_states[user_id] = "profile_processing"
        elif q.startswith("UPDATE quiz_submissions SET\n") or q.startswith("UPDATE quiz_submissions SET status = 'done'"):
            (sid, headline, spirit_animal, spirit_desc, insights, tags, share_card, deep_summary, slug) = args
            self.submission.update({
                "status": "done",
                "headline": headline,
                "spirit_animal": spirit_animal,
                "spirit_desc": spirit_desc,
                "insights": insights,
                "tags": tags,
                "share_card": share_card,
                "deep_summary": deep_summary,
                "archetype_slug": slug,
            })
        elif q.startswith("UPDATE users SET onboarding_state = 'active'"):
            (user_id,) = args
            self.user_states[user_id] = "active"
        elif q.startswith("UPDATE quiz_submissions SET status='error'"):
            sid, error_msg = args
            self.submission["status"] = "error"
            self.submission["error_msg"] = error_msg
        elif q.startswith("UPDATE users SET onboarding_state='error'"):
            (user_id,) = args
            self.user_states[user_id] = "error"
        return "OK"


class _FakeCtx:
    def __init__(self, conn: Any) -> None:
        self.conn = conn

    async def __aenter__(self) -> Any:
        return self.conn

    async def __aexit__(self, *exc: Any) -> bool:
        return False


class _FakeQuizInsightsPool:
    """Always hands back the SAME connection instance — mirrors a real pool
    where every acquire() sees the same underlying database state."""

    def __init__(self, conn: Any) -> None:
        self.conn = conn

    def acquire(self) -> _FakeCtx:
        return _FakeCtx(self.conn)


def _submission_row(user_id: Any, **overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "id": uuid4(),
        "user_id": user_id,
        "answers": json.dumps({"q1": "a"}),
        "status": "pending",
        "share_card": None,
        "headline": None,
        "spirit_animal": None,
        "spirit_desc": None,
        "insights": None,
        "tags": [],
        "deep_summary": None,
    }
    row.update(overrides)
    return row


def _ai_result(archetype_slug: str) -> dict[str, Any]:
    return {
        "headline": "a bold headline",
        "spirit_animal": "Quiet Storm",
        "spirit_desc": "still water",
        "insights": [{"label": "x", "text": "y"}],
        "tags": ["calm"],
        "share_card": {"archetype_slug": archetype_slug, "archetype": "Quiet Storm"},
    }


async def test_success_activates_user_and_assigns_one_community(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    submission = _submission_row(user_id)
    conn = _FakeQuizInsightsConnection(submission, {})
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    async def _fake_insights(answers: dict[str, Any]) -> dict[str, Any]:
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any]) -> dict[str, Any]:
        return {"mirror": "..."}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    assert conn.submission["status"] == "done"
    assert conn.submission["archetype_slug"] == "quiet-storm"
    assert conn.user_states[user_id] == "active"
    assert conn.communities[user_id]["archetype_slug"] == "quiet-storm"


async def test_invalid_archetype_fails_without_activation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    submission = _submission_row(user_id)
    conn = _FakeQuizInsightsConnection(submission, {})
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    async def _fake_insights(answers: dict[str, Any]) -> dict[str, Any]:
        return _ai_result("not-a-real-archetype")

    async def _fake_deep_report(answers: dict[str, Any]) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    assert conn.submission["status"] == "error"
    assert conn.user_states[user_id] == "error"
    assert user_id not in conn.communities


async def test_rerun_is_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    user_id = uuid4()
    submission = _submission_row(user_id)
    conn = _FakeQuizInsightsConnection(submission, {})
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    call_count = {"n": 0}

    async def _fake_insights(answers: dict[str, Any]) -> dict[str, Any]:
        call_count["n"] += 1
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any]) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))
    await generate_quiz_insights({}, str(submission["id"]))

    assert call_count["n"] == 1
    assert len(conn.communities) == 1


async def test_processing_status_skips_to_avoid_double_charge(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A duplicate job (e.g. a double-tapped /quiz/complete enqueuing twice)
    # that runs while the first job is still mid-flight must NOT re-run the
    # paid AI calls — the FOR UPDATE lock serialises it behind the first job's
    # status='processing' write, and it should bail out there.
    user_id = uuid4()
    submission = _submission_row(user_id, status="processing")
    conn = _FakeQuizInsightsConnection(submission, {})
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    call_count = {"n": 0}

    async def _fake_insights(answers: dict[str, Any]) -> dict[str, Any]:
        call_count["n"] += 1
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any]) -> dict[str, Any]:
        call_count["n"] += 1
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    assert call_count["n"] == 0
    assert conn.submission["status"] == "processing"  # left untouched for the live job
    assert user_id not in conn.communities


class _FakeConnectionThatFailsFinalCommit(_FakeQuizInsightsConnection):
    """Simulates an unexpected DB-layer failure (not UnknownArchetypeError/
    CommunityAssignmentError) during the final commit — e.g. a dropped
    connection or a UNIQUE-constraint race on community_members."""

    async def execute(self, query: str, *args: Any) -> str:
        if query.strip().startswith("UPDATE quiz_submissions SET\n"):
            raise RuntimeError("connection reset by peer, includes raw model output XYZ")
        return await super().execute(query, *args)


async def test_unexpected_final_commit_failure_is_sanitized_and_recoverable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    submission = _submission_row(user_id)
    conn = _FakeConnectionThatFailsFinalCommit(submission, {})
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    async def _fake_insights(answers: dict[str, Any]) -> dict[str, Any]:
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any]) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    # Must not raise, must not get stuck at 'processing' with no error path.
    assert conn.submission["status"] == "error"
    assert conn.user_states[user_id] == "error"
    # Sanitized: the exception TYPE name only, never its message content
    # (which here deliberately contains something that looks like leaked data).
    assert conn.submission["error_msg"] == "RuntimeError"
    assert "raw model output" not in conn.submission["error_msg"]
    assert user_id not in conn.communities


async def test_existing_done_result_assigns_without_second_model_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    result = _ai_result("quiet-storm")
    submission = _submission_row(
        user_id,
        status="done",
        headline=result["headline"],
        spirit_animal=result["spirit_animal"],
        spirit_desc=result["spirit_desc"],
        insights=json.dumps(result["insights"]),
        tags=result["tags"],
        share_card=json.dumps(result["share_card"]),
    )
    conn = _FakeQuizInsightsConnection(submission, {})
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    call_count = {"n": 0}

    async def _fake_insights(answers: dict[str, Any]) -> dict[str, Any]:
        call_count["n"] += 1
        return result

    async def _fake_deep_report(answers: dict[str, Any]) -> dict[str, Any]:
        call_count["n"] += 1
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    assert call_count["n"] == 0
    assert conn.communities[user_id]["archetype_slug"] == "quiet-storm"
    assert conn.user_states[user_id] == "active"
