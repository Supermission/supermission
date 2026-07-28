-- 051: AI Signals Revamp
-- - ADD favourite_outcome (AI's pick: "Yes", "No", "India", etc.)
-- - DROP ai_prediction (redundant with favourite_outcome)
-- - DROP predicted_probability (no more percentages)
-- - DROP key_findings (raw article data — not useful UX)
-- - RESET old AI fields so stale "irrelevant" predictions don't pollute the new UX

-- Schema changes
ALTER TABLE market_catalog
  ADD COLUMN IF NOT EXISTS favourite_outcome TEXT,
  ADD COLUMN IF NOT EXISTS source_article_urls TEXT[] DEFAULT '{}',
  DROP COLUMN IF EXISTS ai_prediction,
  DROP COLUMN IF EXISTS predicted_probability,
  DROP COLUMN IF EXISTS key_findings;

-- Clear old AI data — next worker cycle will repopulate with relevance-gated predictions
UPDATE market_catalog
SET ai_sentiment = NULL,
    ai_confidence = NULL,
    ai_summary = NULL
WHERE ai_confidence IS NOT NULL;
