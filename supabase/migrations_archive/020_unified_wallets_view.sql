-- Migration 020: REMOVED
-- The unified_wallets view is no longer needed.
-- server_wallets is the single source of truth for all agent wallets.
-- This file is kept empty to preserve migration ordering.

DROP VIEW IF EXISTS unified_wallets;
