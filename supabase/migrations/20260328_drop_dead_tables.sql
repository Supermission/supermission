-- ============================================================================
-- Drop dead tables: no application code references these
-- 2026-03-28
-- ============================================================================

-- judge_scores: competitions feature never wired up scoring.
-- competition_judges and competition_entries are used, but judge_scores has
-- zero .from('judge_scores') calls anywhere in the codebase.
DROP TABLE IF EXISTS judge_scores CASCADE;

-- Safety net: re-drop tables that earlier migrations targeted, in case those
-- migrations were never applied to the live database.
DROP TABLE IF EXISTS mission_timeline CASCADE;
DROP TABLE IF EXISTS mission_executions CASCADE;
DROP TABLE IF EXISTS mission_agents CASCADE;
DROP TABLE IF EXISTS missions CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS holder_snapshots CASCADE;
DROP TABLE IF EXISTS user_order_history CASCADE;
DROP TABLE IF EXISTS polymarket_wallets CASCADE;
DROP TABLE IF EXISTS defi_lp_positions CASCADE;
DROP TABLE IF EXISTS defi_hook_deployments CASCADE;
DROP TABLE IF EXISTS agent_transactions CASCADE;

-- Drop orphaned views/functions from those tables
DROP VIEW IF EXISTS agent_operation_stats CASCADE;
DROP VIEW IF EXISTS agent_wallet_summary CASCADE;
DROP VIEW IF EXISTS agent_failed_transactions CASCADE;
DROP VIEW IF EXISTS agent_successful_transactions CASCADE;
DROP FUNCTION IF EXISTS update_agent_transactions_updated_at() CASCADE;
DROP FUNCTION IF EXISTS trigger_mission_timeline_update() CASCADE;

-- Drop orphaned sequences
DROP SEQUENCE IF EXISTS defi_lp_positions_id_seq CASCADE;
DROP SEQUENCE IF EXISTS defi_hook_deployments_id_seq CASCADE;
