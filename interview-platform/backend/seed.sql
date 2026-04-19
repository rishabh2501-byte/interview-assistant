-- ============================================================
-- Seed Data - Plans + Dummy Test User
-- ============================================================

-- Seed Plans
INSERT INTO plans (id, name, price, duration_days, description) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Basic',      200000, 30,  '1 Month access to AI Interview Assistant'),
  ('a1b2c3d4-0000-0000-0000-000000000002', 'Standard',   400000, 90,  '3 Months access to AI Interview Assistant'),
  ('a1b2c3d4-0000-0000-0000-000000000003', 'Premium',    600000, 180, '6 Months access to AI Interview Assistant'),
  ('a1b2c3d4-0000-0000-0000-000000000004', 'Enterprise', 900000, 365, '12 Months access to AI Interview Assistant')
ON CONFLICT DO NOTHING;

-- Seed Test User
-- Password: Test@123  →  BCrypt hash (cost=10)
INSERT INTO users (id, username, email, password_hash) VALUES (
  'b2c3d4e5-0000-0000-0000-000000000001',
  'testuser',
  'testuser@example.com',
  '$2a$10$Le0FBbdad.5Uv0CdfhrSluTwag06CVRC0scJniC6HZv1IqEQOCDay'
) ON CONFLICT DO NOTHING;

-- Pre-active subscription for test user (Basic plan, 30 days from now)
INSERT INTO subscriptions (id, user_id, plan_id, start_date, end_date, status) VALUES (
  'c3d4e5f6-0000-0000-0000-000000000001',
  'b2c3d4e5-0000-0000-0000-000000000001',
  'a1b2c3d4-0000-0000-0000-000000000001',
  NOW(),
  NOW() + INTERVAL '30 days',
  'ACTIVE'
) ON CONFLICT DO NOTHING;
