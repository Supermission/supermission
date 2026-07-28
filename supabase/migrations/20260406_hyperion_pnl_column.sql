-- Add pnl column to hyperion_trades for tracking perps P&L
ALTER TABLE hyperion_trades ADD COLUMN IF NOT EXISTS pnl DECIMAL;
