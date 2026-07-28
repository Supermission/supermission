-- X402 Payment Proof Replay Protection
-- Migration: 007_add_payment_proofs_table
-- Created: 2025-11-10
-- Purpose: Track used payment proofs to prevent replay attacks

-- ============================================================================
-- PAYMENT PROOFS (X402 Replay Protection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_proofs (
  tx_hash TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  mission_id TEXT,
  amount TEXT NOT NULL,
  token_address TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_payment_proofs_agent ON payment_proofs(agent_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_mission ON payment_proofs(mission_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_from ON payment_proofs(from_address);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_used_at ON payment_proofs(used_at DESC);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_payment_proofs_agent_tx ON payment_proofs(agent_id, tx_hash);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;

-- Public can read payment proofs (for transparency)
CREATE POLICY "Public can view payment proofs"
  ON payment_proofs FOR SELECT
  USING (true);

-- Only service role can insert (backend only)
CREATE POLICY "Service role can insert payment proofs"
  ON payment_proofs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE payment_proofs IS 'X402 payment proof tracking for replay attack prevention';
COMMENT ON COLUMN payment_proofs.tx_hash IS 'Ethereum transaction hash (unique identifier)';
COMMENT ON COLUMN payment_proofs.agent_id IS 'Agent that received the payment';
COMMENT ON COLUMN payment_proofs.mission_id IS 'Associated mission (optional for direct agent calls)';
COMMENT ON COLUMN payment_proofs.used_at IS 'Timestamp when proof was first used';
