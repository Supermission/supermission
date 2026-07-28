-- x402 Nonce Tracking Table
-- Prevents replay attacks for EIP-3009 payment authorizations
-- Must be run after 000_all_tables.sql

CREATE TABLE IF NOT EXISTS x402_nonces (
  nonce TEXT PRIMARY KEY,
  user_address TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for efficient queries
  CONSTRAINT nonce_unique UNIQUE (nonce)
);

-- Index for cleanup queries (removing old nonces)
CREATE INDEX IF NOT EXISTS idx_x402_nonces_used_at ON x402_nonces(used_at);

-- Index for user address lookups
CREATE INDEX IF NOT EXISTS idx_x402_nonces_user_address ON x402_nonces(user_address);

-- RLS Policy (disable since this is server-side only)
ALTER TABLE x402_nonces ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage nonces
CREATE POLICY "Service role can manage nonces"
  ON x402_nonces
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to clean up old nonces (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_nonces()
RETURNS void AS $$
BEGIN
  DELETE FROM x402_nonces
  WHERE used_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Create a cron job to clean up old nonces daily
-- Uncomment if pg_cron extension is available:
-- SELECT cron.schedule('cleanup-old-nonces', '0 3 * * *', 'SELECT cleanup_old_nonces()');

COMMENT ON TABLE x402_nonces IS 'Tracks used nonces for x402 payment protocol to prevent replay attacks';
COMMENT ON COLUMN x402_nonces.nonce IS 'The keccak256 hash used as authorization nonce';
COMMENT ON COLUMN x402_nonces.user_address IS 'The wallet address that created this authorization';
COMMENT ON COLUMN x402_nonces.used_at IS 'When this nonce was first used';
