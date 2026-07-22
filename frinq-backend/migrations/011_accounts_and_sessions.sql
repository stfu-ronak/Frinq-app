-- Frinq migration 011: OTP-native accounts, rotating sessions, quiz ownership
-- Phase 1 of the mobile launch plan. supabase_uid becomes optional (native
-- phone accounts have none); onboarding_state tracks account lifecycle
-- independent of quiz completion; quiz_submissions gain durable ownership
-- via user_id instead of a bare phone string.

-- ============================================================
-- users
-- ============================================================
ALTER TABLE users ALTER COLUMN supabase_uid DROP NOT NULL;

ALTER TABLE users ADD COLUMN onboarding_state TEXT;
ALTER TABLE users ADD COLUMN banned          BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN banned_reason   TEXT;
ALTER TABLE users ADD COLUMN banned_at       TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN last_seen_at    TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN terms_version   TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMPTZ;

-- ============================================================
-- quiz_submissions ownership (must exist before the onboarding_state
-- backfill below, which reads quiz_submissions.user_id)
-- ============================================================
ALTER TABLE quiz_submissions ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE quiz_submissions ADD COLUMN archetype_slug TEXT;

-- Backfill by normalized phone (last 10 digits, same match rule as the
-- existing WhatsApp inbound lookup) -- only where exactly one user shares
-- that phone, so an ambiguous match links nothing rather than guessing.
WITH phone_counts AS (
    SELECT RIGHT(regexp_replace(phone, '\D', '', 'g'), 10) AS norm_phone, COUNT(*) AS cnt
    FROM users
    WHERE phone IS NOT NULL
    GROUP BY 1
),
unique_phone_users AS (
    SELECT RIGHT(regexp_replace(u.phone, '\D', '', 'g'), 10) AS norm_phone, u.id
    FROM users u
    JOIN phone_counts pc ON pc.norm_phone = RIGHT(regexp_replace(u.phone, '\D', '', 'g'), 10)
    WHERE pc.cnt = 1
)
UPDATE quiz_submissions qs
SET user_id = up.id
FROM unique_phone_users up
WHERE qs.user_id IS NULL
  AND qs.phone IS NOT NULL
  AND RIGHT(regexp_replace(qs.phone, '\D', '', 'g'), 10) = up.norm_phone;

CREATE INDEX idx_quiz_submissions_user ON quiz_submissions(user_id);

-- Backfill: a user with an owned completed submission is mid-AI-processing;
-- everyone else is still mid-quiz. Never backfilled to 'active' or 'error'
-- here -- Task 8's legacy activation pass is the only path to 'active'.
UPDATE users u
SET onboarding_state = 'profile_processing'
WHERE EXISTS (
    SELECT 1 FROM quiz_submissions qs
    WHERE qs.user_id = u.id AND qs.is_complete = TRUE
);

UPDATE users
SET onboarding_state = 'quiz_in_progress'
WHERE onboarding_state IS NULL;

ALTER TABLE users ALTER COLUMN onboarding_state SET DEFAULT 'quiz_in_progress';
ALTER TABLE users ALTER COLUMN onboarding_state SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT chk_users_onboarding_state
    CHECK (onboarding_state IN ('quiz_in_progress', 'profile_processing', 'active', 'error'));

CREATE INDEX idx_users_onboarding_state ON users(onboarding_state);

-- ============================================================
-- user_sessions
-- ============================================================
CREATE TABLE user_sessions (
    id                   UUID PRIMARY KEY,
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_secret_hash  TEXT NOT NULL,
    platform             TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    expires_at           TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at           TIMESTAMPTZ
);

CREATE INDEX idx_user_sessions_user    ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
