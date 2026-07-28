-- 050: Clean up redundant fields, add market icon + event_slug
-- - DROP volume_change_24h (never populated)
-- - DROP ai_reasoning (exact duplicate of ai_summary)
-- - DROP image (consolidated into icon)
-- - ADD icon (from Polymarket Gamma API)
-- - ADD event_slug (for Polymarket link — uses event slug, not market slug)

ALTER TABLE market_catalog
  DROP COLUMN IF EXISTS volume_change_24h,
  DROP COLUMN IF EXISTS ai_reasoning,
  DROP COLUMN IF EXISTS image,
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS event_slug TEXT;
