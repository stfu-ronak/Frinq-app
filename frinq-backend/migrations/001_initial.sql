-- Frinq initial migration (v2)
-- Patches vs SPEC.md §2:
--   * user_profiles.embedding is vector(1024) — Voyage voyage-3-large dimensions
--   * user_profiles gains the v2 columns from build plan §6.2

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- users
-- ============================================================
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supabase_uid        UUID UNIQUE NOT NULL,
    phone               TEXT UNIQUE,
    display_name        TEXT,
    gender              TEXT CHECK (gender IN ('male','female','non_binary','other')),
    age                 SMALLINT CHECK (age BETWEEN 18 AND 65),
    ncr_zone            TEXT CHECK (ncr_zone IN ('gurgaon','south_delhi','noida','east_delhi','west_delhi','faridabad','other_ncr')),
    max_travel_km       SMALLINT DEFAULT 15,
    schedule            TEXT[] DEFAULT '{}',
    onboarding_complete BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_users_ncr_zone ON users(ncr_zone);
CREATE INDEX idx_users_onboarding ON users(onboarding_complete) WHERE deleted_at IS NULL;

-- ============================================================
-- questionnaire_responses
-- ============================================================
CREATE TABLE questionnaire_responses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version         TEXT DEFAULT '2.0',
    answers         JSONB NOT NULL,
    submitted_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

CREATE INDEX idx_qr_user ON questionnaire_responses(user_id);

-- ============================================================
-- user_profiles  (v2: embedding=vector(1024) + new columns)
-- ============================================================
CREATE TABLE user_profiles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,

    -- Intent
    primary_goals       TEXT[] DEFAULT '{}',
    secondary_goals     TEXT[] DEFAULT '{}',

    -- Big Five
    openness            NUMERIC(4,3),
    conscientiousness   NUMERIC(4,3),
    extraversion        NUMERIC(4,3),
    agreeableness       NUMERIC(4,3),
    neuroticism         NUMERIC(4,3),

    -- HEXACO H-Factor
    honesty_humility    NUMERIC(4,3),

    -- Social Bonding
    connection_anxiety  NUMERIC(4,3),
    connection_avoidance NUMERIC(4,3),
    reliability         NUMERIC(4,3),
    bonding_style       TEXT CHECK (bonding_style IN ('secure','anxious','avoidant','fearful')),

    -- Values (Schwartz)
    val_self_direction  NUMERIC(4,3),
    val_stimulation     NUMERIC(4,3),
    val_achievement     NUMERIC(4,3),
    val_security        NUMERIC(4,3),
    val_tradition       NUMERIC(4,3),
    val_universalism    NUMERIC(4,3),
    openness_to_change  NUMERIC(4,3),
    conservation        NUMERIC(4,3),

    -- Activities
    loved_activities    JSONB DEFAULT '[]',
    open_to_try         TEXT[] DEFAULT '{}',
    anti_preferences    TEXT[] DEFAULT '{}',
    activity_archetype  TEXT CHECK (activity_archetype IN ('A','B','C','D')),
    riasec_R            NUMERIC(4,3),
    riasec_I            NUMERIC(4,3),
    riasec_A            NUMERIC(4,3),
    riasec_S            NUMERIC(4,3),
    riasec_E            NUMERIC(4,3),
    riasec_C            NUMERIC(4,3),

    -- Communication & Humor
    affiliative_humor   NUMERIC(4,3),
    self_enhancing_humor NUMERIC(4,3),
    aggressive_humor    NUMERIC(4,3),
    directness          NUMERIC(4,3),
    depth_preference    NUMERIC(4,3),

    -- Lifestyle
    chronotype          TEXT CHECK (chronotype IN ('morning','evening','flexible')),
    group_pref          TEXT CHECK (group_pref IN ('one_on_one','small','large','flexible')),
    drinks              TEXT CHECK (drinks IN ('never','socially','regularly')),
    smokes              TEXT CHECK (smokes IN ('never','socially','regularly')),
    drinks_tolerance    TEXT CHECK (drinks_tolerance IN ('any','prefer_non','dealbreaker')),
    smokes_tolerance    TEXT CHECK (smokes_tolerance IN ('any','prefer_non','dealbreaker')),
    diet                TEXT CHECK (diet IN ('veg','non_veg','vegan','jain','no_pref')),
    languages           TEXT[] DEFAULT '{}',

    -- AI-generated
    ai_summary          TEXT,
    latent_tags         TEXT[] DEFAULT '{}',
    vibe_check_raw      TEXT,

    -- pgvector embedding (v2: 1024 dims for Voyage voyage-3-large)
    embedding           vector(1024),

    -- v2 additions (plan §6.2)
    social_type           TEXT,
    saturday_archetype    TEXT,
    substance_scene       TEXT,
    connection_signals    TEXT[]  DEFAULT '{}',
    red_flags             TEXT[]  DEFAULT '{}',
    red_flag_normalised   TEXT[]  DEFAULT '{}',
    show_up_style         TEXT,
    looking_for_text      TEXT,
    hobbies_text          TEXT,
    storytime_transcript  TEXT,
    rapid_fire            JSONB   DEFAULT '{}',
    slider_depth          NUMERIC(4,3),
    slider_fun_get        NUMERIC(4,3),
    slider_frequency      NUMERIC(4,3),
    extraction_confidence JSONB   DEFAULT '{}',

    -- Behavioural
    meetups_attended    SMALLINT DEFAULT 0,
    meetups_no_show     SMALLINT DEFAULT 0,

    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_profiles_user ON user_profiles(user_id);
