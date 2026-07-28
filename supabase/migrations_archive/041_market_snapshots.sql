-- 041_market_snapshots.sql
-- Price snapshots for historical charts and trending detection

CREATE TABLE IF NOT EXISTS market_price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id TEXT NOT NULL,
  yes_price DECIMAL NOT NULL,
  no_price DECIMAL NOT NULL,
  volume DECIMAL,
  captured_at TIMESTAMPTZ DEFAULT now()
);

-- Index for time-series queries: given a market, get snapshots in time order
CREATE INDEX IF NOT EXISTS idx_snapshots_condition_time
  ON market_price_snapshots (condition_id, captured_at DESC);

-- Index for cleanup: delete old snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_captured_at
  ON market_price_snapshots (captured_at);

-- RLS: public read, service-role write
ALTER TABLE market_price_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_public_read" ON market_price_snapshots
  FOR SELECT USING (true);
