-- Admin aggregation RPC functions
-- Replaces in-memory full-table scans with DB-side aggregation

-- ============================================================
-- AI Performance
-- ============================================================

-- Accuracy grouped by category
CREATE OR REPLACE FUNCTION admin_accuracy_by_category()
RETURNS TABLE(category TEXT, total BIGINT, correct BIGINT) AS $$
  SELECT
    COALESCE(category, 'unknown') AS category,
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE was_correct = true)::BIGINT AS correct
  FROM ai_accuracy_log
  GROUP BY COALESCE(category, 'unknown');
$$ LANGUAGE sql STABLE;

-- Accuracy grouped by confidence bucket
CREATE OR REPLACE FUNCTION admin_accuracy_by_confidence()
RETURNS TABLE(bucket TEXT, total BIGINT, correct BIGINT) AS $$
  SELECT
    CASE
      WHEN predicted_confidence < 0.5 THEN '0.0-0.5'
      WHEN predicted_confidence < 0.6 THEN '0.5-0.6'
      WHEN predicted_confidence < 0.7 THEN '0.6-0.7'
      WHEN predicted_confidence < 0.8 THEN '0.7-0.8'
      WHEN predicted_confidence < 0.9 THEN '0.8-0.9'
      ELSE '0.9-1.0'
    END AS bucket,
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE was_correct = true)::BIGINT AS correct
  FROM ai_accuracy_log
  GROUP BY bucket
  ORDER BY bucket;
$$ LANGUAGE sql STABLE;

-- Accuracy totals
CREATE OR REPLACE FUNCTION admin_accuracy_totals()
RETURNS TABLE(total BIGINT, correct BIGINT) AS $$
  SELECT
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE was_correct = true)::BIGINT AS correct
  FROM ai_accuracy_log;
$$ LANGUAGE sql STABLE;

-- Live trades aggregation by coin
CREATE OR REPLACE FUNCTION admin_live_trades_by_coin()
RETURNS TABLE(coin TEXT, trades BIGINT, total_pnl NUMERIC, correct BIGINT, resolved BIGINT) AS $$
  SELECT
    COALESCE(coin, 'unknown') AS coin,
    COUNT(*)::BIGINT AS trades,
    COALESCE(SUM(pnl), 0) AS total_pnl,
    COUNT(*) FILTER (WHERE is_correct = true)::BIGINT AS correct,
    COUNT(*) FILTER (WHERE is_correct IS NOT NULL)::BIGINT AS resolved
  FROM live_trades
  GROUP BY COALESCE(coin, 'unknown');
$$ LANGUAGE sql STABLE;

-- Live trades aggregation by strategy
CREATE OR REPLACE FUNCTION admin_live_trades_by_strategy()
RETURNS TABLE(strategy TEXT, trades BIGINT, total_pnl NUMERIC) AS $$
  SELECT
    COALESCE(strategy, 'unknown') AS strategy,
    COUNT(*)::BIGINT AS trades,
    COALESCE(SUM(pnl), 0) AS total_pnl
  FROM live_trades
  GROUP BY COALESCE(strategy, 'unknown');
$$ LANGUAGE sql STABLE;

-- Live trades totals
CREATE OR REPLACE FUNCTION admin_live_trades_totals()
RETURNS TABLE(total BIGINT, total_pnl NUMERIC, correct BIGINT, resolved BIGINT) AS $$
  SELECT
    COUNT(*)::BIGINT AS total,
    COALESCE(SUM(pnl), 0) AS total_pnl,
    COUNT(*) FILTER (WHERE is_correct = true)::BIGINT AS correct,
    COUNT(*) FILTER (WHERE is_correct IS NOT NULL)::BIGINT AS resolved
  FROM live_trades;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- Agent Economy
-- ============================================================

CREATE OR REPLACE FUNCTION admin_agent_counts()
RETURNS TABLE(
  total BIGINT,
  ai_count BIGINT, human_count BIGINT, hybrid_count BIGINT,
  active_count BIGINT, inactive_count BIGINT, suspended_count BIGINT, pending_count BIGINT,
  platform_count BIGINT, available_count BIGINT,
  avg_rating NUMERIC
) AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(agent_type) = 'ai')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(agent_type) = 'human')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(agent_type) = 'hybrid')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(agent_status) = 'active')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(agent_status) = 'inactive')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(agent_status) = 'suspended')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(agent_status) = 'pending')::BIGINT,
    COUNT(*) FILTER (WHERE is_platform_agent = true)::BIGINT,
    COUNT(*) FILTER (WHERE is_available = true)::BIGINT,
    COALESCE(AVG(rating) FILTER (WHERE rating > 0), 0)
  FROM marketplace_agents;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_mission_counts()
RETURNS TABLE(
  total BIGINT,
  active_count BIGINT, in_progress_count BIGINT, completed_count BIGINT, cancelled_count BIGINT,
  total_budget NUMERIC, avg_budget NUMERIC
) AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'active')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'in_progress')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'completed')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'cancelled')::BIGINT,
    COALESCE(SUM(budget), 0),
    COALESCE(AVG(budget), 0)
  FROM collaborate_missions;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_task_counts()
