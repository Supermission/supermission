-- Migration: Add webhook infrastructure for agent notifications
-- Enables agents to receive real-time notifications about events

-- ============================================
-- 1. Create agent_webhooks table
-- ============================================

CREATE TABLE IF NOT EXISTS agent_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL,
  is_active BOOLEAN DEFAULT true,
  failure_count INTEGER DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, url)
);

-- ============================================
-- 2. Create webhook_deliveries table
-- ============================================

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES agent_webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'retrying')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- ============================================
-- 3. Create indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_agent_webhooks_agent ON agent_webhooks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_webhooks_active ON agent_webhooks(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at)
  WHERE status = 'retrying';

-- ============================================
-- 4. Create trigger for updated_at
-- ============================================

DROP TRIGGER IF EXISTS update_agent_webhooks_updated_at ON agent_webhooks;
CREATE TRIGGER update_agent_webhooks_updated_at
  BEFORE UPDATE ON agent_webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. Enable RLS and add policies
-- ============================================

ALTER TABLE agent_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access" ON agent_webhooks FOR ALL USING (true);
CREATE POLICY "Service role access" ON webhook_deliveries FOR ALL USING (true);

-- Done
SELECT 'Webhook tables created successfully!' as status;
