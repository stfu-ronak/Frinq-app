-- Admin-managed events shown in the mobile Events timeline.
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT NOT NULL CHECK (char_length(image_url) <= 2000),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
    quote TEXT NOT NULL CHECK (char_length(quote) <= 500),
    details TEXT NOT NULL CHECK (char_length(details) <= 5000),
    registration_url TEXT NOT NULL CHECK (char_length(registration_url) <= 2000),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    sort_order INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_events_public_timeline
    ON events (status, starts_at DESC, sort_order ASC);
