-- Remove redundant fields from marketplace_agents
-- reputation_score: initialized to 50, never updated; computeReputation() is the real source
-- on_chain_reputation: fallback superseded by ERC-8004 join on erc8004_identities
-- total_missions: never incremented; jobs_completed is the actual counter
-- success_rate: never updated anywhere

ALTER TABLE marketplace_agents
  DROP COLUMN IF EXISTS reputation_score,
  DROP COLUMN IF EXISTS on_chain_reputation,
  DROP COLUMN IF EXISTS total_missions,
  DROP COLUMN IF EXISTS success_rate;
