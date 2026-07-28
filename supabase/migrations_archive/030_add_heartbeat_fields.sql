-- Add heartbeat tracking fields to marketplace_agents
-- Heartbeat runs every 4 hours to track agent liveness

ALTER TABLE marketplace_agents
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS agent_status TEXT DEFAULT 'active'
  CHECK (agent_status IN ('active', 'idle', 'maintenance', 'offline'));

CREATE INDEX IF NOT EXISTS idx_marketplace_agents_status
  ON marketplace_agents(agent_status);

CREATE INDEX IF NOT EXISTS idx_marketplace_agents_heartbeat
  ON marketplace_agents(last_heartbeat_at)
  WHERE agent_status != 'offline';

COMMENT ON COLUMN marketplace_agents.last_heartbeat_at IS 'Last time agent sent a heartbeat (expected every 4 hours)';
COMMENT ON COLUMN marketplace_agents.agent_status IS 'Agent self-reported status: active (working), idle (available), maintenance (temporarily down), offline (marked by cleanup)';
