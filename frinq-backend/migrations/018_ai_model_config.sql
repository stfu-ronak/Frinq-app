-- 018_ai_model_config.sql
--
-- Admin-controlled AI provider/model/effort selection for the two quiz
-- generation steps (hero-card "insights" and "deep_report"), replacing the
-- hardcoded settings.INSIGHTS_PROVIDER / settings.OPENAI_MODEL globals with
-- a live-editable DB row. Seeded with today's actual defaults so shipping
-- this migration changes nothing until an admin touches it.
--
-- quiz_submissions.model_snapshot records exactly which provider/model/effort
-- generated that submission's result — read once by generate_quiz_insights
-- at the moment it starts processing (not re-read mid-run), so an admin
-- config change never affects a job already in flight.

CREATE TABLE ai_model_config (
    step        TEXT PRIMARY KEY CHECK (step IN ('insights', 'deep_report')),
    provider    TEXT NOT NULL CHECK (provider IN ('openai', 'claude')),
    model_id    TEXT NOT NULL,
    effort      TEXT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  TEXT NOT NULL
);

INSERT INTO ai_model_config (step, provider, model_id, effort, updated_by) VALUES
    ('insights', 'openai', 'gpt-5.5', 'medium', 'migration_seed'),
    ('deep_report', 'openai', 'gpt-5.5', 'medium', 'migration_seed');

ALTER TABLE quiz_submissions ADD COLUMN model_snapshot JSONB;
