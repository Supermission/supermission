-- ============================================================================
-- Normalize IDs: TEXT agent_ids → UUID, BIGSERIAL PKs → UUID
-- 2026-03-13
-- ============================================================================

-- ============================================================================
-- PART A: TEXT agent_id columns → UUID
-- ============================================================================

-- 1. agent_request_log.agent_id (receives marketplace_agents.id UUIDs)
-- Clean non-UUID rows first
DELETE FROM agent_request_log WHERE agent_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
ALTER TABLE agent_request_log
  ALTER COLUMN agent_id TYPE UUID USING agent_id::UUID;

-- 2. agent_endpoint_health.agent_id
DELETE FROM agent_endpoint_health WHERE agent_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
ALTER TABLE agent_endpoint_health
  ALTER COLUMN agent_id TYPE UUID USING agent_id::UUID;

-- 3. mission_payments.to_agent_id
DELETE FROM mission_payments WHERE to_agent_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
ALTER TABLE mission_payments
  ALTER COLUMN to_agent_id TYPE UUID USING to_agent_id::UUID;

-- 4. payment_proofs.agent_id (may contain 'unknown' — set those to NULL first)
ALTER TABLE payment_proofs ALTER COLUMN agent_id DROP NOT NULL;
UPDATE payment_proofs SET agent_id = NULL
  WHERE agent_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
ALTER TABLE payment_proofs
  ALTER COLUMN agent_id TYPE UUID USING agent_id::UUID;

-- 5. x402_payments.from_agent_id (nullable, values are UUIDs or null)
DELETE FROM x402_payments WHERE from_agent_id IS NOT NULL
  AND from_agent_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
ALTER TABLE x402_payments
  ALTER COLUMN from_agent_id TYPE UUID USING from_agent_id::UUID;

-- 6. deliverables.agent_id
DELETE FROM deliverables WHERE agent_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
ALTER TABLE deliverables
  ALTER COLUMN agent_id TYPE UUID USING agent_id::UUID;

-- ============================================================================
-- PART B: BIGSERIAL → UUID primary keys
-- ============================================================================

-- 1. deliverables: BIGSERIAL → UUID
--    Drop old PK, add UUID column, set as PK
ALTER TABLE deliverables DROP CONSTRAINT deliverables_pkey;
ALTER TABLE deliverables DROP COLUMN id;
ALTER TABLE deliverables ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();

-- 2. payment_transactions: BIGSERIAL → UUID
ALTER TABLE payment_transactions DROP CONSTRAINT payment_transactions_pkey;
ALTER TABLE payment_transactions DROP COLUMN id;
ALTER TABLE payment_transactions ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();

-- 3. defi_activity: BIGSERIAL → UUID
ALTER TABLE defi_activity DROP CONSTRAINT defi_activity_pkey;
ALTER TABLE defi_activity DROP COLUMN id;
ALTER TABLE defi_activity ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();
