-- ============================================================================
-- TEXT → NUMERIC migration for all 29 monetary columns across 15 tables
-- 2026-03-13
--
-- Supabase JS returns NUMERIC as JavaScript number — existing parsers
-- (safeParseAmount, safeBigInt, parseFloat, BigInt) already handle number
-- input via String(value) coercion, so app code changes are minimal.
--
-- Strategy: DROP DEFAULT → ALTER TYPE → SET DEFAULT (PG cannot auto-cast
-- a TEXT default like '0' to NUMERIC during ALTER TYPE).
-- ============================================================================

-- ============================================================================
-- 1. marketplace_agents
-- ============================================================================
ALTER TABLE marketplace_agents ALTER COLUMN hourly_rate DROP DEFAULT;
ALTER TABLE marketplace_agents ALTER COLUMN total_earnings DROP DEFAULT;
ALTER TABLE marketplace_agents
  ALTER COLUMN hourly_rate TYPE NUMERIC USING (NULLIF(TRIM(hourly_rate), '')::NUMERIC),
  ALTER COLUMN total_earnings TYPE NUMERIC USING (NULLIF(TRIM(total_earnings), '')::NUMERIC);
ALTER TABLE marketplace_agents ALTER COLUMN hourly_rate SET DEFAULT 0;
ALTER TABLE marketplace_agents ALTER COLUMN total_earnings SET DEFAULT 0;

-- ============================================================================
-- 2. marketplace_contracts
-- ============================================================================
ALTER TABLE marketplace_contracts ALTER COLUMN escrow_amount DROP DEFAULT;
ALTER TABLE marketplace_contracts
  ALTER COLUMN agreed_rate TYPE NUMERIC USING (NULLIF(TRIM(agreed_rate), '')::NUMERIC),
  ALTER COLUMN escrow_amount TYPE NUMERIC USING (NULLIF(TRIM(escrow_amount), '')::NUMERIC);
ALTER TABLE marketplace_contracts ALTER COLUMN escrow_amount SET DEFAULT 0;

-- ============================================================================
-- 3. marketplace_reviews
-- ============================================================================
ALTER TABLE marketplace_reviews ALTER COLUMN payment_amount DROP DEFAULT;
ALTER TABLE marketplace_reviews
  ALTER COLUMN payment_amount TYPE NUMERIC USING (NULLIF(TRIM(payment_amount), '')::NUMERIC);
ALTER TABLE marketplace_reviews ALTER COLUMN payment_amount SET DEFAULT 0;

-- ============================================================================
-- 4. server_wallets
-- ============================================================================
ALTER TABLE server_wallets ALTER COLUMN daily_limit DROP DEFAULT;
ALTER TABLE server_wallets ALTER COLUMN spent_today DROP DEFAULT;
ALTER TABLE server_wallets
  ALTER COLUMN daily_limit TYPE NUMERIC USING (NULLIF(TRIM(daily_limit), '')::NUMERIC),
  ALTER COLUMN spent_today TYPE NUMERIC USING (NULLIF(TRIM(spent_today), '')::NUMERIC);
ALTER TABLE server_wallets ALTER COLUMN daily_limit SET DEFAULT 0;
ALTER TABLE server_wallets ALTER COLUMN spent_today SET DEFAULT 0;

-- ============================================================================
-- 5. collaborate_missions
-- ============================================================================
ALTER TABLE collaborate_missions
  ALTER COLUMN budget TYPE NUMERIC USING (NULLIF(TRIM(budget), '')::NUMERIC);

-- ============================================================================
-- 6. collaborate_tasks
-- ============================================================================
ALTER TABLE collaborate_tasks
  ALTER COLUMN reward TYPE NUMERIC USING (NULLIF(TRIM(reward), '')::NUMERIC);

-- ============================================================================
-- 7. collaborate_applications
-- ============================================================================
ALTER TABLE collaborate_applications
  ALTER COLUMN proposed_rate TYPE NUMERIC USING (NULLIF(TRIM(proposed_rate), '')::NUMERIC),
  ALTER COLUMN agreed_rate TYPE NUMERIC USING (NULLIF(TRIM(agreed_rate), '')::NUMERIC);

-- ============================================================================
-- 8. mission_payments
-- ============================================================================
ALTER TABLE mission_payments
  ALTER COLUMN amount TYPE NUMERIC USING (NULLIF(TRIM(amount), '')::NUMERIC);

-- ============================================================================
-- 9. competitions
-- ============================================================================
ALTER TABLE competitions ALTER COLUMN entry_fee DROP DEFAULT;
ALTER TABLE competitions
  ALTER COLUMN prize_pool TYPE NUMERIC USING (NULLIF(TRIM(prize_pool), '')::NUMERIC),
  ALTER COLUMN entry_fee TYPE NUMERIC USING (NULLIF(TRIM(entry_fee), '')::NUMERIC);
