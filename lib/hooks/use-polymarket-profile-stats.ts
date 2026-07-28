'use client';

import { useQuery } from '@tanstack/react-query';

export interface PnlSeriesPoint {
  t: number;
  v: number;
}

export interface PolymarketProfileStats {
  positionsValue: number;
  biggestWin: { amount: number; title: string | null } | null;
  predictions: number;
  pnl: {
    all: number;
    day: number;
    week: number;
    month: number;
  };
  pnlSeries: PnlSeriesPoint[];
}

const emptyStats: PolymarketProfileStats = {
  positionsValue: 0,
  biggestWin: null,
  predictions: 0,
  pnl: { all: 0, day: 0, week: 0, month: 0 },
  pnlSeries: [],
};

export function usePolymarketProfileStats(address: string | null | undefined) {
  const { data, isLoading, error } = useQuery<PolymarketProfileStats>({
    queryKey: ['polymarket-profile-stats', address],
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/polymarket/profile-stats', { signal });
      if (!res.ok) throw new Error('Failed to fetch profile stats');
      return res.json();
    },
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return {
    stats: data ?? emptyStats,
    isLoading,
    error: error?.message ?? null,
  };
}
