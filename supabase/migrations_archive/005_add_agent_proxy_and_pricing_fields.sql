-- Add agent proxy system and enhanced pricing fields
-- Migration: 005_add_agent_proxy_and_pricing_fields
-- Created: 2025-10-25

-- ============================================================================
-- AGENT PROFILES: Add new fields for proxy system and enhanced pricing
-- ============================================================================

-- Add pricing model (per_task or per_message)
ALTER TABLE agent_profiles
ADD COLUMN IF NOT EXISTS pricing_model TEXT CHECK (pricing_model IN ('per_task', 'per_message'));

-- Add pricing rate (the actual numeric rate)
ALTER TABLE agent_profiles
ADD COLUMN IF NOT EXISTS pricing_rate DECIMAL(18,6) CHECK (pricing_rate >= 0);

-- Add proxy system flag (if true, SUPERMISSION wraps their endpoint with X402)
ALTER TABLE agent_profiles
ADD COLUMN IF NOT EXISTS use_proxy BOOLEAN DEFAULT false;

-- Add ERC-8004 NFT ID (on-chain identity token ID)
ALTER TABLE agent_profiles
ADD COLUMN IF NOT EXISTS erc8004_nft_id TEXT;

-- Add discoverable flag (controls marketplace visibility)
ALTER TABLE agent_profiles
ADD COLUMN IF NOT EXISTS is_discoverable BOOLEAN DEFAULT true;

-- ============================================================================
-- INDEXES for new fields
-- ============================================================================

-- Index for pricing model queries
CREATE INDEX IF NOT EXISTS idx_agent_profiles_pricing_model ON agent_profiles(pricing_model);

-- Index for ERC-8004 lookups
CREATE INDEX IF NOT EXISTS idx_agent_profiles_erc8004_nft ON agent_profiles(erc8004_nft_id);

-- Index for discoverable agents (marketplace queries)
CREATE INDEX IF NOT EXISTS idx_agent_profiles_discoverable ON agent_profiles(is_discoverable) WHERE is_discoverable = true;

-- Composite index for pricing queries (discoverable + pricing model)
CREATE INDEX IF NOT EXISTS idx_agent_profiles_pricing ON agent_profiles(is_discoverable, pricing_model, pricing_rate);

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON COLUMN agent_profiles.pricing_model IS 'Pricing model: per_task (one-time payment) or per_message (pay per API call)';
COMMENT ON COLUMN agent_profiles.pricing_rate IS 'Numeric rate in USDC (e.g., 0.05 for 5 cents)';
COMMENT ON COLUMN agent_profiles.use_proxy IS 'If true, SUPERMISSION wraps agent endpoint with X402 payment handling';
COMMENT ON COLUMN agent_profiles.erc8004_nft_id IS 'ERC-8004 NFT token ID for on-chain agent identity and reputation';
COMMENT ON COLUMN agent_profiles.is_discoverable IS 'Controls whether agent appears in public marketplace';

-- ============================================================================
-- DATA MIGRATION: Update existing agents with default values
-- ============================================================================

-- Set existing agents to per_task pricing by default (if they have pricing_per_task)
UPDATE agent_profiles
SET pricing_model = 'per_task',
    pricing_rate = pricing_per_task,
    use_proxy = false,
    is_discoverable = true
WHERE pricing_model IS NULL AND pricing_per_task IS NOT NULL;

-- ============================================================================
-- OPTIONAL: Create view for discoverable agents with full pricing info
-- ============================================================================

CREATE OR REPLACE VIEW discoverable_agents AS
SELECT
  id,
  name,
  address,
  capabilities,
  agent_type,
  reputation_score,
  success_rate,
  total_missions,
  pricing_model,
  pricing_rate,
  use_proxy,
  endpoint_url,
  erc8004_nft_id,
  bio,
  avatar_url,
  created_at
FROM agent_profiles
WHERE is_discoverable = true
ORDER BY reputation_score DESC, total_missions DESC;

COMMENT ON VIEW discoverable_agents IS 'Public view of all discoverable agents with pricing information for marketplace';
