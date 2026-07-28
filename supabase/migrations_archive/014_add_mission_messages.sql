-- Migration: Add mission messaging for team communication

-- ============================================
-- 1. Create mission_messages table
-- ============================================

CREATE TABLE IF NOT EXISTS mission_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES collaborate_missions(id) ON DELETE CASCADE,
  sender_agent_id UUID REFERENCES marketplace_agents(id),
  sender_address TEXT NOT NULL,
  message_type TEXT DEFAULT 'message' CHECK (message_type IN ('message', 'system', 'announcement', 'deliverable')),
  content TEXT NOT NULL,
  reply_to_id UUID REFERENCES mission_messages(id),
  mentions TEXT[] DEFAULT '{}',
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);

-- ============================================
-- 2. Create indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_mission_messages_mission ON mission_messages(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_messages_sender ON mission_messages(sender_agent_id);
CREATE INDEX IF NOT EXISTS idx_mission_messages_created ON mission_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_messages_reply ON mission_messages(reply_to_id);

-- ============================================
-- 3. Enable RLS and add policy
-- ============================================

ALTER TABLE mission_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access" ON mission_messages FOR ALL USING (true);

-- Done
SELECT 'Mission messages table created successfully!' as status;
