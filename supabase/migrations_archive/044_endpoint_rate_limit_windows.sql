-- Per-endpoint, per-minute rate limit windows (replaces in-memory Map)
-- Shared across all instances; safe for load-balanced / serverless deployments

CREATE TABLE IF NOT EXISTS api_rate_limit_windows (
  key_id       UUID        NOT NULL,
  endpoint     TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL, -- truncated to the current minute
  count        INTEGER     NOT NULL DEFAULT 1,
  PRIMARY KEY (key_id, endpoint, window_start)
);

-- Index to speed up the upsert lookup (PK already covers it, but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_rate_limit_windows_lookup
  ON api_rate_limit_windows (key_id, endpoint, window_start);

-- Atomic check-and-increment for per-endpoint rate limiting.
-- Returns: allowed, remaining, reset (Unix seconds of window end).
CREATE OR REPLACE FUNCTION check_and_increment_endpoint_rate_limit(
  p_key_id  UUID,
  p_endpoint TEXT,
  p_limit   INTEGER
) RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset BIGINT) AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_count  INTEGER;
BEGIN
  v_window := date_trunc('minute', NOW());

  INSERT INTO api_rate_limit_windows (key_id, endpoint, window_start, count)
  VALUES (p_key_id, p_endpoint, v_window, 1)
  ON CONFLICT (key_id, endpoint, window_start)
  DO UPDATE SET count = api_rate_limit_windows.count + 1
  RETURNING api_rate_limit_windows.count INTO v_count;

  RETURN QUERY SELECT
    (v_count <= p_limit)                                                   AS allowed,
    GREATEST(0, p_limit - v_count)                                         AS remaining,
    EXTRACT(EPOCH FROM (v_window + INTERVAL '1 minute'))::BIGINT           AS reset;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function: delete windows older than 1 hour.
-- Call this from a pg_cron job: SELECT cron.schedule('rate-limit-cleanup', '*/15 * * * *', 'SELECT cleanup_old_rate_limit_windows()');
CREATE OR REPLACE FUNCTION cleanup_old_rate_limit_windows() RETURNS void AS $$
BEGIN
  DELETE FROM api_rate_limit_windows
  WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;
