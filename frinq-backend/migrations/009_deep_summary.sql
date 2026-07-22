-- Frinq migration 009: deep_summary
ALTER TABLE quiz_submissions
ADD COLUMN IF NOT EXISTS deep_summary JSONB;
