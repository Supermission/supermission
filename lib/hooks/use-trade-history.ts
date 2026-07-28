'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { startAutoFlush, stopAutoFlush } from '@/lib/trade-record-queue';

export interface EnrichedTrade {
  id: string;
  condition_id: string;
  token_id: string;
  side: 'BUY' | 'SELL' | 'REDEEM';
  outcome: string;
  amount: number;
  price: number;
  shares: number;
  status: string;
  created_at: string;
  marketQuestion: string;
  transactionHash: string;
  event_slug: string;
}

export interface PeriodPnl {
  day: number;
  week: number;
  month: number;
  year: number;
}

export interface TradeStats {
  totalTrades: number;
  totalVolume: number;
  buys: number;
  sells: number;
  redeems: number;
  winRate: number;
  periodPnl: PeriodPnl;
  totalBuyCost: number;
  totalSellRedeemRevenue: number;
  allTimePnl: number;
  currentPortfolioValue: number;
}

export interface TradeFilters {
  side?: 'BUY' | 'SELL' | 'REDEEM';
  market?: string;
}

interface UseTradeHistoryReturn {
  trades: EnrichedTrade[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  stats: TradeStats;
  page: number;
  setPage: (page: number) => void;
  total: number;
  hasMore: boolean;
  loadMore: () => void;
  loadingMore: boolean;
  fetchAllTrades: () => Promise<EnrichedTrade[]>;
  filters: TradeFilters;
  setFilters: (filters: TradeFilters) => void;
}

const PAGE_SIZE = 20;

const emptyStats: TradeStats = {
  totalTrades: 0,
  totalVolume: 0,
  buys: 0,
  sells: 0,
  redeems: 0,
  winRate: 0,
  periodPnl: { day: 0, week: 0, month: 0, year: 0 },
  totalBuyCost: 0,
  totalSellRedeemRevenue: 0,
  allTimePnl: 0,
  currentPortfolioValue: 0,
};

function parseStats(data: Partial<TradeStats> | null | undefined): TradeStats {
  if (!data) return emptyStats;
  return {
    totalTrades: data.totalTrades ?? 0,
    totalVolume: data.totalVolume ?? 0,
    buys: data.buys ?? 0,
    sells: data.sells ?? 0,
    redeems: data.redeems ?? 0,
    winRate: data.winRate ?? 0,
    periodPnl: data.periodPnl ?? { day: 0, week: 0, month: 0, year: 0 },
    totalBuyCost: data.totalBuyCost ?? 0,
    totalSellRedeemRevenue: data.totalSellRedeemRevenue ?? 0,
    allTimePnl: data.allTimePnl ?? 0,
    currentPortfolioValue: data.currentPortfolioValue ?? 0,
  };
}

export function useTradeHistory(userAddress: string | undefined): UseTradeHistoryReturn & { addOptimisticTrade: (trade: EnrichedTrade) => void } {
  const [filters, setFilters] = useState<TradeFilters>({});
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['trade-history', userAddress, { side: filters.side }],
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      params.set('address', userAddress!);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(pageParam * PAGE_SIZE));
      if (filters.side) params.set('side', filters.side);

