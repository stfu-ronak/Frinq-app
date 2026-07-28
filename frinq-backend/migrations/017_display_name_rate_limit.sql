-- 017_display_name_rate_limit.sql
--
-- New design spec (2026-07-27): display_name may only change once every
-- 3 months. Nullable so existing users aren't retroactively rate-limited —
-- the very first change after this migration is always allowed regardless
-- of when their row was created.

ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name_updated_at TIMESTAMPTZ;
