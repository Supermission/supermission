-- Migration 024: Atomic spend reservation with daily reset
-- Fixes TOCTOU race condition: atomically resets if new day, increments, and returns new total.
-- Caller checks returned total against daily limit AFTER the increment.
-- If signing fails, caller calls decrement_wallet_spending to roll back.

CREATE OR REPLACE FUNCTION reserve_wallet_spending(
  p_agent_name TEXT,
  p_amount TEXT
)
RETURNS TABLE(new_total TEXT, last_tx_timestamp BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today TEXT := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  v_new_total BIGINT;
  v_updated_at TIMESTAMPTZ;
BEGIN
  -- Atomic: reset if new day, then increment, all in one UPDATE + RETURNING
  UPDATE server_wallets
  SET
    spent_today = CASE
      WHEN last_reset_date != v_today THEN p_amount
      ELSE (CAST(spent_today AS BIGINT) + CAST(p_amount AS BIGINT))::TEXT
    END,
    last_reset_date = v_today,
    updated_at = NOW()
  WHERE agent_name = p_agent_name
  RETURNING
    CAST(server_wallets.spent_today AS BIGINT),
    server_wallets.updated_at
  INTO v_new_total, v_updated_at;

  IF NOT FOUND THEN
    -- No wallet exists for this agent
    new_total := '0';
    last_tx_timestamp := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  new_total := v_new_total::TEXT;
  last_tx_timestamp := EXTRACT(EPOCH FROM v_updated_at)::BIGINT;
  RETURN NEXT;
  RETURN;
END;
$$;

-- Decrement function for rollback on signing failure
CREATE OR REPLACE FUNCTION rollback_wallet_spending(
  p_agent_name TEXT,
  p_amount TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE server_wallets
  SET
    spent_today = GREATEST(0, CAST(spent_today AS BIGINT) - CAST(p_amount AS BIGINT))::TEXT,
    updated_at = NOW()
  WHERE agent_name = p_agent_name;
END;
$$;
