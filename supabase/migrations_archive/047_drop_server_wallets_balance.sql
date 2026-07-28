-- Migration 047: Drop server_wallets.balance
--
-- This column was always initialised to '0' at wallet creation and never
-- updated. Balance is now read directly from the USDC contract on Base
-- by the /wallet/balance and /wallet/list endpoints. Keeping a stale
-- cached column that is never written to is misleading, so we drop it.

ALTER TABLE server_wallets DROP COLUMN IF EXISTS balance;
