'use client';

import { useQuery } from '@tanstack/react-query';
import { Address } from 'viem';

interface TokenHolding {
  address: string;
  symbol: string;
  name: string;
  balance: string;
  balanceRaw: string;
  decimals: number;
  priceUSD: number;
  balanceUSD: number;
  logo?: string;
  chainId: number;
}

interface ChainBalance {
  chainId: number;
  name: string;
  nativeSymbol: string;
  nativeBalance: number;
  nativeBalanceUSD: number;
  tokenCount: number;
  totalBalanceUSD: number;
}

interface WalletSummary {
  totalPortfolioUSD: number;
  totalTokenCount: number;
  totalChains: number;
  totalNativeUSD: number;
  totalTokensUSD: number;
  change24h?: number;
}

export interface WalletData {
  address: string;
  summary: WalletSummary;
  chains: ChainBalance[];
  tokens: TokenHolding[];
  timestamp: number;
}

export function useWalletData(address: Address | undefined) {
  return useQuery({
    queryKey: ['wallet-data', address],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');

      const res = await fetch(`/api/dashboard/wallet/overview?address=${address}`);

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch wallet data');
      }

      const data = await res.json();
      return data.data as WalletData;
    },
    enabled: !!address,
    staleTime: 15_000, // 15s — balance should feel responsive after actions
    gcTime: 5 * 60_000, // keep in cache 5 min for dedup across components
    placeholderData: (prev: WalletData | undefined) => prev, // keep old data visible during refetch — no $0 flash
    retry: (failureCount, error) => {
      // Never retry on 429 — we're rate-limited, retries make it worse
      if (error instanceof Error && error.message.includes('429')) return false;
      return failureCount < 2;
    },
    retryDelay: 2000,
  });
}
