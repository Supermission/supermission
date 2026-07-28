'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOpenInterest } from '@/lib/polymarket/api';
import { WORKER_API } from '@/lib/config/worker';

// ── Types ──────────────────────────────────────────────────────────

export interface VolumeMarket {
  conditionId: string;
  question: string;
  volume: number;
  volume24h: number;
  volumeChange: number; // percentage change: volume_24h relative to (volume_1wk / 7)
  openInterest: number;
  category: string;
  liquidity: number;
}

interface UseLiveVolumeReturn {
  topMovers: VolumeMarket[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RawMarket {
  condition_id: string;
  question?: string;
  volume?: string;
  volume_24h?: string;
  volume_1wk?: string;
  categories?: string[];
  liquidity?: string;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useLiveVolume(): UseLiveVolumeReturn {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['live-volume'],
    queryFn: async () => {
      // Fetch top 20 markets by volume from the existing API route
      const res = await fetch(`${WORKER_API}/v1/markets?sort=volume&limit=20`);
      if (!res.ok) throw new Error(`Failed to fetch markets: ${res.status}`);

      const json = await res.json();
      const markets: RawMarket[] = json.markets || [];

      // For top 10 markets, fetch open interest in parallel
      const top10 = markets.slice(0, 10);
      const oiResults = await Promise.allSettled(
        top10.map((m) => fetchOpenInterest(m.condition_id))
      );

      // Build a map of conditionId -> openInterest
      const oiMap = new Map<string, number>();
      top10.forEach((m, i) => {
        const result = oiResults[i];
        oiMap.set(
          m.condition_id,
          result.status === 'fulfilled' ? result.value : 0
        );
      });

      // Map all 20 markets into VolumeMarket
      const movers: VolumeMarket[] = markets.map((m) => {
        const volume = parseFloat(m.volume || '0');
        const volume24h = parseFloat(m.volume_24h || '0');
        const volume1wk = parseFloat(m.volume_1wk || '0');
        const dailyAvg = volume1wk / 7;

        // Volume change %: how today's 24h volume compares to the weekly daily average
        const volumeChange =
          dailyAvg > 0 ? ((volume24h - dailyAvg) / dailyAvg) * 100 : 0;

        const categories: string[] = Array.isArray(m.categories)
          ? m.categories
          : [];

        return {
          conditionId: m.condition_id,
          question: m.question || '',
          volume,
          volume24h,
          volumeChange: Math.round(volumeChange * 10) / 10,
          openInterest: oiMap.get(m.condition_id) ?? 0,
          category: categories[0] || 'Other',
          liquidity: parseFloat(m.liquidity || '0'),
        };
      });

      return movers;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['live-volume'] });
  };

  return {
    topMovers: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch volume data') : null,
    refresh,
  };
}
