'use client';

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PolymarketEvent } from '@/lib/polymarket/api';
import { WORKER_API } from '@/lib/config/worker';

// ── Types ──────────────────────────────────────────────────────────

export interface LocalMarketData {
  condition_id: string;
  question: string;
  categories?: string[];
  ai_sentiment?: string;
  ai_summary?: string;
  is_trending?: boolean;
  volume_24h?: number;
  [key: string]: unknown;
}

export interface EventDetailData {
  event: PolymarketEvent;
  localMarkets: LocalMarketData[];
}

export interface AggregateStats {
  totalVolume: number;
  totalLiquidity: number;
  marketCount: number;
  activeCount: number;
  closedCount: number;
}

interface UseEventDetailReturn {
  event: PolymarketEvent | null;
  localMarkets: LocalMarketData[];
  stats: AggregateStats;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useEventDetail(eventId: string): UseEventDetailReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['event-detail', eventId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `${WORKER_API}/v1/events/${encodeURIComponent(eventId)}`,
        { signal },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `Failed to fetch event: HTTP ${res.status}`);
      }

      const json: EventDetailData = await res.json();
      return json;
    },
    enabled: !!eventId,
  });

  const event = data?.event ?? null;
  const localMarkets = data?.localMarkets ?? [];

  const stats: AggregateStats = useMemo(() => {
    if (!event || !event.markets) {
      return {
        totalVolume: 0,
        totalLiquidity: 0,
        marketCount: 0,
        activeCount: 0,
        closedCount: 0,
      };
    }

    const markets = event.markets;
    return {
      totalVolume: markets.reduce((sum, m) => sum + (m.volume || 0), 0),
      totalLiquidity: markets.reduce((sum, m) => sum + (m.liquidity || 0), 0),
      marketCount: markets.length,
      activeCount: markets.filter((m) => m.active && !m.closed).length,
      closedCount: markets.filter((m) => m.closed).length,
    };
  }, [event]);

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return { event, localMarkets, stats, loading: isLoading, error: error?.message ?? null, refresh };
}
