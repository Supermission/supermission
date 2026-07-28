-- Migration 003: Add Mission Escrow Columns
-- Created: 2025-10-21
-- Purpose: Add columns to support MissionEscrow.sol integration with validation and disputes

-- ============================================================================
-- 1. ADD MISSION ESCROW COLUMNS
-- ============================================================================

-- Add escrow-related columns to missions table
ALTER TABLE missions
ADD COLUMN IF NOT EXISTS escrow_contract_id BIGINT,
ADD COLUMN IF NOT EXISTS deliverable_uri TEXT,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS auto_release_time TIMESTAMP WITH TIME ZONE;

-- Add validation-related columns
ALTER TABLE missions
ADD COLUMN IF NOT EXISTS validation_id BIGINT,
ADD COLUMN IF NOT EXISTS validation_status TEXT CHECK (validation_status IN ('pending', 'approved', 'rejected', 'none')),
ADD COLUMN IF NOT EXISTS validation_stake DECIMAL(18,6),
ADD COLUMN IF NOT EXISTS validator_agent_id TEXT;

-- Add dispute-related columns (UMA integration)
ALTER TABLE missions
ADD COLUMN IF NOT EXISTS dispute_assertion_id TEXT,
ADD COLUMN IF NOT EXISTS dispute_status TEXT CHECK (dispute_status IN ('pending', 'resolved', 'none')),
ADD COLUMN IF NOT EXISTS dispute_claim TEXT,
ADD COLUMN IF NOT EXISTS dispute_result BOOLEAN;

COMMENT ON COLUMN missions.escrow_contract_id IS 'On-chain mission ID from MissionEscrow contract';
COMMENT ON COLUMN missions.deliverable_uri IS 'IPFS URI of submitted deliverable';
COMMENT ON COLUMN missions.submitted_at IS 'Timestamp when deliverable was submitted';
COMMENT ON COLUMN missions.auto_release_time IS '48-hour auto-release deadline';
COMMENT ON COLUMN missions.validation_id IS 'ERC-8004 validation request ID';
COMMENT ON COLUMN missions.validation_status IS 'Status of ERC-8004 validation';
COMMENT ON COLUMN missions.validation_stake IS 'Stake amount for validation (USDC)';
COMMENT ON COLUMN missions.validator_agent_id IS 'ERC-8004 agent ID performing validation';
COMMENT ON COLUMN missions.dispute_assertion_id IS 'UMA Optimistic Oracle assertion ID';
COMMENT ON COLUMN missions.dispute_status IS 'Status of UMA dispute';
COMMENT ON COLUMN missions.dispute_claim IS 'Dispute claim text submitted to UMA';
COMMENT ON COLUMN missions.dispute_result IS 'Final dispute result (true = agent wins, false = client wins)';

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_missions_escrow_id ON missions(escrow_contract_id);
CREATE INDEX IF NOT EXISTS idx_missions_validation_id ON missions(validation_id);
CREATE INDEX IF NOT EXISTS idx_missions_validation_status ON missions(validation_status);
CREATE INDEX IF NOT EXISTS idx_missions_dispute_id ON missions(dispute_assertion_id);
CREATE INDEX IF NOT EXISTS idx_missions_auto_release ON missions(auto_release_time) WHERE auto_release_time IS NOT NULL;

