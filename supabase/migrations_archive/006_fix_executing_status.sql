-- Migration 006: Add 'executing' to mission_timeline event types
-- Created: 2025-10-25
-- Purpose: Fix constraint violation when agents report 'executing' status
-- Issue: Agents cannot update status because 'executing' is not in allowed event_type values

-- ============================================================================
-- FIX MISSION_TIMELINE CONSTRAINT TO ALLOW 'executing'
-- ============================================================================

-- Drop existing constraint
ALTER TABLE mission_timeline DROP CONSTRAINT IF EXISTS mission_timeline_event_type_check;

-- Add updated constraint with 'executing' included
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

  -- Mission statuses
  'pending',
  'in_progress',
  'validating',
  'disputing',
  'failed',

  -- Agent execution statuses (ADDED)
  'executing'        -- Agent is currently executing task
));

COMMENT ON CONSTRAINT mission_timeline_event_type_check ON mission_timeline
IS 'Allows all mission statuses, lifecycle events, and agent execution statuses';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
