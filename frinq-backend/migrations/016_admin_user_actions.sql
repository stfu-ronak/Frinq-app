-- 016_admin_user_actions.sql
--
-- Full-control admin console: unban / unsuspend / force-logout write to the
-- SAME moderation_actions audit trail as ban/suspend. Migration 014 created
-- that table with a CHECK restricting `action` to four values, so the new
-- action types would violate it (INSERT would fail). Widen the allowed set.
--
-- Idempotent: the constraint is dropped-if-exists then recreated, so a re-run
-- (or a manual apply after a permission fix) is safe. Constraint name is
-- Postgres's default for the inline CHECK in 014 (<table>_<column>_check).

ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_action_check;

ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_check
    CHECK (action IN (
        'resolve_no_action',
        'delete_message',
        'suspend_user',
        'ban_user',
        'unban_user',
        'unsuspend_user',
        'force_logout'
    ));