-- ============================================================================
-- 3. CREATE MISSION TIMELINE TABLE (Optional - for audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS mission_timeline (
  id BIGSERIAL PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
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
    'cancelled'
  )),
  event_data JSONB,
  tx_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_timeline_mission ON mission_timeline(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_timeline_type ON mission_timeline(event_type);

COMMENT ON TABLE mission_timeline IS 'Complete audit trail of mission lifecycle events';
COMMENT ON COLUMN mission_timeline.event_type IS 'Type of lifecycle event';
COMMENT ON COLUMN mission_timeline.event_data IS 'Additional event metadata (amounts, addresses, etc)';
COMMENT ON COLUMN mission_timeline.tx_hash IS 'On-chain transaction hash if applicable';

-- ============================================================================
-- 4. UPDATE MISSION STATUS ENUM (Add new escrow-specific statuses)
-- ============================================================================

-- Drop existing constraint
ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_status_check;

-- Add new constraint with escrow statuses
ALTER TABLE missions ADD CONSTRAINT missions_status_check
CHECK (status IN (
  'pending',        -- Created but not funded
  'funded',         -- Escrow funded, ready to start
  'in_progress',    -- Agents working
  'submitted',      -- Deliverable submitted
  'validating',     -- ERC-8004 validation in progress
  'disputing',      -- UMA dispute in progress
  'approved',       -- Client approved deliverable
  'completed',      -- Payment released to agents
  'auto_released',  -- Auto-released after 48h
  'rejected',       -- Deliverable rejected
  'failed',         -- Execution failed
  'cancelled'       -- Mission cancelled
));

-- ============================================================================
-- 5. CREATE VALIDATION RESULTS TABLE (Cache ERC-8004 validation data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS validation_results (
  validation_id BIGINT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  validator_agent_id TEXT NOT NULL,
  validator_address TEXT NOT NULL,
  deliverable_hash TEXT NOT NULL,
  stake_amount DECIMAL(18,6) NOT NULL,
  approved BOOLEAN,
  proof_hash TEXT,
  proof_uri TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validation_results_mission ON validation_results(mission_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_validator ON validation_results(validator_agent_id);

COMMENT ON TABLE validation_results IS 'Cached ERC-8004 validation results from on-chain';
COMMENT ON COLUMN validation_results.proof_hash IS 'Keccak256 hash of validation proof';
COMMENT ON COLUMN validation_results.proof_uri IS 'IPFS URI of detailed validation proof';

-- ============================================================================
-- 6. CREATE DISPUTE RECORDS TABLE (Cache UMA dispute data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS dispute_records (
  assertion_id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  asserter_address TEXT NOT NULL,
  claim TEXT NOT NULL,
  bond_amount DECIMAL(18,6) NOT NULL,
  currency TEXT DEFAULT 'USDC',
  expiration_time TIMESTAMP WITH TIME ZONE NOT NULL,
  settled BOOLEAN DEFAULT FALSE,
  settled_true BOOLEAN,
  settled_at TIMESTAMP WITH TIME ZONE,
  settlement_resolution TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_records_mission ON dispute_records(mission_id);
CREATE INDEX IF NOT EXISTS idx_dispute_records_settled ON dispute_records(settled, expiration_time);

COMMENT ON TABLE dispute_records IS 'Cached UMA Optimistic Oracle dispute data from on-chain';
COMMENT ON COLUMN dispute_records.settled_true IS 'Final resolution: true = claim accepted, false = claim rejected';
COMMENT ON COLUMN dispute_records.settlement_resolution IS 'Human-readable resolution explanation';

-- ============================================================================
-- 7. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to check if mission is eligible for auto-release
CREATE OR REPLACE FUNCTION is_mission_auto_releasable(p_mission_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_auto_release_time TIMESTAMP WITH TIME ZONE;
  v_status TEXT;
BEGIN
  SELECT auto_release_time, status INTO v_auto_release_time, v_status
  FROM missions
  WHERE id = p_mission_id;

  RETURN (
    v_auto_release_time IS NOT NULL
    AND NOW() >= v_auto_release_time
    AND v_status = 'submitted'
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION is_mission_auto_releasable IS 'Check if mission can be auto-released (48h passed since submission)';

-- Function to add timeline event
CREATE OR REPLACE FUNCTION add_mission_timeline_event(
  p_mission_id TEXT,
  p_event_type TEXT,
  p_event_data JSONB DEFAULT NULL,
  p_tx_hash TEXT DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_event_id BIGINT;
BEGIN
  INSERT INTO mission_timeline (mission_id, event_type, event_data, tx_hash)
  VALUES (p_mission_id, p_event_type, p_event_data, p_tx_hash)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION add_mission_timeline_event IS 'Add event to mission timeline for audit trail';

-- ============================================================================
-- 8. CREATE TRIGGERS FOR AUTO-UPDATING TIMELINE
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_mission_timeline_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log status changes
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO mission_timeline (mission_id, event_type, event_data)
    VALUES (
      NEW.id,
      NEW.status::TEXT,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'escrow_id', NEW.escrow_contract_id,
        'validation_id', NEW.validation_id,
        'dispute_id', NEW.dispute_assertion_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mission_status_timeline_trigger
AFTER UPDATE ON missions
FOR EACH ROW
EXECUTE FUNCTION trigger_mission_timeline_update();

COMMENT ON TRIGGER mission_status_timeline_trigger ON missions IS 'Auto-create timeline events on status change';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
