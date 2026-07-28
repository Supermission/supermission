'use client';

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { MarketCatalogItem } from '@/lib/types/market';
import { WORKER_API } from '@/lib/config/worker';

export interface EventGroup {
  event_id: string;
  total_volume: number;
  markets: MarketCatalogItem[];
}

interface UseGroupedMarketsReturn {
  groups: EventGroup[];
  loading: boolean;
  error: string | null;
  totalGroups: number;
  totalMarkets: number;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

const PAGE_SIZE = 20;

export function useGroupedMarkets(opts?: {
  category?: string;
  sort?: string;
  search?: string;
}): UseGroupedMarketsReturn {
  const category = opts?.category;
  const sort = opts?.sort;
  const search = opts?.search;

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['grouped-markets', { category, sort, search }],
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (category && category !== 'all') params.set('category', category);
      if (sort) params.set('sort', sort);
      if (search) params.set('search', search);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(pageParam));

      const res = await fetch(`${WORKER_API}/v1/markets/grouped?${params}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch grouped markets');

      const data = await res.json();
      return {
        groups: (data.groups || []) as EventGroup[],
        totalGroups: (data.totalGroups || 0) as number,
        totalMarkets: (data.totalMarkets || 0) as number,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.groups.length, 0);
      return fetched < lastPage.totalGroups ? fetched : undefined;
    },
  });

  const groups = useMemo(
    () => data?.pages.flatMap(p => p.groups) ?? [],
    [data],
  );

  const totalGroups = data?.pages[0]?.totalGroups ?? 0;
  const totalMarkets = data?.pages[0]?.totalMarkets ?? 0;

  const loadMore = useCallback(() => {
    if (hasNextPage) fetchNextPage();
  }, [hasNextPage, fetchNextPage]);

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    groups,
    loading: isLoading,
    error: error?.message ?? null,
    totalGroups,
    totalMarkets,
    hasMore: hasNextPage ?? false,
    loadMore,
    refresh,
  };
}
