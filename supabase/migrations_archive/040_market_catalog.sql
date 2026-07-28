-- 040_market_catalog.sql
-- Prediction Market Terminal: market catalog, watchlists, trade history

-- Enable trigram extension for full-text search (must come before indexes)
-- NOTE: If this fails, enable pg_trgm in Supabase Dashboard → Database → Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1. market_catalog — Full market catalog synced from Polymarket
-- ============================================================
CREATE TABLE IF NOT EXISTS market_catalog (
  condition_id TEXT PRIMARY KEY,
  market_id TEXT,
  event_id TEXT,
  question TEXT NOT NULL,
  description TEXT,
  slug TEXT,

  -- CLOB data
  clob_token_ids TEXT[],
  outcomes TEXT[],
  outcome_prices DECIMAL[],

  -- Market metrics
  volume DECIMAL DEFAULT 0,
  volume_24h DECIMAL DEFAULT 0,
  volume_1wk DECIMAL DEFAULT 0,
  liquidity DECIMAL DEFAULT 0,
  spread DECIMAL DEFAULT 0,

  -- Categorization
  categories TEXT[],
  tags TEXT[],

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_closed BOOLEAN DEFAULT false,
  end_date TIMESTAMPTZ,
  start_date TIMESTAMPTZ,
  resolution_source TEXT,

  -- AI enrichment (filled later by pipeline)
  ai_sentiment TEXT,        -- 'bullish', 'bearish', 'neutral'
  ai_confidence DECIMAL,    -- 0-100
  ai_summary TEXT,

  -- Computed fields (updated by sync/price jobs)
  price_change_24h DECIMAL DEFAULT 0,
  volume_change_24h DECIMAL DEFAULT 0,
  is_trending BOOLEAN DEFAULT false,
  is_hot BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_market_catalog_active ON market_catalog (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_market_catalog_categories ON market_catalog USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_market_catalog_volume ON market_catalog (volume DESC);
CREATE INDEX IF NOT EXISTS idx_market_catalog_volume_24h ON market_catalog (volume_24h DESC);
CREATE INDEX IF NOT EXISTS idx_market_catalog_slug ON market_catalog (slug);
CREATE INDEX IF NOT EXISTS idx_market_catalog_end_date ON market_catalog (end_date);
CREATE INDEX IF NOT EXISTS idx_market_catalog_trending ON market_catalog (is_trending) WHERE is_trending = true;
CREATE INDEX IF NOT EXISTS idx_market_catalog_event_id ON market_catalog (event_id);
-- Trigram index for fuzzy text search on question (requires pg_trgm extension above)
CREATE INDEX IF NOT EXISTS idx_market_catalog_question_trgm ON market_catalog USING GIN (question gin_trgm_ops);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_market_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_market_catalog_updated_at
  BEFORE UPDATE ON market_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_market_catalog_updated_at();


-- ============================================================
-- 2. user_watchlists — User's saved markets
-- ============================================================
CREATE TABLE IF NOT EXISTS user_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  condition_id TEXT NOT NULL REFERENCES market_catalog(condition_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_address, condition_id)
);

CREATE INDEX IF NOT EXISTS idx_user_watchlists_user ON user_watchlists (user_address);


-- ============================================================
-- 3. trade_history — Records of trades executed through platform
-- ============================================================
CREATE TABLE IF NOT EXISTS trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  token_id TEXT,
  side TEXT NOT NULL,         -- 'BUY' or 'SELL'
  outcome TEXT NOT NULL,      -- 'Yes' or 'No'
  amount DECIMAL NOT NULL,    -- USDC amount
  price DECIMAL NOT NULL,     -- Price at execution
  shares DECIMAL,             -- Shares received
  order_id TEXT,              -- Polymarket order ID
  status TEXT DEFAULT 'completed',  -- 'pending', 'completed', 'failed'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_history_user ON trade_history (user_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_history_condition ON trade_history (condition_id);


-- ============================================================
-- RLS Policies (public read, service-role write)
-- ============================================================
ALTER TABLE market_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;

-- market_catalog: public read
CREATE POLICY "market_catalog_public_read" ON market_catalog
  FOR SELECT USING (true);

-- user_watchlists: public read/write (address-based filtering done in app)
CREATE POLICY "user_watchlists_public_read" ON user_watchlists
  FOR SELECT USING (true);

CREATE POLICY "user_watchlists_public_insert" ON user_watchlists
  FOR INSERT WITH CHECK (true);

CREATE POLICY "user_watchlists_public_delete" ON user_watchlists
  FOR DELETE USING (true);

-- trade_history: public read, insert
CREATE POLICY "trade_history_public_read" ON trade_history
  FOR SELECT USING (true);

CREATE POLICY "trade_history_public_insert" ON trade_history
  FOR INSERT WITH CHECK (true);
