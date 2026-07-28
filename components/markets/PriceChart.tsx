'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';

interface PricePoint {
  t: number;
  p: number;
}

interface PriceChartProps {
  conditionId: string;
  tokenId: string;
  height?: number;
}

type Timeframe = '6H' | '1D' | '1W' | '1M' | 'ALL';
const TIMEFRAMES: Timeframe[] = ['6H', '1D', '1W', '1M', 'ALL'];

export function PriceChart({ conditionId, tokenId, height = 200 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let chart: IChartApi | null = null;
    let handleResize: (() => void) | null = null;

    (async () => {
      const { createChart, AreaSeries, ColorType, LineStyle } = await import('lightweight-charts');

      if (cancelled || !containerRef.current) return;

      chart = createChart(containerRef.current, {
        height,
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
        crosshair: {
          vertLine: {
            color: 'rgba(0,0,0,0.1)',
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#000',
          },
          horzLine: {
            color: 'rgba(0,0,0,0.1)',
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#000',
          },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.05 },
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

      const series = chart.addSeries(AreaSeries, {
        lineColor: '#10b981',
        topColor: 'rgba(16,185,129,0.2)',
        bottomColor: 'rgba(16,185,129,0.02)',
        lineWidth: 2,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: '#fff',
        crosshairMarkerBackgroundColor: '#10b981',
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `${(price * 100).toFixed(1)}%`,
        },
      });

      chartRef.current = chart;
      areaSeriesRef.current = series;

      handleResize = () => {
        if (containerRef.current) {
          chart!.applyOptions({ width: containerRef.current.clientWidth });
        }
      };
      window.addEventListener('resize', handleResize);
    })();

    return () => {
      cancelled = true;
      if (handleResize) {
        window.removeEventListener('resize', handleResize);
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        areaSeriesRef.current = null;
      }
    };
  }, [height]);

  // Fetch and set data
  const fetchHistory = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/markets/${conditionId}/history?tokenId=${tokenId}&timeframe=${tf}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      const history: PricePoint[] = json.history || [];

      if (history.length < 2) {
        setError(true);
        setLoading(false);
        return;
      }

      // Convert to lightweight-charts format
      const chartData = history.map(pt => ({
        time: pt.t as UTCTimestamp,
        value: pt.p,
      }));

      const firstPrice = history[0].p;
      const currentPrice = history[history.length - 1].p;
      const change = currentPrice - firstPrice;
      const isUp = change >= 0;

      setLastPrice(currentPrice);
      setPriceChange(change);

      if (areaSeriesRef.current && chartRef.current) {
        areaSeriesRef.current.applyOptions({
          lineColor: isUp ? '#10b981' : '#f43f5e',
          topColor: isUp ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)',
          bottomColor: isUp ? 'rgba(16,185,129,0.02)' : 'rgba(244,63,94,0.02)',
          crosshairMarkerBackgroundColor: isUp ? '#10b981' : '#f43f5e',
        });

        areaSeriesRef.current.setData(chartData);
        chartRef.current.timeScale().fitContent();
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [conditionId, tokenId]);

  useEffect(() => {
    fetchHistory(timeframe);
  }, [timeframe, fetchHistory]);

  return (
    <div className="relative">
      {/* Header: timeframe selector + price info */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2 py-1 text-[9px] font-mono font-bold transition-colors rounded ${
                timeframe === tf
                  ? 'bg-[#3a3a3a] text-white'
                  : 'text-[#9ca3af] hover:text-black'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        {lastPrice != null && !loading && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-mono font-black tabular-nums text-black">
              {(lastPrice * 100).toFixed(1)}% chance
            </span>
            <span className={`text-[10px] font-mono font-bold tabular-nums ${
              priceChange >= 0 ? 'text-emerald-600' : 'text-rose-500'
            }`}>
              {priceChange >= 0 ? '+' : ''}{(priceChange * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Chart container */}
      <div data-price-chart-surface className="relative border border-[#e5e7eb] rounded-[8px] bg-white overflow-hidden" style={{ height }}>
        <div ref={containerRef} className="w-full h-full" />

        {loading && (
          <div data-price-chart-loading className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
            <span className="text-[10px] font-mono font-bold text-[#9ca3af] animate-pulse">
              Loading...
            </span>
          </div>
        )}
        {!loading && error && (
          <div data-price-chart-loading className="absolute inset-0 bg-white flex items-center justify-center z-10">
            <span className="text-[10px] font-mono font-bold text-[#9ca3af]">
              No data for {timeframe}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
