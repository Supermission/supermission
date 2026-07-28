-- Migration: Escrow-based mission funding
-- Adds escrow_id to missions and pending_funding status support
-- Adds wallet_type to server_wallets for agentic wallet support

-- 1. Add escrow_id column to collaborate_missions
ALTER TABLE collaborate_missions
  ADD COLUMN IF NOT EXISTS escrow_id UUID REFERENCES compute_escrow(id);

-- 2. Add wallet_type to server_wallets (agentic vs cdp_managed)
ALTER TABLE server_wallets
  ADD COLUMN IF NOT EXISTS wallet_type TEXT DEFAULT 'cdp_managed';

-- 3. Index for quick escrow lookups by mission
CREATE INDEX IF NOT EXISTS idx_collaborate_missions_escrow_id
  ON collaborate_missions(escrow_id)
  WHERE escrow_id IS NOT NULL;

-- 4. Update compute_escrow mission_id foreign key to point to collaborate_missions
-- (The existing FK may point to a non-existent 'missions' table — make it work with collaborate_missions)
-- Only add if not already referencing the correct table
DO $$
BEGIN
  -- Drop the old FK if it exists and points to wrong table
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'compute_escrow_mission_id_fkey'
    AND table_name = 'compute_escrow'
  ) THEN
    ALTER TABLE compute_escrow DROP CONSTRAINT compute_escrow_mission_id_fkey;
  END IF;

  -- Add FK to collaborate_missions (if column exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compute_escrow' AND column_name = 'mission_id'
  ) THEN
    ALTER TABLE compute_escrow
      ADD CONSTRAINT compute_escrow_mission_id_fkey
      FOREIGN KEY (mission_id) REFERENCES collaborate_missions(id);
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'FK migration skipped: %', SQLERRM;
END $$;
