'use client';

import { useQuery } from '@tanstack/react-query';
import { WORKER_API } from '@/lib/config/worker';
import type { MarketCatalogItem } from '@/lib/types/market';

/**
 * Fetch a single market by condition_id for the full-page market view.
 *
 * Prefers the worker (`/v1/markets/:conditionId`) which merges live SSE prices
 * into the catalog row; falls back to the Supabase-backed Next route
 * (`/api/markets/:conditionId`) if the worker is unreachable. Live YES/NO ticks
 * on the page still come from useSSEPrices — this is the static/metadata source.
 */
async function fetchMarket(conditionId: string): Promise<MarketCatalogItem> {
  try {
    const r = await fetch(`${WORKER_API}/v1/markets/${conditionId}`);
    if (r.ok) {
      const d = await r.json();
      const m = (d?.market ?? d) as MarketCatalogItem;
      if (m?.condition_id) return m;
    }
  } catch {
    // fall through to the Next route
  }
  const r2 = await fetch(`/api/markets/${conditionId}`);
  if (!r2.ok) throw new Error('Market not found');
  const d2 = await r2.json();
  const m2 = (d2?.market ?? d2) as MarketCatalogItem;
  if (!m2?.condition_id) throw new Error('Market not found');
  return m2;
}

export function useMarket(conditionId: string | undefined) {
  return useQuery({
    queryKey: ['market', conditionId],
    queryFn: () => fetchMarket(conditionId!),
    enabled: !!conditionId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
