'use client';

import { useRef, useEffect, useState } from 'react';
import { createChart, CandlestickSeries, ColorType } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface PriceChartData {
  symbol: string;
  timeframe: string;
  candles: Candle[];
}

const FONT = "'Inter', 'SF Pro Display', system-ui, sans-serif";

export function PriceChartPanel({ data }: { data: PriceChartData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !data?.candles?.length) return;

    const bg = isDark ? '#0d0d0d' : '#ffffff';
    const grid = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
    const textColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor,
        fontFamily: FONT,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: grid },
        horzLines: { color: grid },
      },
      crosshair: { vertLine: { visible: true }, horzLine: { visible: true } },
      rightPriceScale: {
        borderColor: 'transparent',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'transparent',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    seriesRef.current = series;

    const chartData: CandlestickData<Time>[] = data.candles.map(c => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    series.setData(chartData);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      chart.resize(width, height);
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [data, isDark]);

  if (!data?.candles?.length) return null;

  const last = data.candles[data.candles.length - 1];
  const first = data.candles[0];
  const pctChange = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
  const isUp = pctChange >= 0;

  const fmt = (n: number) =>
    n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) :
    n >= 1 ? n.toFixed(4) : n.toFixed(8);

  return (
    <div className={`rounded-[14px] overflow-hidden border ${isDark ? 'border-white/[0.06] bg-[#0d0d0d]' : 'border-black/[0.06] bg-white'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={`text-[13px] font-semibold ${isDark ? 'text-white' : 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>
            {data.symbol}
          </span>
          <span className={`text-[11px] font-medium ${isDark ? 'text-white/30' : 'text-[#999]'}`} style={{ fontFamily: FONT }}>
            {data.timeframe}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[13px] font-semibold tabular-nums ${isDark ? 'text-white' : 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>
            ${fmt(last.close)}
          </span>
          <span className={`text-[11px] font-semibold tabular-nums ${isUp ? 'text-emerald-500' : 'text-red-500'}`} style={{ fontFamily: FONT }}>
            {isUp ? '+' : ''}{pctChange.toFixed(2)}%
          </span>
        </div>
      </div>
      {/* Chart */}
      <div className="relative h-[200px] w-full">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
