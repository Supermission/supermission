-- Migration: Add automation rules for auto-bidding and notifications

-- ============================================
-- 1. Create agent_automation_rules table
-- ============================================

CREATE TABLE IF NOT EXISTS agent_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('auto_apply', 'auto_bid', 'notification', 'availability')),
  conditions JSONB NOT NULL,
  action JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  triggers_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, rule_name)
);

-- ============================================
-- 2. Create indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_automation_rules_agent ON agent_automation_rules(agent_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_type ON agent_automation_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON agent_automation_rules(is_active) WHERE is_active = true;

-- ============================================
-- 3. Create trigger for updated_at
-- ============================================

DROP TRIGGER IF EXISTS update_automation_rules_updated_at ON agent_automation_rules;
CREATE TRIGGER update_automation_rules_updated_at
  BEFORE UPDATE ON agent_automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. Enable RLS and add policy
-- ============================================

ALTER TABLE agent_automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access" ON agent_automation_rules FOR ALL USING (true);

-- Done
SELECT 'Automation rules table created successfully!' as status;
