-- ============================================================================
-- High-priority hardening: remaining NUMERIC, FK indexes, mission_id UUID,
-- UNIQUE constraints, CHECK constraints
-- 2026-03-13
-- ============================================================================

-- ============================================================================
-- 1. Two remaining TEXT → NUMERIC columns
-- ============================================================================

ALTER TABLE compute_requests ALTER COLUMN cost_usdc DROP DEFAULT;
ALTER TABLE compute_requests
  ALTER COLUMN cost_usdc TYPE NUMERIC USING (NULLIF(TRIM(cost_usdc), '')::NUMERIC);
ALTER TABLE compute_requests ALTER COLUMN cost_usdc SET DEFAULT 0;

ALTER TABLE execution_receipts ALTER COLUMN cost_usdc DROP DEFAULT;
ALTER TABLE execution_receipts
  ALTER COLUMN cost_usdc TYPE NUMERIC USING (NULLIF(TRIM(cost_usdc), '')::NUMERIC);
ALTER TABLE execution_receipts ALTER COLUMN cost_usdc SET DEFAULT 0;

-- ============================================================================
-- 2. mission_id TEXT → UUID (3 tables)
-- ============================================================================

-- deliverables.mission_id
DELETE FROM deliverables WHERE mission_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
ALTER TABLE deliverables
  ALTER COLUMN mission_id TYPE UUID USING mission_id::UUID;

-- compute_sessions.mission_id
UPDATE compute_sessions SET mission_id = NULL
  WHERE mission_id IS NOT NULL
  AND mission_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
ALTER TABLE compute_sessions
  ALTER COLUMN mission_id TYPE UUID USING mission_id::UUID;

-- compute_escrow.mission_id
UPDATE compute_escrow SET mission_id = NULL
  WHERE mission_id IS NOT NULL
  AND mission_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
ALTER TABLE compute_escrow
  ALTER COLUMN mission_id TYPE UUID USING mission_id::UUID;

