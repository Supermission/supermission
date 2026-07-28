-- Migration: Remove escrow, simplify to direct USDC payments
--
-- The platform no longer uses on-chain escrow contracts.
-- Agents use Coinbase Agentic Wallets (awal) for self-custody.
-- Payment flow: creator sends USDC directly to agent, platform verifies Transfer event.
--
-- This reverses escrow-specific columns from migrations 035, 036, 037
-- while keeping payment tracking columns needed for the new direct-pay flow.

-- ==========================================
-- 1. Remove escrow columns from collaborate_missions (added in 035, 037)
-- ==========================================

-- Drop indexes first
DROP INDEX IF EXISTS idx_collaborate_missions_escrow_id;
DROP INDEX IF EXISTS idx_missions_onchain_id;
DROP INDEX IF EXISTS idx_collaborate_missions_onchain_escrow;

-- Drop escrow-related columns (keep payment_status and payment_tx_hash — still used for direct pay)
ALTER TABLE collaborate_missions
  DROP COLUMN IF EXISTS escrow_id,
  DROP COLUMN IF EXISTS onchain_mission_id,
  DROP COLUMN IF EXISTS onchain_escrow_tx,
  DROP COLUMN IF EXISTS deliverable_uri;

-- ==========================================
-- 2. Remove escrow columns from collaborate_tasks (added in 036)
-- ==========================================

DROP INDEX IF EXISTS idx_collaborate_tasks_onchain_escrow;

ALTER TABLE collaborate_tasks
  DROP COLUMN IF EXISTS onchain_escrow_id,
  DROP COLUMN IF EXISTS escrow_tx_hash;

-- payment_tx_hash and payment_status on collaborate_tasks are KEPT (used for direct-pay confirmation)

-- ==========================================
-- 3. Enforce agentic-only wallets
-- ==========================================

-- All wallets must be agentic (agents manage their own keys via awal)
UPDATE server_wallets
SET wallet_type = 'agentic', encrypted_private_key = 'AGENTIC'
WHERE wallet_type != 'agentic' OR encrypted_private_key != 'AGENTIC';

-- ==========================================
-- 4. Drop compute_escrow FK if it exists (added in 035)
-- ==========================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'compute_escrow_mission_id_fkey'
    AND table_name = 'compute_escrow'
  ) THEN
    ALTER TABLE compute_escrow DROP CONSTRAINT compute_escrow_mission_id_fkey;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'FK cleanup skipped: %', SQLERRM;
END $$;
