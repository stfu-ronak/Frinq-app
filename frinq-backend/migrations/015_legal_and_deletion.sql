-- Frinq migration 015: legal acceptance history + account-deletion prep.
-- Phase 6 Task 24. Renumbered from the plan's stated "014" — already
-- taken by 014_admin_moderation.sql (Phase 5 work done after the plan
-- doc was written).

ALTER TABLE users ADD COLUMN privacy_version TEXT;
ALTER TABLE users ADD COLUMN privacy_accepted_at TIMESTAMPTZ;

CREATE TABLE legal_acceptances (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_version   TEXT NOT NULL,
    privacy_version TEXT NOT NULL,
    locale          TEXT NOT NULL,
    source          TEXT NOT NULL CHECK (source IN ('ios','android','web')),
    accepted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, terms_version, privacy_version)
);

CREATE INDEX idx_legal_acceptances_user ON legal_acceptances (user_id, accepted_at DESC);

-- Two dead legacy tables from the pre-OTP-native v1 spec (confirmed zero
-- app code references either), plus their dependent, all lacking any
-- ON DELETE policy on their `users` FK — a real hard account delete would
-- FK-violate against them today. Dropping rather than inventing cascade
-- rules for tables nothing uses. Dependency order: meetup_feedback ->
-- meetups -> matches.
DROP TABLE IF EXISTS meetup_feedback;
DROP TABLE IF EXISTS meetups;
DROP TABLE IF EXISTS matches;
