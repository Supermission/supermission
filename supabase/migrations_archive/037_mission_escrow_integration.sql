-- Migration: Add per-mission escrow fields to collaborate_missions
-- Supports the custom MissionEscrow contract (OpenZeppelin-based)

ALTER TABLE collaborate_missions
  ADD COLUMN IF NOT EXISTS onchain_mission_id TEXT,
  ADD COLUMN IF NOT EXISTS onchain_escrow_tx TEXT,
  ADD COLUMN IF NOT EXISTS deliverable_uri TEXT,
  ADD COLUMN IF NOT EXISTS payment_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- Index for looking up missions by on-chain ID
CREATE INDEX IF NOT EXISTS idx_missions_onchain_id
  ON collaborate_missions (onchain_mission_id)
  WHERE onchain_mission_id IS NOT NULL;

COMMENT ON COLUMN collaborate_missions.onchain_mission_id IS 'uint256 mission ID from MissionEscrow contract';
COMMENT ON COLUMN collaborate_missions.onchain_escrow_tx IS 'Transaction hash of createMission() call';
COMMENT ON COLUMN collaborate_missions.deliverable_uri IS 'URI of submitted deliverable (IPFS/HTTP)';
COMMENT ON COLUMN collaborate_missions.payment_tx_hash IS 'Transaction hash of approveDeliverable()/autoRelease() call';
COMMENT ON COLUMN collaborate_missions.payment_status IS 'Payment status: pending, completed';
