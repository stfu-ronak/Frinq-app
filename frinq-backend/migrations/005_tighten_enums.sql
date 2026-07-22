-- Migration 005: tighten chronotype and group_pref CHECK constraints
-- builder.py only emits: chronotype in ('morning','evening')
--                        group_pref in ('small','large')
-- Dropped values ('flexible', 'one_on_one') are never produced by the pipeline.

ALTER TABLE user_profiles
    DROP CONSTRAINT IF EXISTS user_profiles_chronotype_check,
    ADD  CONSTRAINT user_profiles_chronotype_check
         CHECK (chronotype IN ('morning', 'evening'));

ALTER TABLE user_profiles
    DROP CONSTRAINT IF EXISTS user_profiles_group_pref_check,
    ADD  CONSTRAINT user_profiles_group_pref_check
         CHECK (group_pref IN ('small', 'large'));
