-- SUPERMISSION: Agent Economy Database Schema
-- These tables are for the Agent Economy platform (/agent-economy)
-- They do NOT touch existing production tables (agent_profiles, missions, etc.)

-- ============================================
-- UTILITY FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================
-- 1. SERVER WALLETS (TEE-style policy-enforced wallets)
-- Note: Different from existing agent_wallets (CDP mappings)
-- ============================================

CREATE TABLE IF NOT EXISTS server_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_address TEXT NOT NULL,
  agent_name TEXT NOT NULL UNIQUE,
  account_address TEXT NOT NULL UNIQUE,
  encrypted_private_key TEXT NOT NULL,
  balance TEXT DEFAULT '0',
  daily_limit TEXT DEFAULT '0',
  spent_today TEXT DEFAULT '0',
  last_reset_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES server_wallets(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('spending_limit', 'allowlist', 'blocklist', 'cooldown', 'time_window')),
  policy_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. MARKETPLACE (Agent registry and hiring)
-- ============================================

CREATE TABLE IF NOT EXISTS marketplace_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  description TEXT,
  capabilities TEXT[] DEFAULT '{}',
  hourly_rate TEXT DEFAULT '0',
  rating DECIMAL(3,2) DEFAULT 0.00,
  total_reviews INTEGER DEFAULT 0,
  total_earnings TEXT DEFAULT '0',
  jobs_completed INTEGER DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  is_platform_agent BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_address TEXT NOT NULL,
  agent_id UUID REFERENCES marketplace_agents(id) ON DELETE SET NULL,
  task_description TEXT NOT NULL,
  agreed_rate TEXT NOT NULL,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'escrowed', 'released', 'refunded', 'disputed')),
  contract_status TEXT DEFAULT 'active' CHECK (contract_status IN ('active', 'completed', 'cancelled', 'disputed')),
  escrow_amount TEXT DEFAULT '0',
  payment_txhash TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES marketplace_contracts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  reviewer_address TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. COLLABORATE (Multi-agent missions)
-- Note: Different from existing missions table
-- ============================================

CREATE TABLE IF NOT EXISTS collaborate_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_address TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('development', 'research', 'trading', 'content', 'data', 'other')),
  budget TEXT NOT NULL,
  reward_distribution JSONB DEFAULT '{}',
  required_agents INTEGER DEFAULT 1,
  current_agents INTEGER DEFAULT 0,
  status TEXT DEFAULT 'recruiting' CHECK (status IN ('recruiting', 'in_progress', 'completed', 'cancelled')),
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS collaborate_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES collaborate_missions(id) ON DELETE CASCADE,
  assigned_agent_id UUID REFERENCES marketplace_agents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  reward TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'submitted', 'approved', 'rejected')),
  priority INTEGER DEFAULT 0,
  dependencies UUID[] DEFAULT '{}',
  submission_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS collaborate_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES collaborate_missions(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  application_text TEXT,
  proposed_tasks UUID[] DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE(mission_id, agent_id)
);

-- ============================================
-- 4. COMPETE (Competitions with prizes)
-- ============================================

CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_address TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('trading', 'coding', 'research', 'creative', 'prediction', 'other')),
  prize_pool TEXT NOT NULL,
  entry_fee TEXT DEFAULT '0',
  max_entries INTEGER,
  current_entries INTEGER DEFAULT 0,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'judging', 'completed', 'cancelled')),
  judging_criteria JSONB DEFAULT '{}',
  prize_distribution JSONB DEFAULT '{"1": 50, "2": 30, "3": 20}',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  judging_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS competition_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  entry_fee_txhash TEXT,
  submission_url TEXT,
  submission_data JSONB,
  score DECIMAL(10,4),
  rank INTEGER,
  prize_amount TEXT,
  prize_txhash TEXT,
  status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'submitted', 'scored', 'disqualified')),
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  scored_at TIMESTAMPTZ,
  UNIQUE(competition_id, agent_id)
);

CREATE TABLE IF NOT EXISTS competition_judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE,
  judge_address TEXT NOT NULL,
  weight DECIMAL(3,2) DEFAULT 1.00,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competition_id, judge_address)
);

CREATE TABLE IF NOT EXISTS judge_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES competition_entries(id) ON DELETE CASCADE,
  judge_id UUID REFERENCES competition_judges(id) ON DELETE CASCADE,
  score DECIMAL(10,4) NOT NULL,
  feedback TEXT,
  scored_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entry_id, judge_id)
);

-- ============================================
-- 6. PAYMENTS (x402 protocol)
-- ============================================

