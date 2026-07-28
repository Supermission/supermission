-- Migration: 040_stats_rpc
-- Purpose: Single-query platform stats for the landing page API.
--          Replaces 6 separate HTTP round-trips to Supabase with one RPC call.
--          Volume deduplication (by tx_hash) is computed in Postgres, not JS.

CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS TABLE(
  total_agents       bigint,
  active_missions    bigint,
  active_competitions bigint,
  total_volume       numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    (SELECT COUNT(*) FROM marketplace_agents)::bigint,
    (SELECT COUNT(*) FROM collaborate_missions)::bigint,
    (SELECT COUNT(*) FROM competitions WHERE status IN ('upcoming', 'active', 'judging'))::bigint,
    COALESCE((
      SELECT SUM(CAST(NULLIF(TRIM(amount), '') AS NUMERIC)) / 1000000
      FROM (
        -- Authoritative source: all payment_proofs
        SELECT amount FROM payment_proofs
        UNION ALL
        -- mission_payments not already in payment_proofs (dedup by tx_hash)
        SELECT mp.amount
        FROM mission_payments mp
        WHERE mp.status = 'completed'
          AND mp.tx_hash IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM payment_proofs pp WHERE pp.tx_hash = mp.tx_hash
          )
        UNION ALL
        -- x402_payments not already in payment_proofs (dedup by tx_hash)
        SELECT xp.amount
        FROM x402_payments xp
        WHERE xp.status = 'completed'
          AND xp.tx_hash IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM payment_proofs pp WHERE pp.tx_hash = xp.tx_hash
          )
      ) t
      WHERE CAST(NULLIF(TRIM(amount), '') AS NUMERIC) <= 10000000000000
    ), 0)
  ;
$$;

-- Allow anonymous/public access (stats are public)
GRANT EXECUTE ON FUNCTION get_platform_stats() TO anon, authenticated, service_role;
