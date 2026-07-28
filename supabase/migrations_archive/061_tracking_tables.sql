-- Migration 061: Tracking tables for admin visibility
-- 6 tables for previously untracked flows

-- ============================================================================
-- 1. TRADE FAILURES — failed trade attempts with reason
-- ============================================================================
CREATE TABLE IF NOT EXISTS trade_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  condition_id TEXT,
  token_id TEXT,
  amount NUMERIC,
  error_reason TEXT NOT NULL,
  error_step TEXT, -- e.g. 'balance_check', 'compliance', 'bridge', 'order_submit', 'approval'
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trade_failures_user ON trade_failures(user_address);
CREATE INDEX idx_trade_failures_step ON trade_failures(error_step);
CREATE INDEX idx_trade_failures_created ON trade_failures(created_at DESC);

ALTER TABLE trade_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages trade_failures" ON trade_failures FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. AGENT REQUEST LOG — every proxy hit (402s + paid calls)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  from_address TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('payment_required', 'payment_verified', 'payment_failed', 'agent_forwarded', 'agent_error')),
  payment_amount TEXT,
  response_status INT,
  response_time_ms INT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_request_log_agent ON agent_request_log(agent_id);
CREATE INDEX idx_agent_request_log_type ON agent_request_log(event_type);
CREATE INDEX idx_agent_request_log_from ON agent_request_log(from_address);
CREATE INDEX idx_agent_request_log_created ON agent_request_log(created_at DESC);

ALTER TABLE agent_request_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages agent_request_log" ON agent_request_log FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. LOGIN EVENTS — every session creation
-- ============================================================================
CREATE TABLE IF NOT EXISTS login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  wallet_addresses TEXT[],
  waitlist_status TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_events_email ON login_events(email);
CREATE INDEX idx_login_events_created ON login_events(created_at DESC);

ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages login_events" ON login_events FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. BRIDGE TRANSACTIONS — Base→Polygon USDC bridges
-- ============================================================================
CREATE TABLE IF NOT EXISTS bridge_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  amount TEXT NOT NULL,
  source_chain TEXT NOT NULL DEFAULT 'base',
  dest_chain TEXT NOT NULL DEFAULT 'polygon',
  tx_hash TEXT,
  deposit_address TEXT,
  status TEXT NOT NULL CHECK (status IN ('initiated', 'tx_sent', 'arrived', 'timeout', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bridge_tx_user ON bridge_transactions(user_address);
CREATE INDEX idx_bridge_tx_status ON bridge_transactions(status);
CREATE INDEX idx_bridge_tx_created ON bridge_transactions(created_at DESC);

ALTER TABLE bridge_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages bridge_transactions" ON bridge_transactions FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. COMPLIANCE SCREENINGS — Circle compliance check results
-- ============================================================================
CREATE TABLE IF NOT EXISTS compliance_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'ETH',
  risk_level TEXT, -- LOW, MEDIUM, HIGH, SEVERE
  risk_score NUMERIC,
  flags TEXT[],
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'error', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_address ON compliance_screenings(address);
CREATE INDEX idx_compliance_result ON compliance_screenings(result);
CREATE INDEX idx_compliance_created ON compliance_screenings(created_at DESC);

ALTER TABLE compliance_screenings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages compliance_screenings" ON compliance_screenings FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 6. AGENT ENDPOINT HEALTH — proxy→agent forwarding outcomes
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_endpoint_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  endpoint_url TEXT,
  status_code INT,
  response_time_ms INT,
  is_success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_health_agent ON agent_endpoint_health(agent_id);
CREATE INDEX idx_agent_health_success ON agent_endpoint_health(is_success);
CREATE INDEX idx_agent_health_created ON agent_endpoint_health(created_at DESC);

ALTER TABLE agent_endpoint_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages agent_endpoint_health" ON agent_endpoint_health FOR ALL USING (true) WITH CHECK (true);
