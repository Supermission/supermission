-- Migration 004: Fix Mission Timeline Event Type Constraints
-- Created: 2025-10-22
-- Purpose: Add missing event types to mission_timeline to match all mission statuses

-- ============================================================================
-- 1. UPDATE MISSION_TIMELINE EVENT_TYPE CONSTRAINT
-- ============================================================================

-- Drop existing constraint
ALTER TABLE mission_timeline DROP CONSTRAINT IF EXISTS mission_timeline_event_type_check;

-- Add updated constraint with all mission statuses
ALTER TABLE mission_timeline ADD CONSTRAINT mission_timeline_event_type_check
CHECK (event_type IN (
  -- Original event types
  'created',
  'funded',
  'started',
  'submitted',
  'validation_requested',
  'validation_completed',
  'dispute_initiated',
  'dispute_resolved',
  'approved',
  'rejected',
  'auto_released',
  'completed',
  'cancelled',

  -- Added to match mission statuses
  'pending',           -- Maps to mission status 'pending'
  'in_progress',       -- Maps to mission status 'in_progress'
  'validating',        -- Maps to mission status 'validating'
  'disputing',         -- Maps to mission status 'disputing'
  'failed'             -- Maps to mission status 'failed'
));

COMMENT ON CONSTRAINT mission_timeline_event_type_check ON mission_timeline
IS 'Allows all mission status values plus additional lifecycle events';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
