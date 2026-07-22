-- Migration 003: Phone OTP table + verification columns
-- Run this in Supabase SQL editor

-- OTP storage table
CREATE TABLE IF NOT EXISTS phone_otps (
    id         BIGSERIAL PRIMARY KEY,
    phone      TEXT NOT NULL,
    code       TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts   INT NOT NULL DEFAULT 0,
    verified   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_otps_phone_created_idx
    ON phone_otps (phone, created_at DESC);

-- Add verification fields to quiz_submissions
ALTER TABLE quiz_submissions
    ADD COLUMN IF NOT EXISTS phone_verified   BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS linkedin_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS linkedin_sub      TEXT;

-- Clean up old OTPs automatically (optional — run periodically or as a cron)
-- DELETE FROM phone_otps WHERE created_at < now() - interval '24 hours';
