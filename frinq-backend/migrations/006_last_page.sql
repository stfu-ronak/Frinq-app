-- Frinq migration 006: add last_page to quiz_submissions
-- Tracks which quiz route the user was on when they last saved progress,
-- so /otp/verify can route resuming users directly to the right page.

ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS last_page TEXT;
