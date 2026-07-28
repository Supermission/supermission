'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export interface UsdcBalancesData {
  address: string;
  balances: Record<string, Record<string, { formatted: string; value: string; decimals: number }>>;
  hlBalance?: number;
  /** Actual withdrawable HL balance (net of locked margin). `null` = fetch failed. */
  hlWithdrawable?: number | null;
  timestamp: number;
}

/**
 * Consolidated USDC balance hook.
 *
 * Replaces 5+ individual useBalance RPC hooks with a single server-side
 * API call that batch-fetches all USDC balances across all chains.
 */
export function useUsdcBalances(address: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<UsdcBalancesData>({
    queryKey: ['usdc-balances', address],
    queryFn: async () => {
      const res = await fetch(`/api/wallet/balances?address=${address}`);
      if (!res.ok) throw new Error('Failed to fetch balances');
      return res.json();
    },
    enabled: !!address,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  // Listen for trade-completed events and refetch
  useEffect(() => {
    const handler = () => {
      // Immediate refetch + delayed refetch for chain settlement
      query.refetch();
      setTimeout(() => query.refetch(), 4_000);
    };
    window.addEventListener('trade-completed', handler);
    return () => window.removeEventListener('trade-completed', handler);
  }, [query.refetch]);

  // Listen for bridge-completed events and refetch
  useEffect(() => {
    const handler = () => {
      query.refetch();
      setTimeout(() => query.refetch(), 4_000);
    };
    window.addEventListener('bridge-completed', handler);
    return () => window.removeEventListener('bridge-completed', handler);
  }, [query.refetch]);

  const balances = query.data?.balances;

  const baseUsdc = parseFloat(balances?.base?.USDC?.formatted || '0');
  const polyPusd = parseFloat(balances?.polygon?.pUSD?.formatted || '0');
  const polyBridgedUsdc = parseFloat(balances?.polygon?.['USDC.e']?.formatted || '0');
  const polyNativeUsdc = parseFloat(balances?.polygon?.USDC?.formatted || '0');
  const arbUsdc = parseFloat(balances?.arbitrum?.USDC?.formatted || '0');
  const ethUsdc = parseFloat(balances?.ethereum?.USDC?.formatted || '0');
  const robinhoodUsdg = parseFloat(balances?.robinhood?.USDG?.formatted || '0');
  const totalUsdc = baseUsdc + polyPusd + polyBridgedUsdc + polyNativeUsdc + arbUsdc + ethUsdc + robinhoodUsdg;
  const hlBalance = query.data?.hlBalance || 0;
  // Pass through null/undefined explicitly — the Move Funds modal needs to
  // distinguish "fetch failed" (null) from "really zero" (0).
  const hlWithdrawable: number | null | undefined = query.data?.hlWithdrawable;

  return {
    baseUsdc,
    polyPusd,
    polyBridgedUsdc,
    polyNativeUsdc,
    polyUsdc: polyPusd + polyBridgedUsdc + polyNativeUsdc,
    arbUsdc,
    ethUsdc,
    robinhoodUsdg,
    totalUsdc,
    hlBalance,
    hlWithdrawable,
    isLoading: query.isLoading,
    refetch: query.refetch,
    raw: balances,
  };
}
