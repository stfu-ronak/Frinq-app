-- Frinq migration 008: voice clips storage
-- Stores audio uploaded from the voice recorder on /story and /opinions-why.
-- BYTEA so the audio survives deploys (DO App Platform filesystem is ephemeral).

CREATE TABLE IF NOT EXISTS voice_clips (
    id              BIGSERIAL PRIMARY KEY,
    submission_id   UUID REFERENCES quiz_submissions(id) ON DELETE CASCADE,
    question_key    TEXT NOT NULL,           -- "story" | "opinion_why_0" | etc
    audio_data      BYTEA NOT NULL,
    mime_type       TEXT NOT NULL DEFAULT 'audio/webm',
    duration_sec    SMALLINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (submission_id, question_key)
);

CREATE INDEX IF NOT EXISTS idx_voice_clips_submission ON voice_clips (submission_id);
