'use client';

import { useState, useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { MarketCatalogItem, MarketFilters, MarketSortOption } from '@/lib/types/market';

interface UseMarketCatalogReturn {
  markets: MarketCatalogItem[];
  loading: boolean;
  error: string | null;
  total: number;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  filters: MarketFilters;
  setCategory: (category: string) => void;
  setSort: (sort: MarketSortOption) => void;
  setSearch: (search: string) => void;
}

const PAGE_SIZE = 20;

export function useMarketCatalog(): UseMarketCatalogReturn {
  const [filters, setFilters] = useState<MarketFilters>({
    sort: 'trending',
    limit: PAGE_SIZE,
    offset: 0,
  });

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['market-catalog', {
      category: filters.category,
      sort: filters.sort,
      search: filters.search,
      trending_only: filters.trending_only,
    }],
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (filters.category && filters.category !== 'all') {
        params.set('category', filters.category);
      }
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.search) params.set('search', filters.search);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(pageParam));
      if (filters.trending_only) params.set('trending', 'true');

      const res = await fetch(`/api/markets/public?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch markets');

      const data = await res.json();
      return {
        markets: (data.markets || []) as MarketCatalogItem[],
        total: (data.total || 0) as number,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.markets.length, 0);
      return fetched < lastPage.total ? fetched : undefined;
    },
    // Auto-refresh every 60s so markets the worker has filtered (ended
    // games, dead-book-flagged, decided low-activity) disappear from the
    // UI without requiring a manual reload.
    refetchInterval: 60_000,
  });

  // Defensive filter — hide markets whose end_date has passed even if the
  // backend hasn't evicted them yet. Polymarket sometimes keeps `closed=false`
  // for hours after the actual event ends, and ended markets can't be traded
  // (CLOB rejects the token → SSE never delivers a price → trade-freshness
  // guard trips with "Live prices reconnecting").
  const markets = useMemo(() => {
    const all = data?.pages.flatMap(p => p.markets) ?? [];
    const nowISO = new Date().toISOString();
    return all.filter(m => !m.end_date || m.end_date > nowISO);
  }, [data]);

  const total = data?.pages[0]?.total ?? 0;

  const loadMore = useCallback(() => {
    if (hasNextPage) fetchNextPage();
  }, [hasNextPage, fetchNextPage]);

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const setCategory = useCallback((category: string) => {
    setFilters(prev => prev.category === category ? prev : { ...prev, category, offset: 0 });
  }, []);

  const setSort = useCallback((sort: MarketSortOption) => {
    setFilters(prev => prev.sort === sort ? prev : { ...prev, sort, offset: 0 });
  }, []);

  const setSearch = useCallback((search: string) => {
    setFilters(prev => ({ ...prev, search, offset: 0 }));
  }, []);

  return {
    markets,
    loading: isLoading,
    error: error?.message ?? null,
    total,
    hasMore: hasNextPage ?? false,
    loadMore,
    refresh,
    filters,
    setCategory,
    setSort,
    setSearch,
  };
}
