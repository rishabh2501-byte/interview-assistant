-- ============================================================
-- Migration 001: Session-based pricing (hybrid subscription + top-up)
-- Safe to re-run; all ADDs are idempotent via IF NOT EXISTS.
-- Apply: psql $DATABASE_URL -f migrations/001_session_quotas.sql
-- ============================================================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS sessions_included INTEGER NOT NULL DEFAULT 0;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS plan_type VARCHAR(20) NOT NULL DEFAULT 'SUBSCRIPTION';

-- Add check constraint only if it doesn't already exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plans_plan_type_check'
  ) THEN
    ALTER TABLE plans
      ADD CONSTRAINT plans_plan_type_check
      CHECK (plan_type IN ('SUBSCRIPTION','TOPUP'));
  END IF;
END $$;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS sessions_granted INTEGER NOT NULL DEFAULT 0;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS sessions_used INTEGER NOT NULL DEFAULT 0;
