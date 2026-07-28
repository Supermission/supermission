-- ============================================================================
-- FK constraints on orphaned UUID columns + owner_address NOT NULL
-- 2026-03-13
-- ============================================================================

-- ============================================================================
-- 1. disputes FK constraints
-- ============================================================================

-- Clean orphans first, then add FKs
DELETE FROM disputes WHERE filed_by_agent_id IS NOT NULL
  AND filed_by_agent_id NOT IN (SELECT id FROM marketplace_agents);
DELETE FROM disputes WHERE filed_against_agent_id IS NOT NULL
  AND filed_against_agent_id NOT IN (SELECT id FROM marketplace_agents);
DELETE FROM disputes WHERE contract_id IS NOT NULL
  AND contract_id NOT IN (SELECT id FROM marketplace_contracts);
DELETE FROM disputes WHERE task_id IS NOT NULL
  AND task_id NOT IN (SELECT id FROM collaborate_tasks);

ALTER TABLE disputes
  ADD CONSTRAINT fk_disputes_filed_by FOREIGN KEY (filed_by_agent_id) REFERENCES marketplace_agents(id),
  ADD CONSTRAINT fk_disputes_filed_against FOREIGN KEY (filed_against_agent_id) REFERENCES marketplace_agents(id),
  ADD CONSTRAINT fk_disputes_contract FOREIGN KEY (contract_id) REFERENCES marketplace_contracts(id),
  ADD CONSTRAINT fk_disputes_task FOREIGN KEY (task_id) REFERENCES collaborate_tasks(id);

-- ============================================================================
-- 2. dispute_comments FK
-- ============================================================================

DELETE FROM dispute_comments WHERE author_agent_id IS NOT NULL
  AND author_agent_id NOT IN (SELECT id FROM marketplace_agents);

ALTER TABLE dispute_comments
  ADD CONSTRAINT fk_dc_author FOREIGN KEY (author_agent_id) REFERENCES marketplace_agents(id);

-- ============================================================================
-- 3. mission_messages + application_messages sender FK
-- ============================================================================

UPDATE mission_messages SET sender_agent_id = NULL WHERE sender_agent_id IS NOT NULL
  AND sender_agent_id NOT IN (SELECT id FROM marketplace_agents);
UPDATE application_messages SET sender_agent_id = NULL WHERE sender_agent_id IS NOT NULL
  AND sender_agent_id NOT IN (SELECT id FROM marketplace_agents);

ALTER TABLE mission_messages
  ADD CONSTRAINT fk_mm_sender_agent FOREIGN KEY (sender_agent_id) REFERENCES marketplace_agents(id);
ALTER TABLE application_messages
  ADD CONSTRAINT fk_am_sender_agent FOREIGN KEY (sender_agent_id) REFERENCES marketplace_agents(id);

-- ============================================================================
-- 4. compute_sessions FK
-- ============================================================================

DELETE FROM compute_sessions WHERE consumer_agent_id NOT IN (SELECT id FROM marketplace_agents);

ALTER TABLE compute_sessions
  ADD CONSTRAINT fk_cs_consumer_agent FOREIGN KEY (consumer_agent_id) REFERENCES marketplace_agents(id);

-- ============================================================================
-- 5. compute_requests FK
-- ============================================================================

UPDATE compute_requests SET consumer_agent_id = NULL WHERE consumer_agent_id IS NOT NULL
  AND consumer_agent_id NOT IN (SELECT id FROM marketplace_agents);

ALTER TABLE compute_requests
  ADD CONSTRAINT fk_cr_consumer_agent FOREIGN KEY (consumer_agent_id) REFERENCES marketplace_agents(id);

-- ============================================================================
-- 6. execution_receipts FK
-- ============================================================================

DELETE FROM execution_receipts WHERE compute_request_id IS NOT NULL
  AND compute_request_id NOT IN (SELECT id FROM compute_requests);

ALTER TABLE execution_receipts
  ADD CONSTRAINT fk_er_compute_request FOREIGN KEY (compute_request_id) REFERENCES compute_requests(id);

-- ============================================================================
-- 7. compute_escrow FK
-- ============================================================================

DELETE FROM compute_escrow WHERE sponsor_agent_id NOT IN (SELECT id FROM marketplace_agents);

ALTER TABLE compute_escrow
  ADD CONSTRAINT fk_ce_sponsor_agent FOREIGN KEY (sponsor_agent_id) REFERENCES marketplace_agents(id);

-- ============================================================================
-- 8. escrow_draws FK
-- ============================================================================

DELETE FROM escrow_draws WHERE agent_id NOT IN (SELECT id FROM marketplace_agents);

ALTER TABLE escrow_draws
  ADD CONSTRAINT fk_ed_agent FOREIGN KEY (agent_id) REFERENCES marketplace_agents(id);

-- ============================================================================
-- 9. marketplace_agents.owner_address NOT NULL
-- ============================================================================

UPDATE marketplace_agents SET owner_address = wallet_address WHERE owner_address IS NULL;
ALTER TABLE marketplace_agents ALTER COLUMN owner_address SET NOT NULL;
