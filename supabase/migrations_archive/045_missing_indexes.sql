-- Migration 045: Add missing indexes identified during performance audit
--
-- collaborate_tasks.mission_id and collaborate_applications.mission_id
-- were already indexed in 000_all_tables.sql.
-- The three below were confirmed missing across all migrations.

-- Agents querying their own competition entries (full table scan without this)
CREATE INDEX IF NOT EXISTS idx_competition_entries_agent
  ON competition_entries (agent_id);

-- Payment history lookups by agent, sorted by date.
-- Composite covers both "all payments for agent X" and "payments for agent X ORDER BY created_at".
-- x402_payments grows with every transaction — most important index here.
CREATE INDEX IF NOT EXISTS idx_x402_payments_from_agent_created
  ON x402_payments (from_agent_id, created_at DESC);

-- Filtering contracts by payment status (pending, escrowed, released, etc.)
CREATE INDEX IF NOT EXISTS idx_marketplace_contracts_payment_status
  ON marketplace_contracts (payment_status);
