'use client';

import { useQuery } from '@tanstack/react-query';

export interface YieldPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase?: number;
  apyReward?: number;
  rewardTokens?: string[];
  underlyingTokens?: string[];
  poolMeta?: string;
  url?: string;
  apyPct1D?: number;
  apyPct7D?: number;
  apyPct30D?: number;
  stablecoin?: boolean;
  ilRisk?: 'none' | 'low' | 'medium' | 'high';
  exposure?: string;
}

export interface YieldFilters {
  chain?: string;
  minApy?: number;
  maxApy?: number;
  minTvl?: number;
  stablecoin?: boolean;
  sortBy?: 'apy' | 'tvl' | 'apyBase';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

interface YieldListResponse {
  pools: YieldPool[];
  count: number;
  filters: YieldFilters;
}

export function useYieldList(filters: YieldFilters = {}) {
  // Build query string
  const queryParams = new URLSearchParams();
  if (filters.chain) queryParams.set('chain', filters.chain);
  if (filters.minApy !== undefined) queryParams.set('minApy', filters.minApy.toString());
  if (filters.maxApy !== undefined) queryParams.set('maxApy', filters.maxApy.toString());
  if (filters.minTvl !== undefined) queryParams.set('minTvl', filters.minTvl.toString());
  if (filters.stablecoin !== undefined) queryParams.set('stablecoin', filters.stablecoin.toString());
  if (filters.sortBy) queryParams.set('sortBy', filters.sortBy);
  if (filters.sortOrder) queryParams.set('sortOrder', filters.sortOrder);
  if (filters.limit) queryParams.set('limit', filters.limit.toString());

  return useQuery({
    queryKey: ['yield-list', filters],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/yields/list?${queryParams.toString()}`);

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch yield opportunities');
      }

      const data = await res.json();
      return data.data as YieldListResponse;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes (yields don't change frequently)
    gcTime: 10 * 60 * 1000,
    retry: 2,
    retryDelay: 2000,
  });
}
