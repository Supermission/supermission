-- Migration 019: Atomic spending increment RPC function
-- Prevents race conditions in updateSpentToday by doing the increment in a single SQL statement.

CREATE OR REPLACE FUNCTION increment_wallet_spending(
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
    spent_today = (CAST(spent_today AS BIGINT) + CAST(p_amount AS BIGINT))::TEXT,
    updated_at = NOW()
  WHERE agent_name = p_agent_name;
END;
$$;
