'use client';

import { useQuery } from '@tanstack/react-query';

interface PriceChange {
  price: number;
  change24h: number;
  change24hPct: number;
}

interface TokenChange extends PriceChange {
  symbol: string;
}

export interface MarketOverviewData {
  btc: PriceChange | null;
  eth: PriceChange | null;
  tokenChanges: Record<string, PriceChange>;
  topGainers: TokenChange[];
  topLosers: TokenChange[];
  timestamp: number;
}

export function useMarketOverview(symbols?: string[]) {
  const symbolsKey = symbols?.sort().join(',') || '';

  return useQuery({
    queryKey: ['market-overview', symbolsKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (symbolsKey) params.set('symbols', symbolsKey);

      const res = await fetch(`/api/dashboard/market/overview?${params.toString()}`);

      if (!res.ok) {
        const text = await res.text();
        let msg = 'Failed to fetch market overview';
        try { msg = JSON.parse(text).error || msg; } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      return data.data as MarketOverviewData;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 2,
  });
}
