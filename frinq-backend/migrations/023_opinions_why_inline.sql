-- 023_opinions_why_inline.sql
--
-- Folds the standalone "opinions_why" step into the "opinions" step's pairs
-- (each pair now carries its own whyPrompt/whyAllowVoice), so admin/mobile
-- treat the 4 this-or-that picks + their 4 why-explains as ONE editable
-- round instead of two independently-authored steps correlated only by
-- array position. Fixes a shipped bug where opinions_why's single shared
-- string answer was being indexed character-by-character by the AI insights
-- prompt (app/core/ai/insights.py) instead of one why-answer per pair.
--
-- Wire/answer shape is unchanged: 'opinions' still submits a flat string[]
-- of picks, 'opinions_why' (now the step's whyAnswerKey) still submits a
-- flat string[] of why-answers, one per pair, in pair order. Historical
-- quiz_submissions.answers rows are untouched (opaque JSONB); the export
-- and insights code paths defensively normalize the old single-string shape
-- (see raw_responses.py / insights.py).
--
-- Re-seed (not ALTER — steps is already JSONB), same versioned-insert
-- pattern set_quiz_config() uses at runtime.
--
-- Order matters: quiz_config has a partial unique index
-- (quiz_config_one_active ON is_active WHERE is_active), so the previously
-- active row MUST be deactivated BEFORE the new active row is inserted —
-- inserting first raises UniqueViolationError even inside a transaction,
-- because a plain (non-deferrable) unique index is enforced per statement.
-- The source `steps` is therefore captured into a temp table first, since
-- after the UPDATE there is no `is_active = TRUE` row left to read it from.
-- An empty temp table (no active config) makes both writes no-ops, which
-- is the same guard the previous `WHERE EXISTS (...)` clause provided.

CREATE TEMP TABLE _src_023 AS
SELECT steps FROM quiz_config WHERE is_active = TRUE;

UPDATE quiz_config SET is_active = FALSE WHERE is_active = TRUE;

INSERT INTO quiz_config (version, steps, is_active, created_by)
SELECT
  (SELECT COALESCE(MAX(version), 0) + 1 FROM quiz_config),
  (
    -- ORDER BY ord: step order is the quiz's running order, so aggregating
    -- without it would risk silently reshuffling the whole questionnaire.
    SELECT jsonb_agg(
      CASE
        WHEN step->>'id' = 'opinions' THEN
          (step - 'pairs') || jsonb_build_object(
            'whyAnswerKey', 'opinions_why',
            'pairs', (
              SELECT jsonb_agg(
                pair || jsonb_build_object('whyPrompt', why_prompt, 'whyAllowVoice', true)
                ORDER BY p.idx
              )
              FROM jsonb_array_elements(step->'pairs') WITH ORDINALITY AS p(pair, idx)
              JOIN (VALUES
                (1, 'what makes you think that?'),
                (2, 'why do you feel that way?'),
                (3, 'what makes you respect that?'),
                (4, 'why''s that?')
              ) AS w(idx, why_prompt) ON w.idx = p.idx
            )
          )
        ELSE step
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(_src_023.steps) WITH ORDINALITY AS s(step, ord)
    WHERE step->>'id' != 'opinions_why'
  ),
  TRUE,
  'migration_seed'
FROM _src_023;

DROP TABLE _src_023;
