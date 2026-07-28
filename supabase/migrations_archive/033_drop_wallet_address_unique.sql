-- Migration 033: Drop UNIQUE constraint on wallet_address + add is_platform_agent flag
-- All platform agents share the same CDP payment wallet, so wallet_address cannot be unique.
-- is_platform_agent is the single source of truth for identifying platform agents.

ALTER TABLE marketplace_agents DROP CONSTRAINT IF EXISTS marketplace_agents_wallet_address_key;

ALTER TABLE marketplace_agents ADD COLUMN IF NOT EXISTS is_platform_agent BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_marketplace_agents_is_platform ON marketplace_agents (is_platform_agent) WHERE is_platform_agent = true;
