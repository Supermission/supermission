-- Robinhood Agentic Trading integration.
-- Per-user OAuth connection (tokens encrypted at rest, app-side AES-256-GCM) +
-- user-defined RORO automated strategies. Keyed on owner wallet address, matching
-- server_wallets / price_alerts conventions.

CREATE TABLE IF NOT EXISTS robinhood_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_address TEXT NOT NULL,
  access_token_ciphertext TEXT,
  access_token_iv TEXT,
  access_token_salt TEXT,
  refresh_token_ciphertext TEXT,
  refresh_token_iv TEXT,
  refresh_token_salt TEXT,
  access_token_expires_at TIMESTAMPTZ,
  scopes TEXT,
  is_active BOOLEAN DEFAULT true,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rh_conn_owner ON robinhood_connections(owner_address);

-- RORO scheduled/automated strategies (Phase C).
CREATE TABLE IF NOT EXISTS roro_strategies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_address TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,   -- entry/exit predicates
  action JSONB NOT NULL DEFAULT '{}'::jsonb,        -- order template: symbol, side, qty, order_type, limit_price
  require_approval BOOLEAN DEFAULT true,            -- when true, propose (notify) instead of auto-placing
  is_active BOOLEAN DEFAULT true,
  triggers_count INT DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_roro_active ON roro_strategies(is_active, next_run_at);
CREATE INDEX IF NOT EXISTS idx_roro_owner ON roro_strategies(owner_address);