ALTER TABLE competitions ALTER COLUMN entry_fee SET DEFAULT 0;

-- ============================================================================
-- 10. competition_entries
-- ============================================================================
ALTER TABLE competition_entries
  ALTER COLUMN prize_amount TYPE NUMERIC USING (NULLIF(TRIM(prize_amount), '')::NUMERIC);

-- ============================================================================
-- 11. payment_proofs
-- ============================================================================
ALTER TABLE payment_proofs
  ALTER COLUMN amount TYPE NUMERIC USING (NULLIF(TRIM(amount), '')::NUMERIC);

-- ============================================================================
-- 12. x402_payments
-- ============================================================================
ALTER TABLE x402_payments
  ALTER COLUMN amount TYPE NUMERIC USING (NULLIF(TRIM(amount), '')::NUMERIC);

-- ============================================================================
-- 13. compute_providers
-- ============================================================================
ALTER TABLE compute_providers ALTER COLUMN min_charge_usdc DROP DEFAULT;
ALTER TABLE compute_providers ALTER COLUMN total_earnings DROP DEFAULT;
ALTER TABLE compute_providers
  ALTER COLUMN min_charge_usdc TYPE NUMERIC USING (NULLIF(TRIM(min_charge_usdc), '')::NUMERIC),
  ALTER COLUMN total_earnings TYPE NUMERIC USING (NULLIF(TRIM(total_earnings), '')::NUMERIC);
ALTER TABLE compute_providers ALTER COLUMN min_charge_usdc SET DEFAULT 1000;
ALTER TABLE compute_providers ALTER COLUMN total_earnings SET DEFAULT 0;

-- ============================================================================
-- 14. compute_models
-- ============================================================================
ALTER TABLE compute_models
  ALTER COLUMN input_price_per_1k TYPE NUMERIC USING (NULLIF(TRIM(input_price_per_1k), '')::NUMERIC),
  ALTER COLUMN output_price_per_1k TYPE NUMERIC USING (NULLIF(TRIM(output_price_per_1k), '')::NUMERIC);

-- ============================================================================
-- 15. compute_sessions
-- ============================================================================
ALTER TABLE compute_sessions ALTER COLUMN total_cost_usdc DROP DEFAULT;
ALTER TABLE compute_sessions
  ALTER COLUMN total_cost_usdc TYPE NUMERIC USING (NULLIF(TRIM(total_cost_usdc), '')::NUMERIC),
  ALTER COLUMN max_cost_usdc TYPE NUMERIC USING (NULLIF(TRIM(max_cost_usdc), '')::NUMERIC);
ALTER TABLE compute_sessions ALTER COLUMN total_cost_usdc SET DEFAULT 0;

-- ============================================================================
-- 16. compute_escrow
-- ============================================================================
ALTER TABLE compute_escrow ALTER COLUMN spent_usdc DROP DEFAULT;
ALTER TABLE compute_escrow
  ALTER COLUMN total_budget_usdc TYPE NUMERIC USING (NULLIF(TRIM(total_budget_usdc), '')::NUMERIC),
  ALTER COLUMN remaining_usdc TYPE NUMERIC USING (NULLIF(TRIM(remaining_usdc), '')::NUMERIC),
  ALTER COLUMN spent_usdc TYPE NUMERIC USING (NULLIF(TRIM(spent_usdc), '')::NUMERIC),
  ALTER COLUMN max_per_session_usdc TYPE NUMERIC USING (NULLIF(TRIM(max_per_session_usdc), '')::NUMERIC);
ALTER TABLE compute_escrow ALTER COLUMN spent_usdc SET DEFAULT 0;

-- ============================================================================
-- 17. escrow_draws
-- ============================================================================
ALTER TABLE escrow_draws
  ALTER COLUMN amount_usdc TYPE NUMERIC USING (NULLIF(TRIM(amount_usdc), '')::NUMERIC);

-- ============================================================================
-- 18. agent_request_log
-- ============================================================================
ALTER TABLE agent_request_log
  ALTER COLUMN payment_amount TYPE NUMERIC USING (NULLIF(TRIM(payment_amount), '')::NUMERIC);

-- ============================================================================
-- 19. Update get_platform_stats() — regex guard no longer needed for NUMERIC
-- ============================================================================
CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS TABLE(total_agents BIGINT, active_missions BIGINT, active_competitions BIGINT, total_volume NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    (SELECT COUNT(*) FROM marketplace_agents)::bigint,
    (SELECT COUNT(*) FROM collaborate_missions)::bigint,
    (SELECT COUNT(*) FROM competitions WHERE status IN ('upcoming', 'active', 'judging'))::bigint,
    COALESCE((
      SELECT SUM(amount) / 1000000
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
      WHERE amount IS NOT NULL AND amount <= 10000000000000
    ), 0);
$$;
