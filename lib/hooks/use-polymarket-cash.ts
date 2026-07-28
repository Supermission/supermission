'use client';

import { useUsdcBalances } from '@/lib/hooks/use-usdc-balances';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';

/**
 * Liquid cash the user can spend on a Polymarket trade right now.
 *
 * Polymarket V2 settles in pUSD on Polygon. The spendable balance is strictly
 * polyBridgedUsdc (which now tracks pUSD) — the trade hook will reject anything
 * else with "Insufficient pUSD". Counting native Polygon USDC or Base USDC here
 * would over-promise and trigger the exact balance error users were hitting.
 */
export function usePolymarketCash() {
  const { paymentAddress } = usePaymentWallet();
  const { polyPusd, polyBridgedUsdc, isLoading } = useUsdcBalances(paymentAddress ?? undefined);
  const cash = (polyPusd || 0) + (polyBridgedUsdc || 0);
  return { cash, isLoading };
}
