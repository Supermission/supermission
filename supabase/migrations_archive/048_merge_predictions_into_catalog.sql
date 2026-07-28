-- 048_merge_predictions_into_catalog.sql
-- Merge market_predictions into market_catalog (single source of truth)

ALTER TABLE market_catalog
  ADD COLUMN IF NOT EXISTS predicted_probability DECIMAL,
  ADD COLUMN IF NOT EXISTS key_findings TEXT[],
  ADD COLUMN IF NOT EXISTS ai_prediction TEXT,
  ADD COLUMN IF NOT EXISTS ai_reasoning TEXT;

ALTER TABLE market_catalog
  ADD CONSTRAINT market_catalog_ai_prediction_check
  CHECK (ai_prediction IS NULL OR ai_prediction IN ('Yes', 'No'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_catalog_market_id ON market_catalog (market_id);

-- Migrate existing data from market_predictions into market_catalog
UPDATE market_catalog mc SET
  predicted_probability = mp.predicted_probability,
  key_findings = mp.key_findings,
  ai_prediction = mp.ai_prediction,
  ai_reasoning = mp.ai_reasoning,
  ai_confidence = COALESCE(mp.ai_confidence, mc.ai_confidence),
  ai_sentiment = COALESCE(mp.current_sentiment, mc.ai_sentiment),
  ai_summary = COALESCE(mp.summary, mc.ai_summary)
FROM market_predictions mp
WHERE mc.market_id = mp.market_id;

DROP TABLE IF EXISTS market_predictions;
