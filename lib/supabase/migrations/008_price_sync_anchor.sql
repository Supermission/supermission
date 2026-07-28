-- 008_price_sync_anchor.sql
-- Persist the 24h price anchor + rotation metadata so priceSync can
-- run on stateless Vercel functions (previously held in worker's
-- in-memory FullMarket.yesPriceAgo24h, lost on every restart).

-- Anchor per market — copied from current yes-price every ~23h.
ALTER TABLE market_catalog
  ADD COLUMN IF NOT EXISTS yes_price_ago_24h numeric NOT NULL DEFAULT 0;

-- Single-row meta table. Tracks when the anchor was last rotated across
-- all markets. Keyed by a singleton id so we can upsert safely.
CREATE TABLE IF NOT EXISTS price_sync_meta (
  id              int PRIMARY KEY DEFAULT 1,
  last_rotated_at timestamptz,
  CONSTRAINT price_sync_meta_singleton CHECK (id = 1)
);

INSERT INTO price_sync_meta (id, last_rotated_at)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;
