-- Migration 025: Reconcile payment_transactions schema
-- Two definitions exist: 000_all_tables.sql (UUID, TEXT amount, created_at)
-- and 001_create_production_tables.sql (BIGSERIAL, DECIMAL amount, timestamp).
-- Whichever ran first wins due to IF NOT EXISTS. This migration ensures
-- all columns used by code exist regardless of which schema was created.

-- Add created_at if missing (new schema uses this, old uses 'timestamp')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_transactions' AND column_name = 'created_at'
  ) THEN
    -- If 'timestamp' column exists (old schema), alias it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'payment_transactions' AND column_name = 'timestamp'
    ) THEN
      ALTER TABLE payment_transactions RENAME COLUMN "timestamp" TO created_at;
    ELSE
      ALTER TABLE payment_transactions ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
  END IF;
END $$;

-- Relax tx_hash constraint: new code allows nullable tx_hash (payment may fail)
DO $$
BEGIN
  -- Drop UNIQUE constraint on tx_hash if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_transactions_tx_hash_key'
    AND conrelid = 'payment_transactions'::regclass
  ) THEN
    ALTER TABLE payment_transactions DROP CONSTRAINT payment_transactions_tx_hash_key;
  END IF;

  -- Drop NOT NULL on tx_hash if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_transactions'
    AND column_name = 'tx_hash'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE payment_transactions ALTER COLUMN tx_hash DROP NOT NULL;
  END IF;
END $$;

-- Extend purpose CHECK to include all values used by code
-- Drop old constraint, add new one with all valid purposes
DO $$
BEGIN
  -- Find and drop the existing check constraint on purpose
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid
    WHERE c.conrelid = 'payment_transactions'::regclass
    AND c.contype = 'c'
    AND a.attname = 'purpose'
    AND pg_get_constraintdef(c.oid) LIKE '%purpose%'
  ) THEN
    -- Drop all check constraints that reference 'purpose'
    EXECUTE (
      SELECT string_agg('ALTER TABLE payment_transactions DROP CONSTRAINT ' || quote_ident(c.conname), '; ')
      FROM pg_constraint c
      WHERE c.conrelid = 'payment_transactions'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%purpose%'
    );
  END IF;
END $$;

-- Add comprehensive purpose constraint
ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_purpose_check
  CHECK (purpose IN (
    'agent_to_agent', 'escrow_deposit', 'escrow_release',
    'competition_entry', 'competition_prize', 'mission_reward',
    'mission_payment', 'bounty_payout', 'other'
  ));

-- Ensure indexes exist for common queries
CREATE INDEX IF NOT EXISTS idx_payment_transactions_from ON payment_transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_to ON payment_transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created ON payment_transactions(created_at DESC);
