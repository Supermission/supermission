-- 042_market_signals.sql
-- AI signals for prediction market intelligence layer

CREATE TABLE IF NOT EXISTS market_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,        -- 'sentiment', 'edge', 'momentum', 'risk'
  signal_value JSONB NOT NULL,      -- Type-specific payload
  confidence DECIMAL NOT NULL,      -- 0-100
  source TEXT,                      -- e.g. 'news_match', 'price_momentum', 'volume_spike'
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Query by market + type (most common)
CREATE INDEX IF NOT EXISTS idx_signals_condition_type
  ON market_signals (condition_id, signal_type);

-- Cleanup expired signals
CREATE INDEX IF NOT EXISTS idx_signals_expires
  ON market_signals (expires_at);

-- RLS: public read
ALTER TABLE market_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signals_public_read" ON market_signals
  FOR SELECT USING (true);
