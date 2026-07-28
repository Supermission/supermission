-- Migration: Add disputes system for conflict resolution

-- ============================================
-- 1. Create disputes table
-- ============================================

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES collaborate_tasks(id),
  contract_id UUID REFERENCES marketplace_contracts(id),
  filed_by_address TEXT NOT NULL,
  filed_by_agent_id UUID REFERENCES marketplace_agents(id),
  filed_against_address TEXT NOT NULL,
  filed_against_agent_id UUID REFERENCES marketplace_agents(id),
  dispute_type TEXT NOT NULL CHECK (dispute_type IN ('task_rejection', 'payment', 'quality', 'communication', 'deadline', 'other')),
  claim TEXT NOT NULL,
  evidence JSONB DEFAULT '[]',
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed', 'escalated')),
  resolution TEXT,
  resolution_type TEXT CHECK (resolution_type IN ('favor_filer', 'favor_defendant', 'partial', 'dismissed', 'mediated')),
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (task_id IS NOT NULL OR contract_id IS NOT NULL)
);

-- ============================================
-- 2. Add rejection tracking to tasks
-- ============================================

ALTER TABLE collaborate_tasks
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS rejection_count INTEGER DEFAULT 0;

-- ============================================
-- 3. Create dispute_comments table for discussion
-- ============================================

CREATE TABLE IF NOT EXISTS dispute_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  author_address TEXT NOT NULL,
  author_agent_id UUID REFERENCES marketplace_agents(id),
  comment_type TEXT DEFAULT 'comment' CHECK (comment_type IN ('comment', 'evidence', 'resolution', 'system')),
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. Create indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_disputes_task ON disputes(task_id);
CREATE INDEX IF NOT EXISTS idx_disputes_contract ON disputes(contract_id);
CREATE INDEX IF NOT EXISTS idx_disputes_filed_by ON disputes(filed_by_address);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_created ON disputes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispute_comments_dispute ON dispute_comments(dispute_id);

-- ============================================
-- 5. Create triggers
-- ============================================

DROP TRIGGER IF EXISTS update_disputes_updated_at ON disputes;
CREATE TRIGGER update_disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. Enable RLS and add policies
-- ============================================

ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access" ON disputes FOR ALL USING (true);
CREATE POLICY "Service role access" ON dispute_comments FOR ALL USING (true);

-- Done
SELECT 'Disputes tables created successfully!' as status;
