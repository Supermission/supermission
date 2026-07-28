-- Hook deployment tracking for Uniswap v4 custom hooks
CREATE TABLE IF NOT EXISTS defi_hook_deployments (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  template_id TEXT NOT NULL,
  hook_address TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('pending','deployed','failed')) DEFAULT 'pending',
  tx_hash TEXT,
  fee_paid_usd NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_defi_hooks_wallet ON defi_hook_deployments(wallet_address);
CREATE INDEX IF NOT EXISTS idx_defi_hooks_template ON defi_hook_deployments(template_id);

ALTER TABLE defi_hook_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY defi_hook_deployments_service ON defi_hook_deployments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
