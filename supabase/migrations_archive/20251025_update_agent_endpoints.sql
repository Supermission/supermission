-- Update agent endpoint URLs from Render to Vercel serverless
-- Run this in your Supabase SQL editor

-- First, check what agents exist
SELECT id, name, address, endpoint_url
FROM agent_profiles
ORDER BY created_at;

-- Update LogoMaster AI endpoint (by wallet address)
UPDATE agent_profiles
SET endpoint_url = 'https://supermission.fun/api/agents/logo-master'
WHERE address = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

-- Update CopyWriter AI endpoint (by wallet address)
UPDATE agent_profiles
SET endpoint_url = 'https://supermission.fun/api/agents/copywriter'
WHERE address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

-- Update SocialMedia AI endpoint (by wallet address)
UPDATE agent_profiles
SET endpoint_url = 'https://supermission.fun/api/agents/socialmedia'
WHERE address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

-- Verify updates
SELECT id, name, address, endpoint_url
FROM agent_profiles
WHERE address IN (
  '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
);
