'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTradingStore } from '@/lib/store/trading';
import type { PriceHistoryPoint } from '@/lib/polymarket/api';
import { WORKER_API } from '@/lib/config/worker';

export interface ComparisonMarket {
  conditionId: string;
  question: string;
  tokenId: string;
  currentPrice: number;
  volume: number;
  liquidity: number;
  spread: number;
  categories: string[];
  priceHistory: PriceHistoryPoint[];
}

interface UseMarketComparisonReturn {
  markets: ComparisonMarket[];
  loading: boolean;
  error: string | null;
  addMarket: (conditionId: string) => void;
  removeMarket: (conditionId: string) => void;
  clearAll: () => void;
}

export function useMarketComparison(): UseMarketComparisonReturn {
  const {
    activeComparisonIds,
    addComparisonId,
    removeComparisonId,
    setActiveComparisonIds,
  } = useTradingStore();

  const sortedIds = [...activeComparisonIds].sort();

  const { data, isLoading, error } = useQuery({
    queryKey: ['market-comparison', sortedIds],
    queryFn: async ({ signal }) => {
      const ids = activeComparisonIds.join(',');
      const res = await fetch(
        `${WORKER_API}/v1/markets/compare?ids=${encodeURIComponent(ids)}`,
        { signal },
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch comparison data (${res.status})`);
      }

      const json = await res.json();
      return (json.markets || []) as ComparisonMarket[];
    },
    enabled: activeComparisonIds.length > 0,
  });

  const addMarket = useCallback(
    (conditionId: string) => { addComparisonId(conditionId); },
    [addComparisonId],
  );

  const removeMarket = useCallback(
    (conditionId: string) => { removeComparisonId(conditionId); },
    [removeComparisonId],
  );

  const clearAll = useCallback(() => {
    setActiveComparisonIds([]);
  }, [setActiveComparisonIds]);

  return {
    markets: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    addMarket,
    removeMarket,
    clearAll,
  };
}
