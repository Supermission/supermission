-- Portfolio snapshots: daily snapshots of each user's portfolio value
-- Used to compute accurate period PnL (1D, 1W, 1M, 1Y)
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_address text NOT NULL,
  snapshot_date date NOT NULL,
  total_value numeric NOT NULL DEFAULT 0,
  positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_address, snapshot_date)
);

-- Index for fast lookups by user + date range
CREATE INDEX idx_portfolio_snapshots_user_date
  ON portfolio_snapshots (user_address, snapshot_date DESC);
