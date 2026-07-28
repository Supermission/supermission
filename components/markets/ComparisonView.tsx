'use client';

import { useEffect, useRef, useMemo } from 'react';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useMarketComparison, type ComparisonMarket } from '@/lib/hooks/use-market-comparison';
import { MarketPicker } from './MarketPicker';

const SERIES_COLORS = [
  { line: '#3b82f6', label: 'blue' },    // blue
  { line: '#10b981', label: 'emerald' },  // emerald
  { line: '#f59e0b', label: 'amber' },    // amber
  { line: '#a855f7', label: 'purple' },   // purple
];

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function compute24hChange(history: { t: number; p: number }[]): number {
  if (history.length < 2) return 0;
  const now = history[history.length - 1];
  const oneDayAgo = now.t - 86400;
  // Find closest point to 24h ago
  let closest = history[0];
  for (const pt of history) {
    if (Math.abs(pt.t - oneDayAgo) < Math.abs(closest.t - oneDayAgo)) {
      closest = pt;
    }
  }
  return now.p - closest.p;
}

export function ComparisonView() {
  const { markets, loading, error, addMarket, removeMarket, clearAll } =
    useMarketComparison();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<ISeriesApi<'Line'>[]>([]);

  const excludeIds = useMemo(
    () => markets.map((m) => m.conditionId),
    [markets],
  );

  // Create / destroy chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    let cancelled = false;
    let handleResize: (() => void) | null = null;

    (async () => {
      const { createChart, ColorType, LineStyle } = await import('lightweight-charts');

      if (cancelled || !chartContainerRef.current) return;

      const chart = createChart(chartContainerRef.current, {
        height: 400,
        layout: {
          background: { type: ColorType.Solid, color: '#f8fafc' },
          textColor: 'rgba(107,114,128,0.7)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: 'rgba(229,231,235,0.8)', style: LineStyle.Dotted },
          horzLines: { color: 'rgba(229,231,235,0.8)', style: LineStyle.Dotted },
        },
        crosshair: {
          vertLine: {
            color: 'rgba(107,114,128,0.3)',
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#f8fafc',
          },
          horzLine: {
            color: 'rgba(107,114,128,0.3)',
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#f8fafc',
          },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.05, bottom: 0.05 },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
        },
        handleScroll: { vertTouchDrag: false },
      });

      chartRef.current = chart;

      handleResize = () => {
        if (chartContainerRef.current) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      };
      window.addEventListener('resize', handleResize);
      handleResize();
    })();

    return () => {
      cancelled = true;
      if (handleResize) {
        window.removeEventListener('resize', handleResize);
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRefs.current = [];
      }
    };
  }, []);

  // Update series data when markets change
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    let cancelled = false;

    (async () => {
      const { LineSeries } = await import('lightweight-charts');

      if (cancelled || !chartRef.current) return;

    // Remove old series
    for (const s of seriesRefs.current) {
      try {
        chart.removeSeries(s);
      } catch {
        // series may already be removed
      }
    }
    seriesRefs.current = [];

    // Add new series
    markets.forEach((market, idx) => {
      const color = SERIES_COLORS[idx % SERIES_COLORS.length];
      const series = chart.addSeries(LineSeries, {
        color: color.line,
        lineWidth: 2,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: '#ffffff',
        crosshairMarkerBackgroundColor: color.line,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `${(price * 100).toFixed(1)}%`,
        },
        title: market.question.slice(0, 30),
      });

      const data = market.priceHistory
        .map((pt) => ({
          time: pt.t as UTCTimestamp,
          value: pt.p,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      series.setData(data);
      seriesRefs.current.push(series);
    });

    if (markets.length > 0) {
      chart.timeScale().fitContent();
    }
    })();

    return () => {
      cancelled = true;
    };
  }, [markets]);

  const hasMarkets = markets.length > 0;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <MarketPicker onSelect={addMarket} excludeIds={excludeIds} />
        </div>
        {hasMarkets && (
          <button
            onClick={clearAll}
            className="px-3 py-2 text-xs font-mono text-[#6b7280] hover:text-[#3a3a3a] bg-white border border-[#e5e7eb] rounded-md transition-colors whitespace-nowrap"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Market tags */}
      {hasMarkets && (
        <div className="flex flex-wrap gap-2">
          {markets.map((market, idx) => {
            const color = SERIES_COLORS[idx % SERIES_COLORS.length];
            return (
              <div
                key={market.conditionId}
                className="flex items-center gap-2 bg-[#f8fafc] border border-[#e5e7eb] rounded-md px-2.5 py-1.5"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color.line }}
                />
                <span className="text-xs font-mono text-[#3a3a3a] max-w-[200px] truncate">
                  {market.question}
                </span>
                <button
                  onClick={() => removeMarket(market.conditionId)}
                  className="text-[#9ca3af] hover:text-[#3a3a3a] transition-colors ml-1 text-sm leading-none"
                  aria-label="Remove market"
                >
                  x
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Chart */}
      <div className="relative border border-[#e5e7eb] rounded-[12px] overflow-hidden bg-white">
        <div ref={chartContainerRef} className="w-full" style={{ height: 400 }} />

        {!hasMarkets && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-mono text-[#9ca3af]">
              Add markets to compare
            </span>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="text-xs font-mono text-[#6b7280] animate-pulse">
              Loading...
            </span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="text-xs font-mono text-red-400">
              {error}
            </span>
          </div>
        )}
      </div>

      {/* Stats comparison grid */}
      {hasMarkets && (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${markets.length}, minmax(0, 1fr))` }}>
          {markets.map((market, idx) => {
            const color = SERIES_COLORS[idx % SERIES_COLORS.length];
            const change24h = compute24hChange(market.priceHistory);
            const isUp = change24h >= 0;

            return (
              <div
                key={market.conditionId}
                className="bg-white border border-[#e5e7eb] rounded-[12px] p-3 space-y-3"
              >
                {/* Header */}
                <div className="flex items-start gap-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                    style={{ backgroundColor: color.line }}
                  />
                  <span className="text-xs font-mono text-[#3a3a3a] leading-snug line-clamp-2">
                    {market.question}
                  </span>
                </div>

                {/* Stats */}
                <div className="space-y-2">
                  <StatRow
                    label="Price"
                    value={`${(market.currentPrice * 100).toFixed(1)}%`}
                    highlight
                  />
                  <StatRow label="Volume" value={formatVolume(market.volume)} />
                  <StatRow label="Liquidity" value={formatVolume(market.liquidity)} />
                  <StatRow
                    label="Spread"
                    value={`${(market.spread * 100).toFixed(2)}%`}
                  />
                  <StatRow
                    label="24h Change"
                    value={`${isUp ? '+' : ''}${(change24h * 100).toFixed(1)}%`}
                    valueClassName={isUp ? 'text-emerald-400' : 'text-red-400'}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  highlight,
  valueClassName,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-mono text-[#6b7280]">
        {label}
      </span>
      <span
        className={
          valueClassName ||
          (highlight
            ? 'text-xs font-mono font-bold text-[#3a3a3a] tabular-nums'
            : 'text-xs font-mono text-[#6b7280] tabular-nums')
        }
      >
        {value}
      </span>
    </div>
  );
}
