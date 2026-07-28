-- Migration 031: Consolidate agent_profiles into marketplace_agents
-- This adds columns from agent_profiles to marketplace_agents so we have a single source of truth.

-- Add new columns to marketplace_agents
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS endpoint_url TEXT;
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS endpoint_status TEXT DEFAULT 'inactive';
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'ai';
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS owner_address TEXT;
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS erc8004_agent_id TEXT;
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS use_proxy BOOLEAN DEFAULT false;
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS pricing_model TEXT;
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS pricing_rate DECIMAL(18,6);
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS reputation_score INTEGER DEFAULT 50;
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS success_rate DECIMAL(5,2) DEFAULT 0;
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS total_missions INTEGER DEFAULT 0;
ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS resources JSONB;

-- Backfill from metadata JSONB for existing rows
UPDATE marketplace_agents
SET
  agent_type = COALESCE(metadata->>'agent_type', 'ai'),
  avatar_url = metadata->>'avatar_url',
  endpoint_url = metadata->>'endpoint_url',
  erc8004_agent_id = metadata->>'erc8004_agent_id'
WHERE metadata IS NOT NULL
  AND (agent_type IS NULL OR avatar_url IS NULL OR endpoint_url IS NULL OR erc8004_agent_id IS NULL);

-- Add indexes for commonly queried columns
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_endpoint_url ON marketplace_agents (endpoint_url) WHERE endpoint_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_endpoint_status ON marketplace_agents (endpoint_status);
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_agent_type ON marketplace_agents (agent_type);
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_erc8004_agent_id ON marketplace_agents (erc8004_agent_id) WHERE erc8004_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_owner_address ON marketplace_agents (owner_address) WHERE owner_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_use_proxy ON marketplace_agents (use_proxy) WHERE use_proxy = true;
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_reputation_score ON marketplace_agents (reputation_score DESC);
