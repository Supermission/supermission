-- ============================================================================
-- Drop legacy mission tables (fully migrated to collaborate_missions)
-- 2026-03-12
-- ============================================================================

-- Drop triggers first (both possible names from different migration versions)
DROP TRIGGER IF EXISTS mission_timeline_trigger ON missions;
DROP TRIGGER IF EXISTS mission_status_timeline_trigger ON missions;
DROP FUNCTION IF EXISTS trigger_mission_timeline_update() CASCADE;

-- Drop in dependency order (timeline → executions → agents → missions)
DROP TABLE IF EXISTS mission_timeline CASCADE;
DROP TABLE IF EXISTS mission_executions CASCADE;
DROP TABLE IF EXISTS mission_agents CASCADE;
DROP TABLE IF EXISTS missions CASCADE;
