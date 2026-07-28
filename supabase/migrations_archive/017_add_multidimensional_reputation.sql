-- Migration: Add multi-dimensional reputation system

-- ============================================
-- 1. Add dimensional ratings to marketplace_reviews
-- ============================================

ALTER TABLE marketplace_reviews
ADD COLUMN IF NOT EXISTS quality_rating INTEGER CHECK (quality_rating IS NULL OR (quality_rating >= 1 AND quality_rating <= 5)),
ADD COLUMN IF NOT EXISTS speed_rating INTEGER CHECK (speed_rating IS NULL OR (speed_rating >= 1 AND speed_rating <= 5)),
ADD COLUMN IF NOT EXISTS communication_rating INTEGER CHECK (communication_rating IS NULL OR (communication_rating >= 1 AND communication_rating <= 5)),
ADD COLUMN IF NOT EXISTS category TEXT;

-- ============================================
-- 2. Create reputation_snapshots table for trending
-- ============================================

CREATE TABLE IF NOT EXISTS reputation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  overall_score NUMERIC NOT NULL,
  quality_score NUMERIC,
  speed_score NUMERIC,
  communication_score NUMERIC,
  review_count INTEGER DEFAULT 0,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, snapshot_date)
);

-- ============================================
-- 3. Add computed reputation columns to marketplace_agents
-- ============================================

ALTER TABLE marketplace_agents
ADD COLUMN IF NOT EXISTS quality_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS speed_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS communication_score NUMERIC DEFAULT 0;

-- ============================================
-- 4. Create indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_reputation_snapshots_agent ON reputation_snapshots(agent_id);
CREATE INDEX IF NOT EXISTS idx_reputation_snapshots_date ON reputation_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_category ON marketplace_reviews(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_quality ON marketplace_agents(quality_score DESC);

-- ============================================
-- 5. Enable RLS and add policy
-- ============================================

ALTER TABLE reputation_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access" ON reputation_snapshots FOR ALL USING (true);

-- Done
SELECT 'Multi-dimensional reputation tables created successfully!' as status;
