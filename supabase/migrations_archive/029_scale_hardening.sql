-- Migration 029: Scale hardening for 10k+ agents
-- Focus: atomic counters, rate limits, and critical indexes

-- ============================================
-- 1) Atomic competition entry increment with capacity check
-- ============================================
CREATE OR REPLACE FUNCTION increment_competition_entries_if_available(
  p_competition_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE competitions
  SET current_entries = COALESCE(current_entries, 0) + 1
  WHERE id = p_competition_id
    AND (max_entries IS NULL OR COALESCE(current_entries, 0) < max_entries)
  RETURNING 1 INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- ============================================
-- 2) Atomic daily rate limit check + increment
-- ============================================
CREATE OR REPLACE FUNCTION check_and_increment_rate_limit(
  p_key_id UUID
)
RETURNS TABLE(
  allowed BOOLEAN,
  remaining INTEGER,
  rate_limit INTEGER,
  reset INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rate_limit INTEGER;
  v_requests_today INTEGER;
  v_last_reset DATE;
  v_today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  v_reset_ts INTEGER;
BEGIN
  SELECT rate_limit, requests_today, last_reset_date
  INTO v_rate_limit, v_requests_today, v_last_reset
  FROM agent_api_keys
  WHERE id = p_key_id
  FOR UPDATE;

  IF NOT FOUND THEN
    allowed := FALSE;
    remaining := 0;
    rate_limit := 0;
    reset := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  v_rate_limit := COALESCE(v_rate_limit, 1000);
  v_reset_ts := EXTRACT(EPOCH FROM (date_trunc('day', NOW() AT TIME ZONE 'UTC') + interval '1 day'))::INTEGER;

  -- Reset counter if new day
  IF v_last_reset IS DISTINCT FROM v_today THEN
    UPDATE agent_api_keys
    SET requests_today = 1,
        last_reset_date = v_today,
        last_request_at = NOW()
    WHERE id = p_key_id;

    allowed := TRUE;
    remaining := v_rate_limit - 1;
    rate_limit := v_rate_limit;
    reset := v_reset_ts;
    RETURN NEXT;
    RETURN;
  END IF;

  v_requests_today := COALESCE(v_requests_today, 0);

  IF v_requests_today >= v_rate_limit THEN
    allowed := FALSE;
    remaining := 0;
    rate_limit := v_rate_limit;
    reset := v_reset_ts;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE agent_api_keys
  SET requests_today = v_requests_today + 1,
      last_request_at = NOW()
  WHERE id = p_key_id;

  allowed := TRUE;
  remaining := v_rate_limit - v_requests_today - 1;
  rate_limit := v_rate_limit;
  reset := v_reset_ts;
  RETURN NEXT;
  RETURN;
END;
$$;

-- ============================================
-- 3) Mission payment idempotency (active statuses only)
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_payments_task_active
ON mission_payments(task_id)
WHERE status IN ('pending', 'signing', 'settling', 'completed');

-- ============================================
-- 4) Scale indexes for common filters
-- ============================================
CREATE INDEX IF NOT EXISTS idx_collaborate_tasks_assigned_status
  ON collaborate_tasks(assigned_agent_id, status);

CREATE INDEX IF NOT EXISTS idx_collaborate_tasks_mission_status
  ON collaborate_tasks(mission_id, status);

CREATE INDEX IF NOT EXISTS idx_competition_entries_status
  ON competition_entries(status);

CREATE INDEX IF NOT EXISTS idx_marketplace_agents_available
  ON marketplace_agents(is_available);

CREATE INDEX IF NOT EXISTS idx_marketplace_agents_agent_type
  ON marketplace_agents((metadata->>'agent_type'));

CREATE INDEX IF NOT EXISTS idx_marketplace_agents_capabilities
  ON marketplace_agents USING GIN (capabilities);

-- ============================================
-- 5) Grants
-- ============================================
GRANT EXECUTE ON FUNCTION increment_competition_entries_if_available(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION check_and_increment_rate_limit(UUID) TO service_role;

SELECT 'Scale hardening migration complete' as status;
