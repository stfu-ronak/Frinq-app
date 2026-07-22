-- Frinq migration 012: canonical communities + chat schema
-- Phase 2 of the mobile launch plan. communities is the 24-entry taxonomy
-- (synced from app/core/ai/archetypes.py, not duplicated here); every other
-- table depends on it existing first, so it's created before anything that
-- references archetype_slug as a foreign key.

ALTER TABLE users ADD COLUMN suspended_until TIMESTAMPTZ;

-- ============================================================
-- communities (must exist before quiz_submissions.archetype_slug gets its FK,
-- and before community_members/messages/message_reports below)
-- ============================================================
CREATE TABLE communities (
    archetype_slug TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quiz_submissions
    ADD CONSTRAINT fk_quiz_archetype
    FOREIGN KEY (archetype_slug) REFERENCES communities(archetype_slug);

-- ============================================================
-- community_members
-- ============================================================
CREATE TABLE community_members (
    archetype_slug TEXT NOT NULL REFERENCES communities(archetype_slug),
    user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    muted          BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (archetype_slug, user_id)
);

-- ============================================================
-- messages
-- ============================================================
CREATE TABLE messages (
    id                 BIGSERIAL PRIMARY KEY,
    client_message_id  UUID NOT NULL,
    archetype_slug     TEXT NOT NULL REFERENCES communities(archetype_slug),
    user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
    body               TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by         TEXT,
    UNIQUE (user_id, client_message_id)
);

CREATE INDEX idx_messages_archetype_slug_desc
    ON messages (archetype_slug, id DESC)
    WHERE deleted_at IS NULL;

-- ============================================================
-- message_reports
-- ============================================================
CREATE TABLE message_reports (
    id               UUID PRIMARY KEY,
    message_id       BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason           TEXT NOT NULL CHECK (reason IN ('spam','harassment','hate','sexual','self_harm','violence','impersonation','privacy','other')),
    details          TEXT CHECK (char_length(details) <= 500),
    status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at      TIMESTAMPTZ,
    UNIQUE (message_id, reporter_user_id)
);

CREATE INDEX idx_message_reports_status_created
    ON message_reports (status, created_at DESC);

-- ============================================================
-- user_blocks
-- ============================================================
CREATE TABLE user_blocks (
    blocker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_user_id, blocked_user_id),
    CHECK (blocker_user_id <> blocked_user_id)
);

-- ============================================================
-- push_tokens
-- ============================================================
CREATE TABLE push_tokens (
    token_hash       TEXT PRIMARY KEY,
    token_ciphertext TEXT NOT NULL,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform         TEXT NOT NULL CHECK (platform IN ('ios','android')),
    installation_id  UUID NOT NULL,
    app_version      TEXT NOT NULL,
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    last_sent_at     TIMESTAMPTZ,
    last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (installation_id)
);

CREATE INDEX idx_push_tokens_user ON push_tokens (user_id);
