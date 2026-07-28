-- Migration 060: User wallet-to-email mapping
-- Purpose: Track which wallet addresses belong to which users (by email)
-- Populated on login via /api/auth/session

CREATE TABLE IF NOT EXISTS user_wallets (
  wallet_address TEXT NOT NULL,
  email TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, chain)
);

CREATE INDEX IF NOT EXISTS idx_user_wallets_email ON user_wallets(email);
CREATE INDEX IF NOT EXISTS idx_user_wallets_address ON user_wallets(wallet_address);

ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read user wallets"
  ON user_wallets FOR SELECT USING (true);

CREATE POLICY "Service role can manage user wallets"
  ON user_wallets FOR ALL
  USING (true) WITH CHECK (true);
