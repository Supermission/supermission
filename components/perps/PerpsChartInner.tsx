'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  Time,
  CandlestickData,
} from 'lightweight-charts';
import { useHLCandles } from '@/lib/hyperliquid/hooks';
import { formatPrice } from '@/lib/hyperliquid/utils';
import type { CandleInterval } from '@/lib/hyperliquid/constants';
import { useUIStore } from '@/lib/store/ui';

const INTERVALS: { label: string; value: CandleInterval }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1D', value: '1d' },
];

interface OHLCVTooltip {
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface PerpsChartInnerProps {
  coin: string;
  externalInterval?: CandleInterval;
  onIntervalChange?: (interval: CandleInterval) => void;
  hideIntervalBar?: boolean;
}

export default function PerpsChartInner({ coin, externalInterval, onIntervalChange, hideIntervalBar }: PerpsChartInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [internalInterval, setInternalInterval] = useState<CandleInterval>('15m');
  const interval = externalInterval ?? internalInterval;
  const [tooltip, setTooltip] = useState<OHLCVTooltip | null>(null);
  const dark = useUIStore((s) => s.perpsDarkMode);

  const { candles, isLoading } = useHLCandles(coin, interval);

  // Create chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#fafafa' },
        textColor: '#71717a',
        fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif',
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: 'rgba(0,0,0,0.04)' },
        horzLines: { color: 'rgba(0,0,0,0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(0,0,0,0.1)',
          labelBackgroundColor: '#3a3a3a',
        },
        horzLine: {
          color: 'rgba(0,0,0,0.1)',
          labelBackgroundColor: '#3a3a3a',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(0,0,0,0.06)',
      },
      timeScale: {
        borderColor: 'rgba(0,0,0,0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Crosshair tooltip
    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.time || !param.seriesData.size) {
        setTooltip(null);
        return;
      }

      const candleData = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;
      if (candleData) {
        const t = param.time;
        let timeStr = '';
        if (typeof t === 'number') {
          timeStr = new Date(t * 1000).toLocaleString();
        } else if (typeof t === 'string') {
          timeStr = t;
        } else if (typeof t === 'object' && 'year' in t) {
          timeStr = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
        }

        setTooltip({
          time: timeStr,
          open: formatPrice(candleData.open, 6),
          high: formatPrice(candleData.high, 6),
          low: formatPrice(candleData.low, 6),
          close: formatPrice(candleData.close, 6),
          volume: '—',
        });
      }
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    // ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;

    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: dark ? '#121212' : '#fafafa' },
        textColor: dark ? '#858585' : '#71717a',
      },
      grid: {
        vertLines: { color: dark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.04)' },
        horzLines: { color: dark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.04)' },
      },
      crosshair: {
        vertLine: {
          color: dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.1)',
          labelBackgroundColor: dark ? '#2a2a2a' : '#3a3a3a',
        },
        horzLine: {
          color: dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.1)',
          labelBackgroundColor: dark ? '#2a2a2a' : '#3a3a3a',
        },
      },
      rightPriceScale: {
        borderVisible: !dark,
        borderColor: dark ? 'rgba(255,255,255,0.012)' : 'rgba(0,0,0,0.06)',
      },
      timeScale: {
        borderVisible: !dark,
        borderColor: dark ? 'rgba(255,255,255,0.012)' : 'rgba(0,0,0,0.06)',
      },
    });
  }, [dark]);

  // Track whether we've done the initial load (to fitContent only once)
  const initialLoadDone = useRef(false);
  const prevCandleLen = useRef(0);

  // Reset initial load flag when interval changes
  useEffect(() => {
    initialLoadDone.current = false;
    prevCandleLen.current = 0;
  }, [interval]);

  // Update data when candles change
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const candleData = candles.map((c) => ({
      time: (Math.floor(c.t / 1000)) as Time,
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
    }));

    const volumeData = candles.map((c) => {
      const close = parseFloat(c.c);
      const open = parseFloat(c.o);
      return {
        time: (Math.floor(c.t / 1000)) as Time,
        value: parseFloat(c.v),
        color: close >= open ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)',
      };
    });

    const isInitial = !initialLoadDone.current;
    const hasNewBars = candles.length !== prevCandleLen.current;

    if (isInitial || hasNewBars) {
      // Full setData when initial load or when new bars appeared
      candleSeriesRef.current.setData(candleData);
      volumeSeriesRef.current.setData(volumeData);
      if (isInitial && chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
      initialLoadDone.current = true;
      prevCandleLen.current = candles.length;
    } else {
      // Same number of bars — just update the last candle (current bar)
      const lastCandle = candleData[candleData.length - 1];
      const lastVolume = volumeData[volumeData.length - 1];
      if (lastCandle) candleSeriesRef.current.update(lastCandle);
      if (lastVolume) volumeSeriesRef.current.update(lastVolume);
    }
  }, [candles]);

  const handleIntervalChange = useCallback((newInterval: CandleInterval) => {
    if (onIntervalChange) {
      onIntervalChange(newInterval);
    } else {
      setInternalInterval(newInterval);
    }
    setTooltip(null);
  }, [onIntervalChange]);

  return (
    <div
      className={`perps-chart-shell flex flex-col rounded-[14px] overflow-hidden h-full min-h-[360px] ${
        dark ? 'bg-[#121212]' : 'border border-black/[0.08] bg-[#fafafa]'
      }`}
    >
      {/* Interval buttons */}
      {!hideIntervalBar && (
        <div
          className={`flex items-center gap-1 px-3 py-2 ${
            dark ? 'bg-[#121212]' : 'border-b border-black/[0.06] bg-white'
          }`}
        >
          <span
            className="text-[10px] font-bold text-[#1a1a1a] uppercase tracking-wider mr-1.5"
            style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
          >
            Timeframe
          </span>
          {INTERVALS.map((itv) => (
            <button
              key={itv.value}
              onClick={() => handleIntervalChange(itv.value)}
              className={`px-2.5 py-1 rounded-[6px] text-[11px] font-semibold transition-colors cursor-pointer ${
                interval === itv.value
                  ? 'bg-[#3a3a3a] text-white'
                  : 'text-[#9ca3af] hover:bg-[#f7f7f7] hover:text-[#1a1a1a]'
              }`}
              style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
            >
              {itv.label}
            </button>
          ))}

          {isLoading && (
            <div className="ml-2 h-2.5 w-2.5 border-2 border-black/20 border-t-black/60 rounded-full animate-spin" />
          )}
        </div>
      )}

      {/* Chart container */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="absolute inset-0" />

        {/* OHLCV Tooltip */}
        {tooltip && (
          <div
            className="absolute top-2 left-3 z-10 flex items-center gap-3 text-[10px] pointer-events-none"
            style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
          >
            <span className="text-[#9ca3af]">{tooltip.time}</span>
            <span className="text-[#9ca3af]">
              O <span className="text-[#1a1a1a] font-medium">{tooltip.open}</span>
            </span>
            <span className="text-[#9ca3af]">
              H <span className="text-[#1a1a1a] font-medium">{tooltip.high}</span>
            </span>
            <span className="text-[#9ca3af]">
              L <span className="text-[#1a1a1a] font-medium">{tooltip.low}</span>
            </span>
            <span className="text-[#9ca3af]">
              C <span className="text-[#1a1a1a] font-medium">{tooltip.close}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
