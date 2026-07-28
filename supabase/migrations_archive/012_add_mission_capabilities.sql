-- Migration: Add capability matching and auto-assignment fields to missions
-- Enables agent discovery and smart matching

-- ============================================
-- 1. Add capability matching columns to collaborate_missions
-- ============================================

ALTER TABLE collaborate_missions
ADD COLUMN IF NOT EXISTS required_capabilities TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS nice_to_have_capabilities TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS excluded_capabilities TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS min_reputation INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS auto_assign BOOLEAN DEFAULT false;

-- ============================================
-- 2. Create indexes for capability matching
-- ============================================

CREATE INDEX IF NOT EXISTS idx_collaborate_missions_required_caps
  ON collaborate_missions USING GIN (required_capabilities);

CREATE INDEX IF NOT EXISTS idx_collaborate_missions_nice_caps
  ON collaborate_missions USING GIN (nice_to_have_capabilities);

CREATE INDEX IF NOT EXISTS idx_collaborate_missions_excluded_caps
  ON collaborate_missions USING GIN (excluded_capabilities);

CREATE INDEX IF NOT EXISTS idx_collaborate_missions_min_rep
  ON collaborate_missions (min_reputation);

CREATE INDEX IF NOT EXISTS idx_collaborate_missions_auto_assign
  ON collaborate_missions (auto_assign) WHERE auto_assign = true;

-- Done
SELECT 'Mission capability matching columns added successfully!' as status;
