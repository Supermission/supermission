'use client';

import { useMemo } from 'react';
import { useOrderBook } from '@/lib/hooks/use-orderbook';
import type { OrderBookLevelWithDepth } from '@/lib/hooks/use-orderbook';

interface OrderBookLadderProps {
  tokenId: string;
  maxRows?: number;
}

interface LadderRow {
  price: number;
  bidSize: number | null;
  askSize: number | null;
}

function formatSize(size: number | null): string {
  if (size === null) return '';
  if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
  return size.toFixed(1);
}

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="border border-[#e5e7eb] rounded-[12px] overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[#e5e7eb]">
        <div className="h-3 w-24 bg-[#f8fafc] animate-pulse" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 px-3 py-1">
          <div className="h-3 bg-[#f8fafc] animate-pulse" style={{ animationDelay: `${i * 30}ms` }} />
          <div className="h-3 bg-[#f8fafc] animate-pulse" style={{ animationDelay: `${i * 30 + 15}ms` }} />
          <div className="h-3 bg-[#f8fafc] animate-pulse" style={{ animationDelay: `${i * 30 + 30}ms` }} />
        </div>
      ))}
    </div>
  );
}

export default function OrderBookLadder({ tokenId, maxRows = 8 }: OrderBookLadderProps) {
  const { orderbook, spread, loading, error } = useOrderBook(tokenId);

  const { rows, maxSize } = useMemo(() => {
    if (!orderbook) return { rows: [] as LadderRow[], maxSize: 0 };

    const topBids = orderbook.bids.slice(0, maxRows);
    const topAsks = orderbook.asks.slice(0, maxRows);

    let peak = 0;
    for (const b of topBids) if (b.size > peak) peak = b.size;
    for (const a of topAsks) if (a.size > peak) peak = a.size;

    const bidMap = new Map<string, OrderBookLevelWithDepth>();
    const askMap = new Map<string, OrderBookLevelWithDepth>();
    const allPrices = new Set<string>();

    for (const b of topBids) { const k = b.price.toFixed(4); bidMap.set(k, b); allPrices.add(k); }
    for (const a of topAsks) { const k = a.price.toFixed(4); askMap.set(k, a); allPrices.add(k); }

    const sorted = Array.from(allPrices).map(Number).sort((a, b) => b - a);

    return {
      rows: sorted.map((price) => {
        const k = price.toFixed(4);
        return { price, bidSize: bidMap.get(k)?.size ?? null, askSize: askMap.get(k)?.size ?? null };
      }),
      maxSize: peak,
    };
  }, [orderbook, maxRows]);

  if (loading && !orderbook) return <LoadingSkeleton rows={maxRows} />;
  if (error && !orderbook) return <p className="text-rose-500 text-[11px] font-mono">Error loading ladder</p>;
  if (!orderbook || rows.length === 0) return null;

  const spreadBps = spread
    ? ((spread.spread / ((spread.bidPrice + spread.askPrice) / 2)) * 10000).toFixed(1)
    : null;

  return (
    <div className="border border-[#e5e7eb] rounded-[12px] overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-3 px-3 py-1 border-b border-[#e5e7eb] text-[8px] font-bold text-[#9ca3af]">
        <span className="text-left">Bid Size</span>
        <span className="text-center">Price</span>
        <span className="text-right">Ask Size</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#f8fafc]">
        {rows.map((row, i) => {
          const bidI = row.bidSize !== null && maxSize > 0 ? Math.min(row.bidSize / maxSize, 1) : 0;
          const askI = row.askSize !== null && maxSize > 0 ? Math.min(row.askSize / maxSize, 1) : 0;

          return (
            <div key={i} className="grid grid-cols-3 px-3 py-1 relative hover:bg-[#f7f7f7] transition-colors">
              {row.bidSize !== null && (
                <div className="absolute left-0 top-0 bottom-0 bg-emerald-500/[0.06] transition-all" style={{ width: `${bidI * 50}%` }} />
              )}
              {row.askSize !== null && (
                <div className="absolute right-0 top-0 bottom-0 bg-rose-500/[0.06] transition-all" style={{ width: `${askI * 50}%` }} />
              )}
              <span className={`text-[11px] font-mono text-left relative z-10 tabular-nums ${row.bidSize !== null ? 'text-emerald-600' : 'text-black/10'}`}>
                {formatSize(row.bidSize)}
              </span>
              <span className="text-[11px] font-mono text-center relative z-10 text-black/70 tabular-nums">
                {(row.price * 100).toFixed(1)}¢
              </span>
              <span className={`text-[11px] font-mono text-right relative z-10 tabular-nums ${row.askSize !== null ? 'text-rose-500' : 'text-black/10'}`}>
                {formatSize(row.askSize)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Spread row */}
      {spreadBps && (
        <div className="px-3 py-1 bg-[#f7f7f7] border-t border-[#e5e7eb]">
          <div className="flex items-center justify-center gap-1">
            <div className="h-px flex-1 bg-[#e5e7eb]" />
            <span className="text-[9px] font-mono font-bold text-[#9ca3af]">
              Spread: {spreadBps} bps
            </span>
            <div className="h-px flex-1 bg-[#e5e7eb]" />
          </div>
        </div>
      )}
    </div>
  );
}
