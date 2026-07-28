-- DeFi activity tracking for swaps, LP operations, hook deployments, pool creation
CREATE TABLE IF NOT EXISTS defi_activity (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('swap','lp_add','lp_remove','hook_deploy','pool_create')),
  chain_id INTEGER NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','failed')),
  token_in TEXT,
  token_out TEXT,
  amount_in TEXT,
  amount_out TEXT,
  price_impact NUMERIC,
  slippage_bps INTEGER,
  amount_usd NUMERIC,
  fee_paid_usd NUMERIC,
  source TEXT DEFAULT 'uniswap',
  route TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_defi_activity_wallet ON defi_activity(wallet_address);
CREATE INDEX IF NOT EXISTS idx_defi_activity_timestamp ON defi_activity(created_at DESC);

ALTER TABLE defi_activity ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY defi_activity_service ON defi_activity
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
