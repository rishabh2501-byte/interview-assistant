-- ============================================================
-- Interview Platform - PostgreSQL Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Plans
-- plan_type:
--   SUBSCRIPTION → recurring access + quota, valid for duration_days
--   TOPUP        → one-time session pack, added to user's active subscription
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    price INTEGER NOT NULL,              -- amount in paise (INR * 100)
    duration_days INTEGER NOT NULL,      -- for TOPUP this is the add-on validity (e.g. 180)
    sessions_included INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited (legacy)
    plan_type VARCHAR(20) NOT NULL DEFAULT 'SUBSCRIPTION'
        CHECK (plan_type IN ('SUBSCRIPTION','TOPUP')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions
-- sessions_used counts consumed sessions in the current window.
-- sessions_granted = plan.sessions_included + any top-ups applied.
-- Quota-exhausted check: sessions_used >= sessions_granted  →  block.
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    start_date TIMESTAMP NOT NULL DEFAULT NOW(),
    end_date TIMESTAMP NOT NULL,
    sessions_granted INTEGER NOT NULL DEFAULT 0,
    sessions_used    INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','CANCELLED')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id),
    razorpay_order_id VARCHAR(255),
    razorpay_payment_id VARCHAR(255),
    razorpay_signature VARCHAR(512),
    amount INTEGER NOT NULL,          -- in paise
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','FAILED')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Resumes
CREATE TABLE IF NOT EXISTS resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(512) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Instructions
CREATE TABLE IF NOT EXISTS instructions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) DEFAULT 'Interview Session',
    start_time TIMESTAMP DEFAULT NOW(),
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Logs (Q&A per session)
CREATE TABLE IF NOT EXISTS logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_session_id ON logs(session_id);
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
