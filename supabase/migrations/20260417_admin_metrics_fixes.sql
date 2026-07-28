-- Admin panel metric fixes
-- 1) endpoint_health_summary: window success/total to the same 24h the label shows
-- 2) admin_slowest_endpoints / admin_failing_endpoints: aggregate server-side
--    (the previous approach ordered & truncated before averaging, biasing results)
-- 3) admin_perps_active_traders_24h: COUNT(DISTINCT user_id) — the route was
--    counting rows with { count: 'exact' } which returns trades, not traders.

CREATE OR REPLACE FUNCTION admin_endpoint_health_summary()
RETURNS TABLE(
  checks_24h BIGINT,
  success_count BIGINT,
  total_checks BIGINT,
  avg_response_time NUMERIC
) AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE is_success = true)::BIGINT,
    COUNT(*)::BIGINT,
    COALESCE(AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL), 0)
  FROM agent_endpoint_health
  WHERE created_at >= NOW() - INTERVAL '24 hours';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_slowest_endpoints()
RETURNS TABLE(
  agent_id TEXT,
  endpoint_url TEXT,
  avg_response_time NUMERIC,
  checks BIGINT
) AS $$
  SELECT
    agent_id,
    endpoint_url,
    ROUND(AVG(response_time_ms)::NUMERIC, 2),
    COUNT(*)::BIGINT
  FROM agent_endpoint_health
  WHERE response_time_ms IS NOT NULL
    AND created_at >= NOW() - INTERVAL '24 hours'
  GROUP BY agent_id, endpoint_url
  ORDER BY AVG(response_time_ms) DESC
  LIMIT 10;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_failing_endpoints()
RETURNS TABLE(
  agent_id TEXT,
  endpoint_url TEXT,
  failure_count BIGINT,
  last_failure TIMESTAMPTZ
) AS $$
  SELECT
    agent_id,
    endpoint_url,
    COUNT(*)::BIGINT,
    MAX(created_at)
  FROM agent_endpoint_health
  WHERE is_success = false
    AND created_at >= NOW() - INTERVAL '24 hours'
  GROUP BY agent_id, endpoint_url
  ORDER BY COUNT(*) DESC
  LIMIT 10;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION admin_perps_active_traders_24h()
RETURNS BIGINT AS $$
  SELECT COUNT(DISTINCT user_id)::BIGINT
  FROM hyperion_trades
  WHERE created_at >= NOW() - INTERVAL '24 hours';
$$ LANGUAGE sql STABLE;