CREATE TABLE IF NOT EXISTS x402_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_hash TEXT NOT NULL UNIQUE,
  from_agent_id TEXT,
  to_address TEXT NOT NULL,
  amount TEXT NOT NULL,
  token TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  requirements JSONB NOT NULL DEFAULT '{}',
  signature TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount TEXT NOT NULL,
  token_address TEXT NOT NULL,
  tx_hash TEXT,
  purpose TEXT CHECK (purpose IN ('agent_to_agent', 'escrow_deposit', 'escrow_release', 'competition_entry', 'competition_prize', 'mission_reward', 'other')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. API KEYS (Agent authentication)
-- ============================================

CREATE TABLE IF NOT EXISTS agent_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  agent_id UUID REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  permissions JSONB DEFAULT '["read", "write"]',
  rate_limit INTEGER DEFAULT 1000,
  requests_today INTEGER DEFAULT 0,
  last_request_at TIMESTAMPTZ,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES agent_api_keys(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  request_body JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_server_wallets_owner ON server_wallets(owner_address);
CREATE INDEX IF NOT EXISTS idx_server_wallets_account ON server_wallets(account_address);
CREATE INDEX IF NOT EXISTS idx_wallet_policies_wallet ON wallet_policies(wallet_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_wallet ON marketplace_agents(wallet_address);
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_rating ON marketplace_agents(rating DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_contracts_client ON marketplace_contracts(client_address);
CREATE INDEX IF NOT EXISTS idx_marketplace_contracts_agent ON marketplace_contracts(agent_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_agent ON marketplace_reviews(agent_id);
CREATE INDEX IF NOT EXISTS idx_collaborate_missions_creator ON collaborate_missions(creator_address);
CREATE INDEX IF NOT EXISTS idx_collaborate_missions_status ON collaborate_missions(status);
CREATE INDEX IF NOT EXISTS idx_collaborate_tasks_mission ON collaborate_tasks(mission_id);
CREATE INDEX IF NOT EXISTS idx_collaborate_applications_mission ON collaborate_applications(mission_id);
CREATE INDEX IF NOT EXISTS idx_competitions_creator ON competitions(creator_address);
CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions(status);
CREATE INDEX IF NOT EXISTS idx_competition_entries_competition ON competition_entries(competition_id);
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_hash ON agent_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_owner ON agent_api_keys(owner_address);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_key ON api_request_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_x402_payments_hash ON x402_payments(payment_hash);
CREATE INDEX IF NOT EXISTS idx_x402_payments_status ON x402_payments(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_from ON payment_transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_to ON payment_transactions(to_address);

-- ============================================
-- TRIGGERS
-- ============================================

DROP TRIGGER IF EXISTS update_server_wallets_updated_at ON server_wallets;
CREATE TRIGGER update_server_wallets_updated_at
  BEFORE UPDATE ON server_wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wallet_policies_updated_at ON wallet_policies;
CREATE TRIGGER update_wallet_policies_updated_at
  BEFORE UPDATE ON wallet_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_marketplace_agents_updated_at ON marketplace_agents;
CREATE TRIGGER update_marketplace_agents_updated_at
  BEFORE UPDATE ON marketplace_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE server_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborate_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborate_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborate_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE x402_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Service role policies (backend full access)
CREATE POLICY "Service role access" ON server_wallets FOR ALL USING (true);
CREATE POLICY "Service role access" ON wallet_policies FOR ALL USING (true);
CREATE POLICY "Service role access" ON marketplace_agents FOR ALL USING (true);
CREATE POLICY "Service role access" ON marketplace_contracts FOR ALL USING (true);
CREATE POLICY "Service role access" ON marketplace_reviews FOR ALL USING (true);
CREATE POLICY "Service role access" ON collaborate_missions FOR ALL USING (true);
CREATE POLICY "Service role access" ON collaborate_tasks FOR ALL USING (true);
CREATE POLICY "Service role access" ON collaborate_applications FOR ALL USING (true);
CREATE POLICY "Service role access" ON competitions FOR ALL USING (true);
CREATE POLICY "Service role access" ON competition_entries FOR ALL USING (true);
CREATE POLICY "Service role access" ON competition_judges FOR ALL USING (true);
CREATE POLICY "Service role access" ON judge_scores FOR ALL USING (true);
CREATE POLICY "Service role access" ON agent_api_keys FOR ALL USING (true);
CREATE POLICY "Service role access" ON api_request_logs FOR ALL USING (true);
CREATE POLICY "Service role access" ON x402_payments FOR ALL USING (true);
CREATE POLICY "Service role access" ON payment_transactions FOR ALL USING (true);

-- Done!
SELECT 'Agent Economy tables created successfully!' as status;
