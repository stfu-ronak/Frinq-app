"""Task 46 Step 3 — minimum-viable metrics registry.

A single private CollectorRegistry (not the global default one) so tests can
import this module repeatedly without prometheus_client's "duplicated metric"
errors across test runs, and so a real deploy never accidentally mixes in
metrics some other library registers against the default registry.

Every counter/gauge/histogram here maps directly to one item in the launch
plan's Task 46 Step 3 list. Values are set/observed at the real call sites
(otp.py, session.py, quiz_insights.py, realtime.py, push.py, users.py,
redis_client.py, queue.py) — this module only defines the instruments and the
render() entrypoint.
"""

from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Gauge, Histogram, generate_latest

REGISTRY = CollectorRegistry()

http_requests_total = Counter(
    "http_requests_total", "HTTP requests by route template and status",
    ["method", "route", "status"], registry=REGISTRY,
)
http_request_duration_seconds = Histogram(
    "http_request_duration_seconds", "HTTP request latency by route template",
    ["route"], registry=REGISTRY,
)

db_pool_connections_in_use = Gauge(
    "db_pool_connections_in_use", "asyncpg pool connections currently checked out", registry=REGISTRY,
)
db_pool_connections_max = Gauge(
    "db_pool_connections_max", "asyncpg pool max size", registry=REGISTRY,
)

redis_failures_total = Counter(
    "redis_failures_total", "Redis/ARQ operation failures by call site", ["source"], registry=REGISTRY,
)

otp_requests_total = Counter(
    "otp_requests_total", "OTP request/verify outcomes",
    ["outcome"], registry=REGISTRY,
)  # outcome: rate_limited | rate_limit_unavailable | sent | send_failed |
   #          verified | verify_wrong_code | verify_expired | verify_timeout

refresh_reuse_detected_total = Counter(
    "refresh_reuse_detected_total", "Rotating refresh-token reuse detected", registry=REGISTRY,
)

quiz_jobs_total = Counter(
    "quiz_jobs_total", "Quiz-insights job outcomes", ["outcome"], registry=REGISTRY,
)  # outcome: done | failed
quiz_job_wait_seconds = Histogram(
    "quiz_job_wait_seconds", "Time a quiz-insights job waited in the queue before starting", registry=REGISTRY,
)

active_websockets = Gauge(
    "community_active_websockets", "Currently connected community WebSocket clients", registry=REGISTRY,
)

chat_message_outcomes_total = Counter(
    "chat_message_outcomes_total", "Inbound chat message accept/reject outcomes",
    ["outcome"], registry=REGISTRY,
)  # outcome: accepted | rate_limited | rejected_moderation | error

moderation_reports_open = Gauge(
    "moderation_reports_open", "Open (unreviewed) message reports", registry=REGISTRY,
)

push_send_outcomes_total = Counter(
    "push_send_outcomes_total", "Push notification send outcomes",
    ["outcome"], registry=REGISTRY,
)  # outcome: success | invalid_token | error | timeout

account_deletion_failures_total = Counter(
    "account_deletion_failures_total", "Failed account-deletion attempts",
    ["reason"], registry=REGISTRY,
)

feature_disabled_rejections_total = Counter(
    "feature_disabled_rejections_total",
    "Requests rejected because a server-side failure switch (Task 47 Step 5) is on",
    ["feature"], registry=REGISTRY,
)  # feature: otp_request | quiz_start | chat_send | push_send


def render() -> tuple[bytes, str]:
    """Renders the registry in Prometheus text exposition format."""
    return generate_latest(REGISTRY), CONTENT_TYPE_LATEST