      const res = await fetch(`/api/trades/history?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`Failed to fetch trade history: ${res.statusText}`);

      const data = await res.json();
      return {
        trades: (data.trades || []) as EnrichedTrade[],
        total: (data.total || 0) as number,
        stats: parseStats(data.stats),
        pageNum: pageParam as number,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.trades.length, 0);
      return fetched < lastPage.total ? allPages.length : undefined;
    },
    enabled: !!userAddress,
  });

  const allTrades = useMemo(
    () => data?.pages.flatMap(p => p.trades) ?? [],
    [data],
  );

  const total = data?.pages[0]?.total ?? 0;
  const stats = data?.pages[0]?.stats ?? emptyStats;
  const page = data?.pages.length ? data.pages.length - 1 : 0;

  const refresh = useCallback(() => { refetch(); }, [refetch]);

  const loadMore = useCallback(() => {
    if (hasNextPage) fetchNextPage();
  }, [hasNextPage, fetchNextPage]);

  const setPage = useCallback((_page: number) => {
    // With infinite query, pages are accumulated sequentially.
    // setPage is kept for interface compatibility.
  }, []);

  // Fetch all trades for CSV export (paginate through everything)
  const fetchAllTrades = useCallback(async (): Promise<EnrichedTrade[]> => {
    if (!userAddress) return [];
    const all: EnrichedTrade[] = [];
    let offset = 0;
    const batchSize = 100;
    while (true) {
      const params = new URLSearchParams();
      params.set('address', userAddress);
      params.set('limit', String(batchSize));
      params.set('offset', String(offset));
      if (filters.side) params.set('side', filters.side);

      const res = await fetch(`/api/trades/history?${params.toString()}`);
      if (!res.ok) break;
      const data = await res.json();
      const batch = data.trades || [];
      all.push(...batch);
      if (batch.length < batchSize || all.length >= (data.total || 0)) break;
      offset += batchSize;
    }
    return all;
  }, [userAddress, filters]);

  // Directly inject a trade into the React Query cache (no refetch needed)
  const addOptimisticTrade = useCallback((trade: EnrichedTrade) => {
    const qk = ['trade-history', userAddress, { side: filters.side }];
    queryClient.setQueryData<typeof data>(qk, (old) => {
      if (!old || !old.pages.length) {
        // No cached data yet — create a first page
        return {
          pages: [{
            trades: [trade],
            total: 1,
            stats: {
              ...emptyStats,
              totalTrades: 1,
              totalVolume: trade.amount,
              [trade.side === 'BUY' ? 'buys' : trade.side === 'SELL' ? 'sells' : 'redeems']: 1,
              totalBuyCost: trade.side === 'BUY' ? trade.amount : 0,
              totalSellRedeemRevenue: trade.side !== 'BUY' ? trade.amount : 0,
            },
            pageNum: 0,
          }],
          pageParams: [0],
        };
      }

      const firstPage = old.pages[0];
      const oldStats = firstPage.stats;
      const updatedStats: TradeStats = {
        ...oldStats,
        totalTrades: oldStats.totalTrades + 1,
        totalVolume: oldStats.totalVolume + trade.amount,
        buys: oldStats.buys + (trade.side === 'BUY' ? 1 : 0),
        sells: oldStats.sells + (trade.side === 'SELL' ? 1 : 0),
        redeems: oldStats.redeems + (trade.side === 'REDEEM' ? 1 : 0),
        totalBuyCost: oldStats.totalBuyCost + (trade.side === 'BUY' ? trade.amount : 0),
        totalSellRedeemRevenue: oldStats.totalSellRedeemRevenue + (trade.side !== 'BUY' ? trade.amount : 0),
      };

      return {
        ...old,
        pages: [
          { ...firstPage, trades: [trade, ...firstPage.trades], total: firstPage.total + 1, stats: updatedStats },
          ...old.pages.slice(1),
        ],
      };
    });

    // Also update any other side-filtered query keys (e.g. if user has side filter active)
    if (filters.side && filters.side !== trade.side) {
      // The trade wouldn't appear in the current filtered view, but update the unfiltered cache too
      const unfilteredQk = ['trade-history', userAddress, { side: undefined }];
      queryClient.setQueryData<typeof data>(unfilteredQk, (old) => {
        if (!old || !old.pages.length) return old;
        const firstPage = old.pages[0];
        const oldStats = firstPage.stats;
        return {
          ...old,
          pages: [
            {
              ...firstPage,
              trades: [trade, ...firstPage.trades],
              total: firstPage.total + 1,
              stats: { ...oldStats, totalTrades: oldStats.totalTrades + 1, totalVolume: oldStats.totalVolume + trade.amount },
            },
            ...old.pages.slice(1),
          ],
        };
      });
    }
  }, [userAddress, filters.side, queryClient, data]);

  // Supabase Realtime: when a trade is recorded in DB, refetch to get canonical data
  // (optimistic trade already shows instantly — this replaces it with real data)
  useEffect(() => {
    if (!userAddress) return;

    const channel = supabase
      .channel(`trade_history_${userAddress}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trade_history',
          filter: `user_address=eq.${userAddress.toLowerCase()}`,
        },
        () => {
          // Refetch trade history to get canonical data from Polymarket API + Supabase
          // This replaces optimistic entries with real fill data, correct amounts, and market questions
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userAddress, refetch]);

  // Flush any queued trade records that failed to send previously
  useEffect(() => {
    startAutoFlush();
    return () => stopAutoFlush();
  }, []);

  // Apply client-side market filter
  const filteredTrades = useMemo(() => {
    if (!filters.market) return allTrades;
    const q = filters.market.toLowerCase();
    return allTrades.filter(
      (t) => t.marketQuestion?.toLowerCase().includes(q) || t.condition_id.includes(q)
    );
  }, [allTrades, filters.market]);

  return {
    trades: filteredTrades,
    loading: isLoading,
    error: error?.message ?? null,
    refresh,
    stats,
    page,
    setPage,
    total,
    hasMore: hasNextPage ?? false,
    loadMore,
    loadingMore: isFetchingNextPage,
    fetchAllTrades,
    filters,
    setFilters,
    addOptimisticTrade,
  };
}
