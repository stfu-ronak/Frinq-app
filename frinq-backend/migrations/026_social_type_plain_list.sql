-- 026_social_type_plain_list.sql
--
-- "social_type" ("what is your social type?", the first content question)
-- moves from a description-card single-choice to a plain pill list, matching
-- the Figma reference (node 163:1661): no per-option description text, and
-- the options are introvert/extrovert/ambivert/selective introvert (the old
-- seed had "selective extrovert" — likely a copy-paste typo, since
-- introvert/extrovert/ambivert already cover the non-selective cases).
-- Mirrors the mobile-side DEFAULT_CONTENT_STEPS fallback update in
-- frinq-mobile src/features/quiz/domain/quizDefinition.ts.
--
-- Deactivate-then-insert, same reason/pattern as migrations 023/025: the
-- partial unique index quiz_config_one_active rejects a second active row,
-- so the source steps are captured into a temp table before deactivating.

CREATE TEMP TABLE _src_026 AS
SELECT steps FROM quiz_config WHERE is_active = TRUE;

UPDATE quiz_config SET is_active = FALSE WHERE is_active = TRUE;

INSERT INTO quiz_config (version, steps, is_active, created_by)
SELECT
  (SELECT COALESCE(MAX(version), 0) + 1 FROM quiz_config),
  (
    SELECT jsonb_agg(
      CASE
        WHEN step->>'id' = 'social_type' THEN
          step || jsonb_build_object(
            'kind', 'singleChoiceList',
            'options', jsonb_build_array(
              jsonb_build_object('value', 'introvert', 'label', 'introvert'),
              jsonb_build_object('value', 'extrovert', 'label', 'extrovert'),
              jsonb_build_object('value', 'ambivert', 'label', 'ambivert'),
              jsonb_build_object('value', 'selective introvert', 'label', 'selective introvert')
            )
          )
        ELSE step
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(_src_026.steps) WITH ORDINALITY AS st(step, ord)
  ),
  TRUE,
  'migration_seed'
FROM _src_026;

DROP TABLE _src_026;
