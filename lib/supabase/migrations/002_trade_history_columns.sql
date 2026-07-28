-- Migration: Add execution quality columns to trade_history
-- These columns store per-trade execution metrics for analytics

ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS midpoint_at_execution NUMERIC;
ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS spread_at_execution NUMERIC;
ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS slippage_bps NUMERIC;
