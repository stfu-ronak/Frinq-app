-- Allow Gemini/Gemma as a first-class provider for both generation steps.

ALTER TABLE ai_model_config
    DROP CONSTRAINT IF EXISTS ai_model_config_provider_check;

ALTER TABLE ai_model_config
    ADD CONSTRAINT ai_model_config_provider_check
    CHECK (provider IN ('openai', 'claude', 'gemini'));

ALTER TABLE ai_usage_log
    DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;

ALTER TABLE ai_usage_log
    ADD CONSTRAINT ai_usage_log_provider_check
    CHECK (provider IN ('openai', 'claude', 'gemini'));
