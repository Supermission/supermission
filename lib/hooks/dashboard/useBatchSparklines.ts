'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Fetch 7-day sparkline data for multiple symbols.
 * Returns a Map of symbol → close prices array.
 */
export function useBatchSparklines(symbols: string[]) {
  // Deduplicate and sort for stable cache key
  const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean))).sort();

  return useQuery({
    queryKey: ['batch-sparklines', uniqueSymbols],
    queryFn: async () => {
      const results = new Map<string, number[]>();

      // Fetch in parallel (each gets cached server-side for 5min)
      const fetches = uniqueSymbols.map(async (symbol) => {
        try {
          const res = await fetch(
            `/api/dashboard/prices/history?symbol=${encodeURIComponent(symbol)}&period=7d`
          );
          if (!res.ok) return;

          const data = await res.json();
          const closes = (data.data?.points || []).map(
            (p: { close: number }) => p.close
          );
          if (closes.length > 0) {
            results.set(symbol, closes);
          }
        } catch {
          // Silently skip failed fetches
        }
      });

      await Promise.all(fetches);
      return results;
    },
    enabled: uniqueSymbols.length > 0,
    staleTime: 5 * 60_000, // 5min
    retry: 1,
  });
}
