-- Add source column to missions table
-- Migration: 008_add_mission_source_column
-- Created: 2025-11-11

ALTER TABLE missions
ADD COLUMN IF NOT EXISTS source TEXT CHECK (source IN ('bundle', 'chat', 'custom'));

-- Add index for filtering by source
CREATE INDEX IF NOT EXISTS idx_missions_source ON missions(source);

-- Add comment
COMMENT ON COLUMN missions.source IS 'Source of mission creation: bundle (from agent bundles), chat (from AI chat), custom (manually created)';
