'use client';

import { useRef, useEffect } from 'react';
import { useHLRecentTrades } from '@/lib/hyperliquid/hooks';
import { formatPrice } from '@/lib/hyperliquid/utils';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

interface PerpsRecentTradesProps {
  coin: string;
}

export function PerpsRecentTrades({ coin }: PerpsRecentTradesProps) {
  const trades = useHLRecentTrades(coin);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top (newest) when new trades come in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [trades.length]);

  const displayTrades = trades.slice(0, 30);

  if (displayTrades.length === 0) {
    return (
      <div>
        {/* Header */}
        <div
          className="grid grid-cols-3 text-[9px] text-[#9ca3af] uppercase tracking-wider font-bold pb-1.5 border-b border-black/[0.04]"
          style={{ fontFamily: FONT }}
        >
          <span>Time</span>
          <span className="text-right">Price</span>
          <span className="text-right">Size</span>
        </div>
        {/* Skeleton rows */}
        <div className="space-y-[1px]">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="grid grid-cols-3 py-[2.5px]">
              <div className="h-[14px] w-[72px] bg-black/[0.04] rounded animate-pulse" />
              <div className="h-[14px] w-[68px] bg-black/[0.04] rounded animate-pulse ml-auto" />
              <div className="h-[14px] w-[48px] bg-black/[0.04] rounded animate-pulse ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        className="grid grid-cols-3 text-[9px] text-[#9ca3af] uppercase tracking-wider font-bold pb-1.5 border-b border-black/[0.04]"
        style={{ fontFamily: FONT }}
      >
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
      </div>

      {/* Trades list */}
      <div
        ref={scrollRef}
        className="max-h-[280px] overflow-y-auto"
      >
        {displayTrades.map((trade, i) => {
          const isBuy = trade.side === 'B' || trade.side.toLowerCase() === 'buy';
          const px = parseFloat(trade.px);
          const decimals = px >= 1000 ? 2 : px >= 1 ? 4 : 6;
          const time = new Date(trade.time);
          const hours = time.getHours() % 12 || 12;
          const minutes = String(time.getMinutes()).padStart(2, '0');
          const seconds = String(time.getSeconds()).padStart(2, '0');
          const ampm = time.getHours() >= 12 ? 'PM' : 'AM';

          return (
            <div
              key={`${trade.hash}-${i}`}
              className={`grid grid-cols-3 py-[2.5px] text-[11px] transition-colors ${
                i === 0 ? (isBuy ? 'bg-emerald-50/40' : 'bg-rose-50/40') : ''
              }`}
            >
              <span className="text-[#9ca3af] tabular-nums" style={{ fontFamily: FONT }}>
                {hours}:{minutes}:{seconds} {ampm}
              </span>
              <span
                className={`text-right tabular-nums font-semibold ${
                  isBuy ? 'text-emerald-600' : 'text-rose-500'
                }`}
                style={{ fontFamily: FONT }}
              >
                {formatPrice(px, decimals)}
              </span>
              <span className="text-right text-[#1a1a1a] tabular-nums font-semibold" style={{ fontFamily: FONT }}>
                {parseFloat(trade.sz).toFixed(4)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