RETURNS TABLE(
  total BIGINT,
  pending_count BIGINT, assigned_count BIGINT, in_progress_count BIGINT,
  submitted_count BIGINT, approved_count BIGINT, rejected_count BIGINT,
  total_rewards NUMERIC
) AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'pending')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'assigned')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'in_progress')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'submitted')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'approved')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'rejected')::BIGINT,
    COALESCE(SUM(reward), 0)
  FROM collaborate_tasks;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_dispute_counts()
RETURNS TABLE(
  total BIGINT, open_count BIGINT,
  task_rejection BIGINT, payment BIGINT, quality BIGINT,
  communication BIGINT, deadline BIGINT, other_type BIGINT,
  st_open BIGINT, st_under_review BIGINT, st_resolved BIGINT,
  st_dismissed BIGINT, st_escalated BIGINT
) AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'open')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(dispute_type) = 'task_rejection')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(dispute_type) = 'payment')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(dispute_type) = 'quality')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(dispute_type) = 'communication')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(dispute_type) = 'deadline')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(dispute_type) = 'other')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'open')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'under_review')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'resolved')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'dismissed')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'escalated')::BIGINT
  FROM disputes;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_competition_counts()
RETURNS TABLE(
  total BIGINT,
  upcoming_count BIGINT, active_count BIGINT, judging_count BIGINT,
  completed_count BIGINT, cancelled_count BIGINT,
  total_prize_pool NUMERIC
) AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'upcoming')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'active')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'judging')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'completed')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'cancelled')::BIGINT,
    COALESCE(SUM(prize_pool), 0)
  FROM competitions;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_application_counts()
RETURNS TABLE(
  total BIGINT,
  pending_count BIGINT, accepted_count BIGINT, rejected_count BIGINT,
  expired_count BIGINT, withdrawn_count BIGINT
) AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'pending')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'accepted')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'rejected')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'expired')::BIGINT,
    COUNT(*) FILTER (WHERE LOWER(status) = 'withdrawn')::BIGINT
  FROM collaborate_applications;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- System Health
-- ============================================================

CREATE OR REPLACE FUNCTION admin_webhook_stats()
RETURNS TABLE(
  total BIGINT,
  pending_count BIGINT, delivered_count BIGINT, failed_count BIGINT, retrying_count BIGINT,
  avg_attempts NUMERIC,
  dlq_size BIGINT
) AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'delivered')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'retrying')::BIGINT,
    COALESCE(AVG(attempts), 0),
    COUNT(*) FILTER (WHERE status = 'failed' AND next_retry_at IS NULL)::BIGINT
  FROM webhook_deliveries;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_x402_stats()
RETURNS TABLE(
  total BIGINT,
  pending_count BIGINT, signing_count BIGINT, completed_count BIGINT,
  failed_count BIGINT, expired_count BIGINT,
  total_volume NUMERIC,
  volume_24h NUMERIC
) AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'signing')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'expired')::BIGINT,
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(amount) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'), 0)
  FROM x402_payments;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_chat_stats()
RETURNS TABLE(
  total_sessions BIGINT,
  total_messages BIGINT,
  sessions_24h BIGINT,
  unique_users BIGINT
) AS $$
  SELECT
    (SELECT COUNT(*) FROM chat_sessions)::BIGINT,
    (SELECT COUNT(*) FROM chat_messages)::BIGINT,
    (SELECT COUNT(*) FROM chat_sessions WHERE created_at >= NOW() - INTERVAL '24 hours')::BIGINT,
    (SELECT COUNT(DISTINCT user_address) FROM chat_sessions WHERE user_address IS NOT NULL)::BIGINT;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_chat_by_agent()
RETURNS TABLE(agent_id TEXT, sessions BIGINT) AS $$
  SELECT
    COALESCE(agent_id, 'unknown') AS agent_id,
    COUNT(*)::BIGINT AS sessions
  FROM chat_sessions
  GROUP BY COALESCE(agent_id, 'unknown')
  ORDER BY sessions DESC;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_endpoint_health_summary()
RETURNS TABLE(
  checks_24h BIGINT,
  success_count BIGINT,
  total_checks BIGINT,
  avg_response_time NUMERIC
) AS $$
  SELECT
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::BIGINT,
    COUNT(*) FILTER (WHERE is_success = true)::BIGINT,
    COUNT(*)::BIGINT,
    COALESCE(AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL), 0)
  FROM agent_endpoint_health
  WHERE created_at >= NOW() - INTERVAL '7 days';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_defi_stats()
