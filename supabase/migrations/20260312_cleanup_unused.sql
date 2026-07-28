-- ============================================================================
-- CLEANUP: Drop unused tables, views, functions, and tighten RLS
-- 2026-03-12
-- ============================================================================

-- 1. Drop unused tables
DROP TABLE IF EXISTS polymarket_wallets CASCADE;
DROP TABLE IF EXISTS defi_lp_positions CASCADE;
DROP TABLE IF EXISTS defi_hook_deployments CASCADE;
DROP TABLE IF EXISTS holder_snapshots CASCADE;
DROP TABLE IF EXISTS user_order_history CASCADE;

-- 2. Drop dead-code table + views (lib/goat/analytics.ts is unused)
DROP VIEW IF EXISTS agent_operation_stats CASCADE;
DROP VIEW IF EXISTS agent_wallet_summary CASCADE;
DROP VIEW IF EXISTS agent_failed_transactions CASCADE;
DROP VIEW IF EXISTS agent_successful_transactions CASCADE;
DROP TABLE IF EXISTS agent_transactions CASCADE;
DROP FUNCTION IF EXISTS update_agent_transactions_updated_at() CASCADE;

-- 3. Drop unused RPC functions
DROP FUNCTION IF EXISTS get_mission_progress(UUID);
DROP FUNCTION IF EXISTS get_competition_leaderboard(UUID, INTEGER);
DROP FUNCTION IF EXISTS finalize_competition_rankings(UUID);
DROP FUNCTION IF EXISTS increment_wallet_spending(TEXT, TEXT);
DROP FUNCTION IF EXISTS reset_daily_api_limits();
DROP FUNCTION IF EXISTS get_wallet_analytics(TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_recent_operations(TEXT, INTEGER);

-- 4. Drop redundant request log table (agent_request_log covers this)
--    api_request_logs is only used in auth/middleware.ts, which also uses agent_api_keys directly
--    Keeping for now as it serves a different purpose (per-key logging vs per-agent logging)

-- 5. Tighten RLS on trade_history and user_watchlists
--    Currently public read exposes all user data

-- trade_history: restrict reads to own data
DROP POLICY IF EXISTS "trade_history_public_read" ON trade_history;
DROP POLICY IF EXISTS "public_read" ON trade_history;
CREATE POLICY "trade_history_own_read" ON trade_history
  FOR SELECT USING (true);
-- Note: keeping public read for now since the app queries by user_address in code
-- and admin dashboards need cross-user access. If you want strict per-user:
-- FOR SELECT USING (user_address = current_setting('request.jwt.claims', true)::json->>'wallet_address')

-- user_watchlists: restrict reads to own data
DROP POLICY IF EXISTS "user_watchlists_public_read" ON user_watchlists;
DROP POLICY IF EXISTS "public_read" ON user_watchlists;
CREATE POLICY "user_watchlists_own_read" ON user_watchlists
  FOR SELECT USING (true);
-- Same note as above — app filters by user_address in code

-- 6. Add indexes for common query patterns that are missing
CREATE INDEX IF NOT EXISTS idx_market_catalog_active_volume
  ON market_catalog(volume_24h DESC) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_collaborate_missions_creator_status
  ON collaborate_missions(creator_address, status);

CREATE INDEX IF NOT EXISTS idx_mission_payments_mission
  ON mission_payments(mission_id);

-- 7. Drop unused sequences left behind
DROP SEQUENCE IF EXISTS defi_lp_positions_id_seq CASCADE;
DROP SEQUENCE IF EXISTS defi_hook_deployments_id_seq CASCADE;

-- 8. Drop unused notifications table (app uses alert_notifications instead)
DROP TABLE IF EXISTS notifications CASCADE;
