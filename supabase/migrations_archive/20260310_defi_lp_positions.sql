-- LP position tracking for Uniswap v4
CREATE TABLE IF NOT EXISTS defi_lp_positions (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  pool_id TEXT NOT NULL,
  token0 TEXT NOT NULL,
  token1 TEXT NOT NULL,
  fee_tier INTEGER,
  lower_tick INTEGER NOT NULL,
  upper_tick INTEGER NOT NULL,
  liquidity TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','closed','out_of_range')) DEFAULT 'active',
  add_tx_hash TEXT,
  remove_tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_defi_lp_wallet ON defi_lp_positions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_defi_lp_pool ON defi_lp_positions(pool_id);
CREATE INDEX IF NOT EXISTS idx_defi_lp_status ON defi_lp_positions(status) WHERE status = 'active';

ALTER TABLE defi_lp_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY defi_lp_positions_service ON defi_lp_positions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
