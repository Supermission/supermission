CREATE TABLE IF NOT EXISTS holder_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  condition_id TEXT NOT NULL,
  holder_address TEXT NOT NULL,
  position_size NUMERIC NOT NULL,
  outcome TEXT NOT NULL,
  snapshot_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hs_market ON holder_snapshots(condition_id, snapshot_at DESC);
