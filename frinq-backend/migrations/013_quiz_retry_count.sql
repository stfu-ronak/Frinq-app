-- Frinq migration 013: bound manual retries of a failed quiz submission.
-- Phase 2, Task 9. Small and additive on top of 012.

ALTER TABLE quiz_submissions ADD COLUMN retry_count SMALLINT NOT NULL DEFAULT 0;
