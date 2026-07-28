-- Compute Marketplace: Agents selling LLM inference for USDC via x402
-- 3 tables: compute_providers, compute_models, compute_requests

-- 1. Compute Providers (1:1 with marketplace_agents)
CREATE TABLE IF NOT EXISTS compute_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  endpoint_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  rate_limit_rpm INTEGER DEFAULT 60,
  min_charge_usdc TEXT DEFAULT '1000',
  supported_features TEXT[] DEFAULT '{}',
  provider_type TEXT DEFAULT 'self_hosted',
  infra_details JSONB DEFAULT '{}',
  total_requests INTEGER DEFAULT 0,
  total_tokens_served BIGINT DEFAULT 0,
  total_earnings TEXT DEFAULT '0',
  avg_latency_ms INTEGER,
  uptime_score REAL DEFAULT 100.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id)
);

-- 2. Models offered by each provider
CREATE TABLE IF NOT EXISTS compute_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES compute_providers(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  display_name TEXT,
  input_price_per_1k TEXT NOT NULL,
  output_price_per_1k TEXT NOT NULL,
  max_context_length INTEGER DEFAULT 128000,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_id, model_name)
);

-- 3. Audit trail of every inference request
CREATE TABLE IF NOT EXISTS compute_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_agent_id UUID REFERENCES marketplace_agents(id),
  consumer_agent_name TEXT,
  provider_id UUID REFERENCES compute_providers(id),
  provider_agent_name TEXT,
  model_id UUID REFERENCES compute_models(id),
  model_name TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  cost_usdc TEXT DEFAULT '0',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  payment_tx_hash TEXT,
  latency_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cp_agent ON compute_providers(agent_id);
CREATE INDEX IF NOT EXISTS idx_cp_active ON compute_providers(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cm_provider ON compute_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_cm_name ON compute_models(model_name);
CREATE INDEX IF NOT EXISTS idx_cr_consumer ON compute_requests(consumer_agent_id);
CREATE INDEX IF NOT EXISTS idx_cr_provider ON compute_requests(provider_id);
CREATE INDEX IF NOT EXISTS idx_cr_created ON compute_requests(created_at DESC);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compute_providers_updated_at ON compute_providers;
CREATE TRIGGER compute_providers_updated_at
  BEFORE UPDATE ON compute_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS compute_models_updated_at ON compute_models;
CREATE TRIGGER compute_models_updated_at
  BEFORE UPDATE ON compute_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE compute_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE compute_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE compute_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON compute_providers FOR ALL USING (true);
CREATE POLICY "Service role full access" ON compute_models FOR ALL USING (true);
CREATE POLICY "Service role full access" ON compute_requests FOR ALL USING (true);

SELECT 'Compute marketplace tables created' as status;
