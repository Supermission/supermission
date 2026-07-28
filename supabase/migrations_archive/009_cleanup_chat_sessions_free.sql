-- Migration 009: Cleanup chat_sessions for free chat
-- Remove payment-related fields: messages_remaining, total_paid, expires_at
-- Created: 2025-11-13

-- Create chat_sessions table if it doesn't exist (simplified version)
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id TEXT PRIMARY KEY,
  user_address TEXT NOT NULL,
  agent_id TEXT DEFAULT 'supermission-agent',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create chat_messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Remove payment-related columns if they exist
ALTER TABLE chat_sessions
  DROP COLUMN IF EXISTS messages_remaining,
  DROP COLUMN IF EXISTS total_paid,
  DROP COLUMN IF EXISTS expires_at;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_address ON chat_sessions(user_address);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created ON chat_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

-- Add updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for chat_sessions updated_at
DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE chat_sessions IS 'Free chat sessions - no payment required';
COMMENT ON TABLE chat_messages IS 'Chat messages for each session';
