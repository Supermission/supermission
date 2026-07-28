-- ============================================================================
-- QUICK WINS: triggers, constraints, dedup function, race condition fix
-- 2026-03-12
-- ============================================================================

-- ============================================================================
-- 1. Add updated_at triggers on 7 tables missing them
-- ============================================================================

CREATE TRIGGER set_updated_at BEFORE UPDATE ON x402_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON agent_automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_seen_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON pm_agent_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON defi_activity
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. Remove duplicate market_catalog trigger function, reuse generic one
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_market_catalog_updated_at ON market_catalog;
DROP FUNCTION IF EXISTS update_market_catalog_updated_at();

CREATE TRIGGER trigger_market_catalog_updated_at
  BEFORE UPDATE ON market_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. CHECK constraints on status/type columns
-- ============================================================================

-- collaborate_missions.status
ALTER TABLE collaborate_missions DROP CONSTRAINT IF EXISTS chk_mission_status;
ALTER TABLE collaborate_missions ADD CONSTRAINT chk_mission_status
  CHECK (status IN ('active', 'in_progress', 'completed', 'cancelled'));

-- collaborate_tasks.status
ALTER TABLE collaborate_tasks DROP CONSTRAINT IF EXISTS chk_task_status;
ALTER TABLE collaborate_tasks ADD CONSTRAINT chk_task_status
  CHECK (status IN ('pending', 'assigned', 'in_progress', 'submitted', 'approved', 'rejected'));

-- collaborate_tasks.payment_status
ALTER TABLE collaborate_tasks DROP CONSTRAINT IF EXISTS chk_task_payment_status;
ALTER TABLE collaborate_tasks ADD CONSTRAINT chk_task_payment_status
  CHECK (payment_status IN ('pending', 'paid', 'failed'));

-- collaborate_applications.status
ALTER TABLE collaborate_applications DROP CONSTRAINT IF EXISTS chk_application_status;
ALTER TABLE collaborate_applications ADD CONSTRAINT chk_application_status
  CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'withdrawn'));

-- marketplace_agents.agent_type
ALTER TABLE marketplace_agents DROP CONSTRAINT IF EXISTS chk_agent_type;
ALTER TABLE marketplace_agents ADD CONSTRAINT chk_agent_type
  CHECK (agent_type IN ('ai', 'human', 'hybrid'));

-- marketplace_agents.agent_status
ALTER TABLE marketplace_agents DROP CONSTRAINT IF EXISTS chk_agent_status;
ALTER TABLE marketplace_agents ADD CONSTRAINT chk_agent_status
  CHECK (agent_status IN ('active', 'inactive', 'suspended', 'pending'));

-- competitions.status
ALTER TABLE competitions DROP CONSTRAINT IF EXISTS chk_competition_status;
ALTER TABLE competitions ADD CONSTRAINT chk_competition_status
  CHECK (status IN ('upcoming', 'active', 'judging', 'completed', 'cancelled'));

-- disputes.status
ALTER TABLE disputes DROP CONSTRAINT IF EXISTS chk_dispute_status;
ALTER TABLE disputes ADD CONSTRAINT chk_dispute_status
  CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed', 'escalated'));

-- ============================================================================
-- 4. Fix increment_mission_agents race condition (add capacity guard)
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_mission_agents(p_mission_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE collaborate_missions
  SET current_agents = COALESCE(current_agents, 0) + 1
  WHERE id = p_mission_id
    AND COALESCE(current_agents, 0) < COALESCE(required_agents, 999);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission is full or not found';
  END IF;
END;
$$;

-- ============================================================================
-- 5. Fix get_platform_stats() unsafe CAST (guard against non-numeric TEXT)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS TABLE(total_agents BIGINT, active_missions BIGINT, active_competitions BIGINT, total_volume NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    (SELECT COUNT(*) FROM marketplace_agents)::bigint,
    (SELECT COUNT(*) FROM collaborate_missions)::bigint,
    (SELECT COUNT(*) FROM competitions WHERE status IN ('upcoming', 'active', 'judging'))::bigint,
    COALESCE((
      SELECT SUM(
        CASE WHEN amount ~ '^[0-9]+(\.[0-9]+)?$' THEN amount::NUMERIC ELSE NULL END
      ) / 1000000
      FROM (
        SELECT amount FROM payment_proofs
        UNION ALL
        SELECT mp.amount FROM mission_payments mp
        WHERE mp.status = 'completed' AND mp.tx_hash IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM payment_proofs pp WHERE pp.tx_hash = mp.tx_hash)
        UNION ALL
        SELECT xp.amount FROM x402_payments xp
        WHERE xp.status = 'completed' AND xp.tx_hash IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM payment_proofs pp WHERE pp.tx_hash = xp.tx_hash)
      ) t
      WHERE CASE WHEN amount ~ '^[0-9]+(\.[0-9]+)?$' THEN amount::NUMERIC ELSE NULL END <= 10000000000000
    ), 0);
$$;
