// components/dashboard/activity/TradingActivity.tsx
'use client';

import { useState, useMemo } from 'react';
import { useUnifiedTrades } from '@/lib/hooks/use-unified-trades';
import { TradeStatsStrip } from './TradeStatsStrip';
import { TradeFilters } from './TradeFilters';
import { TradeRow } from './TradeRow';
import { exportTradesToCsv } from './exportCsv';
import type { SourceFilter, TimeRange, ViewMode, UnifiedTrade, TradeActivityStats } from '@/lib/types/trading-activity';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

interface TradingActivityProps {
  address: string | undefined;
}

function filterBySource(trades: UnifiedTrade[], source: SourceFilter): UnifiedTrade[] {
  if (source === 'all') return trades;
  if (source === 'markets') return trades.filter((t) => t.source === 'polymarket');
  if (source === 'perps') return trades.filter((t) => t.source === 'hyperliquid');
  if (source === 'swaps') return trades.filter((t) => t.source === 'defi');
  return trades;
}

function filterByTime(trades: UnifiedTrade[], range: TimeRange): UnifiedTrade[] {
  if (range === 'all') return trades;
  const now = Date.now();
  const cutoffs: Record<string, number> = {
    today: now - 24 * 60 * 60 * 1000,
    '7d': now - 7 * 24 * 60 * 60 * 1000,
    '30d': now - 30 * 24 * 60 * 60 * 1000,
  };
  const cutoff = cutoffs[range] ?? 0;
  return trades.filter((t) => t.timestamp >= cutoff);
}

function computeStats(trades: UnifiedTrade[]): TradeActivityStats {
  const withPnl = trades.filter((t) => t.pnl !== null && t.pnl !== 0);
  const wins = withPnl.filter((t) => (t.pnl ?? 0) > 0);
  const pnls = withPnl.map((t) => t.pnl ?? 0);
  return {
    totalTrades: trades.length,
    totalVolume: trades.reduce((s, t) => s + Math.abs(t.amount), 0),
    winRate: withPnl.length > 0 ? (wins.length / withPnl.length) * 100 : 0,
    totalPnl: pnls.reduce((s, p) => s + p, 0),
    bestTrade: pnls.length > 0 ? Math.max(...pnls) : 0,
    worstTrade: pnls.length > 0 ? Math.min(...pnls) : 0,
  };
}

export function TradingActivity({ address }: TradingActivityProps) {
  const { trades, loading } = useUnifiedTrades(address);

  const [source, setSource] = useState<SourceFilter>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [view, setView] = useState<ViewMode>('list');

  const filtered = useMemo(() => {
    let result = filterBySource(trades, source);
    result = filterByTime(result, timeRange);
    return result;
  }, [trades, source, timeRange]);

  const stats = useMemo(() => computeStats(filtered), [filtered]);

  if (!address) return null;

  return (
    <div className="border border-[#e5e7eb] rounded-[16px] bg-white overflow-hidden shadow-[0px_4px_16px_0px_rgba(0,0,0,0.04)]">
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <h2 className="text-[15px] font-bold text-[#1a1a1a] mb-4" style={{ fontFamily: FONT }}>
          Trading Activity
        </h2>

        {/* Stats */}
        {!loading && filtered.length > 0 && (
          <div className="mb-4">
            <TradeStatsStrip stats={stats} />
          </div>
        )}

        {/* Filters */}
        <TradeFilters
          source={source}
          onSourceChange={setSource}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          view={view}
          onViewChange={setView}
          onExport={() => exportTradesToCsv(filtered)}
          tradeCount={filtered.length}
        />
      </div>

      {/* Trade list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-[#e5e7eb] border-t-[#1a1a1a] rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-5">
          <span className="text-[12px] font-semibold text-[#9ca3af]" style={{ fontFamily: FONT }}>
            {trades.length === 0 ? 'No trades yet — start trading to see your activity here' : 'No trades match your filters'}
          </span>
        </div>
      ) : view === 'list' ? (
        <div className="trade-list-rows">
          {filtered.map((trade) => (
            <TradeRow key={trade.id} trade={trade} mode="list" />
          ))}
        </div>
      ) : (
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((trade) => (
            <TradeRow key={trade.id} trade={trade} mode="card" />
          ))}
        </div>
      )}
    </div>
  );
}
