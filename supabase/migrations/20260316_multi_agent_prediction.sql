-- Multi-agent prediction system: add tracking columns to prediction_log
-- and queue the multi-agent A/B experiment.

-- 1. Add columns to prediction_log for tracking prediction method and agent breakdown
ALTER TABLE prediction_log
  ADD COLUMN IF NOT EXISTS prediction_method text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS agent_breakdown   jsonb;

-- Index for querying by prediction method (useful for A/B comparison)
CREATE INDEX IF NOT EXISTS idx_prediction_log_method
  ON prediction_log(prediction_method)
  WHERE prediction_method != 'single';

-- 2. Queue the multi-agent experiment
-- Priority 5 = runs before the existing queue items (which start at priority 10)
-- so it gets picked up next when the current experiment concludes.
INSERT INTO experiment_queue (name, param_name, variant_value, priority)
VALUES (
  'prediction method → multi_agent',
  'predictionMethod',
  '{"predictionMethod": "multi_agent"}',
  5
)
ON CONFLICT DO NOTHING;
