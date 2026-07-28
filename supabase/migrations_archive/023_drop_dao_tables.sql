-- ============================================
-- Migration 023: Remove DAO governance tables
-- These were never implemented (no API routes, no lib functions, no UI)
-- ============================================

DROP POLICY IF EXISTS "Service role access" ON dao_delegations;
DROP POLICY IF EXISTS "Service role access" ON dao_votes;
DROP POLICY IF EXISTS "Service role access" ON dao_proposals;

DROP INDEX IF EXISTS idx_dao_delegations_delegator;
DROP INDEX IF EXISTS idx_dao_votes_proposal;
DROP INDEX IF EXISTS idx_dao_proposals_status;

DROP TABLE IF EXISTS dao_delegations CASCADE;
DROP TABLE IF EXISTS dao_votes CASCADE;
DROP TABLE IF EXISTS dao_proposals CASCADE;
