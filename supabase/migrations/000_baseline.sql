-- ============================================================================
-- SUPERMISSION DATABASE BASELINE
-- Squashed from 69 migrations on 2026-03-12
-- Original migrations archived in ../migrations_archive/
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. AGENT MARKETPLACE
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  description TEXT,
  capabilities TEXT[] DEFAULT '{}',
  hourly_rate NUMERIC DEFAULT 0,
  total_earnings NUMERIC DEFAULT 0,
  rating NUMERIC DEFAULT 0.00,
  total_reviews INTEGER DEFAULT 0,
  jobs_completed INTEGER DEFAULT 0,
  quality_score NUMERIC DEFAULT 0,
  speed_score NUMERIC DEFAULT 0,
  communication_score NUMERIC DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  agent_status TEXT DEFAULT 'active',
  agent_type TEXT DEFAULT 'ai',
  is_platform_agent BOOLEAN DEFAULT false,
  avatar_url TEXT,
  endpoint_url TEXT,
  endpoint_status TEXT DEFAULT 'inactive',
  use_proxy BOOLEAN DEFAULT false,
  pricing_model TEXT,
  pricing_rate NUMERIC,
  resources JSONB,
  erc8004_agent_id TEXT,
  erc8004_identity_id UUID,
  verified_on_chain BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  last_heartbeat_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_agents_wallet ON marketplace_agents(wallet_address);
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_rating ON marketplace_agents(rating);
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_available ON marketplace_agents(is_available);
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_agent_type ON marketplace_agents((metadata->>'agent_type'));
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_capabilities ON marketplace_agents USING GIN (capabilities);

CREATE TRIGGER update_marketplace_agents_updated_at
  BEFORE UPDATE ON marketplace_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS marketplace_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES marketplace_agents(id),
  client_address TEXT NOT NULL,
  task_description TEXT NOT NULL,
  agreed_rate NUMERIC NOT NULL,
  escrow_amount NUMERIC DEFAULT 0,
  contract_status TEXT DEFAULT 'active',
  payment_status TEXT DEFAULT 'pending',
  payment_txhash TEXT,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_marketplace_contracts_client ON marketplace_contracts(client_address);
