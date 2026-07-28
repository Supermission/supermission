-- Compute Sessions: Session-based compute lifecycle with metering, receipts, and escrow
-- Extends the v0 inference proxy with session management, execution receipts, and sponsor-funded escrow

-- 1. Compute Sessions
CREATE TABLE IF NOT EXISTS compute_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  consumer_agent_name TEXT NOT NULL,
  provider_id UUID REFERENCES compute_providers(id),
  provider_agent_name TEXT,
  mission_id TEXT REFERENCES missions(id),
  task_id UUID REFERENCES collaborate_tasks(id),

  -- Session config
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','provisioning','active','closing','closed','failed','expired')),
  funding_model TEXT NOT NULL DEFAULT 'byoc'
    CHECK (funding_model IN ('byoc','sponsor','pool')),

  -- Resource specification
  resource_spec JSONB NOT NULL DEFAULT '{}',
  -- Expected shape: { gpuType?, memoryMb?, cpuCores?, durationSeconds?, model? }

  -- Metering aggregates (updated per execution)
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cpu_seconds REAL DEFAULT 0,
  total_gpu_seconds REAL DEFAULT 0,
  total_memory_mb_seconds REAL DEFAULT 0,
  total_cost_usdc TEXT DEFAULT '0',
  execution_count INTEGER DEFAULT 0,

  -- Limits
  max_cost_usdc TEXT,         -- Cost cap for the session
  max_duration_seconds INTEGER DEFAULT 3600, -- 1 hour default

  -- Settlement
  payment_tx_hash TEXT,
  settlement_status TEXT DEFAULT 'unsettled'
    CHECK (settlement_status IN ('unsettled','settling','settled','failed','partial')),

  -- Escrow reference (for sponsor-funded sessions)
  escrow_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- 2. Execution Receipts (one per execution within a session)
CREATE TABLE IF NOT EXISTS execution_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES compute_sessions(id) ON DELETE CASCADE,
  compute_request_id UUID REFERENCES compute_requests(id),

  -- Execution details
  execution_type TEXT NOT NULL DEFAULT 'inference'
    CHECK (execution_type IN ('inference','code','training','custom')),
  input_hash TEXT,           -- keccak256 of input
  output_hash TEXT,          -- keccak256 of output

  -- Resource metering
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cpu_seconds REAL DEFAULT 0,
  gpu_seconds REAL DEFAULT 0,
  memory_mb_seconds REAL DEFAULT 0,
  cost_usdc TEXT DEFAULT '0',
  latency_ms INTEGER,

  -- Provider attestation
  provider_signature TEXT,   -- Provider signs the receipt (phase 1: simple signature)
  model_name TEXT,

  -- Status
  status TEXT DEFAULT 'completed'
    CHECK (status IN ('pending','completed','failed')),
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 3. Compute Escrow (sponsor-funded compute budgets)
CREATE TABLE IF NOT EXISTS compute_escrow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  sponsor_agent_name TEXT NOT NULL,
  mission_id TEXT REFERENCES missions(id),
  task_id UUID REFERENCES collaborate_tasks(id),

  -- Budget
  total_budget_usdc TEXT NOT NULL,
  spent_usdc TEXT DEFAULT '0',
  remaining_usdc TEXT NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'funded'
    CHECK (status IN ('funded','active','depleted','released','refunded','expired')),

  -- Constraints
  max_per_session_usdc TEXT,    -- Cap per session draw
  allowed_agent_ids UUID[],     -- Which agents can draw from this escrow

  -- Settlement
  fund_tx_hash TEXT,            -- TX hash of initial escrow funding
  release_tx_hash TEXT,         -- TX hash when escrow is released
  refund_tx_hash TEXT,          -- TX hash if escrow is refunded

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- 4. Escrow Draws (individual draws from escrow)
CREATE TABLE IF NOT EXISTS escrow_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL REFERENCES compute_escrow(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES compute_sessions(id),
  agent_id UUID NOT NULL REFERENCES marketplace_agents(id),

  amount_usdc TEXT NOT NULL,
  receipt_id UUID REFERENCES execution_receipts(id),
  description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- Indexes
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_cs_consumer ON compute_sessions(consumer_agent_id);
CREATE INDEX IF NOT EXISTS idx_cs_provider ON compute_sessions(provider_id);
CREATE INDEX IF NOT EXISTS idx_cs_status ON compute_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cs_mission ON compute_sessions(mission_id) WHERE mission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cs_escrow ON compute_sessions(escrow_id) WHERE escrow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cs_created ON compute_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_active ON compute_sessions(status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_er_session ON execution_receipts(session_id);
CREATE INDEX IF NOT EXISTS idx_er_created ON execution_receipts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ce_sponsor ON compute_escrow(sponsor_agent_id);
CREATE INDEX IF NOT EXISTS idx_ce_mission ON compute_escrow(mission_id) WHERE mission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ce_status ON compute_escrow(status);

CREATE INDEX IF NOT EXISTS idx_ed_escrow ON escrow_draws(escrow_id);
CREATE INDEX IF NOT EXISTS idx_ed_session ON escrow_draws(session_id);

-- ==========================================
-- Updated_at triggers
-- ==========================================

DROP TRIGGER IF EXISTS compute_sessions_updated_at ON compute_sessions;
CREATE TRIGGER compute_sessions_updated_at
  BEFORE UPDATE ON compute_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS compute_escrow_updated_at ON compute_escrow;
CREATE TRIGGER compute_escrow_updated_at
  BEFORE UPDATE ON compute_escrow
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- RLS
-- ==========================================

ALTER TABLE compute_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE compute_escrow ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_draws ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON compute_sessions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON execution_receipts FOR ALL USING (true);
CREATE POLICY "Service role full access" ON compute_escrow FOR ALL USING (true);
CREATE POLICY "Service role full access" ON escrow_draws FOR ALL USING (true);

-- ==========================================
-- Add session_id to compute_requests for linking
-- ==========================================

DO $$ BEGIN
  ALTER TABLE compute_requests ADD COLUMN session_id UUID REFERENCES compute_sessions(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_cr_session ON compute_requests(session_id) WHERE session_id IS NOT NULL;

SELECT 'Compute sessions, execution receipts, and escrow tables created' as status;
