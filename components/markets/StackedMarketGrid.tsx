'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EventStackCard } from './EventStackCard';
import { useSSEPrices, useStaleMarketIds } from '@/lib/hooks/use-sse-prices';
import { useGroupedMarkets, type EventGroup } from '@/lib/hooks/use-grouped-markets';
import type { MarketCatalogItem, LivePrices } from '@/lib/types/market';

interface StackedMarketGridProps {
  category?: string;
  sort?: string;
  search?: string;
  onMarketClick?: (market: MarketCatalogItem) => void;
  onPricesUpdate?: (prices: Record<string, LivePrices>) => void;
}

/** Detect column count from container width */
function useColumnCount(containerRef: React.RefObject<HTMLDivElement | null>): number {
  const [cols, setCols] = useState(() => {
    if (typeof window === 'undefined') return 3;
    const w = window.innerWidth;
    return w >= 640 ? 3 : 1;
  });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCols(w >= 480 ? 3 : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);
  return cols;
}

const GAP = 12;

export function StackedMarketGrid({
  category,
  sort,
  search,
  onMarketClick,
  onPricesUpdate,
}: StackedMarketGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Fetch pre-grouped data from worker — paginated by group
  const {
    groups,
    loading,
    totalGroups,
    totalMarkets,
    hasMore,
    loadMore,
  } = useGroupedMarkets({ category, sort, search });

  // SSE live prices — only subscribe to currently-loaded markets
  const subscribedIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      for (const m of group.markets) ids.push(m.condition_id);
    }
    return ids;
  }, [groups]);
  const { prices } = useSSEPrices(subscribedIds);

  useEffect(() => {
    if (onPricesUpdate && Object.keys(prices).length > 0) {
      onPricesUpdate(prices);
    }
  }, [prices, onPricesUpdate]);

  // Drop dead-feed markets within each group; drop the entire group if it
  // falls below the 2-market minimum that the worker already enforces. Same
  // staleness signal the worker applies to /v1/markets/grouped, applied here
  // so cards/groups that go dead between catalog refetches disappear without
  // waiting for the next refresh cycle.
  const staleIds = useStaleMarketIds(subscribedIds, prices);
  const visibleGroups = useMemo(() => {
    if (staleIds.size === 0) return groups;
    const out: EventGroup[] = [];
    for (const g of groups) {
      const fresh = g.markets.filter(m => !staleIds.has(m.condition_id));
      if (fresh.length < 2) continue;
      out.push(fresh.length === g.markets.length ? g : { ...g, markets: fresh });
    }
    return out;
  }, [groups, staleIds]);

  // Build stable per-group price slices so EventStackCard memo works.
  const prevGroupPricesRef = useRef<Map<string, Record<string, LivePrices>>>(new Map());
  const groupPrices = useMemo(() => {
    const prev = prevGroupPricesRef.current;
    const next = new Map<string, Record<string, LivePrices>>();
    for (const group of visibleGroups) {
      const slice: Record<string, LivePrices> = {};
      let changed = false;
      const prevSlice = prev.get(group.event_id);
      for (const m of group.markets) {
        const p = prices[m.condition_id];
        if (p) slice[m.condition_id] = p;
        if (!changed && p !== prevSlice?.[m.condition_id]) changed = true;
      }
      next.set(group.event_id, changed || !prevSlice ? slice : prevSlice);
    }
    prevGroupPricesRef.current = next;
    return next;
  }, [visibleGroups, prices]);

  const cols = useColumnCount(gridRef);

  // Chunk groups into rows
  const rows = useMemo(() => {
    const result: EventGroup[][] = [];
    for (let i = 0; i < visibleGroups.length; i += cols) {
      result.push(visibleGroups.slice(i, i + cols));
    }
    return result;
  }, [visibleGroups, cols]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 3,
    gap: GAP,
  });

  // Lazy pagination — load more when near the bottom
  const virtualItems = virtualizer.getVirtualItems();
  const lastRow = virtualItems[virtualItems.length - 1];
  useEffect(() => {
    if (!hasMore || loading) return;
    if (lastRow && lastRow.index >= rows.length - 2) {
      loadMore();
    }
  }, [hasMore, loading, lastRow, rows.length, loadMore]);

  // Loading skeleton
  if (groups.length === 0 && loading) {
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#e5e7eb] animate-pulse rounded-[16px] p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-[8px] bg-[#f1f3f4]" />
                <div className="flex-1">
                  <div className="h-4 bg-[#f1f3f4] rounded w-[80%] mb-2" />
                  <div className="h-3 bg-[#f8fafc] rounded w-[50%] mb-2" />
                  <div className="space-y-1.5">
                    <div className="h-3 bg-[#f8fafc] rounded w-full" />
                    <div className="h-3 bg-[#f8fafc] rounded w-[90%]" />
                  </div>
                </div>
                <div className="w-6 h-5 rounded-full bg-[#f1f3f4]" />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // Empty state
  if (!loading && groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[#d1d5db]">
          <rect x="4" y="2" width="16" height="6" rx="1" stroke="currentColor" strokeWidth="2" />
          <rect x="4" y="10" width="16" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <rect x="4" y="18" width="16" height="4" rx="1" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        </svg>
        <p className="text-sm font-semibold text-[#9ca3af]" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
          No grouped events found
        </p>
        <p className="text-[11px] text-[#9ca3af]">
          Switch to Normal view to see all markets
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Count */}
      {groups.length > 0 && (
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-mono font-semibold text-[#9ca3af] tabular-nums">
            {totalGroups} grouped events · {totalMarkets} markets
          </span>
          <div className="flex-1 h-px bg-[#e5e7eb]" />
        </div>
      )}

      {/* Virtualized scroll container */}
      <div
        ref={scrollRef}
        className="overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ height: 'calc(100dvh - 80px)' }}
      >
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
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gap: GAP,
                  }}
                >
                  {row.map((group) => (
                    <EventStackCard
                      key={group.event_id}
                      eventId={group.event_id}
                      markets={group.markets}
                      livePrices={groupPrices.get(group.event_id) || {}}
                      onMarketClick={onMarketClick}
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
