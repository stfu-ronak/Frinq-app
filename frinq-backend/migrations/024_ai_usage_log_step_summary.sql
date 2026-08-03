-- Admin's /ai-test smoke endpoint accepts step="summary" (the only step
-- that exercises the actual production generate_full_summary/page2 path),
-- but ai_usage_log's step CHECK only allowed 'insights'/'deep_report' —
-- every step="summary" test call hit this constraint and 502'd even on a
-- perfect model response.

ALTER TABLE ai_usage_log
    DROP CONSTRAINT IF EXISTS ai_usage_log_step_check;

ALTER TABLE ai_usage_log
    ADD CONSTRAINT ai_usage_log_step_check
    CHECK (step IN ('insights', 'deep_report', 'summary'));
