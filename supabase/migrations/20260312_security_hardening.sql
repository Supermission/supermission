-- ============================================================================
-- SECURITY HARDENING: RLS, constraints, missing PKs, FK integrity
-- 2026-03-12
-- ============================================================================

-- ============================================================================
-- 1. Enable RLS on 11 unprotected tables
-- ============================================================================

ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_endorsements ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_seen_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Service role full access on all newly-protected tables
CREATE POLICY "service_role_all" ON deliverables FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON agent_claims FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON agent_endorsements FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON agent_heartbeats FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON user_seen_opportunities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON price_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON alert_notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON pm_agent_memory FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON chat_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON waitlist FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. Tighten overly permissive public policies
-- ============================================================================

-- user_wallets: server-side only — remove public read
DROP POLICY IF EXISTS "public_read" ON user_wallets;

-- payment_transactions: server-side only — remove public read
DROP POLICY IF EXISTS "public_read" ON payment_transactions;

-- payment_proofs: server-side only — remove public read
DROP POLICY IF EXISTS "public_read" ON payment_proofs;

-- deliverables: server-side only — remove public read (was dangling before RLS was enabled)
DROP POLICY IF EXISTS "public_read" ON deliverables;

-- trade_history: used client-side but scope reads to service_role
-- (app always passes user_address in query filter; client code uses non-admin supabase)
-- Keep public read for now since client-side code needs it, but remove open insert
DROP POLICY IF EXISTS "public_insert" ON trade_history;
CREATE POLICY "service_role_insert" ON trade_history FOR INSERT TO service_role WITH CHECK (true);

-- user_watchlists: used client-side — keep read, but scope insert/delete to service_role
-- (lib/hooks/use-watchlist.ts uses client supabase for read, insert, delete)
-- These need to stay public for the client hook to work
-- But we should at minimum ensure they can only affect own rows in the future

-- ============================================================================
-- 3. Add primary key to payment_proofs
-- ============================================================================

-- Add a surrogate PK and unique constraint on tx_hash
ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
-- Set PK only if not already set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_proofs_pkey'
  ) THEN
    ALTER TABLE payment_proofs ADD CONSTRAINT payment_proofs_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- Deduplicate tx_hash before adding unique constraint
DELETE FROM payment_proofs a
USING payment_proofs b
WHERE a.id > b.id AND a.tx_hash = b.tx_hash;

ALTER TABLE payment_proofs DROP CONSTRAINT IF EXISTS payment_proofs_tx_hash_unique;
ALTER TABLE payment_proofs ADD CONSTRAINT payment_proofs_tx_hash_unique UNIQUE (tx_hash);

-- ============================================================================
-- 4. Add unique constraint on x402_nonces (replay prevention)
-- ============================================================================

-- Deduplicate before adding constraint
DELETE FROM x402_nonces a
USING x402_nonces b
WHERE a.ctid > b.ctid AND a.nonce = b.nonce AND a.user_address = b.user_address;

-- Add PK
ALTER TABLE x402_nonces ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'x402_nonces_pkey'
  ) THEN
    ALTER TABLE x402_nonces ADD CONSTRAINT x402_nonces_pkey PRIMARY KEY (id);
  END IF;
END $$;

ALTER TABLE x402_nonces DROP CONSTRAINT IF EXISTS x402_nonces_unique;
ALTER TABLE x402_nonces ADD CONSTRAINT x402_nonces_unique UNIQUE (nonce, user_address);

CREATE INDEX IF NOT EXISTS idx_x402_nonces_used_at ON x402_nonces(used_at);

-- ============================================================================
-- 5. Add FK constraints for mission_messages and mission_payments
-- ============================================================================

-- mission_messages.mission_id → collaborate_missions(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_mission_messages_mission'
  ) THEN
    -- Clean up any orphan rows first
    DELETE FROM mission_messages
    WHERE mission_id NOT IN (SELECT id FROM collaborate_missions);

    ALTER TABLE mission_messages
      ADD CONSTRAINT fk_mission_messages_mission
      FOREIGN KEY (mission_id) REFERENCES collaborate_missions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- mission_payments.mission_id → collaborate_missions(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_mission_payments_mission'
  ) THEN
    DELETE FROM mission_payments
    WHERE mission_id NOT IN (SELECT id FROM collaborate_missions);

    ALTER TABLE mission_payments
      ADD CONSTRAINT fk_mission_payments_mission
      FOREIGN KEY (mission_id) REFERENCES collaborate_missions(id);
  END IF;
END $$;

-- mission_payments.task_id → collaborate_tasks(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_mission_payments_task'
  ) THEN
    DELETE FROM mission_payments
    WHERE task_id NOT IN (SELECT id FROM collaborate_tasks);

    ALTER TABLE mission_payments
      ADD CONSTRAINT fk_mission_payments_task
      FOREIGN KEY (task_id) REFERENCES collaborate_tasks(id);
  END IF;
END $$;

-- ============================================================================
-- 6. Fix uuid_generate_v4() → gen_random_uuid() in chat_messages
-- ============================================================================

ALTER TABLE chat_messages ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ============================================================================
-- 7. Key missing indexes for hot query patterns
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_collaborate_applications_agent ON collaborate_applications(agent_id);
CREATE INDEX IF NOT EXISTS idx_collaborate_applications_status ON collaborate_applications(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_agent ON agent_heartbeats(agent_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_erc8004_identities_owner ON erc8004_identities(owner_address);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_time ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_application_messages_app ON application_messages(application_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_address);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_user ON alert_notifications(user_address);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created ON api_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_compliance_address_recent ON compliance_screenings(address, created_at DESC);
