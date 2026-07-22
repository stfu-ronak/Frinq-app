-- Frinq migration 007: tracking_events table for identity-aware click/page tracking

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
