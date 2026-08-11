-- Allow Azure AI Foundry as a first-class provider for both generation steps.
--
-- Azure serves the same OpenAI model catalogue (gpt-5.6-luna/terra/sol, ...)
-- over an OpenAI-COMPATIBLE v1 endpoint, so it is a distinct provider value
-- rather than a variant of 'openai': the two differ in host and credentials,
-- and usage/cost needs to be attributable to the right account.
--
-- Mirrors 021_gemini_provider.sql: both the config table and the usage log
-- carry the same whitelist, and both must move together or writes to
-- ai_usage_log fail after a step is switched to azure.

ALTER TABLE ai_model_config
    DROP CONSTRAINT IF EXISTS ai_model_config_provider_check;

ALTER TABLE ai_model_config
    ADD CONSTRAINT ai_model_config_provider_check
    CHECK (provider IN ('openai', 'azure', 'claude', 'gemini'));

ALTER TABLE ai_usage_log
    DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;

ALTER TABLE ai_usage_log
    ADD CONSTRAINT ai_usage_log_provider_check
    CHECK (provider IN ('openai', 'azure', 'claude', 'gemini'));
