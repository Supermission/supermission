-- RPC Functions for Agent Economy Platform
-- These helper functions are called from the application code

-- ============================================
-- INCREMENT COMPETITION ENTRIES
-- Called when an agent enters a competition
-- ============================================

CREATE OR REPLACE FUNCTION increment_competition_entries(
  p_competition_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE competitions
  SET current_entries = COALESCE(current_entries, 0) + 1
  WHERE id = p_competition_id;
END;
$$;

-- ============================================
-- INCREMENT MISSION AGENTS
-- Called when an agent joins a mission
-- ============================================

CREATE OR REPLACE FUNCTION increment_mission_agents(
  p_mission_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE collaborate_missions
  SET current_agents = COALESCE(current_agents, 0) + 1
  WHERE id = p_mission_id;
END;
$$;

-- ============================================
-- UPDATE AGENT STATS AFTER REVIEW
-- Recalculates rating and review count
-- ============================================

CREATE OR REPLACE FUNCTION update_agent_stats_after_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_rating DECIMAL(3,2);
  v_total_reviews INTEGER;
BEGIN
  -- Calculate new stats
  SELECT
    COALESCE(AVG(rating), 0),
    COUNT(*)
  INTO v_avg_rating, v_total_reviews
  FROM marketplace_reviews
  WHERE agent_id = NEW.agent_id;

  -- Update agent
  UPDATE marketplace_agents
  SET
    rating = v_avg_rating,
    total_reviews = v_total_reviews
  WHERE id = NEW.agent_id;

  RETURN NEW;
END;
$$;

-- Create trigger for auto-updating agent stats
DROP TRIGGER IF EXISTS update_agent_stats_trigger ON marketplace_reviews;
CREATE TRIGGER update_agent_stats_trigger
  AFTER INSERT ON marketplace_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_stats_after_review();

-- ============================================
-- RESET DAILY API RATE LIMITS
-- Called by a scheduled job or on first request of the day
-- ============================================

CREATE OR REPLACE FUNCTION reset_daily_api_limits()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE agent_api_keys
  SET
    requests_today = 0,
    last_reset_date = CURRENT_DATE
  WHERE last_reset_date < CURRENT_DATE;
END;
$$;

-- ============================================
-- GET COMPETITION LEADERBOARD
-- Returns ranked entries for a competition
-- ============================================

CREATE OR REPLACE FUNCTION get_competition_leaderboard(
  p_competition_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  rank BIGINT,
  entry_id UUID,
  agent_id UUID,
  agent_name TEXT,
  score DECIMAL,
  prize_amount TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY ce.score DESC NULLS LAST) as rank,
    ce.id as entry_id,
    ce.agent_id,
    ma.agent_name,
    ce.score,
    ce.prize_amount
  FROM competition_entries ce
  LEFT JOIN marketplace_agents ma ON ce.agent_id = ma.id
  WHERE ce.competition_id = p_competition_id
    AND ce.score IS NOT NULL
  ORDER BY ce.score DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- ============================================
-- GET MISSION PROGRESS
-- Returns task completion stats for a mission
-- ============================================

CREATE OR REPLACE FUNCTION get_mission_progress(
  p_mission_id UUID
)
RETURNS TABLE (
  total_tasks INTEGER,
  pending_tasks INTEGER,
  assigned_tasks INTEGER,
  in_progress_tasks INTEGER,
  submitted_tasks INTEGER,
  approved_tasks INTEGER,
  rejected_tasks INTEGER,
  completion_percentage DECIMAL
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total INTEGER;
  v_approved INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM collaborate_tasks WHERE mission_id = p_mission_id;
  SELECT COUNT(*) INTO v_approved FROM collaborate_tasks WHERE mission_id = p_mission_id AND status = 'approved';

  RETURN QUERY
  SELECT
    v_total as total_tasks,
    (SELECT COUNT(*)::INTEGER FROM collaborate_tasks WHERE mission_id = p_mission_id AND status = 'pending'),
    (SELECT COUNT(*)::INTEGER FROM collaborate_tasks WHERE mission_id = p_mission_id AND status = 'assigned'),
    (SELECT COUNT(*)::INTEGER FROM collaborate_tasks WHERE mission_id = p_mission_id AND status = 'in_progress'),
    (SELECT COUNT(*)::INTEGER FROM collaborate_tasks WHERE mission_id = p_mission_id AND status = 'submitted'),
    v_approved::INTEGER,
    (SELECT COUNT(*)::INTEGER FROM collaborate_tasks WHERE mission_id = p_mission_id AND status = 'rejected'),
    CASE WHEN v_total > 0 THEN (v_approved::DECIMAL / v_total * 100) ELSE 0 END as completion_percentage;
END;
$$;

-- ============================================
-- FINALIZE COMPETITION RANKINGS
-- Assigns final ranks to all scored entries
-- ============================================

CREATE OR REPLACE FUNCTION finalize_competition_rankings(
  p_competition_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update ranks based on scores
  WITH ranked_entries AS (
    SELECT
      id,
      ROW_NUMBER() OVER (ORDER BY score DESC NULLS LAST) as new_rank
    FROM competition_entries
    WHERE competition_id = p_competition_id
      AND score IS NOT NULL
  )
  UPDATE competition_entries ce
  SET rank = re.new_rank::INTEGER
  FROM ranked_entries re
  WHERE ce.id = re.id;

  -- Update competition status
  UPDATE competitions
  SET status = 'completed'
  WHERE id = p_competition_id;
END;
$$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant execute on all functions to authenticated users
GRANT EXECUTE ON FUNCTION increment_competition_entries(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_mission_agents(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION reset_daily_api_limits() TO service_role;
GRANT EXECUTE ON FUNCTION get_competition_leaderboard(UUID, INTEGER) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION get_mission_progress(UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION finalize_competition_rankings(UUID) TO authenticated, service_role;

-- Done!
SELECT 'RPC functions created successfully!' as status;
