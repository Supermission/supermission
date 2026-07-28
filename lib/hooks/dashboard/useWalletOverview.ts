'use client';

import { useQuery } from '@tanstack/react-query';
import { Address } from 'viem';

interface ChainBalance {
  chainId: number;
  name: string;
  balance: number;
  balanceUSD: number;
}

interface TokenHolding {
  symbol: string;
  name: string;
  balanceUSD: number;
  balance: string;
  priceUSD: number;
  address: string;
}

interface PortfolioSummary {
  totalPortfolioUSD: number;
  holdingsCount: number;
  chainCount: number;
  change24h: number;
}

export interface WalletOverviewData {
  address: string;
  summary: PortfolioSummary;
  chains: Array<{
    chainId: number;
    name: string;
    balanceUSD: number;
    tokenCount: number;
  }>;
  topHoldings: TokenHolding[];
  nativeBalances: ChainBalance[];
  timestamp: number;
}

export function useWalletOverview(address: Address | undefined) {
  return useQuery({
    queryKey: ['wallet-overview', address],
    queryFn: async ({ signal }) => {
      if (!address) throw new Error('No address provided');

      const res = await fetch(`/api/dashboard/overview?address=${address}`, {
        signal // Abort controller for cleanup
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch wallet overview');
      }

      const data = await res.json();
      return data.data as WalletOverviewData;
    },
    enabled: !!address,
    staleTime: 30000, // 30s cache
    gcTime: 5 * 60_000,
    retry: 2,
    retryDelay: 1000,
  });
}
