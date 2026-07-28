'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MarketCard } from './MarketCard';
import { useSSEPrices, useStaleMarketIds } from '@/lib/hooks/use-sse-prices';
import type { MarketCatalogItem, LivePrices } from '@/lib/types/market';

interface MarketGridProps {
  markets: MarketCatalogItem[];
  loading: boolean;
  total: number;
  hasMore: boolean;
  onLoadMore: () => void;
  watchlist: Set<string>;
  onToggleWatch: (conditionId: string) => void;
  tradingConditionId?: string | null;
  onTrade?: (params: {
    conditionId: string;
    tokenId: string;
    side: 'BUY';
    outcome: string;
    amount: number;
  }) => void;
  onMarketClick?: (market: MarketCatalogItem) => void;
  onPricesUpdate?: (prices: Record<string, LivePrices>) => void;
  topContent?: ReactNode;
}

const GAP = 12; // gap-3 = 12px

/** Detect column count from container width */
function useColumnCount(containerRef: React.RefObject<HTMLDivElement | null>): number {
  // SSR-safe initial value based on viewport width (avoids flash of wrong column count)
  const [cols, setCols] = useState(() => {
    if (typeof window === 'undefined') return 3;
    const w = window.innerWidth;
    return w >= 1024 ? 3 : w >= 640 ? 2 : 1;
  });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCols(w >= 780 ? 3 : w >= 440 ? 2 : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);
  return cols;
}

export function MarketGrid({
  markets,
  loading,
  total,
  hasMore,
  onLoadMore,
  watchlist,
  onToggleWatch,
  tradingConditionId,
  onTrade,
  onMarketClick,
  onPricesUpdate,
  topContent,
}: MarketGridProps) {
  const hasLoadedOnceRef = useRef(false);
  if (!loading && markets.length > 0) {
    hasLoadedOnceRef.current = true;
  }
  const hasLoadedOnce = hasLoadedOnceRef.current;

  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // SSE-based live prices — only subscribe to currently-loaded markets to avoid
  // streaming prices for thousands of markets the user can't see.
  const subscribedIds = useMemo(
    () => markets.map((m) => m.condition_id),
    [markets],
  );
  const { prices } = useSSEPrices(subscribedIds);

  useEffect(() => {
    if (onPricesUpdate && Object.keys(prices).length > 0) {
      onPricesUpdate(prices);
    }
  }, [prices, onPricesUpdate]);

  // Drop cards whose live-price feed is dead — same signal the worker uses to
  // filter /v1/markets, applied here so cards that go dead between catalog
  // refetches disappear without waiting up to 60s. Subscribe to the full set
  // (above) so a recovered market reappears on the next staleness eval.
  const staleIds = useStaleMarketIds(subscribedIds, prices);
  const visibleMarkets = useMemo(
    () => staleIds.size === 0 ? markets : markets.filter(m => !staleIds.has(m.condition_id)),
    [markets, staleIds],
  );

  const cols = useColumnCount(gridRef);

  // Chunk markets into rows
  const rows = useMemo(() => {
    const result: MarketCatalogItem[][] = [];
    for (let i = 0; i < visibleMarkets.length; i += cols) {
      result.push(visibleMarkets.slice(i, i + cols));
    }
    return result;
  }, [visibleMarkets, cols]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 260, // estimated row height for MarketCard
    overscan: 3,
    gap: GAP,
  });

  // Lazy pagination — load more when scrolled near the bottom of virtual list
  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualRow = virtualItems[virtualItems.length - 1];
  useEffect(() => {
    if (!hasMore || loading) return;
    if (lastVirtualRow && lastVirtualRow.index >= rows.length - 3) {
      onLoadMore();
    }
  }, [hasMore, loading, lastVirtualRow, rows.length, onLoadMore]);

  // Loading skeleton
  if (markets.length === 0 && (loading || !hasLoadedOnce)) {
    return (
      <>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 border-2 border-[#e5e7eb] border-t-[#3a3a3a] rounded-full animate-spin" />
            <span className="text-[10px] font-semibold text-[#9ca3af]" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
              Loading markets
            </span>
          </div>
          <div className="flex-1 h-px bg-[#e5e7eb]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#e5e7eb] animate-pulse rounded-[12px]">
              <div className="p-4 pb-3">
                <div className="h-4 bg-[#f1f5f9] rounded w-[85%] mb-2" />
                <div className="h-4 bg-[#f1f5f9] rounded w-[60%] mb-3" />
                <div className="flex gap-1.5 mb-3">
                  <div className="h-4 w-14 bg-[#f8fafc] rounded" />
                  <div className="h-4 w-12 bg-[#f8fafc] rounded" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-3 bg-[#f8fafc] rounded" />
                    <div className="flex-1 h-[6px] bg-[#f8fafc] rounded" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-3 bg-[#f8fafc] rounded" />
                    <div className="flex-1 h-[6px] bg-[#f8fafc] rounded" />
                  </div>
                </div>
              </div>
              <div className="border-t border-[#e5e7eb] px-4 py-2 flex gap-3">
                <div className="h-3 w-14 bg-[#f8fafc] rounded" />
                <div className="h-3 w-12 bg-[#f8fafc] rounded" />
              </div>
              <div className="px-4 pb-4 pt-1 flex gap-2">
                <div className="flex-1 h-9 bg-emerald-100/60 rounded-[8px]" />
                <div className="flex-1 h-9 bg-rose-100/60 rounded-[8px]" />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // Empty state
  if (!loading && hasLoadedOnce && markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[#d1d5db]">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M16 16l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-sm font-semibold text-[#9ca3af]" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
          No markets found
        </p>
        <p className="text-[11px] text-[#9ca3af]">
          Try a different category or search
        </p>
        <button
          onClick={onLoadMore}
          className="mt-2 px-4 py-2 text-[10px] font-semibold border border-[#e5e7eb] rounded-[8px] text-[#6b7280] hover:border-[#d1d5db] hover:text-black transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>

      {/* Virtualized scroll container — uses dvh for accurate mobile height */}
      <div
        ref={scrollRef}
        className="overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ height: 'calc(100dvh - 80px)' }}
      >
        {topContent && (
          <div className="mb-3">
            {topContent}
          </div>
        )}
        <div
          ref={gridRef}
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.index}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  zIndex: virtualRow.index,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gap: GAP,
                  }}
                >
                  {row.map((market, i) => (
                    <MarketCard
                      key={market.condition_id}
                      market={market}
                      index={(virtualRow.index * cols + i) % 12}
                      livePrices={prices[market.condition_id]}
                      isWatched={watchlist.has(market.condition_id)}
                      tradingConditionId={tradingConditionId}
                      onToggleWatch={onToggleWatch}
                      onTrade={onTrade}
                      onClick={onMarketClick}
                      activeCardId={activeCardId}
                      onActivate={setActiveCardId}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </>
  );
}
