-- Frinq migration 002: quiz_submissions
-- Stores every quiz attempt (complete + partial) without requiring Supabase auth.
-- The AI insights column is populated asynchronously after submission.

CREATE TABLE quiz_submissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone           TEXT,
    answers         JSONB NOT NULL DEFAULT '{}',
    is_complete     BOOLEAN DEFAULT FALSE,

    -- AI processing state
    status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'error')),
    error_msg       TEXT,

    -- AI output (populated once status = 'done')
    headline        TEXT,               -- one bold phrase capturing the person
    spirit_animal   TEXT,               -- personality archetype label
    spirit_desc     TEXT,               -- 1-sentence archetype description
    insights        JSONB DEFAULT '[]', -- array of {label, text} objects
    tags            TEXT[] DEFAULT '{}',
    share_card      JSONB,              -- data for the shareable Instagram card

    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_submissions_phone    ON quiz_submissions(phone);
CREATE INDEX idx_submissions_status   ON quiz_submissions(status);
CREATE INDEX idx_submissions_created  ON quiz_submissions(created_at DESC);
CREATE INDEX idx_submissions_complete ON quiz_submissions(is_complete, created_at DESC);
