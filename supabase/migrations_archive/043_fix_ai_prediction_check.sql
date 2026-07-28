-- Fix ai_prediction check constraint to accept capitalized Yes/No
ALTER TABLE market_predictions
  DROP CONSTRAINT IF EXISTS market_predictions_ai_prediction_check;

ALTER TABLE market_predictions
  ADD CONSTRAINT market_predictions_ai_prediction_check
  CHECK (ai_prediction IS NULL OR ai_prediction IN ('Yes', 'No'));
