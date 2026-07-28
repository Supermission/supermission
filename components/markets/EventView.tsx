'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEventDetail } from '@/lib/hooks/use-event-detail';
import type { EventMarket } from '@/lib/polymarket/api';

// ── Helpers ────────────────────────────────────────────────────────

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getYesPrice(market: EventMarket): number {
  if (market.outcomePrices && market.outcomePrices.length > 0) {
    return market.outcomePrices[0];
  }
  return 0.5;
}

function getNoPrice(market: EventMarket): number {
  if (market.outcomePrices && market.outcomePrices.length > 1) {
    return market.outcomePrices[1];
  }
  return 1 - getYesPrice(market);
}

// ── Sub-components ─────────────────────────────────────────────────

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-2">
      <span className="text-xs font-mono text-[#6b7280]">
        {label}
      </span>
      <span className="text-sm font-semibold text-[#3a3a3a] mt-0.5">
        {value}
      </span>
    </div>
  );
}

function MarketCard({
  market,
  onClick,
}: {
  market: EventMarket;
  onClick: () => void;
}) {
  const yesPrice = getYesPrice(market);
  const noPrice = getNoPrice(market);
  const yesPct = Math.round(yesPrice * 100);
  const noPct = Math.round(noPrice * 100);
  const yesLabel = market.outcomes?.[0] || 'Yes';
  const noLabel = market.outcomes?.[1] || 'No';

  return (
    <button
      onClick={onClick}
      className="text-left w-full bg-white border border-[#e5e7eb] rounded-[12px] p-4 hover:border-[#d1d5db] hover:bg-[#f8fafc] transition-all duration-150 group"
    >
      {/* Question */}
      <p className="text-sm font-medium text-[#3a3a3a] leading-snug mb-3 line-clamp-3 group-hover:text-black">
        {market.question}
      </p>

      {/* Outcome 1 bar */}
      <div className="mb-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono font-semibold text-emerald-400">
            {yesLabel}
          </span>
          <span className="text-xs font-mono font-semibold text-emerald-400">
            {yesPct}%
          </span>
        </div>
        <div className="h-1.5 bg-[#f8fafc] rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${yesPct}%` }}
          />
        </div>
      </div>

      {/* Outcome 2 bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono font-semibold text-rose-400">
            {noLabel}
          </span>
          <span className="text-xs font-mono font-semibold text-rose-400">
            {noPct}%
          </span>
        </div>
        <div className="h-1.5 bg-[#f8fafc] rounded-full overflow-hidden">
          <div
            className="h-full bg-rose-500 rounded-full transition-all duration-300"
            style={{ width: `${noPct}%` }}
          />
        </div>
      </div>

      {/* Footer: volume + status */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-[#6b7280]">
          Vol {formatVolume(market.volume)}
        </span>
        {market.closed ? (
          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#f8fafc] text-[#6b7280] border border-[#e5e7eb]">
            Closed
          </span>
        ) : market.active ? (
          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
            Active
          </span>
        ) : (
          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
            Inactive
          </span>
        )}
      </div>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="h-6 w-3/4 bg-[#f8fafc] rounded" />
        <div className="h-4 w-1/2 bg-[#f8fafc] rounded" />
        <div className="h-3 w-1/3 bg-[#f8fafc] rounded" />
      </div>

      {/* Stats bar skeleton */}
      <div className="flex gap-4 border border-[#e5e7eb] rounded-[12px] p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="h-3 w-12 bg-[#f8fafc] rounded" />
            <div className="h-4 w-16 bg-[#f8fafc] rounded" />
          </div>
        ))}
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-[#e5e7eb] rounded-[12px] p-4 space-y-3"
          >
            <div className="h-4 w-[85%] bg-[#f8fafc] rounded" />
            <div className="h-4 w-[60%] bg-[#f8fafc] rounded" />
            <div className="h-1.5 bg-[#f8fafc] rounded-full" />
            <div className="h-1.5 bg-[#f8fafc] rounded-full" />
            <div className="flex justify-between">
              <div className="h-3 w-16 bg-[#f8fafc] rounded" />
              <div className="h-4 w-12 bg-[#f8fafc] rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

const INITIAL_VISIBLE = 6;

interface EventViewProps {
  eventId: string;
}

export function EventView({ eventId }: EventViewProps) {
  const { event, stats, loading, error, refresh } = useEventDetail(eventId);
  const [showAll, setShowAll] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const router = useRouter();

  // Loading state
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <LoadingSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-[12px] p-6 text-center">
          <p className="text-red-500 text-sm font-mono mb-3">{error}</p>
          <button
            onClick={refresh}
            className="text-xs font-mono text-[#6b7280] hover:text-[#3a3a3a] underline underline-offset-2 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (!event) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-8 text-center">
          <p className="text-[#6b7280] text-sm font-mono">Event not found</p>
        </div>
      </div>
    );
  }

  const markets = event.markets || [];
  const hasMany = markets.length > INITIAL_VISIBLE;
  const visibleMarkets = showAll ? markets : markets.slice(0, INITIAL_VISIBLE);
  const descriptionLong = event.description && event.description.length > 200;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-semibold text-[#3a3a3a] leading-tight mb-2">
          {event.title}
        </h1>

        {event.description && (
          <div className="mb-2">
            <p
              className={`text-sm text-[#6b7280] leading-relaxed ${
                !descExpanded && descriptionLong ? 'line-clamp-3' : ''
              }`}
            >
              {event.description}
            </p>
            {descriptionLong && (
              <button
                onClick={() => setDescExpanded(!descExpanded)}
                className="text-xs font-mono text-[#6b7280] hover:text-[#3a3a3a] mt-1 transition-colors"
              >
                {descExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* Date range */}
        {(event.startDate || event.endDate) && (
          <p className="text-xs font-mono text-[#9ca3af]">
            {event.startDate && formatDate(event.startDate)}
            {event.startDate && event.endDate && ' - '}
            {event.endDate && formatDate(event.endDate)}
          </p>
        )}
      </div>

      {/* ── Stats Bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-center border border-[#e5e7eb] rounded-[12px] bg-[#f8fafc] divide-x divide-[#e5e7eb]">
        <StatBox label="Total Volume" value={formatVolume(stats.totalVolume)} />
        <StatBox
          label="Liquidity"
          value={formatVolume(stats.totalLiquidity)}
        />
        <StatBox label="Markets" value={String(stats.marketCount)} />
        <StatBox label="Active" value={String(stats.activeCount)} />
      </div>

      {/* ── Sub-markets Grid ──────────────────────────────────── */}
      {markets.length === 0 ? (
        <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-8 text-center">
          <p className="text-[#6b7280] text-sm font-mono">
            No sub-markets found for this event
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleMarkets.map((market) => (
              <MarketCard
                key={market.conditionId}
                market={market}
                onClick={() =>
                  router.push(`/markets?id=${market.conditionId}`)
                }
              />
            ))}
          </div>

          {/* Show all toggle */}
          {hasMany && (
            <div className="text-center">
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs font-mono text-[#6b7280] hover:text-[#3a3a3a] border border-[#e5e7eb] hover:border-[#d1d5db] rounded-md px-4 py-2 transition-all"
              >
                {showAll
                  ? 'Show fewer'
                  : `Show all ${markets.length} markets`}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Refresh button ────────────────────────────────────── */}
      <div className="text-center pt-2">
        <button
          onClick={refresh}
          className="text-[10px] font-mono text-[#9ca3af] hover:text-[#6b7280] transition-colors"
        >
          Refresh data
        </button>
      </div>
    </div>
  );
}

export default EventView;