CREATE INDEX IF NOT EXISTS idx_marketplace_contracts_agent ON marketplace_contracts(agent_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_contracts_payment_status ON marketplace_contracts(payment_status);

CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES marketplace_agents(id),
  contract_id UUID REFERENCES marketplace_contracts(id),
  reviewer_address TEXT NOT NULL,
  review_type TEXT DEFAULT 'creator_to_worker',
  rating INTEGER NOT NULL,
  quality_rating INTEGER,
  speed_rating INTEGER,
  communication_rating INTEGER,
  review_text TEXT,
  category TEXT,
  payment_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_agent ON marketplace_reviews(agent_id);

CREATE TABLE IF NOT EXISTS agent_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  verification_code TEXT NOT NULL,
  claim_token TEXT NOT NULL,
  claimed_by TEXT,
  claim_tweet_url TEXT,
  status TEXT DEFAULT 'pending',
  expires_at TIMESTAMPTZ DEFAULT (now() + '7 days'::interval),
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 2. SERVER WALLETS & POLICIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS server_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  account_address TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  wallet_type TEXT DEFAULT 'cdp_managed',
  privy_wallet_id TEXT,
  daily_limit NUMERIC DEFAULT 0,
  spent_today NUMERIC DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  last_tx_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_server_wallets_owner ON server_wallets(owner_address);
CREATE INDEX IF NOT EXISTS idx_server_wallets_account ON server_wallets(account_address);

CREATE TRIGGER update_server_wallets_updated_at
  BEFORE UPDATE ON server_wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS wallet_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES server_wallets(id),
  policy_type TEXT NOT NULL,
  policy_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_policies_wallet ON wallet_policies(wallet_id);

CREATE TRIGGER update_wallet_policies_updated_at
  BEFORE UPDATE ON wallet_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. MISSIONS (Legacy orchestration engine)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  ipfs_hash TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliverables_mission ON deliverables(mission_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_agent ON deliverables(agent_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_ipfs ON deliverables(ipfs_hash);



-- ============================================================================
-- 4. COLLABORATE MISSIONS (v2 mission system)
-- ============================================================================

CREATE TABLE IF NOT EXISTS collaborate_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_address TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  budget NUMERIC NOT NULL,
  status TEXT DEFAULT 'active',
  required_agents INTEGER DEFAULT 1,
  current_agents INTEGER DEFAULT 0,
  required_capabilities TEXT[] DEFAULT '{}',
  nice_to_have_capabilities TEXT[] DEFAULT '{}',
  excluded_capabilities TEXT[] DEFAULT '{}',
  min_reputation INTEGER DEFAULT 0,
  auto_assign BOOLEAN DEFAULT false,
  auto_reject_after_days INTEGER DEFAULT 7,
  reward_distribution JSONB DEFAULT '{}',
  payment_status TEXT DEFAULT 'pending',
  payment_tx_hash TEXT,
  onchain_escrow_id TEXT,
  metadata JSONB DEFAULT '{}',
  deadline TIMESTAMPTZ,
  application_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_collaborate_missions_creator ON collaborate_missions(creator_address);
CREATE INDEX IF NOT EXISTS idx_collaborate_missions_status ON collaborate_missions(status);

CREATE TABLE IF NOT EXISTS collaborate_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES collaborate_missions(id),
  title TEXT NOT NULL,
  description TEXT,
  reward NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  assigned_agent_id UUID REFERENCES marketplace_agents(id),
  dependencies UUID[] DEFAULT '{}',
  submission_data JSONB,
  rejection_reason TEXT,
  rejection_count INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT 'pending',
  payment_tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  assigned_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_collaborate_tasks_mission ON collaborate_tasks(mission_id);
CREATE INDEX IF NOT EXISTS idx_collaborate_tasks_assigned_status ON collaborate_tasks(assigned_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_collaborate_tasks_mission_status ON collaborate_tasks(mission_id, status);

CREATE TABLE IF NOT EXISTS collaborate_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES collaborate_missions(id),
  agent_id UUID REFERENCES marketplace_agents(id),
  application_text TEXT,
  proposed_rate NUMERIC,
  agreed_rate NUMERIC,
  agreed_rate_currency TEXT DEFAULT 'USDC',
  proposed_tasks UUID[] DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  agent_approved BOOLEAN DEFAULT false,
  creator_approved BOOLEAN DEFAULT false,
  agent_approved_at TIMESTAMPTZ,
  creator_approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_collaborate_applications_mission ON collaborate_applications(mission_id);

CREATE TABLE IF NOT EXISTS application_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES collaborate_applications(id),
  sender_address TEXT NOT NULL,
  sender_agent_id UUID REFERENCES marketplace_agents(id),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'message',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mission_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES collaborate_missions(id) ON DELETE CASCADE,
  sender_address TEXT NOT NULL,
  sender_agent_id UUID REFERENCES marketplace_agents(id),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'message',
  attachments JSONB DEFAULT '[]',
  mentions TEXT[] DEFAULT '{}',
  reply_to_id UUID,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES collaborate_missions(id),
  task_id UUID NOT NULL REFERENCES collaborate_tasks(id),
  from_address TEXT NOT NULL,
  from_agent_name TEXT NOT NULL,
  to_address TEXT NOT NULL,
  to_agent_id UUID NOT NULL,
  to_agent_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending',
  tx_hash TEXT,
  x402_payment_id UUID,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_payments_task_active
  ON mission_payments(task_id)
  WHERE status IN ('pending', 'signing', 'settling', 'completed');

-- ============================================================================
-- 5. COMPETITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_address TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  prize_pool NUMERIC NOT NULL,
  entry_fee NUMERIC DEFAULT 0,
  prize_distribution JSONB DEFAULT '{"1": 50, "2": 30, "3": 20}',
  judging_criteria JSONB DEFAULT '{}',
  max_entries INTEGER,
  current_entries INTEGER DEFAULT 0,
  status TEXT DEFAULT 'upcoming',
  metadata JSONB DEFAULT '{}',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  judging_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitions_creator ON competitions(creator_address);
CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions(status);

CREATE TABLE IF NOT EXISTS competition_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES competitions(id),
  agent_id UUID REFERENCES marketplace_agents(id),
  status TEXT DEFAULT 'registered',
  submission_url TEXT,
  submission_data JSONB,
  entry_fee_txhash TEXT,
  score NUMERIC,
  rank INTEGER,
  prize_amount NUMERIC,
  prize_txhash TEXT,
  registered_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  scored_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_competition_entries_competition ON competition_entries(competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_entries_status ON competition_entries(status);
CREATE INDEX IF NOT EXISTS idx_competition_entries_agent ON competition_entries(agent_id);

CREATE TABLE IF NOT EXISTS competition_judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES competitions(id),
  judge_address TEXT NOT NULL,
  weight NUMERIC DEFAULT 1.00,
  added_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS judge_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id UUID REFERENCES competition_judges(id),
  entry_id UUID REFERENCES competition_entries(id),
  score NUMERIC NOT NULL,
  feedback TEXT,
  scored_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 6. IDENTITY & AUTH
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES marketplace_agents(id),
  owner_address TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  permissions JSONB DEFAULT '["read", "write"]',
  rate_limit INTEGER DEFAULT 1000,
  requests_today INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  last_request_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_api_keys_hash ON agent_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_owner ON agent_api_keys(owner_address);

CREATE TABLE IF NOT EXISTS api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES agent_api_keys(id),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  request_body JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_key ON api_request_logs(api_key_id);

CREATE TABLE IF NOT EXISTS erc8004_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_agent_id UUID REFERENCES marketplace_agents(id),
  owner_address TEXT NOT NULL,
  erc8004_agent_id BIGINT NOT NULL,
  global_agent_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 8453,
  registry_address TEXT NOT NULL DEFAULT '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  registration_tx_hash TEXT NOT NULL,
  agent_uri TEXT,
  agent_wallet TEXT,
  on_chain_reputation_score NUMERIC DEFAULT 0,
  on_chain_review_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 7. PAYMENTS & TRANSACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id TEXT,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  tx_hash TEXT NOT NULL,
  purpose TEXT,
  metadata JSONB,
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_from ON payment_transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_to ON payment_transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tx ON payment_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_time ON payment_transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_mission ON payment_transactions(mission_id);

CREATE TABLE IF NOT EXISTS payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash TEXT NOT NULL UNIQUE,
  agent_id UUID,
  mission_id TEXT,
  amount NUMERIC NOT NULL,
  token_address TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  metadata JSONB,
  used_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS x402_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_hash TEXT NOT NULL,
  from_agent_id UUID,
  to_address TEXT NOT NULL,
  token TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  requirements JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  signature TEXT,
  tx_hash TEXT,
  payload JSONB,
  receipt JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_x402_payments_hash ON x402_payments(payment_hash);
CREATE INDEX IF NOT EXISTS idx_x402_payments_status ON x402_payments(status);
CREATE INDEX IF NOT EXISTS idx_x402_payments_from_agent_created ON x402_payments(from_agent_id, created_at);

CREATE TABLE IF NOT EXISTS x402_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce TEXT NOT NULL,
  user_address TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (nonce, user_address)
);

CREATE INDEX IF NOT EXISTS idx_x402_nonces_used_at ON x402_nonces(used_at);

-- ============================================================================
-- 8. AGENT INFRASTRUCTURE
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL,
  is_active BOOLEAN DEFAULT true,
  failure_count INTEGER DEFAULT 0,
  last_failure_reason TEXT,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES agent_webhooks(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  conditions JSONB NOT NULL,
  action JSONB NOT NULL,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  triggers_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endorser_agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  endorsed_agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  capability TEXT NOT NULL,
  proof_type TEXT NOT NULL,
  proof_id UUID NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES marketplace_agents(id),
  missions_found INTEGER DEFAULT 0,
  tasks_pending INTEGER DEFAULT 0,
  competitions_active INTEGER DEFAULT 0,
  actions_taken JSONB DEFAULT '[]',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 9. DISPUTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_type TEXT NOT NULL,
  filed_by_address TEXT NOT NULL,
  filed_by_agent_id UUID REFERENCES marketplace_agents(id),
  filed_against_address TEXT NOT NULL,
  filed_against_agent_id UUID REFERENCES marketplace_agents(id),
  contract_id UUID REFERENCES marketplace_contracts(id),
  task_id UUID REFERENCES collaborate_tasks(id),
  claim TEXT NOT NULL,
  evidence JSONB DEFAULT '[]',
  status TEXT DEFAULT 'open',
  resolution TEXT,
  resolution_type TEXT,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispute_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id),
  author_address TEXT NOT NULL,
  author_agent_id UUID REFERENCES marketplace_agents(id),
  content TEXT NOT NULL,
  comment_type TEXT DEFAULT 'comment',
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 10. COMPUTE MARKETPLACE
-- ============================================================================

CREATE TABLE IF NOT EXISTS compute_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  endpoint_url TEXT NOT NULL,
  provider_type TEXT DEFAULT 'self_hosted',
  supported_features TEXT[] DEFAULT '{}',
  min_charge_usdc NUMERIC DEFAULT 1000,
  rate_limit_rpm INTEGER DEFAULT 60,
  infra_details JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  total_requests INTEGER DEFAULT 0,
  total_tokens_served BIGINT DEFAULT 0,
  total_earnings NUMERIC DEFAULT 0,
  avg_latency_ms INTEGER,
  uptime_score REAL DEFAULT 100.0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cp_agent ON compute_providers(agent_id);
CREATE INDEX IF NOT EXISTS idx_cp_active ON compute_providers(is_active);

CREATE TRIGGER compute_providers_updated_at
  BEFORE UPDATE ON compute_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS compute_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES compute_providers(id),
  model_name TEXT NOT NULL,
  display_name TEXT,
  input_price_per_1k NUMERIC NOT NULL,
  output_price_per_1k NUMERIC NOT NULL,
  max_context_length INTEGER DEFAULT 128000,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cm_provider ON compute_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_cm_name ON compute_models(model_name);

CREATE TRIGGER compute_models_updated_at
  BEFORE UPDATE ON compute_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS compute_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  consumer_agent_name TEXT NOT NULL,
  provider_id UUID REFERENCES compute_providers(id),
  provider_agent_name TEXT,
  mission_id UUID,
  task_id UUID,
  escrow_id UUID,
  resource_spec JSONB NOT NULL DEFAULT '{}',
  funding_model TEXT NOT NULL DEFAULT 'byoc',
  status TEXT NOT NULL DEFAULT 'pending',
  total_cost_usdc NUMERIC DEFAULT 0,
  max_cost_usdc NUMERIC,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cpu_seconds REAL DEFAULT 0,
  total_gpu_seconds REAL DEFAULT 0,
  total_memory_mb_seconds REAL DEFAULT 0,
  execution_count INTEGER DEFAULT 0,
  max_duration_seconds INTEGER DEFAULT 3600,
  settlement_status TEXT DEFAULT 'unsettled',
  payment_tx_hash TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_consumer ON compute_sessions(consumer_agent_id);
CREATE INDEX IF NOT EXISTS idx_cs_provider ON compute_sessions(provider_id);
CREATE INDEX IF NOT EXISTS idx_cs_status ON compute_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cs_mission ON compute_sessions(mission_id);
CREATE INDEX IF NOT EXISTS idx_cs_escrow ON compute_sessions(escrow_id);
CREATE INDEX IF NOT EXISTS idx_cs_created ON compute_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_cs_active ON compute_sessions(status) WHERE status IN ('pending', 'active');

CREATE TRIGGER compute_sessions_updated_at
  BEFORE UPDATE ON compute_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS compute_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_agent_id UUID REFERENCES marketplace_agents(id),
  consumer_agent_name TEXT,
  provider_id UUID REFERENCES compute_providers(id),
  provider_agent_name TEXT,
  model_id UUID REFERENCES compute_models(id),
  model_name TEXT NOT NULL,
  session_id UUID REFERENCES compute_sessions(id),
  status TEXT DEFAULT 'pending',
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  cost_usdc NUMERIC DEFAULT 0,
  latency_ms INTEGER,
  payment_tx_hash TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cr_consumer ON compute_requests(consumer_agent_id);
CREATE INDEX IF NOT EXISTS idx_cr_provider ON compute_requests(provider_id);
CREATE INDEX IF NOT EXISTS idx_cr_created ON compute_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_cr_session ON compute_requests(session_id);

CREATE TABLE IF NOT EXISTS execution_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES compute_sessions(id),
  compute_request_id UUID REFERENCES compute_requests(id),
  execution_type TEXT NOT NULL DEFAULT 'inference',
  model_name TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cpu_seconds REAL DEFAULT 0,
  gpu_seconds REAL DEFAULT 0,
  memory_mb_seconds REAL DEFAULT 0,
  latency_ms INTEGER,
  cost_usdc NUMERIC DEFAULT 0,
  input_hash TEXT,
  output_hash TEXT,
  provider_signature TEXT,
  status TEXT DEFAULT 'completed',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_er_session ON execution_receipts(session_id);
CREATE INDEX IF NOT EXISTS idx_er_created ON execution_receipts(created_at);

CREATE TABLE IF NOT EXISTS compute_escrow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  sponsor_agent_name TEXT NOT NULL,
  mission_id UUID,
  task_id UUID,
  total_budget_usdc NUMERIC NOT NULL,
  remaining_usdc NUMERIC NOT NULL,
  spent_usdc NUMERIC DEFAULT 0,
  max_per_session_usdc NUMERIC,
  allowed_agent_ids UUID[],
  status TEXT NOT NULL DEFAULT 'funded',
  fund_tx_hash TEXT,
  release_tx_hash TEXT,
  refund_tx_hash TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  released_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ce_sponsor ON compute_escrow(sponsor_agent_id);
CREATE INDEX IF NOT EXISTS idx_ce_mission ON compute_escrow(mission_id);
CREATE INDEX IF NOT EXISTS idx_ce_status ON compute_escrow(status);

CREATE TRIGGER compute_escrow_updated_at
  BEFORE UPDATE ON compute_escrow
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS escrow_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL REFERENCES compute_escrow(id),
  session_id UUID NOT NULL REFERENCES compute_sessions(id),
  agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  amount_usdc NUMERIC NOT NULL,
  receipt_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ed_escrow ON escrow_draws(escrow_id);
CREATE INDEX IF NOT EXISTS idx_ed_session ON escrow_draws(session_id);

-- ============================================================================
-- 11. PREDICTION MARKETS (Polymarket)
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_catalog (
  condition_id TEXT PRIMARY KEY,
  market_id TEXT,
  event_id TEXT,
  question TEXT NOT NULL,
  description TEXT,
  slug TEXT,
  icon TEXT,
  event_slug TEXT,
  clob_token_ids TEXT[],
  outcomes TEXT[],
  outcome_prices NUMERIC[],
  volume NUMERIC DEFAULT 0,
  volume_24h NUMERIC DEFAULT 0,
  volume_1wk NUMERIC DEFAULT 0,
  liquidity NUMERIC DEFAULT 0,
  spread NUMERIC DEFAULT 0,
  categories TEXT[],
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  is_closed BOOLEAN DEFAULT false,
  end_date TIMESTAMPTZ,
  start_date TIMESTAMPTZ,
  resolution_source TEXT,
  ai_sentiment TEXT,
  ai_confidence NUMERIC,
  ai_summary TEXT,
  favourite_outcome TEXT,
  source_article_urls TEXT[] DEFAULT '{}',
  price_change_24h NUMERIC DEFAULT 0,
  yes_price_24h_ago NUMERIC DEFAULT 0,
  is_trending BOOLEAN DEFAULT false,
  is_hot BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_catalog_active ON market_catalog(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_market_catalog_categories ON market_catalog USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_market_catalog_volume ON market_catalog(volume DESC);
CREATE INDEX IF NOT EXISTS idx_market_catalog_volume_24h ON market_catalog(volume_24h DESC);
CREATE INDEX IF NOT EXISTS idx_market_catalog_slug ON market_catalog(slug);
CREATE INDEX IF NOT EXISTS idx_market_catalog_end_date ON market_catalog(end_date);
CREATE INDEX IF NOT EXISTS idx_market_catalog_trending ON market_catalog(is_trending) WHERE is_trending = true;
CREATE INDEX IF NOT EXISTS idx_market_catalog_event_id ON market_catalog(event_id);
CREATE INDEX IF NOT EXISTS idx_market_catalog_question_trgm ON market_catalog USING GIN (question gin_trgm_ops);

CREATE TRIGGER trigger_market_catalog_updated_at
  BEFORE UPDATE ON market_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS market_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_value JSONB NOT NULL,
  confidence NUMERIC NOT NULL,
  source TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_condition_type ON market_signals(condition_id, signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_expires ON market_signals(expires_at);

CREATE TABLE IF NOT EXISTS user_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  condition_id TEXT NOT NULL REFERENCES market_catalog(condition_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_address, condition_id)
);

CREATE INDEX IF NOT EXISTS idx_user_watchlists_user ON user_watchlists(user_address);

CREATE TABLE IF NOT EXISTS trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  token_id TEXT,
  side TEXT NOT NULL,
  outcome TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  shares NUMERIC,
  slippage_bps NUMERIC,
  midpoint_at_execution NUMERIC,
  spread_at_execution NUMERIC,
  order_id TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_history_user ON trade_history(user_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_history_condition ON trade_history(condition_id);

CREATE TABLE IF NOT EXISTS user_seen_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  market_id TEXT NOT NULL,
  recommendation_snapshot JSONB NOT NULL,
  seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  direction TEXT NOT NULL,
  threshold NUMERIC NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_recurring BOOLEAN DEFAULT false,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  alert_id UUID REFERENCES price_alerts(id),
  condition_id TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pm_agent_memory (
  user_address TEXT PRIMARY KEY NOT NULL,
  preferences JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 12. TRACKING & OBSERVABILITY
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  agent_name TEXT,
  event_type TEXT NOT NULL,
  from_address TEXT,
  payment_amount NUMERIC,
  response_status INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_request_log_agent ON agent_request_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_request_log_type ON agent_request_log(event_type);
CREATE INDEX IF NOT EXISTS idx_agent_request_log_from ON agent_request_log(from_address);
CREATE INDEX IF NOT EXISTS idx_agent_request_log_created ON agent_request_log(created_at);

CREATE TABLE IF NOT EXISTS agent_endpoint_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  agent_name TEXT,
  endpoint_url TEXT,
  is_success BOOLEAN NOT NULL DEFAULT true,
  status_code INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_health_agent ON agent_endpoint_health(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_health_success ON agent_endpoint_health(is_success);
CREATE INDEX IF NOT EXISTS idx_agent_health_created ON agent_endpoint_health(created_at);

CREATE TABLE IF NOT EXISTS trade_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  condition_id TEXT,
  token_id TEXT,
  side TEXT NOT NULL,
  amount NUMERIC,
  error_reason TEXT NOT NULL,
  error_step TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_failures_user ON trade_failures(user_address);
CREATE INDEX IF NOT EXISTS idx_trade_failures_step ON trade_failures(error_step);
CREATE INDEX IF NOT EXISTS idx_trade_failures_created ON trade_failures(created_at);

CREATE TABLE IF NOT EXISTS login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  wallet_addresses TEXT[],
  ip_address TEXT,
  user_agent TEXT,
  waitlist_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_events_email ON login_events(email);
CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events(created_at);

CREATE TABLE IF NOT EXISTS bridge_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  source_chain TEXT NOT NULL DEFAULT 'base',
  dest_chain TEXT NOT NULL DEFAULT 'polygon',
  amount TEXT NOT NULL,
  status TEXT NOT NULL,
  deposit_address TEXT,
  tx_hash TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_tx_user ON bridge_transactions(user_address);
CREATE INDEX IF NOT EXISTS idx_bridge_tx_status ON bridge_transactions(status);
CREATE INDEX IF NOT EXISTS idx_bridge_tx_created ON bridge_transactions(created_at);

CREATE TABLE IF NOT EXISTS compliance_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'ETH',
  result TEXT NOT NULL,
  risk_level TEXT,
  risk_score NUMERIC,
  flags TEXT[],
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_address ON compliance_screenings(address);
CREATE INDEX IF NOT EXISTS idx_compliance_result ON compliance_screenings(result);
CREATE INDEX IF NOT EXISTS idx_compliance_created ON compliance_screenings(created_at);

-- ============================================================================
-- 13. DeFi
-- ============================================================================

CREATE TABLE IF NOT EXISTS defi_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  token_in TEXT,
  token_out TEXT,
  amount_in TEXT,
  amount_out TEXT,
  amount_usd NUMERIC,
  fee_paid_usd NUMERIC,
  slippage_bps INTEGER,
  price_impact NUMERIC,
  route TEXT,
  source TEXT DEFAULT 'uniswap',
  tx_hash TEXT,
  status TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_defi_activity_wallet ON defi_activity(wallet_address);
CREATE INDEX IF NOT EXISTS idx_defi_activity_timestamp ON defi_activity(created_at);

-- ============================================================================
-- 14. USERS & MISC
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_wallets (
  email TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_wallets_email ON user_wallets(email);
CREATE INDEX IF NOT EXISTS idx_user_wallets_address ON user_wallets(wallet_address);

CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  user_address TEXT NOT NULL,
  agent_id TEXT DEFAULT 'quickgig-ai-agent',
  title TEXT DEFAULT 'New Chat',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT REFERENCES chat_sessions(session_id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  position INTEGER,
  invite_code_id UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);

ALTER TABLE waitlist ADD CONSTRAINT fk_waitlist_invite_code
  FOREIGN KEY (invite_code_id) REFERENCES invite_codes(id);

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_competition_entries(p_competition_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE competitions SET current_entries = COALESCE(current_entries, 0) + 1
  WHERE id = p_competition_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_mission_agents(p_mission_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE collaborate_missions
  SET current_agents = COALESCE(current_agents, 0) + 1
  WHERE id = p_mission_id
    AND COALESCE(current_agents, 0) < COALESCE(required_agents, 999);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission is full or not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION update_agent_stats_after_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_avg_rating DECIMAL(3,2);
  v_total_reviews INTEGER;
BEGIN
  SELECT COALESCE(AVG(rating), 0), COUNT(*)
  INTO v_avg_rating, v_total_reviews
  FROM marketplace_reviews WHERE agent_id = NEW.agent_id;

  UPDATE marketplace_agents
  SET rating = v_avg_rating, total_reviews = v_total_reviews
  WHERE id = NEW.agent_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_agent_stats_trigger ON marketplace_reviews;
CREATE TRIGGER update_agent_stats_trigger
  AFTER INSERT ON marketplace_reviews
  FOR EACH ROW EXECUTE FUNCTION update_agent_stats_after_review();

CREATE OR REPLACE FUNCTION increment_competition_entries_if_available(p_competition_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_updated INTEGER;
BEGIN
  UPDATE competitions SET current_entries = COALESCE(current_entries, 0) + 1
  WHERE id = p_competition_id
    AND (max_entries IS NULL OR COALESCE(current_entries, 0) < max_entries)
  RETURNING 1 INTO v_updated;
  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION check_and_increment_rate_limit(p_key_id UUID)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, rate_limit INTEGER, reset INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rate_limit INTEGER; v_requests_today INTEGER; v_last_reset DATE;
  v_today DATE := (NOW() AT TIME ZONE 'UTC')::DATE; v_reset_ts INTEGER;
BEGIN
  SELECT ak.rate_limit, ak.requests_today, ak.last_reset_date
  INTO v_rate_limit, v_requests_today, v_last_reset
  FROM agent_api_keys ak WHERE ak.id = p_key_id FOR UPDATE;

  IF NOT FOUND THEN
    allowed := FALSE; remaining := 0; rate_limit := 0; reset := 0;
    RETURN NEXT; RETURN;
  END IF;

  v_rate_limit := COALESCE(v_rate_limit, 1000);
  v_reset_ts := EXTRACT(EPOCH FROM (date_trunc('day', NOW() AT TIME ZONE 'UTC') + interval '1 day'))::INTEGER;

  IF v_last_reset IS DISTINCT FROM v_today THEN
    UPDATE agent_api_keys SET requests_today = 1, last_reset_date = v_today, last_request_at = NOW()
    WHERE id = p_key_id;
    allowed := TRUE; remaining := v_rate_limit - 1; rate_limit := v_rate_limit; reset := v_reset_ts;
    RETURN NEXT; RETURN;
  END IF;

  v_requests_today := COALESCE(v_requests_today, 0);
  IF v_requests_today >= v_rate_limit THEN
    allowed := FALSE; remaining := 0; rate_limit := v_rate_limit; reset := v_reset_ts;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE agent_api_keys SET requests_today = v_requests_today + 1, last_request_at = NOW()
  WHERE id = p_key_id;
  allowed := TRUE; remaining := v_rate_limit - v_requests_today - 1;
  rate_limit := v_rate_limit; reset := v_reset_ts;
  RETURN NEXT; RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS TABLE(total_agents BIGINT, active_missions BIGINT, active_competitions BIGINT, total_volume NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    (SELECT COUNT(*) FROM marketplace_agents)::bigint,
    (SELECT COUNT(*) FROM collaborate_missions)::bigint,
    (SELECT COUNT(*) FROM competitions WHERE status IN ('upcoming', 'active', 'judging'))::bigint,
    COALESCE((
      SELECT SUM(amount) / 1000000
      FROM (
        SELECT amount FROM payment_proofs
        UNION ALL
        SELECT mp.amount FROM mission_payments mp
        WHERE mp.status = 'completed' AND mp.tx_hash IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM payment_proofs pp WHERE pp.tx_hash = mp.tx_hash)
        UNION ALL
        SELECT xp.amount FROM x402_payments xp
        WHERE xp.status = 'completed' AND xp.tx_hash IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM payment_proofs pp WHERE pp.tx_hash = xp.tx_hash)
      ) t
      WHERE amount IS NOT NULL AND amount <= 10000000000000
    ), 0);
$$;

CREATE OR REPLACE FUNCTION redeem_invite_code(p_code_id UUID, p_email TEXT, p_max_uses INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE invite_codes SET current_uses = current_uses + 1
  WHERE id = p_code_id AND is_active = true
    AND (p_max_uses IS NULL OR current_uses < p_max_uses);
  IF NOT FOUND THEN RAISE EXCEPTION 'Code is no longer valid'; END IF;
  INSERT INTO waitlist (email, status, approved_at, invite_code_id)
  VALUES (p_email, 'approved', now(), p_code_id)
  ON CONFLICT (email) DO UPDATE SET status = 'approved', approved_at = now(), invite_code_id = p_code_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UPDATED_AT TRIGGERS (tables that have the column but no trigger)
-- ============================================================================

CREATE TRIGGER set_updated_at BEFORE UPDATE ON x402_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON agent_automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_seen_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON pm_agent_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON defi_activity
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE collaborate_missions ADD CONSTRAINT chk_mission_status
  CHECK (status IN ('active', 'in_progress', 'completed', 'cancelled'));
ALTER TABLE collaborate_tasks ADD CONSTRAINT chk_task_status
  CHECK (status IN ('pending', 'assigned', 'in_progress', 'submitted', 'approved', 'rejected'));
ALTER TABLE collaborate_tasks ADD CONSTRAINT chk_task_payment_status
  CHECK (payment_status IN ('pending', 'paid', 'failed'));
ALTER TABLE collaborate_applications ADD CONSTRAINT chk_application_status
  CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'withdrawn'));
ALTER TABLE marketplace_agents ADD CONSTRAINT chk_agent_type
  CHECK (agent_type IN ('ai', 'human', 'hybrid'));
ALTER TABLE marketplace_agents ADD CONSTRAINT chk_agent_status
  CHECK (agent_status IN ('active', 'inactive', 'suspended', 'pending'));
ALTER TABLE competitions ADD CONSTRAINT chk_competition_status
  CHECK (status IN ('upcoming', 'active', 'judging', 'completed', 'cancelled'));
ALTER TABLE disputes ADD CONSTRAINT chk_dispute_status
  CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed', 'escalated'));

-- Additional CHECK constraints (added 2026-03-13)
ALTER TABLE marketplace_contracts ADD CONSTRAINT chk_contract_status
  CHECK (contract_status IN ('active', 'completed', 'cancelled', 'disputed'));
ALTER TABLE marketplace_contracts ADD CONSTRAINT chk_contract_payment_status
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));
ALTER TABLE compute_sessions ADD CONSTRAINT chk_session_status
  CHECK (status IN ('pending', 'provisioning', 'active', 'closing', 'closed', 'failed', 'expired'));
ALTER TABLE compute_sessions ADD CONSTRAINT chk_session_funding_model
  CHECK (funding_model IN ('byoc', 'sponsor', 'pool'));
ALTER TABLE compute_sessions ADD CONSTRAINT chk_session_settlement
  CHECK (settlement_status IN ('unsettled', 'settling', 'settled', 'failed', 'partial', 'pending_agent_settlement'));
ALTER TABLE compute_requests ADD CONSTRAINT chk_compute_request_status
  CHECK (status IN ('pending', 'completed', 'failed'));
ALTER TABLE execution_receipts ADD CONSTRAINT chk_receipt_status
  CHECK (status IN ('completed', 'failed'));
ALTER TABLE compute_escrow ADD CONSTRAINT chk_escrow_status
  CHECK (status IN ('funded', 'active', 'depleted', 'released', 'refunded', 'expired'));
ALTER TABLE price_alerts ADD CONSTRAINT chk_alert_direction
  CHECK (direction IN ('above', 'below'));
ALTER TABLE bridge_transactions ADD CONSTRAINT chk_bridge_status
  CHECK (status IN ('initiated', 'tx_sent', 'pending', 'completed', 'failed'));
ALTER TABLE agent_claims ADD CONSTRAINT chk_claim_status
  CHECK (status IN ('pending', 'verified', 'rejected', 'expired'));

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Service-role-only tables
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
ALTER TABLE x402_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE erc8004_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE compute_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE compute_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE compute_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE compute_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE compute_escrow ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_request_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_endpoint_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE defi_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
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

-- Service role full access policies
CREATE POLICY "service_role_all" ON server_wallets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON wallet_policies FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON marketplace_agents FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON marketplace_contracts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON marketplace_reviews FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON collaborate_missions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON collaborate_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON collaborate_applications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON competitions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON competition_entries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON competition_judges FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON judge_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON agent_api_keys FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON api_request_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON x402_payments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON x402_nonces FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON payment_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON erc8004_identities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON agent_webhooks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON webhook_deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON mission_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON disputes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON dispute_comments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON agent_automation_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON application_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON mission_payments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON compute_providers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON compute_models FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON compute_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON compute_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON execution_receipts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON compute_escrow FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON escrow_draws FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON trade_failures FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON agent_request_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON login_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON bridge_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON compliance_screenings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON agent_endpoint_health FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON invite_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON user_wallets FOR ALL TO service_role USING (true) WITH CHECK (true);
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

-- Public read policies (only tables accessed client-side)
CREATE POLICY "public_read" ON market_catalog FOR SELECT USING (true);
CREATE POLICY "public_read" ON user_watchlists FOR SELECT USING (true);
CREATE POLICY "public_read" ON trade_history FOR SELECT USING (true);
CREATE POLICY "public_read" ON market_signals FOR SELECT USING (true);
-- Public write policies (client-side tables)
CREATE POLICY "public_insert" ON user_watchlists FOR INSERT WITH CHECK (true);
CREATE POLICY "public_delete" ON user_watchlists FOR DELETE USING (true);
CREATE POLICY "service_role_insert" ON trade_history FOR INSERT TO service_role WITH CHECK (true);

-- DeFi policies
CREATE POLICY "defi_activity_service" ON defi_activity FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- ADDITIONAL INDEXES
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

-- FK column indexes (added 2026-03-13)
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_contract ON marketplace_reviews(contract_id);
CREATE INDEX IF NOT EXISTS idx_agent_claims_agent ON agent_claims(marketplace_agent_id);
CREATE INDEX IF NOT EXISTS idx_application_messages_sender ON application_messages(sender_agent_id);
CREATE INDEX IF NOT EXISTS idx_mission_messages_mission ON mission_messages(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_messages_sender ON mission_messages(sender_agent_id);
CREATE INDEX IF NOT EXISTS idx_mission_payments_agent ON mission_payments(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_competition_judges_competition ON competition_judges(competition_id);
CREATE INDEX IF NOT EXISTS idx_judge_scores_judge ON judge_scores(judge_id);
CREATE INDEX IF NOT EXISTS idx_judge_scores_entry ON judge_scores(entry_id);
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_agent ON agent_api_keys(agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_webhooks_agent ON agent_webhooks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_endorsements_endorser ON agent_endorsements(endorser_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_endorsements_endorsed ON agent_endorsements(endorsed_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_automation_rules_agent ON agent_automation_rules(agent_id);
CREATE INDEX IF NOT EXISTS idx_disputes_filed_by ON disputes(filed_by_agent_id);
CREATE INDEX IF NOT EXISTS idx_disputes_filed_against ON disputes(filed_against_agent_id);
CREATE INDEX IF NOT EXISTS idx_disputes_contract ON disputes(contract_id);
CREATE INDEX IF NOT EXISTS idx_disputes_task ON disputes(task_id);
CREATE INDEX IF NOT EXISTS idx_dispute_comments_dispute ON dispute_comments(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_comments_author ON dispute_comments(author_agent_id);
CREATE INDEX IF NOT EXISTS idx_compute_requests_model ON compute_requests(model_id);
CREATE INDEX IF NOT EXISTS idx_execution_receipts_request ON execution_receipts(compute_request_id);
CREATE INDEX IF NOT EXISTS idx_escrow_draws_agent ON escrow_draws(agent_id);
CREATE INDEX IF NOT EXISTS idx_market_signals_condition ON market_signals(condition_id);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_alert ON alert_notifications(alert_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_agent ON payment_proofs(agent_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_used_at ON payment_proofs(used_at);

-- UNIQUE constraints (added 2026-03-13)
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_claims_active ON agent_claims(marketplace_agent_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_reviewer_contract ON marketplace_reviews(reviewer_address, contract_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_judges_competition_address ON competition_judges(competition_id, judge_address);
CREATE UNIQUE INDEX IF NOT EXISTS uq_judge_scores_judge_entry ON judge_scores(judge_id, entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_agent_name ON agent_api_keys(agent_id, name) WHERE revoked_at IS NULL;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION increment_competition_entries(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_mission_agents(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_competition_entries_if_available(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION check_and_increment_rate_limit(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_platform_stats() TO anon, authenticated, service_role;
