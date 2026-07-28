'use client';

import { useHLPositions, useHLTrade, usePositionTpSl } from '@/lib/hyperliquid/hooks';
import type { FrontendOpenOrder } from '@/lib/hyperliquid/types';
import { formatPrice, estimateLiqPrice } from '@/lib/hyperliquid/utils';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

import { CoinIcon } from './CoinIcon';
import { PerpsShareButton } from '@/components/share/perps-share-button';
import type { PerpsCardProps } from '@/components/share/perps-position-card';

// ─── Close position sound ───────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext();
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume();
  }
  return _audioCtx;
}

function playCloseSound() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    // Two-tone descending "cash out" chime
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    // First note: high ping
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(1200, now);
    osc1.frequency.linearRampToValueAtTime(800, now + 0.12);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.linearRampToValueAtTime(0, now + 0.2);
    osc1.start(now);
    osc1.stop(now + 0.2);

    // Second note: lower resolve
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(600, now + 0.12);
    osc2.frequency.linearRampToValueAtTime(400, now + 0.3);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.linearRampToValueAtTime(0, now + 0.4);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.4);
  } catch {
    // Audio not available
  }
}

type ViewMode = 'card' | 'list' | 'kanban';

// ─── Notes persistence via localStorage ─────────────────────────────────────

function getNote(coin: string): string {
  try { return localStorage.getItem(`perps-note-${coin}`) || ''; } catch { return ''; }
}

function saveNote(coin: string, note: string) {
  try {
    if (note) localStorage.setItem(`perps-note-${coin}`, note);
    else localStorage.removeItem(`perps-note-${coin}`);
  } catch { /* ignore */ }
}

// ─── View mode icons ─────────────────────────────────────────────────────────

function CardIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" stroke={active ? '#1a1a1a' : '#9ca3af'} strokeWidth="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" stroke={active ? '#1a1a1a' : '#9ca3af'} strokeWidth="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" stroke={active ? '#1a1a1a' : '#9ca3af'} strokeWidth="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" stroke={active ? '#1a1a1a' : '#9ca3af'} strokeWidth="1.5" />
    </svg>
  );
}

function ListIcon({ active }: { active: boolean }) {
  const c = active ? '#1a1a1a' : '#9ca3af';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="2.5" rx="1" fill={c} />
      <rect x="1" y="6.75" width="14" height="2.5" rx="1" fill={c} />
      <rect x="1" y="11.5" width="14" height="2.5" rx="1" fill={c} />
    </svg>
  );
}

