-- Add summary columns to chat_sessions for cross-session memory
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS summary_msg_count INTEGER DEFAULT 0;
