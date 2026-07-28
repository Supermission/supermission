'use client';

import { useMemo } from 'react';
import { useOrderBook } from '@/lib/hooks/use-orderbook';
import type { OrderBookLevelWithDepth } from '@/lib/hooks/use-orderbook';

interface OrderBookDepthProps {
  tokenId: string;
}

function DepthBar({
  level,
  maxDepth,
  side,
}: {
  level: OrderBookLevelWithDepth;
  maxDepth: number;
  side: 'bid' | 'ask';
}) {
  const widthPct = maxDepth > 0 ? (level.cumulative / maxDepth) * 100 : 0;
  const isBid = side === 'bid';

  return (
    <div className="flex items-center gap-1 h-6 group relative">
      <span className="text-[10px] text-black/40 font-mono w-14 text-right shrink-0 tabular-nums">
        {level.price.toFixed(2)}
      </span>
      <div className="relative flex-1 h-full">
        <div
          className={`absolute top-0 h-full transition-all duration-300 ${
            isBid
              ? 'right-0 bg-gradient-to-l from-emerald-500/25 to-emerald-500/05'
              : 'left-0 bg-gradient-to-r from-rose-500/25 to-rose-500/05'
          }`}
          style={{ width: `${Math.min(widthPct, 100)}%` }}
        />
        <div
          className="absolute top-0 left-0 right-0 h-full flex items-center px-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="text-[9px] text-black/50 font-mono">
            {level.size.toFixed(1)} / {level.cumulative.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div>
      <div className="h-3 w-32 bg-black/[0.04] animate-pulse mb-3" />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-6 bg-black/[0.03] animate-pulse" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-6 bg-black/[0.03] animate-pulse" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OrderBookDepth({ tokenId }: OrderBookDepthProps) {
  const { orderbook, midpoint, loading, error } = useOrderBook(tokenId);

  const maxDepth = useMemo(() => {
    if (!orderbook) return 0;
    const maxBid = orderbook.bids.length > 0
      ? orderbook.bids[orderbook.bids.length - 1].cumulative
      : 0;
    const maxAsk = orderbook.asks.length > 0
      ? orderbook.asks[orderbook.asks.length - 1].cumulative
      : 0;
    return Math.max(maxBid, maxAsk);
  }, [orderbook]);

  if (loading && !orderbook) return <LoadingSkeleton />;
  if (error && !orderbook) return <p className="text-rose-500 text-[11px] font-mono">Error loading depth</p>;
  if (!orderbook) return null;

  const displayBids = orderbook.bids.slice(0, 12);
  const displayAsks = orderbook.asks.slice(0, 12);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-black/50">
          Order book depth
        </span>
        {midpoint !== null && (
          <span className="text-[10px] font-mono text-black/40 tabular-nums">
            Mid: {(midpoint * 100).toFixed(1)}¢
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Bids */}
        <div className="space-y-0.5">
          <div className="text-[9px] text-emerald-600/60 font-bold uppercase tracking-wider mb-1">Bids</div>
          {displayBids.map((level, i) => (
            <DepthBar key={`bid-${i}`} level={level} maxDepth={maxDepth} side="bid" />
          ))}
          {displayBids.length === 0 && <p className="text-black/30 text-[10px] font-mono py-1">No bids</p>}
        </div>

        {/* Asks */}
        <div className="space-y-0.5">
          <div className="text-[9px] text-rose-500/60 font-bold uppercase tracking-wider mb-1">Asks</div>
          {displayAsks.map((level, i) => (
            <DepthBar key={`ask-${i}`} level={level} maxDepth={maxDepth} side="ask" />
          ))}
          {displayAsks.length === 0 && <p className="text-black/30 text-[10px] font-mono py-1">No asks</p>}
        </div>
      </div>

      {/* Midpoint line */}
      {midpoint !== null && (
        <div className="mt-2 pt-2 border-t border-dashed border-black/[0.08]">
          <div className="flex items-center justify-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/30 to-transparent" />
            <span className="text-[10px] font-mono font-bold text-black/50 tabular-nums">
              {(midpoint * 100).toFixed(1)}¢
            </span>
            <div className="h-px flex-1 bg-gradient-to-l from-rose-500/30 to-transparent" />
          </div>
        </div>
      )}
    </div>
  );
}
