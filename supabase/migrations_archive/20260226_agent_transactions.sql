-- AI Agent Transactions Tracking
-- Migration created: 2026-02-26
-- Purpose: Track all AI agent operations for analytics and monitoring

-- Create agent_transactions table
CREATE TABLE IF NOT EXISTS agent_transactions (
  id BIGSERIAL PRIMARY KEY,

  -- Wallet and operation identifiers
  wallet_address TEXT NOT NULL,
  operation TEXT NOT NULL, -- 'swap', 'transfer', 'approve', 'balance_check', 'yield_deposit', etc.
  chain_id INTEGER NOT NULL,

  -- Transaction details
  tx_hash TEXT, -- Blockchain transaction hash (NULL for read operations)
  status TEXT NOT NULL CHECK (status IN ('initiated', 'confirmed', 'failed')),

  -- Financial metrics
  amount_usd NUMERIC, -- USD value of transaction
  gas_used TEXT, -- Gas used in wei (stored as text for bigint)

  -- Error tracking
  error_message TEXT, -- Error message if status = 'failed'

  -- Additional context
  metadata JSONB, -- Flexible storage for operation-specific data

  -- Timestamps
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE agent_transactions IS 'Tracks all AI agent operations for analytics and monitoring';
COMMENT ON COLUMN agent_transactions.wallet_address IS 'User wallet address (lowercase)';
COMMENT ON COLUMN agent_transactions.operation IS 'Type of operation performed';
COMMENT ON COLUMN agent_transactions.chain_id IS 'Blockchain network ID (8453=Base, 137=Polygon, etc.)';
COMMENT ON COLUMN agent_transactions.tx_hash IS 'Blockchain transaction hash (NULL for read operations)';
COMMENT ON COLUMN agent_transactions.status IS 'Operation status: initiated, confirmed, or failed';
COMMENT ON COLUMN agent_transactions.metadata IS 'JSON object with operation-specific details (token symbols, amounts, etc.)';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agent_transactions_wallet
  ON agent_transactions(wallet_address);

CREATE INDEX IF NOT EXISTS idx_agent_transactions_timestamp
  ON agent_transactions(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_agent_transactions_status
  ON agent_transactions(status);

CREATE INDEX IF NOT EXISTS idx_agent_transactions_chain
  ON agent_transactions(chain_id);

CREATE INDEX IF NOT EXISTS idx_agent_transactions_operation
  ON agent_transactions(operation);

CREATE INDEX IF NOT EXISTS idx_agent_transactions_wallet_timestamp
  ON agent_transactions(wallet_address, timestamp DESC);

-- Create composite index for wallet analytics queries
CREATE INDEX IF NOT EXISTS idx_agent_transactions_wallet_status_timestamp
  ON agent_transactions(wallet_address, status, timestamp DESC);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_agent_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_agent_transactions_updated_at ON agent_transactions;
CREATE TRIGGER trigger_update_agent_transactions_updated_at
  BEFORE UPDATE ON agent_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_transactions_updated_at();

-- Create view for successful transactions only
CREATE OR REPLACE VIEW agent_successful_transactions AS
SELECT
  id,
  wallet_address,
  operation,
  chain_id,
  tx_hash,
  amount_usd,
  gas_used,
  metadata,
  timestamp
FROM agent_transactions
WHERE status = 'confirmed'
ORDER BY timestamp DESC;

COMMENT ON VIEW agent_successful_transactions IS 'View of successfully confirmed agent transactions';

-- Create view for failed transactions (for debugging)
CREATE OR REPLACE VIEW agent_failed_transactions AS
SELECT
  id,
  wallet_address,
  operation,
  chain_id,
  error_message,
  metadata,
  timestamp
FROM agent_transactions
WHERE status = 'failed'
ORDER BY timestamp DESC;

COMMENT ON VIEW agent_failed_transactions IS 'View of failed agent transactions for debugging';

-- Create view for wallet analytics summary
CREATE OR REPLACE VIEW agent_wallet_summary AS
SELECT
  wallet_address,
  COUNT(*) as total_operations,
  COUNT(*) FILTER (WHERE status = 'confirmed') as successful_operations,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_operations,
  SUM(amount_usd) FILTER (WHERE status = 'confirmed') as total_volume_usd,
  MAX(timestamp) as last_operation_at,
  MIN(timestamp) as first_operation_at
FROM agent_transactions
GROUP BY wallet_address;

COMMENT ON VIEW agent_wallet_summary IS 'Summary statistics per wallet for analytics';

-- Create view for operation type distribution
CREATE OR REPLACE VIEW agent_operation_stats AS
SELECT
  operation,
  chain_id,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE status = 'confirmed') as successful_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  AVG(amount_usd) FILTER (WHERE status = 'confirmed') as avg_amount_usd,
  SUM(amount_usd) FILTER (WHERE status = 'confirmed') as total_volume_usd
FROM agent_transactions
GROUP BY operation, chain_id
ORDER BY total_count DESC;

COMMENT ON VIEW agent_operation_stats IS 'Statistics by operation type and chain';

-- Enable Row Level Security (RLS)
ALTER TABLE agent_transactions ENABLE ROW LEVEL SECURITY;

-- Create policy: Allow service role full access
CREATE POLICY agent_transactions_service_role_all
  ON agent_transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create policy: Allow authenticated users to view their own transactions
CREATE POLICY agent_transactions_user_select
  ON agent_transactions
  FOR SELECT
  TO authenticated
  USING (wallet_address = LOWER(auth.jwt() ->> 'wallet_address'));

-- Create policy: Allow insert for authenticated users (their own wallet)
CREATE POLICY agent_transactions_user_insert
  ON agent_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (wallet_address = LOWER(auth.jwt() ->> 'wallet_address'));

-- Note: Update and delete restricted to service role only for data integrity

-- Create function to get wallet analytics (30-day default)
CREATE OR REPLACE FUNCTION get_wallet_analytics(
  p_wallet_address TEXT,
  p_days INTEGER DEFAULT 30
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_operations', COUNT(*),
    'successful_operations', COUNT(*) FILTER (WHERE status = 'confirmed'),
    'failed_operations', COUNT(*) FILTER (WHERE status = 'failed'),
    'total_volume_usd', COALESCE(SUM(amount_usd) FILTER (WHERE status = 'confirmed'), 0),
    'operations_by_type', (
      SELECT json_object_agg(operation, count)
      FROM (
        SELECT operation, COUNT(*) as count
        FROM agent_transactions
        WHERE wallet_address = LOWER(p_wallet_address)
          AND timestamp >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY operation
      ) AS op_counts
    ),
    'operations_by_chain', (
      SELECT json_object_agg(chain_id::TEXT, count)
      FROM (
        SELECT chain_id, COUNT(*) as count
        FROM agent_transactions
        WHERE wallet_address = LOWER(p_wallet_address)
          AND timestamp >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY chain_id
      ) AS chain_counts
    ),
    'success_rate', CASE
      WHEN COUNT(*) > 0 THEN
        ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'confirmed') / COUNT(*), 2)
      ELSE 0
    END,
    'period_days', p_days
  ) INTO result
  FROM agent_transactions
  WHERE wallet_address = LOWER(p_wallet_address)
    AND timestamp >= NOW() - (p_days || ' days')::INTERVAL;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_wallet_analytics IS 'Get analytics summary for a wallet address';

