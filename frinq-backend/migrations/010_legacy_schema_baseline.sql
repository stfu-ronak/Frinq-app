-- Consolidates the ad-hoc startup DDL that used to live in
-- app/main.py's _run_migrations() (removed once the versioned runner in
-- app/migrations.py took over). Idempotent throughout (IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS) so it's safe whether the objects below already
-- exist (legacy database, adopted via the baseline path) or not (fresh
-- database, applied like any other migration).

CREATE TABLE IF NOT EXISTS tracking_events (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL,
    phone       TEXT,
    name        TEXT,
    page        TEXT NOT NULL,
    action      TEXT NOT NULL,
    element     TEXT,
    data        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_phone      ON tracking_events (phone);
CREATE INDEX IF NOT EXISTS idx_tracking_created_at ON tracking_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_page       ON tracking_events (page);

CREATE TABLE IF NOT EXISTS voice_clips (
    id              BIGSERIAL PRIMARY KEY,
    submission_id   UUID REFERENCES quiz_submissions(id) ON DELETE CASCADE,
    question_key    TEXT NOT NULL,
    audio_data      BYTEA NOT NULL,
    mime_type       TEXT NOT NULL DEFAULT 'audio/webm',
    duration_sec    SMALLINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (submission_id, question_key)
);

CREATE INDEX IF NOT EXISTS idx_voice_clips_submission ON voice_clips (submission_id);

ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;

-- Admin-only annotations + flags. is_test complements the env-var filter
-- (NEXT_PUBLIC_TEST_PHONES) so any row can be marked test without
-- redeploying. is_approved tracks which users are "inside the 100" for
-- the launch model.
ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_submissions_is_approved ON quiz_submissions (is_approved) WHERE is_approved = TRUE;

-- Drop-off follow-up tracking — same idempotency pattern as
-- whatsapp_sent_at. Set after the 'first_follow_up' template fires.
ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ;

-- Sunday-invite RSVP captured from WhatsApp button taps (rsvp_yes/no/info),
-- written by the /api/v1/whatsapp/inbound webhook.
ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS rsvp_status TEXT;
ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS rsvp_at TIMESTAMPTZ;

-- Every inbound WhatsApp message (button tap or free-form reply) — feeds
-- the admin RSVP/inbox view.
CREATE TABLE IF NOT EXISTS whatsapp_inbound (
    id             BIGSERIAL PRIMARY KEY,
    from_phone     TEXT,
    body           TEXT,
    button_text    TEXT,
    button_payload TEXT,
    choice         TEXT,
    received_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_inbound_received ON whatsapp_inbound (received_at DESC);

ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS deep_summary JSONB;