RETURNS TABLE(
  total BIGINT,
  activities_24h BIGINT,
  total_volume_usd NUMERIC,
  by_type JSONB,
  by_status JSONB
) AS $$
  SELECT
    (SELECT COUNT(*) FROM defi_activity)::BIGINT,
    (SELECT COUNT(*) FROM defi_activity WHERE created_at >= NOW() - INTERVAL '24 hours')::BIGINT,
    (SELECT COALESCE(SUM(amount_usd), 0) FROM defi_activity),
    COALESCE(
      (SELECT jsonb_object_agg(t, c) FROM (
        SELECT COALESCE(activity_type, 'unknown') AS t, COUNT(*)::BIGINT AS c
        FROM defi_activity GROUP BY t
      ) sub),
      '{}'::jsonb
    ),
    COALESCE(
      (SELECT jsonb_object_agg(s, c) FROM (
        SELECT COALESCE(status, 'unknown') AS s, COUNT(*)::BIGINT AS c
        FROM defi_activity GROUP BY s
      ) sub),
      '{}'::jsonb
    );
$$ LANGUAGE sql STABLE;

-- ============================================================
-- Perps (Hyperion)
-- ============================================================

CREATE OR REPLACE FUNCTION admin_perps_session_stats()
RETURNS TABLE(
  total BIGINT,
  sessions_24h BIGINT,
  sessions_7d BIGINT,
  unique_users BIGINT,
  total_messages BIGINT
) AS $$
  SELECT
    (SELECT COUNT(*) FROM hyperion_sessions)::BIGINT,
    (SELECT COUNT(*) FROM hyperion_sessions WHERE created_at >= NOW() - INTERVAL '24 hours')::BIGINT,
    (SELECT COUNT(*) FROM hyperion_sessions WHERE created_at >= NOW() - INTERVAL '7 days')::BIGINT,
    (SELECT COUNT(DISTINCT user_id) FROM hyperion_sessions)::BIGINT,
    (SELECT COUNT(*) FROM hyperion_messages)::BIGINT;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_perps_trade_stats()
RETURNS TABLE(
  total_trades BIGINT,
  trades_24h BIGINT,
  trades_7d BIGINT,
  total_volume NUMERIC,
  volume_24h NUMERIC,
  buy_count BIGINT,
  sell_count BIGINT,
  avg_leverage NUMERIC,
  total_pnl NUMERIC,
  profitable_count BIGINT,
  resolved_count BIGINT
) AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::BIGINT,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::BIGINT,
    COALESCE(SUM(size * price), 0),
    COALESCE(SUM(size * price) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'), 0),
    COUNT(*) FILTER (WHERE side = 'buy')::BIGINT,
    COUNT(*) FILTER (WHERE side = 'sell')::BIGINT,
    COALESCE(AVG(leverage), 0),
    COALESCE(SUM(pnl) FILTER (WHERE pnl IS NOT NULL), 0),
    COUNT(*) FILTER (WHERE pnl > 0)::BIGINT,
    COUNT(*) FILTER (WHERE pnl IS NOT NULL)::BIGINT
  FROM hyperion_trades;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_perps_by_coin()
RETURNS TABLE(coin TEXT, trades BIGINT, volume NUMERIC, avg_leverage NUMERIC) AS $$
  SELECT
    coin,
    COUNT(*)::BIGINT AS trades,
    COALESCE(SUM(size * price), 0) AS volume,
    COALESCE(AVG(leverage), 0) AS avg_leverage
  FROM hyperion_trades
  GROUP BY coin
  ORDER BY volume DESC;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_perps_by_order_type()
RETURNS TABLE(order_type TEXT, count BIGINT) AS $$
  SELECT
    COALESCE(order_type, 'unknown') AS order_type,
    COUNT(*)::BIGINT
  FROM hyperion_trades
  GROUP BY COALESCE(order_type, 'unknown');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_perps_risk_distribution()
RETURNS TABLE(risk_level TEXT, count BIGINT) AS $$
  SELECT
    COALESCE(risk_level, 'moderate') AS risk_level,
    COUNT(*)::BIGINT
  FROM perps_user_preferences
  GROUP BY COALESCE(risk_level, 'moderate');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_perps_daily_volume()
RETURNS TABLE(day DATE, volume NUMERIC, trades BIGINT, pnl NUMERIC) AS $$
  SELECT
    DATE(created_at) AS day,
    COALESCE(SUM(size * price), 0) AS volume,
    COUNT(*)::BIGINT AS trades,
    COALESCE(SUM(pnl), 0) AS pnl
  FROM hyperion_trades
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY DATE(created_at)
  ORDER BY day;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_perps_top_traders()
RETURNS TABLE(user_id TEXT, wallet_address TEXT, trades BIGINT, volume NUMERIC, pnl NUMERIC) AS $$
  SELECT
    user_id,
    MAX(wallet_address) AS wallet_address,
    COUNT(*)::BIGINT AS trades,
    COALESCE(SUM(size * price), 0) AS volume,
    COALESCE(SUM(pnl), 0) AS pnl
  FROM hyperion_trades
  GROUP BY user_id
  ORDER BY volume DESC
  LIMIT 20;
$$ LANGUAGE sql STABLE;
