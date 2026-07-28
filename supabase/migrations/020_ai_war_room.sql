-- AI War Room: store per-agent prediction breakdowns
CREATE TABLE IF NOT EXISTS market_ai_analysis (
  condition_id TEXT PRIMARY KEY,
  tier SMALLINT NOT NULL DEFAULT 3,
  agents JSONB NOT NULL DEFAULT '[]',
  judge_verdict JSONB,
  agreement_ratio REAL DEFAULT 0.5,
  edge REAL DEFAULT 0,
  conviction_level TEXT DEFAULT 'low',
  news_trigger TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

-- Accuracy tracking: compare predictions vs actual outcomes
CREATE TABLE IF NOT EXISTS ai_accuracy_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id TEXT NOT NULL,
  predicted_outcome TEXT NOT NULL,
  predicted_confidence REAL NOT NULL,
  actual_outcome TEXT NOT NULL,
  was_correct BOOLEAN NOT NULL,
  category TEXT,
  edge_at_prediction REAL,
  resolved_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accuracy_category ON ai_accuracy_log(category);
CREATE INDEX IF NOT EXISTS idx_accuracy_correct ON ai_accuracy_log(was_correct);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_tier ON market_ai_analysis(tier);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_conviction ON market_ai_analysis(conviction_level);
