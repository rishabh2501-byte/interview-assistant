-- ============================================================
-- Migration 002: Email verification flag on users
-- Idempotent; safe to re-run.
-- Apply: psql $DATABASE_URL -f migrations/002_email_verification.sql
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Back-fill test accounts as verified so the seed stays usable.
UPDATE users
   SET email_verified = TRUE
 WHERE email = 'testuser@example.com';
