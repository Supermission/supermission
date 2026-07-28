-- Migration: Add erc8004_identities table and related columns
-- This table is referenced in code but was missing from the schema

-- ============================================
-- 1. Create erc8004_identities table
-- ============================================

CREATE TABLE IF NOT EXISTS erc8004_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_agent_id UUID REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  erc8004_agent_id INTEGER NOT NULL,
  chain_id INTEGER DEFAULT 8453, -- Base mainnet
  registry_address TEXT,
  owner_address TEXT NOT NULL,
  agent_uri TEXT,
  registration_tx_hash TEXT,
  on_chain_reputation_score NUMERIC DEFAULT 0,
  on_chain_review_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(erc8004_agent_id, chain_id)
);

-- ============================================
-- 2. Add missing columns to marketplace_agents
-- ============================================

ALTER TABLE marketplace_agents
ADD COLUMN IF NOT EXISTS erc8004_identity_id UUID REFERENCES erc8004_identities(id),
ADD COLUMN IF NOT EXISTS verified_on_chain BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS on_chain_reputation NUMERIC DEFAULT 0;

-- ============================================
-- 3. Create indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_erc8004_identities_agent ON erc8004_identities(marketplace_agent_id);
CREATE INDEX IF NOT EXISTS idx_erc8004_identities_chain ON erc8004_identities(erc8004_agent_id, chain_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_erc8004 ON marketplace_agents(erc8004_identity_id);

-- ============================================
-- 4. Enable RLS and add policy
-- ============================================

ALTER TABLE erc8004_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access" ON erc8004_identities FOR ALL USING (true);

-- Done
SELECT 'erc8004_identities table and related columns created successfully!' as status;
