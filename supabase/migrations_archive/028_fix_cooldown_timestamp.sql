-- Migration 028: Fix cooldown timestamp bug
--
-- The cooldown check uses `updated_at` as the last transaction timestamp,
-- but `updated_at` is set to NOW() on every reservation attempt (including
-- failed ones and rollbacks). This creates a moving target where the cooldown
-- never expires.
--
-- Fix: Add a dedicated `last_tx_at` column that is ONLY updated after a
-- successful transaction, and use it for cooldown checks.

-- 1. Add the column (nullable — null means no transaction yet, so no cooldown)
ALTER TABLE server_wallets
  ADD COLUMN IF NOT EXISTS last_tx_at TIMESTAMPTZ;

-- 2. Seed it from updated_at for existing wallets that have transacted
UPDATE server_wallets
SET last_tx_at = updated_at
WHERE spent_today != '0' AND spent_today IS NOT NULL;

-- 3. Update reserve_wallet_spending to return last_tx_at instead of updated_at
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
  v_last_tx_at TIMESTAMPTZ;
BEGIN
  -- Atomic: reset if new day, then increment, all in one UPDATE + RETURNING
  -- Note: updated_at still changes (for general tracking), but last_tx_at does NOT
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
    server_wallets.last_tx_at
  INTO v_new_total, v_last_tx_at;

  IF NOT FOUND THEN
    new_total := '0';
    last_tx_timestamp := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  new_total := v_new_total::TEXT;
  -- Return 0 if never transacted (null), so cooldown is skipped
  last_tx_timestamp := COALESCE(EXTRACT(EPOCH FROM v_last_tx_at)::BIGINT, 0);
  RETURN NEXT;
  RETURN;
END;
$$;

-- 4. New function: mark a successful transaction (called AFTER signing succeeds)
CREATE OR REPLACE FUNCTION mark_successful_tx(
  p_agent_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE server_wallets
  SET last_tx_at = NOW()
  WHERE agent_name = p_agent_name;
END;
$$;