-- Create function to get recent operations
CREATE OR REPLACE FUNCTION get_recent_operations(
  p_wallet_address TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id BIGINT,
  operation TEXT,
  chain_id INTEGER,
  tx_hash TEXT,
  status TEXT,
  amount_usd NUMERIC,
  metadata JSONB,
  operation_timestamp TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.operation,
    t.chain_id,
    t.tx_hash,
    t.status,
    t.amount_usd,
    t.metadata,
    t.timestamp AS operation_timestamp
  FROM agent_transactions t
  WHERE t.wallet_address = LOWER(p_wallet_address)
  ORDER BY t.timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_recent_operations IS 'Get recent operations for a wallet address';

-- Grant permissions
GRANT SELECT ON agent_transactions TO authenticated;
GRANT SELECT ON agent_successful_transactions TO authenticated;
GRANT SELECT ON agent_wallet_summary TO authenticated;
GRANT SELECT ON agent_operation_stats TO authenticated;
GRANT ALL ON agent_transactions TO service_role;

-- Insert sample data for testing (optional - remove in production)
-- INSERT INTO agent_transactions (wallet_address, operation, chain_id, tx_hash, status, amount_usd, metadata) VALUES
--   ('0x742d35cc6634c0532925a3b844bc9e7595f0beb', 'swap', 8453, '0xabc123...', 'confirmed', 100.50, '{"from":"USDC","to":"ETH","amount":100}'),
--   ('0x742d35cc6634c0532925a3b844bc9e7595f0beb', 'balance_check', 8453, NULL, 'confirmed', NULL, '{"token":"USDC","balance":250}'),
--   ('0x742d35cc6634c0532925a3b844bc9e7595f0beb', 'swap', 8453, '0xdef456...', 'failed', NULL, '{"error":"insufficient balance"}');

-- Rollback command (for testing)
-- DROP TABLE IF EXISTS agent_transactions CASCADE;
-- DROP VIEW IF EXISTS agent_successful_transactions CASCADE;
-- DROP VIEW IF EXISTS agent_failed_transactions CASCADE;
-- DROP VIEW IF EXISTS agent_wallet_summary CASCADE;
-- DROP VIEW IF EXISTS agent_operation_stats CASCADE;
-- DROP FUNCTION IF EXISTS get_wallet_analytics CASCADE;
-- DROP FUNCTION IF EXISTS get_recent_operations CASCADE;
-- DROP FUNCTION IF EXISTS update_agent_transactions_updated_at CASCADE;
