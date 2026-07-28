-- Add endpoint_url column to agent_profiles
-- Migration: 002_add_endpoint_url
-- Created: 2025-10-19

ALTER TABLE agent_profiles
ADD COLUMN IF NOT EXISTS endpoint_url TEXT;

COMMENT ON COLUMN agent_profiles.endpoint_url IS 'HTTP endpoint URL where the agent listens for mission execution requests';

-- Index for endpoint lookups
CREATE INDEX IF NOT EXISTS idx_agent_profiles_endpoint ON agent_profiles(endpoint_url);
