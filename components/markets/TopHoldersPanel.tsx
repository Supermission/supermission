'use client';

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTopHolders } from '@/lib/hooks/use-top-holders';
import type { EnrichedHolder } from '@/lib/hooks/use-top-holders';

const FONT = "var(--font-bricolage, 'Bricolage Grotesque', sans-serif)";
const DUST_FLOOR = 1;

interface TopHoldersPanelProps {
  conditionId: string;
  /** Live market Yes probability (0–1). Drives the top Yes/No bar so it matches the
   *  market's real odds; falls back to the share-weighted holdings split if omitted. */
  yesProbability?: number | null;
}

interface Holder {
  key: string;
  address: string;
  name: string;
  avatar?: string;
  shares: number;
  poolPct: number;
  isYes: boolean;
}

function truncAddr(a: string): string {
  return a.length < 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function fmtShares(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v >= 100 ? v.toFixed(0) : v.toFixed(1);
}
function isYesOutcome(o: string): boolean {
  return o.toLowerCase() === 'yes';
}
function polymarketUrl(address: string): string {
  return `https://polymarket.com/profile/${address}`;
}
function openProfile(address: string) {
  if (typeof window !== 'undefined') window.open(polymarketUrl(address), '_blank', 'noopener,noreferrer');
}

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M21 2V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12C3 7.03 7.03 3 12 3c3.36 0 6.26 1.95 7.62 4.77" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 22V16H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12c0 4.97-4.03 9-9 9-3.36 0-6.26-1.95-7.62-4.77" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function ExpandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m0 8v3a2 2 0 0 0 2 2h3m8-18h3a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-3"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ display: 'inline', verticalAlign: 'middle' }}>
      <path d="M7 17L17 7M17 7H9M17 7v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// -------- physics bubble canvas (self-contained, ref-driven, no deps) --------

interface SimNode {
  x: number; y: number; vx: number; vy: number;
  fx: number | null; fy: number | null; r: number;
}

function BubbleCanvas({
  holders,
  W,
  H,
  maxNodes,
  onHover,
  onSelect,
  highlightKey,
  selectedKey,
}: {
  holders: Holder[];
  W: number;
  H: number;
  maxNodes: number;
  onHover: (h: Holder | null) => void;
  onSelect: (h: Holder) => void;
  highlightKey: string | null;
  selectedKey: string | null;
}) {
  const nodes = useMemo(() => {
    const list = holders.slice(0, maxNodes);
    const maxShare = list.length ? list[0].shares : 1;
    const rMax = H * 0.15;
    const rMin = Math.max(6, H * 0.021);
    return list.map((h) => ({
      ...h,
      r: Math.max(rMin, Math.sqrt(h.shares / maxShare) * rMax),
    }));
  }, [holders, maxNodes, H]);

  const svgRef = useRef<SVGSVGElement>(null);
  const gRefs = useRef<Array<SVGGElement | null>>([]);
  const sim = useRef<SimNode[]>([]);
  // pointer interaction: distinguish a click (select) from a drag (move)
  const drag = useRef<{ i: number; sx: number; sy: number; moved: boolean } | null>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    sim.current = nodes.map((n, i) => {
      const ang = i * 2.399963;
      const rad = Math.min(W, H) * 0.03 * Math.sqrt(i + 1);
      return { x: W / 2 + Math.cos(ang) * rad, y: H / 2 + Math.sin(ang) * rad, vx: 0, vy: 0, fx: null, fy: null, r: n.r };
    });
  }, [nodes, W, H]);

  useEffect(() => {
    let running = true;
    const cx = W / 2, cy = H / 2;
    const repRange = Math.min(W, H) * 0.42;
    const mx = W * 0.06, my = H * 0.06;
    const step = () => {
      const s = sim.current;
      const n = s.length;
      for (let i = 0; i < n; i++) {
        const a = s[i];
        if (a.fx != null) { a.x = a.fx; a.y = a.fy as number; a.vx = 0; a.vy = 0; continue; }
        // stronger centering keeps the cluster centred (no corner scatter)
        a.vx += (cx - a.x) * 0.0026;
        a.vy += (cy - a.y) * 0.0026;
      }
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = s[i], b = s[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.001;
          if (d < repRange) {
            const F = (1.5 * a.r * b.r) / (d * d);
            const ux = dx / d, uy = dy / d;
            a.vx -= F * ux; a.vy -= F * uy;
            b.vx += F * ux; b.vy += F * uy;
          }
          const min = a.r + b.r + 2;
          if (d < min) {
            const push = ((min - d) / d) * 0.5;
            const ox = dx * push, oy = dy * push;
            if (a.fx == null) { a.x -= ox; a.y -= oy; }
            if (b.fx == null) { b.x += ox; b.y += oy; }
          }
        }
      }
      for (let i = 0; i < n; i++) {
        const a = s[i];
        if (a.fx == null) {
          a.vx *= 0.86; a.vy *= 0.86;
          a.x += a.vx; a.y += a.vy;
          a.x = Math.max(a.r + mx, Math.min(W - a.r - mx, a.x));
          a.y = Math.max(a.r + my, Math.min(H - a.r - my, a.y));
        }
        const g = gRefs.current[i];
        if (g) g.setAttribute('transform', `translate(${a.x.toFixed(2)},${a.y.toFixed(2)})`);
      }
      if (running) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { running = false; cancelAnimationFrame(raf.current); };
  }, [nodes, W, H]);

  const toLocal = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: ((clientX - rect.left) / rect.width) * W, y: ((clientY - rect.top) / rect.height) * H };
  }, [W, H]);

  const startDrag = (e: React.PointerEvent, i: number) => {
    e.preventDefault();
    drag.current = { i, sx: e.clientX, sy: e.clientY, moved: false };
    const p = toLocal(e.clientX, e.clientY);
    if (sim.current[i]) { sim.current[i].fx = p.x; sim.current[i].fy = p.y; }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onHover(nodes[i]);
  };
  const onMove = (e: React.PointerEvent) => {
    const dr = drag.current;
    if (!dr) return;
    if (!dr.moved && Math.hypot(e.clientX - dr.sx, e.clientY - dr.sy) > 5) dr.moved = true;
    const p = toLocal(e.clientX, e.clientY);
    const s = sim.current[dr.i];
    if (s) { s.fx = p.x; s.fy = p.y; }
  };
  const endDrag = () => {
    const dr = drag.current;
    if (dr) {
      if (sim.current[dr.i]) { sim.current[dr.i].fx = null; sim.current[dr.i].fy = null; }
      if (!dr.moved && nodes[dr.i]) onSelect(nodes[dr.i]); // a click, not a drag
    }
    drag.current = null;
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      style={{ display: 'block', touchAction: 'none' }}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerLeave={() => { endDrag(); }}
    >
      <defs>
        <radialGradient id="hmBg" cx="50%" cy="42%" r="75%">
          <stop offset="0%" stopColor="#14161f" />
          <stop offset="100%" stopColor="#07080d" />
        </radialGradient>
        <radialGradient id="hmYes" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#8ff0c4" />
          <stop offset="42%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#064e3b" />
        </radialGradient>
        <radialGradient id="hmNo" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ffc2cd" />
          <stop offset="42%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#7f1d2e" />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="url(#hmBg)" />

      {nodes.map((n, i) => {
        const seedAng = i * 2.399963;
        const seedRad = Math.min(W, H) * 0.03 * Math.sqrt(i + 1);
        const ix = W / 2 + Math.cos(seedAng) * seedRad;
        const iy = H / 2 + Math.sin(seedAng) * seedRad;
        const isSel = selectedKey === n.key;
        const isHi = highlightKey === n.key;
        return (
          <g
            key={n.key}
            ref={(el) => { gRefs.current[i] = el; }}
            transform={`translate(${ix.toFixed(2)},${iy.toFixed(2)})`}
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => startDrag(e, i)}
            onPointerEnter={() => onHover(n)}
          >
            {/* selection halo */}
            {isSel && <circle r={n.r + 6} fill="none" stroke="#ffffff" strokeOpacity={0.25} strokeWidth={2} />}
            <circle r={n.r} fill={n.isYes ? 'url(#hmYes)' : 'url(#hmNo)'} fillOpacity={0.82} />
            <circle
              r={n.r}
              fill="none"
              stroke={isSel || isHi ? '#ffffff' : n.isYes ? '#34d399' : '#fb7185'}
              strokeWidth={isSel ? 2.5 : isHi ? 2 : 1}
              strokeOpacity={isSel ? 1 : isHi ? 0.85 : 0.28}
            />
            <ellipse cx={-n.r * 0.26} cy={-n.r * 0.34} rx={n.r * 0.42} ry={n.r * 0.28} fill="#ffffff" opacity={0.22} />
            {n.r > H * 0.055 && (
              <text
                textAnchor="middle" dominantBaseline="central" y={0}
                fontSize={Math.max(9, n.r * 0.5)} fontWeight={700} fill="#ffffff" fillOpacity={0.92}
                style={{ fontFamily: FONT, pointerEvents: 'none' }}
              >
                {i + 1}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// -------- model + shared bits --------

function useHolderModel(holders: EnrichedHolder[]) {
  return useMemo(() => {
    const clean = holders.filter(
      (h) => !!h.address && Number.isFinite(h.position) && h.position >= DUST_FLOOR && h.outcome.toLowerCase() !== 'unknown',
    );
    const byKey = new Map<string, EnrichedHolder>();
    for (const h of clean) {
      const key = `${h.address.toLowerCase()}:${h.outcome.toLowerCase()}`;
      const prev = byKey.get(key);
      if (!prev || h.position > prev.position) byKey.set(key, h);
    }
    const deduped = [...byKey.values()].sort((a, b) => b.position - a.position);
    if (deduped.length === 0) return null;
    const totalPos = deduped.reduce((s, h) => s + h.position, 0);
    const yesPos = deduped.filter((h) => isYesOutcome(h.outcome)).reduce((s, h) => s + h.position, 0);
    const yesPct = totalPos > 0 ? (yesPos / totalPos) * 100 : 0;
    const list: Holder[] = deduped.map((h) => ({
      key: `${h.address.toLowerCase()}:${h.outcome.toLowerCase()}`,
      address: h.address,
      name: h.username || truncAddr(h.address),
      avatar: h.profileImage,
      shares: h.position,
      poolPct: totalPos > 0 ? (h.position / totalPos) * 100 : 0,
      isYes: isYesOutcome(h.outcome),
    }));
    return { list, yesPct, noPct: 100 - yesPct, count: deduped.length };
  }, [holders]);
}

function ConvictionBar({ yesPct, noPct, count }: { yesPct: number; noPct: number; count: number }) {
  return (
    <div className="mb-2.5">
      <div className="flex items-baseline justify-between mb-1.5" style={{ fontFamily: FONT }}>
        <span className="text-[11px] font-bold text-emerald-600 tabular-nums">Yes {yesPct.toFixed(0)}%</span>
        <span className="text-[9px] font-semibold text-[#9ca3af] uppercase tracking-wide tabular-nums">{count} holders</span>
        <span className="text-[11px] font-bold text-rose-500 tabular-nums">{noPct.toFixed(0)}% No</span>
      </div>
      <div className="flex h-[5px] rounded-full overflow-hidden bg-[#f1f3f4]">
        <div className="h-full bg-emerald-500" style={{ width: `${yesPct}%`, transition: 'width 0.4s ease-out' }} />
        <div className="h-full bg-rose-500" style={{ width: `${noPct}%`, transition: 'width 0.4s ease-out' }} />
      </div>
    </div>
  );
}

function Caption({ h }: { h: Holder | null }) {
  if (!h) return null;
  return (
    <button
      onClick={() => openProfile(h.address)}
      className="w-full flex items-center gap-2 mt-2.5 px-0.5 group"
      style={{ fontFamily: FONT }}
      title="View on Polymarket"
    >
      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${h.isYes ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      <span className="text-[11.5px] font-bold text-black truncate group-hover:underline">{h.name}</span>
      <span className="text-[#9ca3af] group-hover:text-[#6b7280]"><LinkIcon /></span>
      <span className={`text-[9px] font-black uppercase tracking-wide flex-shrink-0 ${h.isYes ? 'text-emerald-600' : 'text-rose-500'}`}>
        {h.isYes ? 'Yes' : 'No'}
      </span>
      <span className="ml-auto flex items-baseline gap-1.5 flex-shrink-0">
        <span className="font-mono text-[11.5px] font-bold text-black tabular-nums">{fmtShares(h.shares)}</span>
        <span className="text-[9px] font-medium text-[#9ca3af] tabular-nums">{h.poolPct.toFixed(1)}%</span>
      </span>
    </button>
  );
}

// -------- fullscreen (big canvas + ranked, clickable list) --------

function FullscreenMap({
  model,
  yesPct,
  noPct,
  onClose,
}: {
  model: { list: Holder[]; yesPct: number; noPct: number; count: number };
  yesPct: number;
  noPct: number;
  onClose: () => void;
}) {
  const [hovered, setHovered] = useState<Holder | null>(model.list[0] ?? null);
  const [selected, setSelected] = useState<Holder | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const highlightKey = hovered?.key ?? selected?.key ?? null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#07080d]" style={{ fontFamily: FONT }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07]">
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] font-bold text-white uppercase tracking-wider">Holder Map</span>
          <span className="text-[11px] text-white/40 tabular-nums">{model.count} holders</span>
          <span className="text-[11px] font-bold text-emerald-400 tabular-nums">Yes {yesPct.toFixed(0)}%</span>
          <span className="text-[11px] font-bold text-rose-400 tabular-nums">No {noPct.toFixed(0)}%</span>
        </div>
        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1.5 -m-1.5" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative min-w-0">
          <BubbleCanvas
            holders={model.list} W={1200} H={760} maxNodes={150}
            onHover={(h) => setHovered(h)}
            onSelect={(h) => { setSelected(h); openProfile(h.address); }}
            highlightKey={highlightKey}
            selectedKey={selected?.key ?? null}
          />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-white/35 pointer-events-none">
            Drag to move · click a bubble to open its Polymarket profile · green = Yes, red = No
          </div>
        </div>
        <div className="w-[300px] shrink-0 border-l border-white/[0.07] overflow-y-auto">
          {model.list.map((h, i) => {
            const active = highlightKey === h.key;
            return (
              <a
                key={h.key}
                href={polymarketUrl(h.address)}
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={() => setHovered(h)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected(h)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-b border-white/[0.04] transition-colors ${active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.03]'}`}
              >
                <span className="text-[11px] font-bold text-white/30 w-6 text-right tabular-nums">{i + 1}</span>
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${h.isYes ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span className="flex-1 min-w-0 truncate text-[12px] font-semibold text-white/90">{h.name}</span>
                <span className="text-white/25"><LinkIcon /></span>
                <span className="font-mono text-[11px] font-bold text-white/80 tabular-nums">{fmtShares(h.shares)}</span>
                <span className="text-[10px] text-white/35 tabular-nums w-10 text-right">{h.poolPct.toFixed(1)}%</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// -------- panel --------

export default function TopHoldersPanel({ conditionId, yesProbability }: TopHoldersPanelProps) {
  const { holders, loading, error, refresh } = useTopHolders(conditionId);
  const model = useHolderModel(holders);
  const [hovered, setHovered] = useState<Holder | null>(null);
  const [selected, setSelected] = useState<Holder | null>(null);
  const [full, setFull] = useState(false);

  const active = hovered ?? selected ?? model?.list[0] ?? null;

  // Bar reflects the real market odds when we have them (matches the market, e.g. 1%/99%);
  // otherwise the share-weighted holdings split. Never a hardcoded 50/50.
  const marketYes = yesProbability != null && Number.isFinite(yesProbability)
    ? Math.max(0, Math.min(100, yesProbability * 100))
    : null;
  const barYes = marketYes ?? (model ? model.yesPct : 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider" style={{ fontFamily: FONT }}>
          Holder Map
        </span>
        <div className="flex items-center gap-3">
          {model && (
            <button onClick={() => setFull(true)} className="text-[#b0b4ba] hover:text-[#6b7280] transition-colors" aria-label="Expand holder map">
              <ExpandIcon />
            </button>
          )}
          <button onClick={refresh} className="text-[#b0b4ba] hover:text-[#6b7280] transition-colors" aria-label="Refresh holders">
            <RefreshIcon />
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-2 text-[11px] text-rose-500" style={{ fontFamily: FONT }}>{error}</p>
      ) : loading ? (
        <LoadingSkeleton />
      ) : !model ? (
        <p className="text-[11px] text-[#9ca3af] py-6 text-center" style={{ fontFamily: FONT }}>No meaningful holder positions yet</p>
      ) : (
        <>
          <ConvictionBar yesPct={barYes} noPct={100 - barYes} count={model.count} />
          <div
            className="relative w-full rounded-[12px] overflow-hidden border border-white/[0.06]"
            style={{ aspectRatio: '7 / 5' }}
            onPointerLeave={() => setHovered(null)}
          >
            <BubbleCanvas
              holders={model.list} W={560} H={400} maxNodes={60}
              onHover={setHovered}
              onSelect={(h) => { setSelected(h); openProfile(h.address); }}
              highlightKey={active?.key ?? null}
              selectedKey={selected?.key ?? null}
            />
            <button
              onClick={() => setFull(true)}
              className="absolute bottom-2 right-2 text-[9px] font-semibold text-white/45 hover:text-white/80 transition-colors tabular-nums"
              style={{ fontFamily: FONT }}
            >
              {model.count > 60 ? `Top 60 · expand all ${model.count} ↗` : 'Expand ↗'}
            </button>
          </div>
          <Caption h={active} />
        </>
      )}

      {full && model && <FullscreenMap model={model} yesPct={barYes} noPct={100 - barYes} onClose={() => setFull(false)} />}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-1.5">
        <div className="h-2.5 w-12 rounded bg-[#f1f3f4]" />
        <div className="h-2.5 w-14 rounded bg-[#f1f3f4]" />
      </div>
      <div className="h-[5px] rounded-full bg-[#f1f3f4] mb-2.5" />
      <div className="w-full rounded-[12px] bg-[#0d0f16] border border-white/[0.06]" style={{ aspectRatio: '7 / 5' }} />
      <div className="h-3 w-40 rounded bg-[#f1f3f4] mt-2.5" />
    </div>
  );
}
