-- 049_drop_snapshots.sql
-- Replace market_price_snapshots table with a single column on market_catalog.
-- The worker will rotate yes_price_24h_ago once every ~24h instead of
-- inserting 1 row per market per minute.

ALTER TABLE market_catalog
  ADD COLUMN IF NOT EXISTS yes_price_24h_ago DECIMAL DEFAULT 0;

DROP TABLE IF EXISTS market_price_snapshots;
