'use client';

import { useMemo, useRef, useState } from 'react';
import type { PnlSeriesPoint } from '@/lib/hooks/use-polymarket-profile-stats';

type Period = 'all' | 'day' | 'week' | 'month';

interface Props {
  series: PnlSeriesPoint[];
  period: Period;
  height?: number;
  isPositive: boolean;
}

const PERIOD_MS: Record<Period, number | null> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  all: null,
};

// Monotone cubic interpolation — same curve Recharts/D3 use for smooth area charts.
function monotonePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dxs: number[] = [];
  const ms: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    dxs.push(dx);
    ms.push((pts[i + 1].y - pts[i].y) / (dx || 1));
  }
  const tan: number[] = new Array(n);
  tan[0] = ms[0];
  tan[n - 1] = ms[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (ms[i - 1] * ms[i] <= 0) tan[i] = 0;
    else {
      const dx0 = dxs[i - 1];
      const dx1 = dxs[i];
      const common = dx0 + dx1;
      tan[i] = (3 * common) / ((common + dx1) / ms[i - 1] + (common + dx0) / ms[i]);
    }
  }
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = dxs[i] / 3;
    const x1 = pts[i].x + dx;
    const y1 = pts[i].y + tan[i] * dx;
    const x2 = pts[i + 1].x - dx;
    const y2 = pts[i + 1].y - tan[i + 1] * dx;
    d += ` C ${x1},${y1} ${x2},${y2} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatDate(t: number): string {
  const d = new Date(t);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function PnlChart({ series, period, height = 140, isPositive }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);

  // Observe container width for responsive SVG without layout thrashing
  const ro = useMemo(() => {
    if (typeof ResizeObserver === 'undefined') return null;
    return new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(280, Math.round(e.contentRect.width)));
    });
  }, []);

  const setWrap = (el: HTMLDivElement | null) => {
    wrapRef.current = el;
    if (ro) {
      ro.disconnect();
      if (el) ro.observe(el);
    }
  };

  // Filter to period window
  const filtered = useMemo(() => {
    const window = PERIOD_MS[period];
    if (!window || series.length === 0) return series;
    const cutoff = Date.now() - window;
    const inWindow = series.filter((p) => p.t >= cutoff);
    // Anchor the left edge: if we dropped earlier points, seed a point at cutoff
    // using the last pre-cutoff value so period P&L starts from the correct baseline.
    if (inWindow.length === series.length) return inWindow;
    const lastBefore = [...series].reverse().find((p) => p.t < cutoff);
    const seed = lastBefore ? { t: cutoff, v: lastBefore.v } : null;
    return seed ? [seed, ...inWindow] : inWindow;
  }, [series, period]);

  // Normalize to display cumulative delta within the period (so chart shows change, not absolute)
  const displayPoints = useMemo(() => {
    if (filtered.length === 0) return [];
    const base = filtered[0].v;
    return filtered.map((p) => ({ t: p.t, v: p.v - base }));
  }, [filtered]);

  const padX = 8;
  const padTop = 18;
  const padBottom = 8;

  const layout = useMemo(() => {
    if (displayPoints.length < 2) return null;
    const ts = displayPoints.map((p) => p.t);
    const vs = displayPoints.map((p) => p.v);
    const tMin = Math.min(...ts);
    const tMax = Math.max(...ts);
    let vMin = Math.min(...vs, 0);
    let vMax = Math.max(...vs, 0);
    if (vMin === vMax) { vMin -= 1; vMax += 1; }
    const pad = (vMax - vMin) * 0.15;
    vMin -= pad; vMax += pad;

    const innerW = Math.max(1, width - padX * 2);
    const innerH = Math.max(1, height - padTop - padBottom);
    const xAt = (t: number) => padX + ((t - tMin) / (tMax - tMin || 1)) * innerW;
    const yAt = (v: number) => padTop + (1 - (v - vMin) / (vMax - vMin || 1)) * innerH;
    const zeroY = yAt(0);

    const pts = displayPoints.map((p) => ({ x: xAt(p.t), y: yAt(p.v) }));
    const linePath = monotonePath(pts);
    const areaPath = `${linePath} L ${pts[pts.length - 1].x},${height - padBottom} L ${pts[0].x},${height - padBottom} Z`;

    return { pts, linePath, areaPath, zeroY, tMin, tMax, xAt };
  }, [displayPoints, width, height]);

  const color = isPositive ? '#10b981' : '#f43f5e';
  const colorSoft = isPositive ? 'rgba(16,185,129,0.18)' : 'rgba(244,63,94,0.18)';

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!layout || displayPoints.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < layout.pts.length; i++) {
      const d = Math.abs(layout.pts[i].x - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    setHoverIdx(best);
  };

  const activeIdx = hoverIdx ?? (layout ? layout.pts.length - 1 : null);
  const activePt = layout && activeIdx !== null ? layout.pts[activeIdx] : null;
  const activeRaw = activeIdx !== null ? filtered[activeIdx] : null;
  const activeDelta = activeIdx !== null ? displayPoints[activeIdx].v : 0;

  // Tooltip positioning
  const ttW = 150;
  const ttLeft = activePt
    ? Math.min(Math.max(activePt.x - ttW / 2, 4), width - ttW - 4)
    : 0;

  if (displayPoints.length < 2 || !layout) {
    return (
      <div ref={setWrap} className="w-full flex items-center justify-center text-[11px] text-[#b0b4ba]" style={{ height }}>
        Not enough activity yet to chart this period.
      </div>
    );
  }

  const gradId = `pnl-grad-${isPositive ? 'pos' : 'neg'}`;

  return (
    <div ref={setWrap} className="relative w-full select-none" style={{ height }}>
      <svg
        width={width}
        height={height}
        className="block"
        onPointerMove={onMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Zero baseline */}
        <line
          x1={padX}
          x2={width - padX}
          y1={layout.zeroY}
          y2={layout.zeroY}
          stroke="rgba(0,0,0,0.08)"
          strokeDasharray="2 3"
          strokeWidth={1}
        />

        <path d={layout.areaPath} fill={`url(#${gradId})`} />
        <path d={layout.linePath} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />

        {activePt && (
          <>
            <line
              x1={activePt.x}
              x2={activePt.x}
              y1={padTop}
              y2={height - padBottom}
              stroke="rgba(0,0,0,0.15)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <circle cx={activePt.x} cy={activePt.y} r={5} fill="white" stroke={color} strokeWidth={2} />
          </>
        )}
      </svg>

      {activePt && activeRaw && (
        <div
          className="pointer-events-none absolute rounded-[10px] bg-white px-2.5 py-1.5"
          style={{
            left: ttLeft,
            top: Math.max(2, activePt.y - 54),
            width: ttW,
            boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.04)',
          }}
        >
          <div className="text-[9px] font-semibold text-[#9ca3af] uppercase tracking-wider leading-none mb-1">
            {formatDate(activeRaw.t)}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[14px] font-bold text-[#111] tabular-nums leading-none"
              style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
            >
              {formatMoney(activeRaw.v)}
            </span>
            <span
              className="text-[10px] font-bold tabular-nums leading-none"
              style={{ color: activeDelta >= 0 ? '#10b981' : '#f43f5e' }}
            >
              {activeDelta >= 0 ? '+' : ''}{formatMoney(activeDelta)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