function KanbanIcon({ active }: { active: boolean }) {
  const c = active ? '#1a1a1a' : '#9ca3af';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="14" rx="1.5" stroke={c} strokeWidth="1.5" />
      <rect x="9" y="1" width="6" height="9" rx="1.5" stroke={c} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Inline Note Editor ──────────────────────────────────────────────────────

function NoteEditor({ coin }: { coin: string }) {
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => { setNote(getNote(coin)); }, [coin]);

  const handleSave = () => {
    saveNote(coin, note.trim());
    setEditing(false);
  };

  if (!editing && !note) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-[9px] text-[#9ca3af] hover:text-[#666] transition-colors cursor-pointer"
        style={{ fontFamily: FONT }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
        </svg>
        Add note
      </button>
    );
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className="flex items-start gap-1.5 mt-1 px-2.5 py-1.5 bg-amber-50/60 border border-amber-200/40 rounded-[6px] cursor-pointer group"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" className="mt-0.5 flex-shrink-0">
          <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
        </svg>
        <span className="text-[10px] text-[#92400e] leading-tight flex-1" style={{ fontFamily: FONT }}>{note}</span>
        <span className="text-[8px] text-[#d97706] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ fontFamily: FONT }}>edit</span>
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <textarea
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note about this position..."
        rows={2}
        className="w-full text-[10px] text-[#1a1a1a] bg-[#fafbfc] border border-[#e5e7eb] rounded-[6px] px-2.5 py-1.5 resize-none focus:border-[#3a3a3a] focus:outline-none"
        style={{ fontFamily: FONT }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); } }}
      />
      <div className="flex items-center gap-1.5 mt-1">
        <button
          onClick={handleSave}
          className="px-2 py-0.5 rounded-[4px] bg-[#1a1a1a] text-white text-[9px] font-bold cursor-pointer"
          style={{ fontFamily: FONT }}
        >
          Save
        </button>
        <button
          onClick={() => { setNote(getNote(coin)); setEditing(false); }}
          className="px-2 py-0.5 rounded-[4px] text-[#9ca3af] text-[9px] font-bold hover:text-[#666] cursor-pointer"
          style={{ fontFamily: FONT }}
        >
          Cancel
        </button>
        {note && (
          <button
            onClick={() => { setNote(''); saveNote(coin, ''); setEditing(false); }}
            className="px-2 py-0.5 rounded-[4px] text-rose-400 text-[9px] font-bold hover:text-rose-600 cursor-pointer ml-auto"
            style={{ fontFamily: FONT }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Build share data from position ─────────────────────────────────────────

function buildPerpsShareData(pos: ReturnType<typeof useHLPositions>[number]): PerpsCardProps {
  const decimals = pos.entryPx >= 1000 ? 2 : pos.entryPx >= 1 ? 4 : 6;
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return {
    coin: pos.position.coin,
    direction: pos.isLong ? 'LONG' : 'SHORT',
    leverage: pos.leverage ? `${pos.leverage}x` : '1x',
    entryPrice: `$${formatPrice(pos.entryPx, decimals)}`,
    markPrice: `$${formatPrice(pos.markPx, decimals)}`,
    pnlPercent: pos.pnlPct,
    pnlDollar: pos.unrealizedPnl,
    date,
  };
}

// ─── TP/SL Management Panel ─────────────────────────────────────────────────

function TpSlPanel({ pos, placeOrder, isExecuting }: {
  pos: ReturnType<typeof useHLPositions>[number];
  placeOrder: ReturnType<typeof useHLTrade>['placeOrder'];
  isExecuting: boolean;
}) {
  const [tpPct, setTpPct] = useState<string>('');
  const [slPct, setSlPct] = useState<string>('');
  const [tpMode, setTpMode] = useState<'pct' | 'price'>('pct');
  const [slMode, setSlMode] = useState<'pct' | 'price'>('pct');
  const [tpDirectPrice, setTpDirectPrice] = useState<string>('');
  const [slDirectPrice, setSlDirectPrice] = useState<string>('');
  const [submitting, setSubmitting] = useState<'tp' | 'sl' | null>(null);

  const coin = pos.position.coin;
  const absSize = Math.abs(pos.size);

  const tpPctNum = parseFloat(tpPct) || 0;
  const slPctNum = parseFloat(slPct) || 0;

  const tpPrice = tpMode === 'price'
    ? (parseFloat(tpDirectPrice) || 0)
    : (tpPctNum > 0
      ? (pos.isLong ? pos.entryPx * (1 + tpPctNum / 100) : pos.entryPx * (1 - tpPctNum / 100))
      : 0);
  const slPrice = slMode === 'price'
    ? (parseFloat(slDirectPrice) || 0)
    : (slPctNum > 0
      ? (pos.isLong ? pos.entryPx * (1 - slPctNum / 100) : pos.entryPx * (1 + slPctNum / 100))
      : 0);

  const decimals = pos.entryPx >= 1000 ? 2 : pos.entryPx >= 1 ? 4 : 6;

  const handleSet = async (type: 'tp' | 'sl') => {
    const triggerPx = type === 'tp' ? tpPrice : slPrice;
    if (triggerPx <= 0) return;
    setSubmitting(type);
    try {
      const limitPx = pos.isLong
        ? triggerPx * (type === 'sl' ? 0.9 : 0.9)
        : triggerPx * (type === 'sl' ? 1.1 : 1.1);
      await placeOrder({
        coin,
        isBuy: !pos.isLong,
        sz: absSize,
        limitPx,
        orderType: { trigger: { triggerPx: triggerPx.toString(), isMarket: true, tpsl: type } },
        reduceOnly: true,
      });
      if (type === 'tp') { setTpPct(''); setTpDirectPrice(''); }
      else { setSlPct(''); setSlDirectPrice(''); }
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Take Profit */}
      <div className="flex items-center gap-1.5 flex-1">
        <span className="text-[9px] font-bold text-[#9ca3af] tracking-wide flex-shrink-0" style={{ fontFamily: FONT }}>TP</span>
        <div className="flex items-center gap-0.5 rounded-[4px] overflow-hidden border border-black/[0.06] flex-shrink-0">
          <button type="button" onClick={() => setTpMode('pct')} className={`px-1 py-0.5 text-[8px] font-bold cursor-pointer ${tpMode === 'pct' ? 'bg-emerald-500 text-white' : 'bg-white text-[#9ca3af]'}`} style={{ fontFamily: FONT }}>%</button>
          <button type="button" onClick={() => setTpMode('price')} className={`px-1 py-0.5 text-[8px] font-bold cursor-pointer ${tpMode === 'price' ? 'bg-emerald-500 text-white' : 'bg-white text-[#9ca3af]'}`} style={{ fontFamily: FONT }}>$</button>
        </div>
        <div className="flex items-center bg-[#fafbfc] rounded-[6px] border border-black/[0.06] flex-1 h-[28px]">
          {tpMode === 'pct' ? (
            <>
              <input
                type="number"
                value={tpPct}
                onChange={(e) => setTpPct(e.target.value)}
                placeholder="10"
                min="0.1"
                step="0.5"
                className="w-full px-2 text-[11px] font-semibold text-[#1a1a1a] bg-transparent outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                style={{ fontFamily: FONT }}
              />
              <span className="text-[9px] text-[#bbb] pr-2 flex-shrink-0" style={{ fontFamily: FONT }}>%</span>
            </>
          ) : (
            <>
              <span className="text-[9px] text-[#bbb] pl-2 flex-shrink-0" style={{ fontFamily: FONT }}>$</span>
              <input
                type="text"
                inputMode="decimal"
                value={tpDirectPrice}
                onChange={(e) => setTpDirectPrice(e.target.value)}
                placeholder={formatPrice(pos.entryPx * (pos.isLong ? 1.10 : 0.90), decimals)}
                className="w-full px-2 text-[11px] font-semibold text-[#1a1a1a] bg-transparent outline-none tabular-nums"
                style={{ fontFamily: FONT }}
              />
            </>
          )}
        </div>
        {tpPrice > 0 && tpMode === 'pct' && (
          <span className="text-[9px] text-[#9ca3af] tabular-nums flex-shrink-0 hidden sm:block" style={{ fontFamily: FONT }}>
            ${formatPrice(tpPrice, decimals)}
          </span>
        )}
        <button
          onClick={() => handleSet('tp')}
          disabled={isExecuting || submitting !== null || tpPrice <= 0}
          className="h-[28px] px-3 rounded-[6px] bg-emerald-500 text-white text-[9px] font-bold disabled:opacity-30 hover:bg-emerald-600 transition-colors cursor-pointer flex-shrink-0"
          style={{ fontFamily: FONT }}
        >
          {submitting === 'tp' ? '···' : 'Set'}
        </button>
      </div>

      <div className="w-px h-4 bg-black/[0.06]" />

      {/* Stop Loss */}
      <div className="flex items-center gap-1.5 flex-1">
        <span className="text-[9px] font-bold text-[#9ca3af] tracking-wide flex-shrink-0" style={{ fontFamily: FONT }}>SL</span>
        <div className="flex items-center gap-0.5 rounded-[4px] overflow-hidden border border-black/[0.06] flex-shrink-0">
          <button type="button" onClick={() => setSlMode('pct')} className={`px-1 py-0.5 text-[8px] font-bold cursor-pointer ${slMode === 'pct' ? 'bg-rose-500 text-white' : 'bg-white text-[#9ca3af]'}`} style={{ fontFamily: FONT }}>%</button>
          <button type="button" onClick={() => setSlMode('price')} className={`px-1 py-0.5 text-[8px] font-bold cursor-pointer ${slMode === 'price' ? 'bg-rose-500 text-white' : 'bg-white text-[#9ca3af]'}`} style={{ fontFamily: FONT }}>$</button>
        </div>
        <div className="flex items-center bg-[#fafbfc] rounded-[6px] border border-black/[0.06] flex-1 h-[28px]">
          {slMode === 'pct' ? (
            <>
              <input
                type="number"
                value={slPct}
                onChange={(e) => setSlPct(e.target.value)}
                placeholder="5"
                min="0.1"
                step="0.5"
                className="w-full px-2 text-[11px] font-semibold text-[#1a1a1a] bg-transparent outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                style={{ fontFamily: FONT }}
              />
              <span className="text-[9px] text-[#bbb] pr-2 flex-shrink-0" style={{ fontFamily: FONT }}>%</span>
            </>
          ) : (
            <>
              <span className="text-[9px] text-[#bbb] pl-2 flex-shrink-0" style={{ fontFamily: FONT }}>$</span>
              <input
                type="text"
                inputMode="decimal"
                value={slDirectPrice}
                onChange={(e) => setSlDirectPrice(e.target.value)}
                placeholder={formatPrice(pos.entryPx * (pos.isLong ? 0.95 : 1.05), decimals)}
                className="w-full px-2 text-[11px] font-semibold text-[#1a1a1a] bg-transparent outline-none tabular-nums"
                style={{ fontFamily: FONT }}
              />
            </>
          )}
        </div>
        {slPrice > 0 && slMode === 'pct' && (
          <span className="text-[9px] text-[#9ca3af] tabular-nums flex-shrink-0 hidden sm:block" style={{ fontFamily: FONT }}>
            ${formatPrice(slPrice, decimals)}
          </span>
        )}
        <button
          onClick={() => handleSet('sl')}
          disabled={isExecuting || submitting !== null || slPrice <= 0}
          className="h-[28px] px-3 rounded-[6px] bg-rose-500 text-white text-[9px] font-bold disabled:opacity-30 hover:bg-rose-600 transition-colors cursor-pointer flex-shrink-0"
          style={{ fontFamily: FONT }}
        >
          {submitting === 'sl' ? '···' : 'Set'}
        </button>
      </div>
    </div>
  );
}

// ─── Position Card (used in card + kanban views) ─────────────────────────────

function PositionCard({ pos, onClose, placeOrder, isExecuting, isClosing, tpSlOrders }: {
  pos: ReturnType<typeof useHLPositions>[number];
  onClose: (coin: string, size: number, isLong: boolean, markPx: number) => void;
  placeOrder: ReturnType<typeof useHLTrade>['placeOrder'];
  isExecuting: boolean;
  isClosing: boolean;
  tpSlOrders?: { tp?: FrontendOpenOrder; sl?: FrontendOpenOrder };
}) {
  const coin = pos.position.coin;
  const decimals = pos.entryPx >= 1000 ? 2 : pos.entryPx >= 1 ? 4 : 6;
  const isPnlPositive = pos.unrealizedPnl >= 0;
  const absSize = Math.abs(pos.size);
  const investedAmount = pos.marginUsed;
  const [showManage, setShowManage] = useState(false);

  return (
    <div className="bg-white rounded-[14px] border border-black/[0.06] overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <CoinIcon symbol={coin} size={36} />
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[15px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>{coin}/USDC</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${pos.isLong ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`} style={{ fontFamily: FONT }}>
                  {pos.isLong ? 'LONG' : 'SHORT'}
                </span>
                {pos.leverage && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-[#1a1a1a] text-white" style={{ fontFamily: FONT }}>{pos.leverage}x</span>
                )}
              </div>
              <span className="text-[11px] text-[#9ca3af] mt-0.5 block" style={{ fontFamily: FONT }}>
                {absSize.toFixed(4)} {coin} · {pos.leverageType === 'cross' ? 'Cross' : 'Isolated'} Margin
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2 flex-shrink-0">
            <div className="text-right">
              <span className={`text-[18px] font-bold tabular-nums ${isPnlPositive ? 'text-emerald-600' : 'text-rose-500'}`} style={{ fontFamily: FONT }}>
                {isPnlPositive ? '+' : '-'}${Math.abs(pos.unrealizedPnl).toFixed(2)}
              </span>
              <span className={`text-[11px] font-bold tabular-nums block ${isPnlPositive ? 'text-emerald-500' : 'text-rose-400'}`} style={{ fontFamily: FONT }}>
                {isPnlPositive ? '+' : '-'}{Math.abs(pos.pnlPct).toFixed(2)}%
              </span>
            </div>
            <div onClick={e => e.stopPropagation()} className="scale-75 origin-top-right -mr-1.5 -mt-0.5">
              <PerpsShareButton data={buildPerpsShareData(pos)} />
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="px-4 sm:px-5 pb-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-[#fafbfc] rounded-[8px] px-3 py-2">
            <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-0.5" style={{ fontFamily: FONT }}>Entry Price</span>
            <span className="text-[13px] font-bold text-[#1a1a1a] tabular-nums" style={{ fontFamily: FONT }}>${formatPrice(pos.entryPx, decimals)}</span>
          </div>
          <div className="bg-[#fafbfc] rounded-[8px] px-3 py-2">
            <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-0.5" style={{ fontFamily: FONT }}>Mark Price</span>
            <span className="text-[13px] font-bold text-[#1a1a1a] tabular-nums" style={{ fontFamily: FONT }}>${formatPrice(pos.markPx, decimals)}</span>
          </div>
          <div className="bg-[#fafbfc] rounded-[8px] px-3 py-2">
            <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-0.5" style={{ fontFamily: FONT }}>Invested</span>
            <span className="text-[13px] font-bold text-[#1a1a1a] tabular-nums" style={{ fontFamily: FONT }}>${investedAmount.toFixed(2)}</span>
          </div>
          <div className="bg-rose-50/60 rounded-[8px] px-3 py-2">
            <span className="text-[8px] font-bold text-rose-400 uppercase tracking-wider block mb-0.5" style={{ fontFamily: FONT }}>Liq. Price</span>
            {(() => {
              if (pos.liqPx) {
                return <span className="text-[13px] font-bold text-rose-500 tabular-nums" style={{ fontFamily: FONT }}>${formatPrice(pos.liqPx, decimals)}</span>;
              }
              const est = estimateLiqPrice(pos.entryPx, pos.leverage ?? 1, pos.isLong);
              if (est > 0) {
                return (
                  <span className="text-[13px] font-bold text-rose-500 tabular-nums" style={{ fontFamily: FONT }}>
                    <span className="text-[8px] font-bold uppercase tracking-wider opacity-60 mr-1">est.</span>
                    ${formatPrice(est, decimals)}
                  </span>
                );
              }
              return <span className="text-[13px] font-bold text-rose-500 tabular-nums" style={{ fontFamily: FONT }}>—</span>;
            })()}
          </div>
        </div>

        {(tpSlOrders?.tp || tpSlOrders?.sl) && (
          <div className="flex items-center gap-3 mt-2 px-0.5">
            {tpSlOrders?.tp?.triggerPx && (
              <span className="text-[10px] font-semibold tabular-nums text-emerald-600" style={{ fontFamily: FONT }}>
                TP ${formatPrice(parseFloat(tpSlOrders.tp.triggerPx), decimals)}
              </span>
            )}
            {tpSlOrders?.tp && tpSlOrders?.sl && (
              <span className="text-[10px] text-black/10">·</span>
            )}
            {tpSlOrders?.sl?.triggerPx && (
              <span className="text-[10px] font-semibold tabular-nums text-rose-500" style={{ fontFamily: FONT }}>
                SL ${formatPrice(parseFloat(tpSlOrders.sl.triggerPx), decimals)}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-2.5 text-[10px] text-[#9ca3af] px-0.5" style={{ fontFamily: FONT }}>
          <span>Position Value: <span className="font-semibold text-[#1a1a1a]">${pos.positionValue.toFixed(2)}</span></span>
          <span>Margin Used: <span className="font-semibold text-[#1a1a1a]">${investedAmount.toFixed(2)}</span></span>
        </div>

        {/* TP/SL panel */}
        {showManage && (
          <div className="mt-2.5 pt-2.5 border-t border-black/[0.04]">
            <TpSlPanel pos={pos} placeOrder={placeOrder} isExecuting={isExecuting} />
          </div>
        )}

        {/* Note */}
        <div className="mt-2">
          <NoteEditor coin={coin} />
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 sm:px-5 pb-4 flex items-center gap-2">
        <button
          onClick={() => setShowManage(!showManage)}
          className={`h-[36px] px-4 rounded-[8px] text-[10px] font-bold transition-all cursor-pointer border ${
            showManage
              ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
              : 'bg-white text-[#1a1a1a] border-black/[0.08] hover:border-black/[0.15]'
          }`}
          style={{ fontFamily: FONT }}
        >
          TP/SL
        </button>
        <button
          onClick={() => onClose(coin, pos.size, pos.isLong, pos.markPx)}
          disabled={isExecuting || isClosing}
          className={`flex-1 h-[36px] rounded-[8px] text-[11px] font-bold transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer ${
            pos.isLong ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-emerald-500 text-white hover:bg-emerald-600'
          }`}
          style={{ fontFamily: FONT }}
        >
          {isClosing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Closing...
            </span>
          ) : (
            `Close ${pos.isLong ? 'Long' : 'Short'}`
          )}
        </button>
      </div>
    </div>
  );
}

// ─── List Row ────────────────────────────────────────────────────────────────

function PositionRow({ pos, onClose, placeOrder, isExecuting, isClosing, tpSlOrders }: {
  pos: ReturnType<typeof useHLPositions>[number];
  onClose: (coin: string, size: number, isLong: boolean, markPx: number) => void;
  placeOrder: ReturnType<typeof useHLTrade>['placeOrder'];
  isExecuting: boolean;
  isClosing: boolean;
  tpSlOrders?: { tp?: FrontendOpenOrder; sl?: FrontendOpenOrder };
}) {
  const coin = pos.position.coin;
  const decimals = pos.entryPx >= 1000 ? 2 : pos.entryPx >= 1 ? 4 : 6;
  const isPnlPositive = pos.unrealizedPnl >= 0;
  const absSize = Math.abs(pos.size);
  const [showNote, setShowNote] = useState(false);
  const [showManage, setShowManage] = useState(false);

  return (
    <div className="bg-white rounded-[10px] border border-black/[0.06] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <CoinIcon symbol={coin} size={24} />

        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>{coin}/USDC</span>
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${pos.isLong ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`} style={{ fontFamily: FONT }}>
            {pos.isLong ? 'LONG' : 'SHORT'}
          </span>
          {pos.leverage && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-[#1a1a1a] text-white" style={{ fontFamily: FONT }}>{pos.leverage}x</span>
          )}
        </div>

        <span className="text-[10px] text-[#9ca3af] tabular-nums hidden sm:block" style={{ fontFamily: FONT }}>
          {absSize.toFixed(4)} @ ${formatPrice(pos.entryPx, decimals)}
        </span>

        <span className="text-[10px] text-[#9ca3af] tabular-nums hidden sm:block" style={{ fontFamily: FONT }}>
          Mark ${formatPrice(pos.markPx, decimals)}
        </span>

        {tpSlOrders?.tp?.triggerPx && (
          <span className="text-[9px] text-emerald-600 font-semibold tabular-nums hidden sm:block" style={{ fontFamily: FONT }}>
            TP ${formatPrice(parseFloat(tpSlOrders.tp.triggerPx), decimals)}
          </span>
        )}
        {tpSlOrders?.sl?.triggerPx && (
          <span className="text-[9px] text-rose-500 font-semibold tabular-nums hidden sm:block" style={{ fontFamily: FONT }}>
            SL ${formatPrice(parseFloat(tpSlOrders.sl.triggerPx), decimals)}
          </span>
        )}

        <div className="flex-1" />

        <span className={`text-[13px] font-bold tabular-nums ${isPnlPositive ? 'text-emerald-600' : 'text-rose-500'}`} style={{ fontFamily: FONT }}>
          {isPnlPositive ? '+' : '-'}${Math.abs(pos.unrealizedPnl).toFixed(2)}
          <span className="text-[9px] ml-1">({isPnlPositive ? '+' : '-'}{Math.abs(pos.pnlPct).toFixed(2)}%)</span>
        </span>

        <div onClick={e => e.stopPropagation()} className="scale-75 -mx-1">
          <PerpsShareButton data={buildPerpsShareData(pos)} />
        </div>

        <button
          onClick={() => { setShowManage(!showManage); if (showNote) setShowNote(false); }}
          className={`w-7 h-7 flex items-center justify-center rounded-[6px] border transition-colors cursor-pointer ${
            showManage ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-[#e5e7eb] text-[#9ca3af] hover:bg-[#f7f7f7]'
          }`}
          title="Set TP/SL"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 8h12M8 2v12" />
          </svg>
        </button>

        <button
          onClick={() => { setShowNote(!showNote); if (showManage) setShowManage(false); }}
          className={`w-7 h-7 flex items-center justify-center rounded-[6px] border transition-colors cursor-pointer ${
            showNote || getNote(coin) ? 'border-amber-300 bg-amber-50 text-amber-600' : 'border-[#e5e7eb] text-[#9ca3af] hover:bg-[#f7f7f7]'
          }`}
          title="Position note"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
          </svg>
        </button>

        <button
          onClick={() => onClose(coin, pos.size, pos.isLong, pos.markPx)}
          disabled={isExecuting || isClosing}
          className={`h-7 px-3 rounded-[6px] text-[9px] font-bold text-white transition-colors disabled:opacity-50 cursor-pointer ${
            pos.isLong ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-500 hover:bg-emerald-600'
          }`}
          style={{ fontFamily: FONT }}
        >
          {isClosing ? '...' : 'Close'}
        </button>
      </div>

      {showManage && (
        <div className="px-4 pb-2.5 border-t border-black/[0.04] pt-2">
          <TpSlPanel pos={pos} placeOrder={placeOrder} isExecuting={isExecuting} />
        </div>
      )}

      {showNote && (
        <div className="px-4 pb-2.5 border-t border-black/[0.04] pt-2">
          <NoteEditor coin={coin} />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PerpsPositions({ filterCoin }: { filterCoin?: string } = {}) {
  const allPositions = useHLPositions();
  const positions = filterCoin ? allPositions.filter((p) => p.position.coin === filterCoin) : allPositions;
  const { placeOrder, isExecuting } = useHLTrade();
  const tpSlByPosition = usePositionTpSl();
  const [closingCoin, setClosingCoin] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  const handleClose = async (coin: string, size: number, isLong: boolean, markPx: number) => {
    setClosingCoin(coin);
    try {
      const limitPx = isLong ? markPx * 0.995 : markPx * 1.005;
      await placeOrder({
        coin,
        isBuy: !isLong,
        sz: Math.abs(size),
        limitPx,
        orderType: { limit: { tif: 'Ioc' } },
        reduceOnly: true,
      });
      playCloseSound();
      const usdValue = Math.abs(size) * markPx;
      const dp = markPx >= 1000 ? 2 : markPx >= 1 ? 4 : 6;
      toast.success(`Closed ${isLong ? 'Long' : 'Short'} ${coin} · $${usdValue.toFixed(2)} at $${formatPrice(markPx, dp)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to close position';
      toast.error(msg);
    } finally {
      setClosingCoin(null);
    }
  };

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-12 h-12 rounded-full bg-[#f5f5f5] flex items-center justify-center mb-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round">
            <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
          </svg>
        </div>
        <span className="text-[13px] font-semibold text-[#1a1a1a] mb-1" style={{ fontFamily: FONT }}>No Open Positions</span>
        <span className="text-[11px] text-[#9ca3af]" style={{ fontFamily: FONT }}>Your perpetual positions will appear here</span>
      </div>
    );
  }

  const longs = positions.filter((p) => p.isLong);
  const shorts = positions.filter((p) => !p.isLong);

  const VIEW_MODES: { id: ViewMode; label: string; Icon: typeof CardIcon }[] = [
    { id: 'card', label: 'Cards', Icon: CardIcon },
    { id: 'list', label: 'List', Icon: ListIcon },
    { id: 'kanban', label: 'Board', Icon: KanbanIcon },
  ];

  return (
    <div className="space-y-3">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>Your Open Positions</span>
          <span className="text-[11px] text-[#9ca3af]" style={{ fontFamily: FONT }}>— active long & short trades</span>
        </div>
        <div className="flex items-center gap-0.5 bg-[#f5f5f5] rounded-[8px] p-0.5">
          {VIEW_MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-[6px] text-[9px] font-bold transition-all cursor-pointer ${
                viewMode === id ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#9ca3af] hover:text-[#666]'
              }`}
              style={{ fontFamily: FONT }}
              title={label}
            >
              <Icon active={viewMode === id} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Card view */}
      {viewMode === 'card' && (
        <div className="space-y-3">
          {positions.map((pos) => (
            <PositionCard
              key={pos.position.coin}
              pos={pos}
              onClose={handleClose}
              placeOrder={placeOrder}
              isExecuting={isExecuting}
              isClosing={closingCoin === pos.position.coin}
              tpSlOrders={tpSlByPosition[pos.position.coin]}
            />
          ))}
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="space-y-1.5">
          {positions.map((pos) => (
            <PositionRow
              key={pos.position.coin}
              pos={pos}
              onClose={handleClose}
              placeOrder={placeOrder}
              isExecuting={isExecuting}
              isClosing={closingCoin === pos.position.coin}
              tpSlOrders={tpSlByPosition[pos.position.coin]}
            />
          ))}
        </div>
      )}

      {/* Kanban view */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Longs column */}
          <div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider" style={{ fontFamily: FONT }}>
                Long ({longs.length})
              </span>
            </div>
            <div className="space-y-2">
              {longs.length === 0 ? (
                <div className="text-center py-8 text-[11px] text-[#9ca3af] bg-[#fafbfc] rounded-[10px] border border-dashed border-[#e5e7eb]" style={{ fontFamily: FONT }}>
                  No long positions
                </div>
              ) : longs.map((pos) => (
                <PositionCard
                  key={pos.position.coin}
                  pos={pos}
                  onClose={handleClose}
                  placeOrder={placeOrder}
                  isExecuting={isExecuting}
                  isClosing={closingCoin === pos.position.coin}
                  tpSlOrders={tpSlByPosition[pos.position.coin]}
                />
              ))}
            </div>
          </div>

          {/* Shorts column */}
          <div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-[11px] font-bold text-rose-500 uppercase tracking-wider" style={{ fontFamily: FONT }}>
                Short ({shorts.length})
              </span>
            </div>
            <div className="space-y-2">
              {shorts.length === 0 ? (
                <div className="text-center py-8 text-[11px] text-[#9ca3af] bg-[#fafbfc] rounded-[10px] border border-dashed border-[#e5e7eb]" style={{ fontFamily: FONT }}>
                  No short positions
                </div>
              ) : shorts.map((pos) => (
                <PositionCard
                  key={pos.position.coin}
                  pos={pos}
                  onClose={handleClose}
                  placeOrder={placeOrder}
                  isExecuting={isExecuting}
                  isClosing={closingCoin === pos.position.coin}
                  tpSlOrders={tpSlByPosition[pos.position.coin]}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