CREATE INDEX idx_profiles_embedding ON user_profiles USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- matches
-- ============================================================
CREATE TABLE matches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id           UUID NOT NULL REFERENCES users(id),
    user_b_id           UUID NOT NULL REFERENCES users(id),

    composite_score     NUMERIC(4,3) NOT NULL,
    activity_score      NUMERIC(4,3),
    big_five_score      NUMERIC(4,3),
    values_score        NUMERIC(4,3),
    bonding_score       NUMERIC(4,3),
    communication_score NUMERIC(4,3),
    h_factor_score      NUMERIC(4,3),
    lifestyle_score     NUMERIC(4,3),
    intent_score        NUMERIC(4,3),
    vibe_text_score     NUMERIC(4,3),

    match_explanation   TEXT,
    suggested_activity  TEXT,
    suggested_venue     TEXT,

    status              TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired','completed')),
    user_a_accepted     BOOLEAN,
    user_b_accepted     BOOLEAN,

    created_at          TIMESTAMPTZ DEFAULT now(),
    expires_at          TIMESTAMPTZ DEFAULT (now() + INTERVAL '72 hours'),

    UNIQUE(user_a_id, user_b_id)
);

CREATE INDEX idx_matches_user_a ON matches(user_a_id, status);
CREATE INDEX idx_matches_composite ON matches(composite_score DESC);

-- ============================================================
-- meetups
-- ============================================================
CREATE TABLE meetups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id        UUID NOT NULL REFERENCES matches(id),
    activity        TEXT NOT NULL,
    venue_name      TEXT,
    venue_address   TEXT,
    scheduled_at    TIMESTAMPTZ,
    status          TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- meetup_feedback
-- ============================================================
CREATE TABLE meetup_feedback (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meetup_id        UUID NOT NULL REFERENCES meetups(id),
    reviewer_id      UUID NOT NULL REFERENCES users(id),
    rating           TEXT NOT NULL CHECK (rating IN ('yes','okay','no')),
    would_meet_again BOOLEAN,
    notes            TEXT,
    submitted_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE(meetup_id, reviewer_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetups ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetup_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_self_access" ON users
    FOR ALL USING (supabase_uid = auth.uid());

CREATE POLICY "qr_self_access" ON questionnaire_responses
    FOR ALL USING (user_id IN (SELECT id FROM users WHERE supabase_uid = auth.uid()));

CREATE POLICY "profile_self_access" ON user_profiles
    FOR SELECT USING (user_id IN (SELECT id FROM users WHERE supabase_uid = auth.uid()));
