/**
 * Hyperliquid withdrawal helpers.
 *
 * Uses the SDK's `withdraw3` method on the ExchangeClient to initiate
 * a withdrawal from the HL trading account back to the user's Arbitrum wallet.
 *
 * Funds always land on Arbitrum first. Cross-chain bridging (Arb → Base/Polygon)
 * is handled separately via LI.FI in the useMoveFunds hook.
 */

import { getHLBalance } from './deposit';

/** Minimum withdrawal amount — HL requires at least $1 */
export const MIN_WITHDRAW_USDC = 1;

/**
 * Execute a withdrawal from Hyperliquid to the user's Arbitrum address.
 * Uses the ExchangeClient's withdraw3 method.
 *
 * @param exchangeClient - An authenticated ExchangeClient instance
 * @param destination - The user's wallet address (receives USDC on Arbitrum)
 * @param amount - Human-readable USDC amount (e.g. 7.25)
 */
export async function executeHLWithdraw(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exchangeClient: any,
  destination: string,
  amount: number,
): Promise<void> {
  if (amount < MIN_WITHDRAW_USDC) {
    throw new Error(`Minimum withdrawal is $${MIN_WITHDRAW_USDC}`);
  }

  const balance = await getHLBalance(destination);
  if (balance < amount) {
    throw new Error(`Insufficient HL balance. Available: $${balance.toFixed(2)}, requested: $${amount.toFixed(2)}`);
  }

  const result = await exchangeClient.withdraw3({
    destination: destination.toLowerCase(),
    amount: amount.toFixed(2),
  });

  // Check for error response
  if (result?.status === 'err') {
    throw new Error(result.response || 'Withdrawal failed');
  }
}

/**
 * Poll for HL balance to decrease after a withdrawal.
 * Resolves `true` once balance drops below `maxBalance`, or `false` on timeout.
 */
export async function waitForHLWithdrawal(
  address: string,
  maxBalance: number,
  timeoutMs = 120_000,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const balance = await getHLBalance(address);
      if (balance <= maxBalance) return true;
    } catch {
      // ignore transient errors
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return false;
}
