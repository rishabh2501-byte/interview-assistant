-- ============================================================
-- Seed Data — Plans + Dummy Test User
--
-- Pricing model (hybrid subscription + top-up), ≈60-min sessions,
-- ≈₹20 OpenAI cost per session:
--
--   SUBSCRIPTION — monthly, X sessions included
--     Starter 5  @ ₹449   (₹89.8 / session,  77% margin)
--     Pro     10 @ ₹800   (₹80.0 / session,  75% margin)
--     Ultra   20 @ ₹1300  (₹65.0 / session,  69% margin)
--
--   TOPUP — one-time session packs, added to active subscription
--     Top-up 5  @ ₹449  (₹89.8 / session)
--     Top-up 10 @ ₹800  (₹80.0 / session)
--
-- All prices are stored in paise (INR × 100).
-- ============================================================

-- Wipe legacy hardcoded plans so stale rows don't interfere with pricing.
DELETE FROM plans WHERE id IN (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'a1b2c3d4-0000-0000-0000-000000000002',
  'a1b2c3d4-0000-0000-0000-000000000003',
  'a1b2c3d4-0000-0000-0000-000000000004'
);

-- Seed Plans (SUBSCRIPTION tier)
INSERT INTO plans (id, name, price, duration_days, sessions_included, plan_type, description) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Starter', 44900,  30, 5,  'SUBSCRIPTION', '5 interview sessions per month'),
  ('11111111-0000-0000-0000-000000000002', 'Pro',     80000,  30, 10, 'SUBSCRIPTION', '10 interview sessions per month — most popular'),
  ('11111111-0000-0000-0000-000000000003', 'Ultra',   130000, 30, 20, 'SUBSCRIPTION', '20 interview sessions per month — best value')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, price = EXCLUDED.price,
      duration_days = EXCLUDED.duration_days,
      sessions_included = EXCLUDED.sessions_included,
      plan_type = EXCLUDED.plan_type,
      description = EXCLUDED.description,
      is_active = TRUE;

-- Seed Plans (TOPUP tier) — adds sessions to an active subscription,
-- extends validity by 180 days (or current subscription end, whichever is later).
INSERT INTO plans (id, name, price, duration_days, sessions_included, plan_type, description) VALUES
  ('22222222-0000-0000-0000-000000000001', 'Top-up 5',  44900, 180, 5,  'TOPUP', '5 extra sessions, valid 6 months'),
  ('22222222-0000-0000-0000-000000000002', 'Top-up 10', 80000, 180, 10, 'TOPUP', '10 extra sessions, valid 6 months')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, price = EXCLUDED.price,
      duration_days = EXCLUDED.duration_days,
      sessions_included = EXCLUDED.sessions_included,
      plan_type = EXCLUDED.plan_type,
      description = EXCLUDED.description,
      is_active = TRUE;

-- Seed Test User
-- Password: Test@123  →  BCrypt hash (cost=10)
INSERT INTO users (id, username, email, password_hash) VALUES (
  'b2c3d4e5-0000-0000-0000-000000000001',
  'testuser',
  'testuser@example.com',
  '$2a$10$Le0FBbdad.5Uv0CdfhrSluTwag06CVRC0scJniC6HZv1IqEQOCDay'
) ON CONFLICT DO NOTHING;

-- Pre-active Pro subscription for test user (10 sessions, 30 days)
INSERT INTO subscriptions (id, user_id, plan_id, start_date, end_date, sessions_granted, sessions_used, status) VALUES (
  'c3d4e5f6-0000-0000-0000-000000000001',
  'b2c3d4e5-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000002',
  NOW(),
  NOW() + INTERVAL '30 days',
  10, 0,
  'ACTIVE'
) ON CONFLICT (id) DO UPDATE
  SET plan_id = EXCLUDED.plan_id,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      sessions_granted = EXCLUDED.sessions_granted,
      sessions_used = 0,
      status = 'ACTIVE';
