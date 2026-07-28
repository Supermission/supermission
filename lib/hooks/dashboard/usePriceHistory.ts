'use client';

import { useQuery } from '@tanstack/react-query';

export type { OHLCVPoint } from '@/lib/types/market';
import type { OHLCVPoint } from '@/lib/types/market';

type Period = '24h' | '7d' | '30d' | '90d';

export function usePriceHistory(symbol: string | undefined, period: Period = '7d') {
  return useQuery({
    queryKey: ['price-history', symbol, period],
    queryFn: async () => {
      if (!symbol) throw new Error('No symbol provided');

      const res = await fetch(
        `/api/dashboard/prices/history?symbol=${encodeURIComponent(symbol)}&period=${period}`
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch price history');
      }

      const data = await res.json();
      return data.data.points as OHLCVPoint[];
    },
    enabled: !!symbol,
    staleTime: period === '24h' ? 60_000 : 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });
}
