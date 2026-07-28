-- 019_ai_usage_log.sql
--
-- Persisted per-call AI usage/cost — both providers already log token
-- counts via structlog (openai.call / claude.call) but nothing was written
-- to the DB, so there was no way to show spend in the admin panel. One row
-- per actual provider call (insights + deep_report per submission = 2 rows
-- per successful generation, more on retries).

CREATE TABLE ai_usage_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id   UUID NULL REFERENCES quiz_submissions(id) ON DELETE SET NULL,
    step            TEXT NOT NULL CHECK (step IN ('insights', 'deep_report')),
    provider        TEXT NOT NULL CHECK (provider IN ('openai', 'claude')),
    model_id        TEXT NOT NULL,
    effort          TEXT NULL,
    input_tokens    INTEGER NOT NULL,
    output_tokens   INTEGER NOT NULL,
    cost_usd        NUMERIC(10, 6) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_log_created_at ON ai_usage_log (created_at DESC);
CREATE INDEX idx_ai_usage_log_submission_id ON ai_usage_log (submission_id);
