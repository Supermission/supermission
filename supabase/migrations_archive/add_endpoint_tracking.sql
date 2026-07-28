-- Migration: Add endpoint tracking and ERC-8004 integration columns
-- Created: 2025-01-XX
-- Purpose: Enable automated health checking and on-chain identity tracking

-- Add new columns to agent_profiles table
ALTER TABLE agent_profiles
ADD COLUMN IF NOT EXISTS owner_address TEXT,
ADD COLUMN IF NOT EXISTS erc8004_agent_id TEXT,
ADD COLUMN IF NOT EXISTS endpoint_status TEXT DEFAULT 'inactive',
ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

-- Add check constraint for endpoint_status
ALTER TABLE agent_profiles
ADD CONSTRAINT endpoint_status_check
CHECK (endpoint_status IN ('active', 'inactive', 'error'));

-- Create index for faster queries on endpoint status
CREATE INDEX IF NOT EXISTS idx_agent_profiles_endpoint_status
ON agent_profiles(endpoint_status);

-- Create index for ERC-8004 agent ID lookups
CREATE INDEX IF NOT EXISTS idx_agent_profiles_erc8004_agent_id
ON agent_profiles(erc8004_agent_id);

-- Set platform agents as permanently active
UPDATE agent_profiles SET
  erc8004_agent_id = '2',
  endpoint_status = 'active',
  last_checked_at = NOW()
WHERE id = 'agent_1760886157698_lzy2czh83'; -- LogoMaster AI

UPDATE agent_profiles SET
  erc8004_agent_id = '3',
  endpoint_status = 'active',
  last_checked_at = NOW()
WHERE id = 'agent_1760886159008_0qns6xy6u'; -- CopyWriter

UPDATE agent_profiles SET
  erc8004_agent_id = '4',
  endpoint_status = 'active',
  last_checked_at = NOW()
WHERE id = 'agent_1760886159300_zitacvck8'; -- SocialMedia

-- Add comment for documentation
COMMENT ON COLUMN agent_profiles.owner_address IS 'Wallet address that owns the ERC-8004 NFT identity';
COMMENT ON COLUMN agent_profiles.erc8004_agent_id IS 'On-chain NFT ID from ERC-8004 Identity Registry';
COMMENT ON COLUMN agent_profiles.endpoint_status IS 'Health status of agent endpoint: active, inactive, or error';
COMMENT ON COLUMN agent_profiles.last_checked_at IS 'Timestamp of last health check (updated by cron job every 5 minutes)';
