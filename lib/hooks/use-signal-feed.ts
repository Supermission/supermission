import { useState, useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { MarketSignal } from '@/lib/types/market';
import { WORKER_API } from '@/lib/config/worker';

export interface EnrichedSignal extends MarketSignal {
  question: string;
  category: string;
  livePrice: number;
}

export type SignalSortOption = 'confidence' | 'volume' | 'ending_soon' | 'price_change';

export interface SignalFeedFilters {
  signalType?: MarketSignal['signal_type'] | null;
  category?: string | null;
  minConfidence?: number;
  sortBy?: SignalSortOption;
  sentiment?: 'bullish' | 'bearish' | null;
  trending?: boolean;
  search?: string | null;
  maxEndDate?: string | null;
  minVolume?: number;
}

interface UseSignalFeedReturn {
  signals: EnrichedSignal[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  refresh: () => void;
  loadMore: () => void;
  hasMore: boolean;
  totalCount: number;
  filters: SignalFeedFilters;
  setFilters: React.Dispatch<React.SetStateAction<SignalFeedFilters>>;
}

interface RawSignal {
  condition_id: string;
  signal_type: MarketSignal['signal_type'];
  signal_value?: Record<string, unknown>;
  confidence: number;
  expires_at: string;
  question?: string;
  category?: string;
  livePrice?: number;
}

function parseSignals(raw: RawSignal[]): EnrichedSignal[] {
  return raw.map((s: RawSignal) => ({
    id: (s as any).id || `${s.condition_id}_${s.signal_type}`,
    condition_id: s.condition_id,
    signal_type: s.signal_type,
    signal_value: s.signal_value || {},
    confidence: s.confidence,
    source: (s as any).source || 'ai_research',
    expires_at: s.expires_at,
    created_at: (s as any).created_at || new Date().toISOString(),
    question: s.question || 'Unknown Market',
    category: s.category || 'Uncategorized',
    livePrice: s.livePrice || 0.5,
  }));
}

function buildSignalUrl(filters: SignalFeedFilters, cursor: string | null): string {
  const params = new URLSearchParams();
  if (filters.signalType) params.set('type', filters.signalType);
  if (filters.category) params.set('category', filters.category);
  if (filters.minConfidence !== undefined && filters.minConfidence > 0) {
    params.set('minConfidence', String(filters.minConfidence));
  }
  if (filters.sortBy && filters.sortBy !== 'confidence') params.set('sortBy', filters.sortBy);
  if (filters.sentiment) params.set('sentiment', filters.sentiment);
  if (filters.trending) params.set('trending', 'true');
  if (filters.search) params.set('search', filters.search);
  if (filters.maxEndDate) params.set('maxEndDate', filters.maxEndDate);
  if (filters.minVolume && filters.minVolume > 0) params.set('minVolume', String(filters.minVolume));
  params.set('pageSize', '50');
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return `${WORKER_API}/v1/signals/feed${qs ? `?${qs}` : ''}`;
}

export function useSignalFeed(initialFilters?: SignalFeedFilters): UseSignalFeedReturn {
  const [filters, setFilters] = useState<SignalFeedFilters>(initialFilters || {});

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['signal-feed', {
      signalType: filters.signalType,
      category: filters.category,
      minConfidence: filters.minConfidence,
      sortBy: filters.sortBy,
      sentiment: filters.sentiment,
      trending: filters.trending,
      search: filters.search,
      maxEndDate: filters.maxEndDate,
      minVolume: filters.minVolume,
    }],
    queryFn: async ({ pageParam, signal }) => {
      const url = buildSignalUrl(filters, pageParam);
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Failed to fetch signals: ${res.status}`);

      const data = await res.json();
      return {
        signals: parseSignals(data.signals || []),
        nextCursor: (data.nextCursor || null) as string | null,
        hasMore: !!data.hasMore,
        totalCount: (data.totalCount ?? 0) as number,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
  });

  const signals = useMemo(
    () => data?.pages.flatMap(p => p.signals) ?? [],
    [data],
  );

  const totalCount = data?.pages[0]?.totalCount ?? 0;

  const loadMore = useCallback(() => {
    if (hasNextPage) fetchNextPage();
  }, [hasNextPage, fetchNextPage]);

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return useMemo(
    () => ({
      signals,
      loading: isLoading,
      loadingMore: isFetchingNextPage,
      error: error?.message ?? null,
      refresh,
      loadMore,
      hasMore: hasNextPage ?? false,
      totalCount,
      filters,
      setFilters,
    }),
    [signals, isLoading, isFetchingNextPage, error, refresh, loadMore, hasNextPage, totalCount, filters],
  );
}
