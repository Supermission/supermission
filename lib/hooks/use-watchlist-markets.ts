'use client';

import { useState, useEffect } from 'react';
import { WORKER_API } from '@/lib/config/worker';
import type { MarketCatalogItem } from '@/lib/types/market';

interface UseWatchlistMarketsParams {
  watchlist: Set<string>;
  activeTab: string;
  setWatchlistCount: (count: number) => void;
}

export function useWatchlistMarkets({
  watchlist,
  activeTab,
  setWatchlistCount,
}: UseWatchlistMarketsParams) {
  const [watchlistMarkets, setWatchlistMarkets] = useState<MarketCatalogItem[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  const watchlistIds = Array.from(watchlist).join(',');

  useEffect(() => {
    if (watchlist.size === 0) {
      setWatchlistMarkets([]);
      setWatchlistCount(0);
      return;
    }
    if (activeTab === 'watchlist') setWatchlistLoading(true);

    const controller = new AbortController();
    fetch(`${WORKER_API}/v1/markets?ids=${watchlistIds}&limit=100`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        const validMarkets = data.markets || [];
        setWatchlistCount(validMarkets.length);
        setWatchlistMarkets(validMarkets);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setWatchlistMarkets([]);
        setWatchlistCount(watchlist.size);
      })
      .finally(() => setWatchlistLoading(false));

    return () => controller.abort();
  }, [watchlistIds, activeTab, setWatchlistCount]);

  return { watchlistMarkets, watchlistLoading };
}
