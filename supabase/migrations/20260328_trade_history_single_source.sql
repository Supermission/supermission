-- Trade history: make Supabase the single source of truth (drop Polymarket API merge).
-- 1. Add market_question column so we don't need to join/merge at query time.
-- 2. Add unique index on order_id for idempotent upserts (retry-safe).

ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS market_question TEXT;

-- Unique partial index: only non-null order_ids (allows multiple NULL order_ids)
CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_history_order_id
  ON trade_history (order_id) WHERE order_id IS NOT NULL;
