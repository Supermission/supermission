-- Migration: Agentic Wallet Only + On-Chain Escrow
-- Removes CDP dependency, adds on-chain escrow tracking columns

-- 1. Mark all existing wallets as agentic (no more CDP-managed wallets)
UPDATE server_wallets SET wallet_type = 'agentic', encrypted_private_key = 'AGENTIC'
WHERE wallet_type != 'agentic' OR encrypted_private_key != 'AGENTIC';

-- 2. Add on-chain escrow ID to missions (from Agent Escrow Protocol contract)
ALTER TABLE collaborate_missions
  ADD COLUMN IF NOT EXISTS onchain_escrow_id TEXT;

-- 3. Add on-chain escrow tracking to tasks (per-task escrow)
ALTER TABLE collaborate_tasks
  ADD COLUMN IF NOT EXISTS onchain_escrow_id TEXT;

ALTER TABLE collaborate_tasks
  ADD COLUMN IF NOT EXISTS escrow_tx_hash TEXT;

ALTER TABLE collaborate_tasks
  ADD COLUMN IF NOT EXISTS payment_tx_hash TEXT;

ALTER TABLE collaborate_tasks
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- 4. Index for quick on-chain escrow lookups
CREATE INDEX IF NOT EXISTS idx_collaborate_missions_onchain_escrow
  ON collaborate_missions(onchain_escrow_id)
  WHERE onchain_escrow_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collaborate_tasks_onchain_escrow
  ON collaborate_tasks(onchain_escrow_id)
  WHERE onchain_escrow_id IS NOT NULL;
