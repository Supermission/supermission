-- Migration 010: Create user_preferences table for onboarding
-- Stores user onboarding completion state and preferences
-- Created: 2025-11-13

CREATE TABLE IF NOT EXISTS user_preferences (
  user_address TEXT PRIMARY KEY,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_dismissed_at TIMESTAMP WITH TIME ZONE,
  onboarding_current_step INTEGER DEFAULT 0,
  network_checked BOOLEAN DEFAULT FALSE,
  tokens_checked BOOLEAN DEFAULT FALSE,
  tutorial_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_preferences_onboarding ON user_preferences(onboarding_completed);
CREATE INDEX IF NOT EXISTS idx_user_preferences_created ON user_preferences(created_at DESC);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE user_preferences IS 'User preferences and onboarding state';
COMMENT ON COLUMN user_preferences.onboarding_completed IS 'Whether user has completed full onboarding';
COMMENT ON COLUMN user_preferences.onboarding_dismissed_at IS 'When user dismissed onboarding (if applicable)';
COMMENT ON COLUMN user_preferences.onboarding_current_step IS 'Current step in onboarding flow (0-based)';
