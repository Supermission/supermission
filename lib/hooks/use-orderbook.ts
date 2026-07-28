'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchOrderBook,
  fetchSpread,
  fetchMidpoint,
} from '@/lib/polymarket/api';
import type { OrderBookSummary, SpreadData, OrderBookLevel } from '@/lib/polymarket/api';

export interface OrderBookLevelWithDepth extends OrderBookLevel {
  cumulative: number;
}

export interface OrderBookWithDepth {
  bids: OrderBookLevelWithDepth[];
  asks: OrderBookLevelWithDepth[];
  timestamp: number;
}

export interface UseOrderBookReturn {
  orderbook: OrderBookWithDepth | null;
  spread: SpreadData | null;
  midpoint: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function addCumulativeDepth(
  levels: OrderBookLevel[],
  direction: 'forward' | 'reverse',
): OrderBookLevelWithDepth[] {
  const ordered = direction === 'reverse' ? [...levels].reverse() : [...levels];
  let cumulative = 0;
  const result = ordered.map((level) => {
    cumulative += level.size;
    return { ...level, cumulative };
  });
  return direction === 'reverse' ? result.reverse() : result;
}

export function useOrderBook(tokenId: string): UseOrderBookReturn {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['orderbook', tokenId],
    queryFn: async () => {
      const [obData, spreadData, midData] = await Promise.all([
        fetchOrderBook(tokenId),
        fetchSpread(tokenId),
        fetchMidpoint(tokenId),
      ]);

      const bidsWithDepth = addCumulativeDepth(obData.bids, 'forward');
      const asksWithDepth = addCumulativeDepth(obData.asks, 'forward');

      return {
        orderbook: {
          bids: bidsWithDepth,
          asks: asksWithDepth,
          timestamp: obData.timestamp,
        } as OrderBookWithDepth,
        spread: spreadData,
        midpoint: midData,
      };
    },
    enabled: !!tokenId,
    // Stop polling once CLOB returns 4xx (retired-market token). `fetchWithRetry`
    // throws `HTTP 4xx: ...` for any client-side error; we match on that so we
    // don't hammer the proxy for a token that will never resolve.
    refetchInterval: (query) => {
      const err = query.state.error;
      if (err instanceof Error && /^HTTP 4\d\d/.test(err.message)) return false;
      return 30_000;
    },
    refetchIntervalInBackground: false,
    retry: (_failureCount, err) => {
      if (err instanceof Error && /^HTTP 4\d\d/.test(err.message)) return false;
      return _failureCount < 1;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['orderbook', tokenId] });
  };

  return {
    orderbook: data?.orderbook ?? null,
    spread: data?.spread ?? null,
    midpoint: data?.midpoint ?? null,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch orderbook') : null,
    refresh,
  };
}
