'use client';

import { memo, useMemo } from 'react';
import Image from 'next/image';
import type { MarketCatalogItem, LivePrices } from '@/lib/types/market';

const FONT = "var(--font-bricolage, 'Bricolage Grotesque', sans-serif)";

interface EventStackCardProps {
  eventId: string;
  markets: MarketCatalogItem[];
  livePrices: Record<string, LivePrices>;
  onMarketClick?: (market: MarketCatalogItem) => void;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export const EventStackCard = memo(function EventStackCard({
  eventId,
  markets,
  livePrices,
  onMarketClick,
}: EventStackCardProps) {
  const stats = useMemo(() => {
    const totalVolume = markets.reduce((s, m) => s + m.volume, 0);
    const icon = markets[0]?.icon;
    const sharedCategory = markets[0]?.categories?.[0] || '';
    return { totalVolume, icon, sharedCategory };
  }, [markets]);

  const hasScroll = markets.length > 3;

  return (
    <div className="bg-white rounded-[16px] border border-[#e5e7eb] overflow-hidden hover:border-black/[0.15] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-all duration-200">
      {/* ── Header ── */}
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Icon */}
        {stats.icon ? (
          <Image src={stats.icon} alt="" width={36} height={36} loading="lazy" className="w-9 h-9 rounded-[10px] object-cover flex-shrink-0 bg-[#f8fafc]" />
        ) : (
          <div className="w-9 h-9 rounded-[10px] flex-shrink-0 flex items-center justify-center bg-[#f1f3f4] text-[11px] font-black text-[#9ca3af]">
            {stats.sharedCategory.slice(0, 2).toUpperCase() || '?'}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3
            className="text-[13px] font-bold text-[#111] leading-snug line-clamp-2"
            style={{ fontFamily: FONT }}
          >
            {markets[0]?.question}
          </h3>

          {/* Category + Volume */}
          <div className="flex items-center gap-2 mt-1.5">
            {stats.sharedCategory && (
              <span className="text-[9px] font-semibold text-[#9ca3af] bg-[#f8fafc] px-1.5 py-[2px] rounded-md">
                {stats.sharedCategory}
              </span>
            )}
            <span className="text-[11px] font-bold text-[#48484b] tabular-nums" style={{ fontFamily: FONT }}>
              {formatVolume(stats.totalVolume)} <span className="text-[9px] font-semibold text-[#9ca3af]">vol</span>
            </span>
          </div>
        </div>

        {/* Count badge */}
        <span className="text-[10px] font-bold text-[#6b7280] bg-[#f1f3f4] h-6 w-6 rounded-full flex items-center justify-center tabular-nums flex-shrink-0 mt-0.5">
          {markets.length}
        </span>
      </div>

      {/* ── Sub-markets — always visible, scrollable if > 3 ── */}
      <div
        className={`border-t border-[#f1f3f4] ${hasScroll ? 'max-h-[132px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden' : ''}`}
      >
        {markets.map((market) => {
          const live = livePrices[market.condition_id];
          const yesPrice = live?.yes ?? market.outcome_prices?.[0] ?? null;
          const noPrice = live?.no ?? market.outcome_prices?.[1] ?? null;

          return (
            <button
              key={market.condition_id}
              onClick={() => onMarketClick?.(market)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left border-b border-[#f5f5f5] last:border-b-0 hover:bg-[#fafbfc] transition-colors"
            >
              <span className="text-[11px] font-medium text-[#48484b] truncate flex-1 min-w-0" style={{ fontFamily: FONT }}>
                {market.question}
              </span>

              {yesPrice !== null && noPrice !== null && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-bold text-emerald-600 tabular-nums" style={{ fontFamily: FONT }}>
                    Yes {(yesPrice * 100).toFixed(0)}¢
                  </span>
                  <span className="text-[10px] font-bold text-rose-500 tabular-nums" style={{ fontFamily: FONT }}>
                    No {(noPrice * 100).toFixed(0)}¢
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});
