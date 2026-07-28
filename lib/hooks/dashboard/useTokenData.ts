'use client';

import { useQuery } from '@tanstack/react-query';

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUSD: number;
  priceChange24h: number;
  marketCap?: number;
  volume24h?: number;
  totalSupply?: string;
  holders?: number;
  liquidity?: number;
  chainId: number;
  chainName: string;
  logo?: string;
}

export function useTokenData(query: string | null, chainId: number = 8453) {
  return useQuery({
    queryKey: ['token-data', query, chainId],
    queryFn: async () => {
      if (!query) throw new Error('No query provided');

      const res = await fetch(
        `/api/dashboard/tokens/list?query=${encodeURIComponent(query)}&chainId=${chainId}`
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch token data');
      }

      const data = await res.json();
      return data.data as TokenInfo;
    },
    enabled: !!query && query.length > 0,
    staleTime: 60000, // 1 minute cache
    gcTime: 5 * 60_000,
    retry: 1,
    retryDelay: 1000,
  });
}
