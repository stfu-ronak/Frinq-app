-- 027_scene_list_layout.sql
--
-- "scene" (the 2nd content question, "what's your scene?") renders as a
-- full-width icon/checkbox list (Figma's "who you are" list layout), not
-- wrapping chips — mirrors the mobile-side DEFAULT_CONTENT_STEPS fallback
-- update in frinq-mobile src/features/quiz/domain/quizDefinition.ts, which
-- adds `layout: 'list'` to this step.
--
-- Deactivate-then-insert, same pattern as migrations 023/025/026.

CREATE TEMP TABLE _src_027 AS
SELECT steps FROM quiz_config WHERE is_active = TRUE;

UPDATE quiz_config SET is_active = FALSE WHERE is_active = TRUE;

INSERT INTO quiz_config (version, steps, is_active, created_by)
SELECT
  (SELECT COALESCE(MAX(version), 0) + 1 FROM quiz_config),
  (
    SELECT jsonb_agg(
      CASE
        WHEN step->>'id' = 'scene' THEN step || jsonb_build_object('layout', 'list')
        ELSE step
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(_src_027.steps) WITH ORDINALITY AS st(step, ord)
  ),
  TRUE,
  'migration_seed'
FROM _src_027;

DROP TABLE _src_027;