-- ============================================================================
-- 3. Indexes on FK columns (28 missing)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_contract ON marketplace_reviews(contract_id);
CREATE INDEX IF NOT EXISTS idx_agent_claims_agent ON agent_claims(marketplace_agent_id);
CREATE INDEX IF NOT EXISTS idx_application_messages_sender ON application_messages(sender_agent_id);
CREATE INDEX IF NOT EXISTS idx_mission_messages_mission ON mission_messages(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_messages_sender ON mission_messages(sender_agent_id);
CREATE INDEX IF NOT EXISTS idx_mission_payments_agent ON mission_payments(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_competition_judges_competition ON competition_judges(competition_id);
CREATE INDEX IF NOT EXISTS idx_judge_scores_judge ON judge_scores(judge_id);
CREATE INDEX IF NOT EXISTS idx_judge_scores_entry ON judge_scores(entry_id);
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_agent ON agent_api_keys(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_webhooks_agent ON agent_webhooks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_endorsements_endorser ON agent_endorsements(endorser_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_endorsements_endorsed ON agent_endorsements(endorsed_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_automation_rules_agent ON agent_automation_rules(agent_id);
CREATE INDEX IF NOT EXISTS idx_disputes_filed_by ON disputes(filed_by_agent_id);
CREATE INDEX IF NOT EXISTS idx_disputes_filed_against ON disputes(filed_against_agent_id);
CREATE INDEX IF NOT EXISTS idx_disputes_contract ON disputes(contract_id);
CREATE INDEX IF NOT EXISTS idx_disputes_task ON disputes(task_id);
CREATE INDEX IF NOT EXISTS idx_dispute_comments_dispute ON dispute_comments(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_comments_author ON dispute_comments(author_agent_id);
CREATE INDEX IF NOT EXISTS idx_compute_requests_model ON compute_requests(model_id);
CREATE INDEX IF NOT EXISTS idx_execution_receipts_request ON execution_receipts(compute_request_id);
CREATE INDEX IF NOT EXISTS idx_escrow_draws_agent ON escrow_draws(agent_id);
CREATE INDEX IF NOT EXISTS idx_market_signals_condition ON market_signals(condition_id);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_alert ON alert_notifications(alert_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_agent ON payment_proofs(agent_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_used_at ON payment_proofs(used_at);

-- ============================================================================
-- 4. UNIQUE constraints (prevent duplicates)
-- ============================================================================

-- One active claim per agent
ALTER TABLE agent_claims DROP CONSTRAINT IF EXISTS uq_agent_claims_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_claims_active
  ON agent_claims(marketplace_agent_id) WHERE status = 'pending';

-- One review per reviewer per contract
ALTER TABLE marketplace_reviews DROP CONSTRAINT IF EXISTS uq_reviews_reviewer_contract;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_reviewer_contract
  ON marketplace_reviews(reviewer_address, contract_id);

-- One judge per competition
ALTER TABLE competition_judges DROP CONSTRAINT IF EXISTS uq_judges_competition_address;
CREATE UNIQUE INDEX IF NOT EXISTS uq_judges_competition_address
  ON competition_judges(competition_id, judge_address);

-- One score per judge per entry
ALTER TABLE judge_scores DROP CONSTRAINT IF EXISTS uq_judge_scores_judge_entry;
CREATE UNIQUE INDEX IF NOT EXISTS uq_judge_scores_judge_entry
  ON judge_scores(judge_id, entry_id);

-- API key names unique per agent
ALTER TABLE agent_api_keys DROP CONSTRAINT IF EXISTS uq_api_keys_agent_name;
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_agent_name
  ON agent_api_keys(agent_id, name) WHERE revoked_at IS NULL;

-- ============================================================================
-- 5. CHECK constraints on remaining status/type columns
-- ============================================================================

-- marketplace_contracts
ALTER TABLE marketplace_contracts DROP CONSTRAINT IF EXISTS chk_contract_status;
ALTER TABLE marketplace_contracts ADD CONSTRAINT chk_contract_status
  CHECK (contract_status IN ('active', 'completed', 'cancelled', 'disputed'));

ALTER TABLE marketplace_contracts DROP CONSTRAINT IF EXISTS chk_contract_payment_status;
ALTER TABLE marketplace_contracts ADD CONSTRAINT chk_contract_payment_status
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));

-- compute_sessions
ALTER TABLE compute_sessions DROP CONSTRAINT IF EXISTS chk_session_status;
ALTER TABLE compute_sessions ADD CONSTRAINT chk_session_status
  CHECK (status IN ('pending', 'provisioning', 'active', 'closing', 'closed', 'failed', 'expired'));

ALTER TABLE compute_sessions DROP CONSTRAINT IF EXISTS chk_session_funding_model;
ALTER TABLE compute_sessions ADD CONSTRAINT chk_session_funding_model
  CHECK (funding_model IN ('byoc', 'sponsor', 'pool'));

ALTER TABLE compute_sessions DROP CONSTRAINT IF EXISTS chk_session_settlement;
ALTER TABLE compute_sessions ADD CONSTRAINT chk_session_settlement
  CHECK (settlement_status IN ('unsettled', 'settling', 'settled', 'failed', 'partial', 'pending_agent_settlement'));

-- compute_requests
ALTER TABLE compute_requests DROP CONSTRAINT IF EXISTS chk_compute_request_status;
ALTER TABLE compute_requests ADD CONSTRAINT chk_compute_request_status
  CHECK (status IN ('pending', 'completed', 'failed'));

-- execution_receipts
ALTER TABLE execution_receipts DROP CONSTRAINT IF EXISTS chk_receipt_status;
ALTER TABLE execution_receipts ADD CONSTRAINT chk_receipt_status
  CHECK (status IN ('completed', 'failed'));

-- compute_escrow
ALTER TABLE compute_escrow DROP CONSTRAINT IF EXISTS chk_escrow_status;
ALTER TABLE compute_escrow ADD CONSTRAINT chk_escrow_status
  CHECK (status IN ('funded', 'active', 'depleted', 'released', 'refunded', 'expired'));

-- price_alerts
ALTER TABLE price_alerts DROP CONSTRAINT IF EXISTS chk_alert_direction;
ALTER TABLE price_alerts ADD CONSTRAINT chk_alert_direction
  CHECK (direction IN ('above', 'below'));

-- bridge_transactions
ALTER TABLE bridge_transactions DROP CONSTRAINT IF EXISTS chk_bridge_status;
ALTER TABLE bridge_transactions ADD CONSTRAINT chk_bridge_status
  CHECK (status IN ('initiated', 'tx_sent', 'pending', 'completed', 'failed'));

-- agent_claims
ALTER TABLE agent_claims DROP CONSTRAINT IF EXISTS chk_claim_status;
ALTER TABLE agent_claims ADD CONSTRAINT chk_claim_status
CHECK (status IN ('pending', 'verified', 'rejected', 'expired'));
