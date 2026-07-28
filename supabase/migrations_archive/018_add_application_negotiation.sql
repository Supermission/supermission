-- Migration: Add application negotiation chat system
-- Enables private negotiation between applicant and mission creator before acceptance

-- ============================================
-- PART 1: Extend collaborate_missions for timeouts
-- ============================================

ALTER TABLE collaborate_missions
ADD COLUMN IF NOT EXISTS application_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_reject_after_days INTEGER DEFAULT 7;

-- ============================================
-- PART 2: Extend collaborate_applications for mutual approval
-- ============================================

ALTER TABLE collaborate_applications
ADD COLUMN IF NOT EXISTS agent_approved BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS creator_approved BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS proposed_rate TEXT,
ADD COLUMN IF NOT EXISTS agreed_rate TEXT,
ADD COLUMN IF NOT EXISTS agreed_rate_currency TEXT DEFAULT 'USDC',
ADD COLUMN IF NOT EXISTS agent_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS creator_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

-- Index for expiration queries (cron job)
CREATE INDEX IF NOT EXISTS idx_applications_expires
ON collaborate_applications(expires_at)
WHERE status = 'pending' AND expires_at IS NOT NULL;

-- ============================================
-- PART 3: Application messages table (negotiation chat)
-- ============================================

CREATE TABLE IF NOT EXISTS application_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES collaborate_applications(id) ON DELETE CASCADE,
  sender_address TEXT NOT NULL,
  sender_agent_id UUID REFERENCES marketplace_agents(id),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'message' CHECK (message_type IN ('message', 'system', 'offer', 'approval', 'withdrawal')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance at scale (500+ agents)
CREATE INDEX IF NOT EXISTS idx_app_messages_app_id ON application_messages(application_id);
CREATE INDEX IF NOT EXISTS idx_app_messages_created ON application_messages(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_messages_sender ON application_messages(sender_address);

-- Enable RLS
ALTER TABLE application_messages ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role access" ON application_messages FOR ALL USING (true);

-- ============================================
-- PART 4: Function to auto-expire applications
-- ============================================

CREATE OR REPLACE FUNCTION expire_stale_applications()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
  expired_ids UUID[];
BEGIN
  -- Get IDs of applications to expire
  SELECT ARRAY_AGG(id) INTO expired_ids
  FROM collaborate_applications
  WHERE
    status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  -- Early return if nothing to expire
  IF expired_ids IS NULL OR array_length(expired_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Update applications to rejected
  UPDATE collaborate_applications
  SET
    status = 'rejected',
    expired_at = NOW(),
    responded_at = NOW()
  WHERE id = ANY(expired_ids);

  -- Insert system messages for expired applications
  INSERT INTO application_messages (application_id, sender_address, content, message_type, metadata)
  SELECT
    id,
    'system',
    'Application expired due to inactivity',
    'system',
    '{"reason": "timeout"}'::jsonb
  FROM collaborate_applications
  WHERE id = ANY(expired_ids);

  -- Return count
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN array_length(expired_ids, 1);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 5: Create mission_payments table if not exists
-- (for payment recording - may already exist from previous migrations)
-- ============================================

CREATE TABLE IF NOT EXISTS mission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES collaborate_missions(id) ON DELETE CASCADE,
  task_id UUID REFERENCES collaborate_tasks(id) ON DELETE SET NULL,
  from_agent_name TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_agent_id UUID REFERENCES marketplace_agents(id),
  to_agent_name TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'signing', 'settling', 'completed', 'failed', 'skipped')),
  x402_payment_id TEXT,
  tx_hash TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mission_payments_mission ON mission_payments(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_payments_task ON mission_payments(task_id);
CREATE INDEX IF NOT EXISTS idx_mission_payments_status ON mission_payments(status);

-- Enable RLS if not already enabled
ALTER TABLE mission_payments ENABLE ROW LEVEL SECURITY;

-- Service role policy (may already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mission_payments' AND policyname = 'Service role access'
  ) THEN
    CREATE POLICY "Service role access" ON mission_payments FOR ALL USING (true);
  END IF;
END $$;

-- Done!
SELECT 'Application negotiation tables created successfully!' as status;
