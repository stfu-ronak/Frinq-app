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


_DEFAULT_MODEL_CONFIGS: dict[str, dict[str, Any]] = {
    "insights": {
        "step": "insights", "provider": "openai", "model_id": "gpt-5.5",
        "effort": "medium", "updated_at": datetime.now(timezone.utc), "updated_by": "test",
    },
    "deep_report": {
        "step": "deep_report", "provider": "openai", "model_id": "gpt-5.5",
        "effort": "medium", "updated_at": datetime.now(timezone.utc), "updated_by": "test",
    },
}


class _FakeQuizInsightsConnection:
    """In-memory quiz_submissions row + users.onboarding_state + community
    membership, mutated by the real SQL the task issues — mirrors the
    _FakeSessionConnection pattern used for session tests."""

    def __init__(
        self,
        submission: dict[str, Any],
        user_states: dict[Any, str],
        model_configs: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        self.submission = submission
        self.user_states = user_states
        self.communities: dict[Any, dict[str, Any]] = {}
        # display_name/gender/ncr_zone backfilled from answers on activation.
        self.user_profile: dict[Any, dict[str, Any]] = {}
        self.model_configs = model_configs if model_configs is not None else dict(_DEFAULT_MODEL_CONFIGS)
        self.usage_log_inserts: list[tuple[Any, ...]] = []

    def transaction(self) -> _NoopTransaction:
        return _NoopTransaction()

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        q = query.strip()
        if q.startswith("SELECT id, user_id, answers, status, share_card"):
            return dict(self.submission)
        if q.startswith("SELECT step, provider, model_id, effort, updated_at, updated_by"):
            (step,) = args
            config = self.model_configs.get(step)
            return dict(config) if config is not None else None
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
            if len(args) >= 2:
                self.submission["model_snapshot"] = args[1]
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
        elif q.startswith("UPDATE users SET") and "onboarding_state = 'active'" in q:
            # Activation also backfills display_name/gender/ncr_zone from the
            # quiz answers (COALESCE, so only where still NULL) — match on the
            # activation clause rather than the literal prefix so the double
            # doesn't break every time a column is added to that one statement.
            user_id = args[0]
            self.user_states[user_id] = "active"
            if len(args) >= 3:
                name, gender = args[1], args[2]
                g = (gender or "").strip().lower()
                self.user_profile[user_id] = {
                    "display_name": (name or "").strip() or None,
                    # Mirrors the SQL's CHECK-matching filter: anything outside
                    # the allowed set is dropped rather than written.
                    "gender": g if g in ("male", "female", "non_binary", "other") else None,
                }
        elif q.startswith("UPDATE quiz_submissions SET status='error'"):
            sid, error_msg = args
            self.submission["status"] = "error"
            self.submission["error_msg"] = error_msg
        elif q.startswith("UPDATE users SET onboarding_state='error'"):
            (user_id,) = args
            self.user_states[user_id] = "error"
        elif q.startswith("INSERT INTO ai_usage_log"):
            self.usage_log_inserts.append(args)
        return "OK"

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        # transcribe_submission_voice_clips's lookup — no fixture here ever
        # records a voice clip, so there's nothing to transcribe.
        q = query.strip()
        if q.startswith("SELECT question_key, audio_data, mime_type FROM voice_clips"):
            return []
        return []


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
        # Age of the row's last write. Defaults to "just written", i.e. a
        # status='processing' row is treated as genuinely in flight; override
        # it to something past STALE_PROCESSING_AFTER_S to model a row
        # stranded by a worker that died without marking it.
        "updated_age_s": 0.0,
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

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
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

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        return _ai_result("not-a-real-archetype")

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
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

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        call_count["n"] += 1
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
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

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        call_count["n"] += 1
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        call_count["n"] += 1
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    assert call_count["n"] == 0
    assert conn.submission["status"] == "processing"  # left untouched for the live job
    assert user_id not in conn.communities


async def test_activation_backfills_profile_columns_from_the_quiz_answers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """users.display_name/gender/ncr_zone are otherwise written ONLY by
    PATCH /users/me during onboarding, while the summary reads the name from
    the quiz answers. Two sources for one fact: when that PATCH is skipped or
    fails, the summary greets the user by name while the profile screen shows
    'your profile' and a column of em-dashes forever, with no way to recover.
    Activation backfills the NULLs from the answers we already have."""
    user_id = uuid4()
    submission = _submission_row(
        user_id,
        answers=json.dumps({"name": "Dhairya", "gender": "male", "city": "Gurgaon"}),
    )
    conn = _FakeQuizInsightsConnection(submission, {})
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    assert conn.user_states[user_id] == "active"
    assert conn.user_profile[user_id] == {"display_name": "Dhairya", "gender": "male"}


async def test_stale_processing_row_is_reclaimed_not_skipped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression: the in-flight guard skipped on status='processing' with no
    staleness check. A worker killed hard (OOM, deploy restart, or ARQ's own
    job_timeout — which cancels via CancelledError, a BaseException that the
    `except Exception` handlers never caught) left the row at 'processing'
    forever, and every recovery path refused it: /quiz/retry required
    'error', admin retry-ai no-opped on 'processing'. The user's onboarding
    stayed pinned at profile_processing permanently. Past the staleness
    window no legitimate job can still be running, so a redelivered job must
    take the row over and finish it."""
    user_id = uuid4()
    submission = _submission_row(
        user_id,
        status="processing",
        updated_age_s=quiz_insights_module.STALE_PROCESSING_AFTER_S + 60,
    )
    conn = _FakeQuizInsightsConnection(submission, {})
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    assert conn.submission["status"] == "done"
    assert user_id in conn.communities


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

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
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

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        call_count["n"] += 1
        return result

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        call_count["n"] += 1
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    assert call_count["n"] == 0
    assert conn.communities[user_id]["archetype_slug"] == "quiet-storm"
    assert conn.user_states[user_id] == "active"


async def test_model_snapshot_is_written_once_at_job_start(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    submission = _submission_row(user_id)
    conn = _FakeQuizInsightsConnection(submission, {})
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    seen_configs: dict[str, dict[str, Any]] = {}

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        seen_configs["insights"] = kwargs["model_config"]
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        seen_configs["deep_report"] = kwargs["model_config"]
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    assert seen_configs["insights"]["model_id"] == "gpt-5.5"
    assert seen_configs["deep_report"]["model_id"] == "gpt-5.5"
    snapshot = json.loads(conn.submission["model_snapshot"])
    assert snapshot["insights"]["model_id"] == "gpt-5.5"
    assert snapshot["deep_report"]["model_id"] == "gpt-5.5"


async def test_admin_switch_mid_flight_does_not_affect_the_in_flight_job(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The single most important guarantee of the model-config feature: a job
    that has already snapshotted its config (i.e. is already past the
    'processing' write) must keep using that snapshot for its ENTIRE run, even
    if an admin PATCHes ai_model_config while the job's AI calls are still in
    flight. A job started AFTER the switch must use the new config.

    Simulated here by having the fake generate_insights callable itself flip
    conn.model_configs mid-call — standing in for "the admin fires a PATCH
    while this job's slow provider call is still outstanding."""
    user_id = uuid4()
    submission = _submission_row(user_id)
    conn = _FakeQuizInsightsConnection(submission, {})
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        # Simulate an admin PATCH landing while this job's own insights call
        # is still outstanding.
        conn.model_configs["insights"] = {
            "step": "insights", "provider": "claude", "model_id": "claude-opus-5",
            "effort": "high", "updated_at": datetime.now(timezone.utc), "updated_by": "admin",
        }
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    # The in-flight job's own snapshot (and its ai_usage_log row) must reflect
    # the OLD config, never the switch that happened mid-call.
    snapshot = json.loads(conn.submission["model_snapshot"])
    assert snapshot["insights"]["model_id"] == "gpt-5.5"

    # A brand-new job (new submission) started after the switch must read the
    # NEW config — the live-config table itself was genuinely updated.
    second_user_id = uuid4()
    second_submission = _submission_row(second_user_id)
    conn.submission, conn.user_states = second_submission, conn.user_states
    # Reuse the same connection/pool (same live ai_model_config table) for a
    # second, independent submission row.
    second_conn = _FakeQuizInsightsConnection(
        second_submission, conn.user_states, model_configs=conn.model_configs,
    )
    second_pool = _FakeQuizInsightsPool(second_conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: second_pool)

    later_configs: dict[str, dict[str, Any]] = {}

    async def _fake_insights_2(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        later_configs["insights"] = kwargs["model_config"]
        return _ai_result("quiet-storm")

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights_2)

    await generate_quiz_insights({}, str(second_submission["id"]))

    assert later_configs["insights"]["model_id"] == "claude-opus-5"
    assert later_configs["insights"]["provider"] == "claude"


async def test_usage_recorder_logs_cost_against_the_snapshotted_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    submission = _submission_row(user_id)
    conn = _FakeQuizInsightsConnection(submission, {}, model_configs={
        "insights": {
            "step": "insights", "provider": "claude", "model_id": "claude-opus-5",
            "effort": "high", "updated_at": datetime.now(timezone.utc), "updated_by": "admin",
        },
        "deep_report": dict(_DEFAULT_MODEL_CONFIGS["deep_report"]),
    })
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        await kwargs["usage_recorder"](1_000_000, 500_000)
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    assert len(conn.usage_log_inserts) == 1
    (sid, step, provider, model_id, effort, input_tokens, output_tokens, cost) = conn.usage_log_inserts[0]
    assert step == "insights"
    assert provider == "claude"
    assert model_id == "claude-opus-5"
    assert input_tokens == 1_000_000
    assert output_tokens == 500_000
    # claude-opus-5: $5.00/$25.00 per MTok -> 1*5.00 + 0.5*25.00 = 17.50
    assert cost == pytest.approx(17.50)


async def test_usage_recorder_falls_back_to_zero_cost_for_unknown_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A snapshot can reference a model that's since been retired from
    model_pricing.py's catalog (an old ai_usage_log row, or a config that was
    live before a code deploy dropped a model). The recorder must still log
    the usage row rather than lose it or crash — just with cost 0.0."""
    user_id = uuid4()
    submission = _submission_row(user_id)
    conn = _FakeQuizInsightsConnection(submission, {}, model_configs={
        "insights": {
            "step": "insights", "provider": "openai", "model_id": "gpt-4-retired-model",
            "effort": None, "updated_at": datetime.now(timezone.utc), "updated_by": "admin",
        },
        "deep_report": dict(_DEFAULT_MODEL_CONFIGS["deep_report"]),
    })
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        await kwargs["usage_recorder"](1000, 500)
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    assert len(conn.usage_log_inserts) == 1
    cost = conn.usage_log_inserts[0][-1]
    assert cost == 0.0
    # The generation itself must still complete normally — an unknown model
    # for cost purposes is not a generation failure.
    assert conn.submission["status"] == "done"


async def test_deep_report_failure_still_records_insights_usage_and_completes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """generate_insights succeeding while generate_deep_report raises is an
    existing, expected outcome (the submission still completes with
    deep_summary=None) — this phase's usage-recording must not regress that:
    the insights call's usage row must still be written even though its
    sibling task failed."""
    user_id = uuid4()
    submission = _submission_row(user_id)
    conn = _FakeQuizInsightsConnection(submission, {})
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        await kwargs["usage_recorder"](500, 200)
        return _ai_result("quiet-storm")

    async def _fake_deep_report(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        raise RuntimeError("provider timeout")

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)
    monkeypatch.setattr(quiz_insights_module, "generate_deep_report", _fake_deep_report)

    await generate_quiz_insights({}, str(submission["id"]))

    assert conn.submission["status"] == "done"
    assert conn.submission["deep_summary"] is None
    assert len(conn.usage_log_inserts) == 1
    assert conn.usage_log_inserts[0][1] == "insights"


async def test_missing_model_config_marks_submission_error_not_stuck_processing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If ai_model_config is missing a row for a step (e.g. a partially
    applied migration), get_active_model_config raises InvalidModelConfigError.
    This must be caught and routed through the normal error path — never left
    to propagate out of the task and strand the submission silently."""
    user_id = uuid4()
    submission = _submission_row(user_id)
    conn = _FakeQuizInsightsConnection(submission, {}, model_configs={})
    pool = _FakeQuizInsightsPool(conn)
    monkeypatch.setattr(quiz_insights_module, "get_pool", lambda: pool)

    async def _fake_insights(answers: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("must not be called — config read fails first")

    monkeypatch.setattr(quiz_insights_module, "generate_insights", _fake_insights)

    await generate_quiz_insights({}, str(submission["id"]))

    assert conn.submission["status"] == "error"
    assert conn.submission["error_msg"] == "InvalidModelConfigError"
    assert conn.user_states[user_id] == "error"
