'use client';

import { useMemo } from 'react';
import { useHLOrderbook } from '@/lib/hyperliquid/hooks';
import { formatPrice } from '@/lib/hyperliquid/utils';

interface PerpsOrderbookProps {
  coin: string;
  onPriceClick?: (price: string) => void;
}

const MAX_LEVELS = 12;

export function PerpsOrderbook({ coin, onPriceClick }: PerpsOrderbookProps) {
  const { bids, asks, spread, spreadPct } = useHLOrderbook(coin);

  // Determine price decimals from best bid/ask
  const priceDecimals = useMemo(() => {
    const ref = bids[0]?.px || asks[0]?.px || '0';
    const val = parseFloat(ref);
    if (val >= 1000) return 2;
    if (val >= 1) return 4;
    return 6;
  }, [bids, asks]);

  // Process asks: take top N, sorted DESC (highest at top, lowest near spread)
  const processedAsks = useMemo(() => {
    const sliced = asks.slice(0, MAX_LEVELS);

    let cumulative = 0;
    // Build cumulative from bottom up (closest to spread first)
    const withCum = sliced.map((a) => {
      cumulative += parseFloat(a.sz);
      return { ...a, cumSize: cumulative };
    });
    const maxCum = cumulative;
    // Now reverse for display (highest at top)
    return withCum.reverse().map((a) => ({ ...a, maxCum }));
  }, [asks]);

  // Process bids: take top N, sorted DESC (highest near spread, lowest at bottom)
  const processedBids = useMemo(() => {
    const sliced = bids.slice(0, MAX_LEVELS);

    let cumulative = 0;
    return sliced.map((b) => {
      cumulative += parseFloat(b.sz);
      return { ...b, cumSize: cumulative, maxCum: 0 };
    });
  }, [bids]);

  // Max cumulative across both sides for bar width normalization
  const maxCumulative = useMemo(() => {
    const askMax = processedAsks.length > 0 ? processedAsks[0]?.maxCum || 0 : 0;
    const bidMax =
      processedBids.length > 0
        ? processedBids[processedBids.length - 1]?.cumSize || 0
        : 0;
    return Math.max(askMax, bidMax, 1);
  }, [processedAsks, processedBids]);

  const isEmpty = bids.length === 0 && asks.length === 0;

  return (
    <div className="border border-black/[0.08] rounded-[14px] bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e7eb]">
        <span
          className="text-[12px] font-semibold text-[#1a1a1a]"
          style={{ fontFamily: 'var(--font-bricolage), sans-serif' }}
        >
          Order Book
        </span>
        <span
          className="text-[9px] text-[#9ca3af] font-medium"
          style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
        >
          {coin}/USDC
        </span>
      </div>

      {/* Column headers */}
      <div
        className="grid grid-cols-3 px-3 py-1.5 text-[9px] font-medium text-[#9ca3af] uppercase tracking-wider border-b border-black/[0.04]"
        style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
      >
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {isEmpty ? (
        <div className="py-8 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="h-2.5 w-2.5 border-2 border-black/20 border-t-black/60 rounded-full animate-spin" />
            <span
              className="text-[10px] text-[#9ca3af] font-medium"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              Waiting for data...
            </span>
          </div>
        </div>
      ) : (
        <>
          {/* Asks (red) — highest at top */}
          <div className="flex flex-col">
            {processedAsks.map((ask, i) => {
              const barWidth = (ask.cumSize / maxCumulative) * 100;
              return (
                <button
                  key={`ask-${i}`}
                  onClick={() => onPriceClick?.(ask.px)}
                  className="grid grid-cols-3 px-3 py-[3px] text-[11px] relative hover:bg-rose-50/50 transition-colors cursor-pointer"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  {/* Depth bar */}
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-rose-500/[0.06]"
                    style={{ width: `${barWidth}%` }}
                  />
                  <span className="text-rose-500 font-medium relative z-10 text-left tabular-nums">
                    {formatPrice(ask.px, priceDecimals)}
                  </span>
                  <span className="text-[#1a1a1a] relative z-10 text-right tabular-nums">
                    {parseFloat(ask.sz).toFixed(4)}
                  </span>
                  <span className="text-[#9ca3af] relative z-10 text-right tabular-nums">
                    {ask.cumSize.toFixed(4)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Spread row */}
          <div
            className="flex items-center justify-between px-3 py-1.5 bg-[#f7f7f7] border-y border-black/[0.04]"
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
          >
            <span className="text-[10px] text-[#9ca3af]">Spread</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#1a1a1a] font-medium tabular-nums">
                {formatPrice(spread, priceDecimals)}
              </span>
              <span className="text-[10px] text-[#9ca3af] tabular-nums">
                ({spreadPct.toFixed(3)}%)
              </span>
            </div>
          </div>

          {/* Bids (green) — highest at top (near spread) */}
          <div className="flex flex-col">
            {processedBids.map((bid, i) => {
              const barWidth = (bid.cumSize / maxCumulative) * 100;
              return (
                <button
                  key={`bid-${i}`}
                  onClick={() => onPriceClick?.(bid.px)}
                  className="grid grid-cols-3 px-3 py-[3px] text-[11px] relative hover:bg-emerald-50/50 transition-colors cursor-pointer"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  {/* Depth bar */}
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-emerald-500/[0.06]"
                    style={{ width: `${barWidth}%` }}
                  />
                  <span className="text-emerald-600 font-medium relative z-10 text-left tabular-nums">
                    {formatPrice(bid.px, priceDecimals)}
                  </span>
                  <span className="text-[#1a1a1a] relative z-10 text-right tabular-nums">
                    {parseFloat(bid.sz).toFixed(4)}
                  </span>
                  <span className="text-[#9ca3af] relative z-10 text-right tabular-nums">
                    {bid.cumSize.toFixed(4)}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
