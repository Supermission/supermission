-- SUPERMISSION V1 Production Tables
-- Migration: 001_create_production_tables
-- Created: 2025-10-19

-- ============================================================================
-- 1. AGENT PROFILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT UNIQUE NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  agent_type TEXT CHECK (agent_type IN ('ai', 'human', 'hybrid')),
  reputation_score INTEGER DEFAULT 50 CHECK (reputation_score >= 0 AND reputation_score <= 100),
  success_rate DECIMAL(5,2) CHECK (success_rate >= 0 AND success_rate <= 100),
  total_missions INTEGER DEFAULT 0 CHECK (total_missions >= 0),
  pricing_per_task DECIMAL(18,6),
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_agent_profiles_address ON agent_profiles(address);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_capabilities ON agent_profiles USING GIN(capabilities);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_reputation ON agent_profiles(reputation_score DESC);

-- ============================================================================
-- 2. CDP WALLETS — REMOVED (use server_wallets from 000_all_tables.sql instead)
-- ============================================================================

-- ============================================================================
-- 3. MISSIONS (All deployed missions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  client_address TEXT NOT NULL,
  description TEXT,
  total_budget DECIMAL(18,6) NOT NULL CHECK (total_budget >= 0),
  orchestration_mode TEXT CHECK (orchestration_mode IN ('sequential', 'parallel')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  escrow_tx_hash TEXT,
  requirements_ipfs TEXT, -- Pinata IPFS hash
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for mission queries
CREATE INDEX IF NOT EXISTS idx_missions_client ON missions(client_address);
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_created ON missions(created_at DESC);

-- ============================================================================
-- 4. MISSION AGENTS (Which agents are in which missions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mission_agents (
  id BIGSERIAL PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agent_profiles(id),
  capability TEXT NOT NULL,
  payment_amount DECIMAL(18,6) NOT NULL CHECK (payment_amount >= 0),
  requirements TEXT,
  position INTEGER, -- For sequential execution order
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(mission_id, agent_id)
);

-- Indexes for mission-agent lookups
CREATE INDEX IF NOT EXISTS idx_mission_agents_mission ON mission_agents(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_agents_agent ON mission_agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_mission_agents_position ON mission_agents(mission_id, position);

-- ============================================================================
-- 5. MISSION EXECUTIONS (Real-time execution tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mission_executions (
  id BIGSERIAL PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agent_profiles(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'failed')),
  result_data JSONB,
  deliverable_uri TEXT, -- Pinata IPFS URL
  tx_hash TEXT,
  paid_amount DECIMAL(18,6),
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for execution tracking
CREATE INDEX IF NOT EXISTS idx_mission_executions_mission ON mission_executions(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_executions_agent ON mission_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_mission_executions_status ON mission_executions(status);

-- ============================================================================
-- 6. PAYMENT TRANSACTIONS (All A2A payments)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGSERIAL PRIMARY KEY,
  mission_id TEXT REFERENCES missions(id) ON DELETE SET NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount DECIMAL(18,6) NOT NULL CHECK (amount >= 0),
  token_address TEXT NOT NULL,
  tx_hash TEXT UNIQUE NOT NULL,
  purpose TEXT CHECK (purpose IN ('mission_payment', 'agent_to_agent', 'bounty_payout', 'escrow_release')),
  metadata JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for payment queries
CREATE INDEX IF NOT EXISTS idx_payment_transactions_mission ON payment_transactions(mission_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_from ON payment_transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_to ON payment_transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tx ON payment_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_time ON payment_transactions(timestamp DESC);

-- ============================================================================
-- 7. DELIVERABLES (IPFS hashes and metadata)
-- ============================================================================
CREATE TABLE IF NOT EXISTS deliverables (
  id BIGSERIAL PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agent_profiles(id),
  ipfs_hash TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for deliverable lookups
CREATE INDEX IF NOT EXISTS idx_deliverables_mission ON deliverables(mission_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_agent ON deliverables(agent_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_ipfs ON deliverables(ipfs_hash);

-- ============================================================================
-- 8. BOUNTY BIDS (Track all bounty bids)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bounty_bids (
  id BIGSERIAL PRIMARY KEY,
  bounty_id BIGINT NOT NULL,
  bidder_address TEXT NOT NULL,
  agent_id TEXT REFERENCES agent_profiles(id),
  amount DECIMAL(18,6) NOT NULL CHECK (amount >= 0),
  proposal_uri TEXT, -- IPFS hash of bid proposal
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for bounty bid queries
CREATE INDEX IF NOT EXISTS idx_bounty_bids_bounty ON bounty_bids(bounty_id);
CREATE INDEX IF NOT EXISTS idx_bounty_bids_bidder ON bounty_bids(bidder_address);
CREATE INDEX IF NOT EXISTS idx_bounty_bids_agent ON bounty_bids(agent_id);
CREATE INDEX IF NOT EXISTS idx_bounty_bids_status ON bounty_bids(status);

-- ============================================================================
-- TRIGGERS (Auto-update timestamps)
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to agent_profiles
CREATE TRIGGER update_agent_profiles_updated_at
  BEFORE UPDATE ON agent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply to bounty_bids
CREATE TRIGGER update_bounty_bids_updated_at
  BEFORE UPDATE ON bounty_bids
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE bounty_bids ENABLE ROW LEVEL SECURITY;

-- Public read access for agent profiles (agent directory)
CREATE POLICY "Public can view agent profiles"
  ON agent_profiles FOR SELECT
  USING (true);

-- Authenticated users can create missions
CREATE POLICY "Authenticated users can create missions"
  ON missions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Users can view their own missions
CREATE POLICY "Users can view their missions"
  ON missions FOR SELECT
  USING (client_address = current_setting('request.jwt.claims')::json->>'sub' OR auth.role() = 'service_role');

-- Service role has full access (for backend operations)
CREATE POLICY "Service role has full access to missions"
  ON missions FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to mission_agents"
  ON mission_agents FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to mission_executions"
  ON mission_executions FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to payment_transactions"
  ON payment_transactions FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to deliverables"
  ON deliverables FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to bounty_bids"
  ON bounty_bids FOR ALL
  USING (auth.role() = 'service_role');

-- Public can view mission executions (for tracking)
CREATE POLICY "Public can view mission executions"
  ON mission_executions FOR SELECT
  USING (true);

-- Public can view deliverables
CREATE POLICY "Public can view deliverables"
  ON deliverables FOR SELECT
  USING (true);

-- Public can view payment transactions
CREATE POLICY "Public can view payment transactions"
  ON payment_transactions FOR SELECT
  USING (true);

-- Public can view bounty bids
CREATE POLICY "Public can view bounty bids"
  ON bounty_bids FOR SELECT
  USING (true);

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE agent_profiles IS 'All registered agents (AI, human, hybrid) with reputation and capabilities';
COMMENT ON TABLE agent_wallets IS 'CDP wallet mappings for autonomous agents';
COMMENT ON TABLE missions IS 'All deployed multi-agent missions';
COMMENT ON TABLE mission_agents IS 'Many-to-many relationship between missions and agents';
COMMENT ON TABLE mission_executions IS 'Real-time execution tracking for each agent task';
COMMENT ON TABLE payment_transactions IS 'All blockchain payment transactions (A2A, escrow, bounties)';
COMMENT ON TABLE deliverables IS 'IPFS-stored deliverables from agent executions';
COMMENT ON TABLE bounty_bids IS 'Bids placed on bounties by agents';
