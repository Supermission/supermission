'use client';

import { useState, useEffect, useRef } from 'react';
import { usePriceHistory } from '@/lib/hooks/dashboard/usePriceHistory';
import type { IChartApi, UTCTimestamp } from 'lightweight-charts';

interface TokenDetailPanelProps {
  symbol: string;
  currentPrice: number;
}

type Period = '24h' | '7d' | '30d' | '90d';
const PERIODS: Period[] = ['24h', '7d', '30d', '90d'];

export function TokenDetailPanel({ symbol, currentPrice }: TokenDetailPanelProps) {
  const [period, setPeriod] = useState<Period>('7d');
  const { data: points, isLoading, error } = usePriceHistory(symbol, period);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Calculate changes from data
  const change24h = points && points.length >= 2
    ? ((points[points.length - 1].close - points[0].close) / points[0].close) * 100
    : 0;

  useEffect(() => {
    if (!containerRef.current || !points || points.length === 0) return;

    let cancelled = false;
    let chart: IChartApi | null = null;

    (async () => {
      const { createChart, AreaSeries, ColorType, LineStyle } = await import('lightweight-charts');

      if (cancelled || !containerRef.current) return;

      // Dispose existing chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      chart = createChart(containerRef.current, {
        height: 200,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: 'rgba(0,0,0,0.3)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: 'rgba(0,0,0,0.03)', style: LineStyle.Dotted },
          horzLines: { color: 'rgba(0,0,0,0.03)', style: LineStyle.Dotted },
        },
        rightPriceScale: {
          borderColor: 'rgba(0,0,0,0.06)',
        },
        timeScale: {
          borderColor: 'rgba(0,0,0,0.06)',
          timeVisible: period === '24h',
        },
      });

      const isPositive = points[points.length - 1].close >= points[0].close;
      const color = isPositive ? '#16a34a' : '#dc2626';

      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: color,
        topColor: isPositive ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)',
        bottomColor: 'transparent',
        lineWidth: 2,
      });

      areaSeries.setData(
        points.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.close,
        }))
      );

      chart.timeScale().fitContent();
      chartRef.current = chart;
    })();

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [points, period]);

  return (
    <div className="border-t-2 border-black/10 bg-black/[0.02] p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="font-mono text-sm font-bold">{symbol}</span>
          <span className="font-mono text-sm ml-2">
            ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
          </span>
          {change24h !== 0 && (
            <span className={`font-mono text-xs ml-2 ${change24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Period toggles */}
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-1 text-[10px] font-mono font-bold uppercase transition-colors ${
                period === p
                  ? 'bg-black text-white'
                  : 'bg-white border border-black/10 text-black/40 hover:text-black hover:border-black/30'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {isLoading && (
        <div className="h-[200px] flex items-center justify-center">
          <span className="text-xs font-mono text-black/30 uppercase">Loading chart...</span>
        </div>
      )}

      {error && (
        <div className="h-[200px] flex items-center justify-center">
          <span className="text-xs font-mono text-red-500 uppercase">Failed to load chart</span>
        </div>
      )}

      <div ref={containerRef} className={isLoading || error ? 'hidden' : ''} />
    </div>
  );
}
