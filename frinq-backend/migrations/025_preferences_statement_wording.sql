-- 025_preferences_statement_wording.sql
--
-- Rewrites the 4 "preferences" slider prompts from bipolar comparisons
-- ("you trust more: what you can see <-> what you sense") to self-
-- descriptive statements ("i trust what i can see more than what i can't
-- explain but somehow feel.") rated on a fixed "not me <-> that's so me!"
-- scale — matches the new SnapSlider design (frinq-mobile
-- src/features/quiz/components/SnapSlider.tsx), which no longer renders
-- leftLabel/rightLabel at all. Those fields are left in place on each
-- slider object (harmless, unused) rather than stripped, matching how the
-- mobile-side DEFAULT_CONTENT_STEPS fallback was updated.
--
-- Re-seed (not ALTER — steps is already JSONB), same versioned-insert
-- pattern set_quiz_config() uses at runtime.
--
-- Deactivate-then-insert, for the same reason as migration 023: the partial
-- unique index quiz_config_one_active (ON is_active WHERE is_active) rejects
-- a second active row immediately, so the source steps are captured into a
-- temp table before the old row is deactivated.

CREATE TEMP TABLE _src_025 AS
SELECT steps FROM quiz_config WHERE is_active = TRUE;

UPDATE quiz_config SET is_active = FALSE WHERE is_active = TRUE;

INSERT INTO quiz_config (version, steps, is_active, created_by)
SELECT
  (SELECT COALESCE(MAX(version), 0) + 1 FROM quiz_config),
  (
    -- ORDER BY ord / s.idx: both step order and slider order are meaningful
    -- (running order of the quiz, and prompt-to-answer-index mapping).
    SELECT jsonb_agg(
      CASE
        WHEN step->>'id' = 'preferences' THEN
          step || jsonb_build_object(
            'sliders', (
              SELECT jsonb_agg(
                slider || jsonb_build_object('prompt', new_prompt)
                ORDER BY s.idx
              )
              FROM jsonb_array_elements(step->'sliders') WITH ORDINALITY AS s(slider, idx)
              JOIN (VALUES
                (1, 'i trust what i can see more than what i can''t explain but somehow feel.'),
                (2, 'when it''s a big decision, my heart usually speaks before my head does.'),
                (3, 'i''d rather go deep with a few things than wide across many.'),
                (4, 'if i have to pick one, i''d rather be kind than brutally honest.')
              ) AS w(idx, new_prompt) ON w.idx = s.idx
            )
          )
        ELSE step
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(_src_025.steps) WITH ORDINALITY AS st(step, ord)
  ),
  TRUE,
  'migration_seed'
FROM _src_025;

DROP TABLE _src_025;
