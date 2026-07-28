'use client';

import { useCallback, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface DefiActivity {
  id: string;
  activity_type: string;
  wallet_address: string;
  chain_id: number;
  token_in: string | null;
  token_out: string | null;
  amount_in: string | null;
  amount_out: string | null;
  amount_usd: number | null;
  fee_paid_usd: number | null;
  price_impact: number | null;
  slippage_bps: number | null;
  source: string | null;
  tx_hash: string | null;
  status: string;
  route: string | null;
  metadata: unknown;
  created_at: string | null;
}

interface ActivityResponse {
  ok: boolean;
  activities: DefiActivity[];
  total: number;
  limit: number;
  offset: number;
}

// Known token addresses → symbols (client-side resolution)
const KNOWN_SYMBOLS: Record<string, string> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
  '0x4200000000000000000000000000000000000006': 'WETH',
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 'USDC.e',
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 'USDC',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 'DAI',
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 'USDT',
  '0x0b2c639c533813f4aa9d7837caf62653d097ff85': 'USDC',
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': 'USDT',
  '0x8f3cf7ad23cd3cadbd9735aff958023d60313e92': 'DAI',
};

export function resolveSymbol(addr: string | null): string {
  if (!addr) return '?';
  return KNOWN_SYMBOLS[addr.toLowerCase()] || `${addr.slice(0, 6)}…`;
}

const PAGE_SIZE = 20;

export function useDelphiActivity(walletAddress: string | undefined) {
  const [page, setPage] = useState(0);

  const { data, isLoading, error, refetch } = useQuery<ActivityResponse>({
    queryKey: ['delphi-activity', walletAddress, page],
    queryFn: async () => {
      const res = await fetch(
        `/api/defi/activity?wallet=${walletAddress}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
      );
      if (!res.ok) throw new Error('Failed to fetch activity');
      return res.json();
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
  });

  const refresh = useCallback(() => { refetch(); }, [refetch]);

  return {
    activities: data?.activities ?? [],
    total: data?.total ?? 0,
    loading: isLoading,
    error: error ? (error as Error).message : null,
    page,
    setPage,
    refresh,
  };
}
