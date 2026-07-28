-- Prevent the same on-chain transaction from being used to mark multiple tasks as paid.
-- NULL values are excluded so unpaid tasks don't conflict with each other.
CREATE UNIQUE INDEX IF NOT EXISTS collaborate_tasks_payment_tx_hash_unique
  ON collaborate_tasks (payment_tx_hash)
  WHERE payment_tx_hash IS NOT NULL;
