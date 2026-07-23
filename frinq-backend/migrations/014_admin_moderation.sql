-- Frinq migration 014: moderator review + enforcement audit trail.
-- Phase 5 Task 20. Renumbered from the launch plan's stated "013" — that
-- number was already taken by 013_quiz_retry_count.sql (Phase 2 work done
-- after the plan doc was written).
--
-- users.suspended_until already exists (added in migration 012, unused
-- until this task) — no ALTER needed here.

CREATE TABLE moderation_actions (
    id               UUID PRIMARY KEY,
    report_id        UUID REFERENCES message_reports(id) ON DELETE SET NULL,
    target_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    message_id       BIGINT REFERENCES messages(id) ON DELETE SET NULL,
    actor_id         TEXT NOT NULL,
    action           TEXT NOT NULL CHECK (action IN ('resolve_no_action','delete_message','suspend_user','ban_user')),
    reason           TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_moderation_actions_created_at ON moderation_actions (created_at DESC);
CREATE INDEX idx_moderation_actions_target_user ON moderation_actions (target_user_id, created_at DESC);
CREATE INDEX idx_users_suspended_until ON users (suspended_until);
