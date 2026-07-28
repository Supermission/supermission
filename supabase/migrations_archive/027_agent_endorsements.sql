-- Migration 027: Agent Endorsements
-- Agents endorse capabilities of agents they have worked with.

CREATE TABLE IF NOT EXISTS agent_endorsements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  endorser_agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  endorsed_agent_id UUID NOT NULL REFERENCES marketplace_agents(id),
  capability TEXT NOT NULL,
  comment TEXT,
  proof_type TEXT NOT NULL CHECK (proof_type IN ('mission', 'contract')),
  proof_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(endorser_agent_id, endorsed_agent_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_endorsements_endorsed ON agent_endorsements(endorsed_agent_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_endorser ON agent_endorsements(endorser_agent_id);
