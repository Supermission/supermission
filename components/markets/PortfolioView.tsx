'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSharedNow } from '@/lib/hooks/use-shared-now';

import Image from 'next/image';
import { useEmbeddedAddress } from '@/lib/hooks/use-embedded-address';
import { PnLShareButton } from '@/components/share/pnl-share-button';
import { motion, AnimatePresence } from 'framer-motion';
import { usePolymarketPositions, PolymarketPosition } from '@/lib/hooks/dashboard/usePolymarketPositions';
import { useLimitOrders, type OpenOrder } from '@/lib/hooks/use-limit-orders';
import { useSSEPrices } from '@/lib/hooks/use-sse-prices';
import type { LivePrices } from '@/lib/types/market';
import { useTradeHistory, type EnrichedTrade } from '@/lib/hooks/use-trade-history';
import { usePolymarketProfileStats } from '@/lib/hooks/use-polymarket-profile-stats';
import { PnlChart } from '@/components/markets/PnlChart';

const FONT = "var(--font-bricolage, 'Bricolage Grotesque', sans-serif)";

// ─── Notes persistence via localStorage ─────────────────────────────────────

function getMarketNote(conditionId: string): string {
  try { return localStorage.getItem(`market-note-${conditionId}`) || ''; } catch { return ''; }
}

function saveMarketNote(conditionId: string, note: string) {
  try {
    if (note) localStorage.setItem(`market-note-${conditionId}`, note);
    else localStorage.removeItem(`market-note-${conditionId}`);
  } catch { /* ignore */ }
}

function MarketNoteEditor({ conditionId }: { conditionId: string }) {
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => { setNote(getMarketNote(conditionId)); }, [conditionId]);

  const handleSave = () => {
    saveMarketNote(conditionId, note.trim());
    setEditing(false);
  };

  if (!editing && !note) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
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
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
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
    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
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
          onClick={() => { setNote(getMarketNote(conditionId)); setEditing(false); }}
          className="px-2 py-0.5 rounded-[4px] text-[#9ca3af] text-[9px] font-bold hover:text-[#666] cursor-pointer"
          style={{ fontFamily: FONT }}
        >
          Cancel
        </button>
        {note && (
          <button
            onClick={() => { setNote(''); saveMarketNote(conditionId, ''); setEditing(false); }}
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

const abbreviateOutcome = (label: string): string => {
  if (label.length <= 5) return label;
  const words = label.trim().split(/\s+/);
  if (words.length < 2) return label;
  return words.map(w => w[0]).join('').toUpperCase();
};

interface PortfolioViewProps {
  onSell?: (position: PolymarketPosition) => void;
  onRedeem?: (position: PolymarketPosition) => void;
  sellingConditionId?: string | null;
  redeemingConditionId?: string | null;
  onPositionCountChange?: (count: number) => void;
  onHookReady?: (hooks: {
    refetch: (addr: string) => Promise<void>;
    refreshHistory: () => void;
  }) => void;
  onMarketClick?: (conditionId: string) => void;
  onPricesUpdate?: (prices: Record<string, LivePrices>) => void;
}

function formatUsd(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function formatSignedUsd(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  return `${sign}${formatUsd(Math.abs(v))}`;
}

/* ── Inline icons ── */
function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M21 2V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12C3 7.02944 7.02944 3 12 3C15.3611 3 18.2625 4.94853 19.6167 7.7735" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 22V16H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12C21 16.9706 16.9706 21 12 21C8.63893 21 5.73754 19.0515 4.38327 16.2265" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={`animate-spin ${className || ''}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
    </svg>
  );
}

/* ── Resolution badge ── */
function getResolutionBadge(position: PolymarketPosition): { label: string; bg: string } | null {
  if (position.redeemable) return { label: 'REDEEMABLE', bg: 'bg-emerald-500' };
  if (position.endDate) {
    const diff = new Date(position.endDate).getTime() - Date.now();
    if (diff <= 0) return { label: 'RESOLVING', bg: 'bg-amber-500' };
    if (diff < 24 * 60 * 60 * 1000) return { label: 'ENDING SOON', bg: 'bg-orange-500' };
  }
  return null;
}


/* ── Countdown timer — Bricolage Grotesque, clean typography ── */
function CountdownClock({ endDate }: { endDate: string | null }) {
  const now = useSharedNow();
  if (!endDate) return null;
  const diff = new Date(endDate).getTime() - now;

  if (diff <= 0) return null; // handled by resolution badge

  const D = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  const isUrgent = diff < 3600000;    // < 1h
  const isSoon   = diff < 86400000;   // < 24h
  const numColor = isUrgent ? 'text-red-500' : isSoon ? 'text-amber-600' : 'portfolio-timer-num';
  const unitColor = isUrgent ? 'text-red-400' : isSoon ? 'text-amber-400' : 'portfolio-timer-unit';

  return (
    <span className="inline-flex items-baseline shrink-0" style={{ fontFamily: FONT }}>
      {D > 0 && (
        <>
          <span className={`text-[11px] font-extrabold tabular-nums ${numColor}`}>{D}</span>
          <span className={`text-[8px] font-semibold ${unitColor} mr-[3px]`}>d</span>
        </>
      )}
      <span className={`text-[11px] font-extrabold tabular-nums ${numColor}`}>{D > 0 ? pad(h) : h}</span>
      <span className={`text-[8px] font-semibold ${unitColor} mr-[3px]`}>h</span>
      <span className={`text-[11px] font-extrabold tabular-nums ${numColor}`}>{pad(m)}</span>
      <span className={`text-[8px] font-semibold ${unitColor} mr-[3px]`}>m</span>
      {D === 0 && (
        <>
          <span className={`text-[11px] font-extrabold tabular-nums ${numColor}`}>{pad(s)}</span>
          <span className={`text-[8px] font-semibold ${unitColor}`}>s</span>
        </>
      )}
    </span>
  );
}


/* ── Position Card — premium uniform design ── */
function PositionCard({ position, index, onSell, onRedeem, onMarketClick, isSelling, isRedeeming, isSyncing }: {
  position: PolymarketPosition;
  index: number;
  onSell?: (p: PolymarketPosition) => void;
  onRedeem?: (p: PolymarketPosition) => void;
  onMarketClick?: (conditionId: string) => void;
  isSelling?: boolean;
  isRedeeming?: boolean;
  isSyncing?: boolean;
}) {
  const isProfit = position.cashPnl >= 0;
  const curCents = Math.round(position.curPrice * 100);
  const bidPercent = Math.round(position.bidPrice * 100);
  const avgCostCents = Math.round(position.avgPrice * 100);
  const outcomeNorm = position.outcome?.toLowerCase();
  const isYes = outcomeNorm === 'yes';
  const isNo = outcomeNorm === 'no';
  const resolution = getResolutionBadge(position);

  return (
    <motion.div
      data-portfolio-position-card
      initial={{ opacity: 0, y: -20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 200, damping: 24 }}
      onClick={() => onMarketClick?.(position.conditionId)}
      className={`bg-white rounded-[14px] border border-black/[0.06] shadow-[0_0_4px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)] hover:border-black/[0.1] transition-all overflow-visible relative mt-3 ${onMarketClick ? 'cursor-pointer' : ''}`}
    >
      {/* Floating top-edge tag (like MarketCard AI Pick tags) */}
      {resolution && !isSyncing && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className={`inline-flex items-center gap-1 text-[8px] font-black px-3 py-1 rounded-full shadow-sm ${
            resolution.label === 'REDEEMABLE' ? 'bg-emerald-500 text-white' :
            resolution.label === 'ENDING SOON' ? 'bg-orange-500 text-white' :
            'bg-amber-500 text-white'
          }`}>
            <span className="h-1 w-1 rounded-full bg-white/60 animate-pulse" />
            {resolution.label === 'REDEEMABLE' ? 'Redeemable' : resolution.label === 'ENDING SOON' ? 'Ending Soon' : 'Resolving'}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="px-4 sm:px-5 pt-4 pb-0">
        <div className="flex items-start gap-3">
          {/* Market icon */}
          {position.icon ? (
            <Image src={position.icon} alt="" width={36} height={36} loading="lazy" className="w-9 h-9 rounded-[10px] object-cover flex-shrink-0 bg-[#f5f5f5]" />
          ) : (
            <div className="w-9 h-9 rounded-[10px] flex-shrink-0 flex items-center justify-center bg-[#f5f5f5] text-[11px] font-extrabold text-[#a3a3a3]" style={{ fontFamily: FONT }}>
              {abbreviateOutcome(position.outcome)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-bold leading-[1.35] text-[#1a1a1a] line-clamp-2 tracking-[-0.01em]" style={{ fontFamily: FONT }}>
              {position.title}
            </h3>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-[5px] tracking-[0.02em] ${
                isYes ? 'bg-emerald-50 text-emerald-600' : isNo ? 'bg-rose-50 text-rose-500' : 'bg-[#f5f5f5] text-[#1a1a1a]'
              }`} style={{ fontFamily: FONT }}>
                {abbreviateOutcome(position.outcome)}
              </span>
              {position.endDate && <CountdownClock endDate={position.endDate} />}
            </div>
          </div>
          <div onClick={e => e.stopPropagation()} className="flex-shrink-0 mt-0.5">
            <PnLShareButton position={position} />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-black/[0.04] mx-4 sm:mx-5 mt-3.5 portfolio-card-divider" />

      {/* Stats grid */}
      <div className="px-4 sm:px-5 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <div className="bg-[#fafbfc] rounded-[8px] px-3 py-2 portfolio-stat-box">
            <span className="text-[8px] font-bold text-[#b5b5b5] uppercase tracking-wider block mb-0.5 portfolio-stat-label" style={{ fontFamily: FONT }}>Current</span>
            <span className="text-[13px] font-bold text-[#1a1a1a] tabular-nums portfolio-stat-value" style={{ fontFamily: FONT }}>{curCents}¢</span>
          </div>
          <div className="bg-[#fafbfc] rounded-[8px] px-3 py-2 portfolio-stat-box">
            <span className="text-[8px] font-bold text-[#b5b5b5] uppercase tracking-wider block mb-0.5 portfolio-stat-label" style={{ fontFamily: FONT }}>Bought @</span>
            <span className="text-[13px] font-bold text-[#1a1a1a] tabular-nums portfolio-stat-value" style={{ fontFamily: FONT }}>{avgCostCents}¢</span>
          </div>
          <div className="bg-[#fafbfc] rounded-[8px] px-3 py-2 portfolio-stat-box">
            <span className="text-[8px] font-bold text-[#b5b5b5] uppercase tracking-wider block mb-0.5 portfolio-stat-label" style={{ fontFamily: FONT }}>Value</span>
            <span className="text-[13px] font-bold text-[#1a1a1a] tabular-nums portfolio-stat-value" style={{ fontFamily: FONT }}>{formatUsd(position.currentValue)}</span>
          </div>
          <div className={`rounded-[8px] px-3 py-2 ${isProfit ? 'bg-emerald-50/70' : 'bg-rose-50/70'}`}>
            <span className={`text-[8px] font-bold uppercase tracking-wider block mb-0.5 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`} style={{ fontFamily: FONT }}>P&L</span>
            <span className={`text-[13px] font-bold tabular-nums ${isProfit ? 'text-emerald-600' : 'text-rose-500'}`} style={{ fontFamily: FONT }}>
              {formatSignedUsd(position.cashPnl)}
            </span>
          </div>
        </div>
      </div>

      {/* Footer: shares + cost + action */}
      {(onSell || onRedeem) && (
        <div className="px-4 sm:px-5 pb-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-3 text-[10px] text-[#b5b5b5] portfolio-footer-text" style={{ fontFamily: FONT }}>
            <span>Shares: <strong className="text-[#666] font-semibold portfolio-footer-value">{parseFloat(position.size.toFixed(2))}</strong></span>
            <span>Cost: <strong className="text-[#666] font-semibold portfolio-footer-value">{formatUsd(position.avgPrice * position.size)}</strong></span>
          </div>
          {position.redeemable && position.currentValue > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); onRedeem?.(position); }}
              disabled={isRedeeming}
              aria-busy={isRedeeming}
              className={`group relative min-w-[150px] px-4 py-2 rounded-[8px] text-[11px] font-bold transition-all active:scale-[0.98] overflow-hidden ${
                isRedeeming
                  ? 'cursor-wait bg-emerald-600 text-white shadow-[0_6px_18px_rgba(16,185,129,0.22)]'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600 hover:shadow-[0_6px_18px_rgba(16,185,129,0.18)]'
              }`}
              style={{ fontFamily: FONT }}
            >
              {isRedeeming && (
                <motion.span
                  className="absolute inset-y-0 -left-1/2 w-1/2 skew-x-[-18deg] bg-white/30 blur-[1px]"
                  animate={{ x: ['0%', '320%'] }}
                  transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <span className="relative flex items-center justify-center gap-1.5 whitespace-nowrap">
                {isRedeeming ? (
                  <>
                    <SpinnerIcon className="text-white" />
                    Redeeming
                  </>
                ) : (
                  `Redeem ${formatUsd(position.currentValue)}`
                )}
              </span>
            </button>
          ) : position.redeemable ? (
            // Resolved market, but this outcome lost — nothing to claim.
            // Showing a "$0" Redeem button would only submit a reverting tx.
            <span
              className="min-w-[150px] px-4 py-2 rounded-[8px] text-[11px] font-semibold text-center text-[#9ca3af] bg-[#f3f4f6] whitespace-nowrap"
              style={{ fontFamily: FONT }}
            >
              No payout — outcome lost
            </span>
          ) : onSell ? (
            <button
              onClick={(e) => { e.stopPropagation(); onSell(position); }}
              disabled={isSelling}
              aria-busy={isSelling}
              className={`group relative min-w-[104px] px-4 py-2 rounded-[8px] text-[11px] font-bold transition-all active:scale-[0.98] overflow-hidden ${
                isSelling
                  ? 'cursor-wait bg-amber-500 text-[#1a1200] shadow-[0_6px_18px_rgba(245,158,11,0.22)]'
                  : 'bg-[#1a1a1a] text-white hover:bg-[#333] hover:shadow-[0_6px_18px_rgba(0,0,0,0.14)]'
              }`}
              style={{ fontFamily: FONT }}
            >
              {isSelling && (
                <motion.span
                  className="absolute inset-y-0 -left-1/2 w-1/2 skew-x-[-18deg] bg-white/35 blur-[1px]"
                  animate={{ x: ['0%', '320%'] }}
                  transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <span className="relative flex items-center justify-center gap-1.5 whitespace-nowrap">
                {isSelling ? (
                  <>
                    <SpinnerIcon className="text-[#1a1200]" />
                    Selling
                  </>
                ) : (
                  `Sell @ ${bidPercent}¢`
                )}
              </span>
            </button>
          ) : null}
        </div>
      )}
    </motion.div>
  );
}

/* ── Inline Orders Table (embedded in portfolio) ── */
function OrdersPanel({ orders, loading, onCancel, onCancelAll, onRefresh, onMarketClick }: {
  orders: OpenOrder[];
  loading: boolean;
  onCancel: (id: string) => void;
  onCancelAll: () => void;
  onRefresh: () => void;
  onMarketClick?: (conditionId: string) => void;
}) {
  const filledPct = (order: OpenOrder): number => {
    const orig = parseFloat(order.original_size) || 0;
    const matched = parseFloat(order.size_matched) || 0;
    if (orig <= 0) return 0;
    return Math.round((matched / orig) * 100);
  };

  const formatDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  if (orders.length === 0 && loading) {
    return (
      <div className="flex items-center justify-center py-8 text-[#9ca3af]">
        <span className="flex items-center gap-2 text-[11px] font-mono font-bold">
          <SpinnerIcon className="text-[#9ca3af]" />
          Loading orders...
        </span>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-[#9ca3af]">
        <p className="text-[11px] font-mono font-semibold">No open orders</p>
        <p className="text-[10px] text-[#b0b0b0] mt-0.5">Place a limit order from any market</p>
      </div>
    );
  }

  return (
    <div>
      {/* Actions row */}
      <div className="flex items-center justify-end gap-2 mb-3">
        <button
          onClick={onRefresh}
          disabled={loading}
          className="h-7 px-2.5 rounded-[6px] border border-[#e5e7eb] text-[10px] font-semibold text-[#6b7280] hover:bg-[#f7f7f7] transition-colors disabled:opacity-40 flex items-center gap-1"
        >
          <RefreshIcon className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        <button
          onClick={onCancelAll}
          disabled={loading}
          className="h-7 px-2.5 rounded-[6px] border border-rose-200 text-[10px] font-semibold text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-40"
        >
          Cancel All
        </button>
      </div>

      {/* Orders — desktop table / mobile cards */}
      <div className="border border-[#e5e7eb] rounded-[10px] overflow-hidden">
        {/* Desktop table header — hidden on mobile */}
        <div className="hidden sm:grid grid-cols-[50px_1fr_80px_70px_70px_60px_32px] gap-2 px-3 py-2 bg-[#fafafa] border-b border-[#e5e7eb]">
          <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider">Side</span>
          <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider">Market</span>
          <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider text-right">Price</span>
          <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider text-right">Shares</span>
          <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider text-right">Filled</span>
          <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider text-right">Date</span>
          <span />
        </div>

        {/* Order rows */}
        {orders.map((order) => {
          const pct = filledPct(order);
          const cost = (parseFloat(order.price) * parseFloat(order.original_size)).toFixed(2);
          return (
            <div
              key={order.id}
              onClick={() => onMarketClick?.(order.market || order.asset_id)}
              className={`border-b border-[#f0f0f0] last:border-b-0 hover:bg-[#fafafa] transition-colors ${onMarketClick ? 'cursor-pointer' : ''}`}
            >
              {/* Desktop row */}
              <div className="hidden sm:grid grid-cols-[50px_1fr_80px_70px_70px_60px_32px] gap-2 px-3 py-2.5 items-center">
                <span className={`text-[10px] font-mono font-bold ${
                  order.side === 'BUY' ? 'text-emerald-600' : 'text-rose-500'
                }`}>
                  {order.side}
                </span>
                <div className="min-w-0">
                  {order.outcome ? (
                    <span className="text-[10px] font-semibold text-black truncate block">
                      {order.outcome}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-[#9ca3af] truncate block">
                      {order.asset_id ? `${order.asset_id.slice(0, 6)}...${order.asset_id.slice(-4)}` : '-'}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-mono font-bold text-black tabular-nums">
                    {(parseFloat(order.price) * 100).toFixed(1)}c
                  </span>
                  <span className="text-[8px] font-mono text-[#9ca3af] ml-0.5">
                    (${cost})
                  </span>
                </div>
                <span className="text-[11px] font-mono text-[#6b7280] tabular-nums text-right">
                  {parseFloat(order.original_size).toFixed(1)}
                </span>
                <div className="flex items-center justify-end gap-1">
                  <div className="w-10 h-1.5 bg-[#e5e7eb] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct > 0 ? 'bg-emerald-400' : 'bg-[#e5e7eb]'}`}
                      style={{ width: `${Math.max(pct, 0)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-[#9ca3af] tabular-nums w-6 text-right">
                    {pct}%
                  </span>
                </div>
                <span className="text-[8px] font-mono text-[#9ca3af] text-right whitespace-nowrap">
                  {order.created_at ? formatDate(order.created_at) : '-'}
                </span>
                <div className="flex justify-end">
                  <button
                    onClick={(e) => { e.stopPropagation(); onCancel(order.id); }}
                    disabled={loading}
                    className="w-5 h-5 flex items-center justify-center rounded-[3px] text-[#9ca3af] hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-40"
                    title="Cancel order"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Mobile card — shown only on sm and below */}
              <div className="sm:hidden px-3 py-3 flex flex-col gap-2">
                {/* Row 1: side pill + market label + cancel */}
                <div className="flex items-start gap-2 min-w-0">
                  <span className={`text-[10px] font-mono font-bold shrink-0 px-1.5 py-0.5 rounded-[4px] ${
                    order.side === 'BUY' ? 'text-emerald-700 bg-emerald-50' : 'text-rose-600 bg-rose-50'
                  }`}>
                    {order.side}
                  </span>
                  <div className="flex-1 min-w-0">
                    {order.outcome ? (
                      <span className="text-[11px] font-semibold text-black line-clamp-2 leading-[1.3]">
                        {order.outcome}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-[#9ca3af] truncate block">
                        {order.asset_id ? `${order.asset_id.slice(0, 6)}...${order.asset_id.slice(-4)}` : '-'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onCancel(order.id); }}
                    disabled={loading}
                    className="shrink-0 w-5 h-5 flex items-center justify-center rounded-[3px] text-[#9ca3af] hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-40"
                    title="Cancel order"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                {/* Row 2: price + shares + filled bar + date */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <span className="text-[8px] font-bold text-[#b0b4ba] uppercase tracking-wider mr-1">Price</span>
                    <span className="text-[11px] font-mono font-bold text-black tabular-nums">
                      {(parseFloat(order.price) * 100).toFixed(1)}c
                    </span>
                    <span className="text-[8px] font-mono text-[#9ca3af] ml-0.5">(${cost})</span>
                  </div>
                  <div>
                    <span className="text-[8px] font-bold text-[#b0b4ba] uppercase tracking-wider mr-1">Qty</span>
                    <span className="text-[11px] font-mono text-[#6b7280] tabular-nums">
                      {parseFloat(order.original_size).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] font-bold text-[#b0b4ba] uppercase tracking-wider">Filled</span>
                    <div className="w-10 h-1.5 bg-[#e5e7eb] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct > 0 ? 'bg-emerald-400' : 'bg-[#e5e7eb]'}`}
                        style={{ width: `${Math.max(pct, 0)}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-[#9ca3af] tabular-nums">{pct}%</span>
                  </div>
                  {order.created_at && (
                    <span className="text-[8px] font-mono text-[#9ca3af] whitespace-nowrap">
                      {formatDate(order.created_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main PortfolioView ── */
export function PortfolioView({ onSell, onRedeem, sellingConditionId, redeemingConditionId, onPositionCountChange, onHookReady, onMarketClick, onPricesUpdate }: PortfolioViewProps) {
  const address = useEmbeddedAddress();
  const { positions: rawPositions, optimisticKeys, pnlStats, isLoading, error, refetch, addOptimisticBuy, markSold } = usePolymarketPositions();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Orders hook
  const { openOrders, cancelOrder, cancelAllOrders, loading: ordersLoading, refreshOrders } = useLimitOrders();

  // Trade history — for portfolio stats (total trades, volume) and recent activity
  const { stats: tradeStats, trades: recentTrades, refresh: refreshHistory, hasMore, loadMore, loadingMore, fetchAllTrades, addOptimisticTrade } = useTradeHistory(address ?? undefined);

  // Polymarket profile stats — P&L, positions value, biggest win, predictions (fetched directly from Polymarket)
  const { stats: profileStats, isLoading: profileStatsLoading } = usePolymarketProfileStats(address);

  // SSE live prices — subscribe to all position condition IDs
  const conditionIds = useMemo(
    () => rawPositions.map(p => p.conditionId).filter(Boolean),
    [rawPositions]
  );
  const { prices: livePrices } = useSSEPrices(conditionIds.length > 0 ? conditionIds : []);

  useEffect(() => {
    if (onPricesUpdate && Object.keys(livePrices).length > 0) {
      onPricesUpdate(livePrices);
    }
  }, [livePrices, onPricesUpdate]);

  // Merge live SSE prices into positions for real-time updates
  const positions = useMemo(() => {
    if (Object.keys(livePrices).length === 0) return rawPositions;
    return rawPositions.map(p => {
      const live = livePrices[p.conditionId];
      if (!live) return p;
      const livePrice = p.outcomeIndex === 0 ? live.yes : live.no;
      const liveBid = p.outcomeIndex === 0 ? (live.yesBid ?? live.yes) : (live.noBid ?? live.no);
      if (livePrice <= 0 || livePrice === p.curPrice) return p;
      const currentValue = p.size * livePrice;
      const cashPnl = currentValue - p.initialValue;
      const percentPnl = p.initialValue > 0 ? (cashPnl / p.initialValue) * 100 : 0;
      return { ...p, curPrice: livePrice, bidPrice: liveBid > 0 ? liveBid : livePrice, currentValue, cashPnl, percentPnl };
    });
  }, [rawPositions, livePrices]);

  // Initial fetch
  useEffect(() => {
    if (address) refetch(address);
  }, [address, refetch]);

  // Refresh positions when a trade completes (oracle agent or manual)
  // If the event carries detail (from Oracle), inject optimistic entries immediately
  useEffect(() => {
    const handler = (e: Event) => {
      if (!address) return;
      const detail = (e as CustomEvent).detail;
      if (detail?.side === 'BUY' && detail.conditionId) {
        // Optimistic position so it appears instantly in portfolio
        addOptimisticBuy({
          proxyWallet: address,
          asset: detail.tokenId,
          conditionId: detail.conditionId,
          size: detail.shares,
          avgPrice: detail.price,
          initialValue: detail.amount,
          currentValue: detail.amount,
          cashPnl: 0,
          percentPnl: 0,
          totalBought: detail.amount,
          realizedPnl: 0,
          percentRealizedPnl: 0,
          curPrice: detail.price,
          bidPrice: detail.price,
          redeemable: false,
          mergeable: false,
          title: detail.question || '',
          slug: detail.slug || '',
          icon: '',
          eventId: detail.eventId || '',
          eventSlug: '',
          outcome: detail.outcome,
          outcomeIndex: detail.outcomeIndex ?? (detail.outcome?.toLowerCase() === 'no' ? 1 : 0),
          oppositeOutcome: detail.oppositeOutcome ?? (detail.outcome?.toLowerCase() === 'no' ? 'Yes' : detail.outcome?.toLowerCase() === 'yes' ? 'No' : ''),
          oppositeAsset: '',
          endDate: detail.endDate || '',
          negativeRisk: false,
        });
        // Optimistic trade history entry
        addOptimisticTrade({
          id: `optimistic-buy-${Date.now()}`,
          condition_id: detail.conditionId,
          token_id: detail.tokenId,
          side: 'BUY',
          outcome: detail.outcome,
          amount: detail.amount,
          price: detail.price,
          shares: detail.shares,
          status: 'MATCHED',
          created_at: new Date().toISOString(),
          marketQuestion: detail.question || '',
          transactionHash: '',
          event_slug: '',
        });
      } else if (detail?.side === 'SELL' && detail.conditionId) {
        // Mark position as sold so it disappears instantly
        markSold(detail.conditionId);
        // Optimistic trade history entry for sell
        addOptimisticTrade({
          id: `optimistic-sell-${Date.now()}`,
          condition_id: detail.conditionId,
          token_id: detail.tokenId,
          side: 'SELL',
          outcome: detail.outcome,
          amount: detail.amount,
          price: detail.price,
          shares: detail.shares,
          status: 'MATCHED',
          created_at: new Date().toISOString(),
          marketQuestion: detail.question || '',
          transactionHash: '',
          event_slug: '',
        });
      }
      // Always refetch to get canonical data from API
      refetch(address);
    };
    window.addEventListener('trade-completed', handler);
    return () => window.removeEventListener('trade-completed', handler);
  }, [address, refetch, addOptimisticBuy, addOptimisticTrade, markSold]);

  // Expose refetch/refreshHistory to parent for delayed reconciliation
  useEffect(() => {
    onHookReady?.({ refetch, refreshHistory });
  }, [onHookReady, refetch, refreshHistory]);

  // Sync position count to navbar
  useEffect(() => {
    onPositionCountChange?.(positions.length);
  }, [positions.length, onPositionCountChange]);

  const handleRefresh = useCallback(async () => {
    if (!address || isRefreshing) return;
    setIsRefreshing(true);
    await refetch(address);
    setIsRefreshing(false);
  }, [address, refetch, isRefreshing]);

  // PnL period selector
  const [pnlPeriod, setPnlPeriod] = useState<'all' | 'day' | 'week' | 'month'>('all');

  // Summary stats
  const stats = useMemo(() => {
    if (positions.length === 0) return null;
    const totalValue = positions.reduce((s, p) => s + p.currentValue, 0);
    const totalPnl = positions.reduce((s, p) => s + p.cashPnl, 0);
    const totalInvested = positions.reduce((s, p) => s + p.initialValue, 0);
    const pnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
    const redeemable = positions.filter(p => p.redeemable).length;
    return { totalValue, totalPnl, pnlPercent, openPositions: positions.length, redeemable };
  }, [positions]);

  // Sort: redeemable first, then by endDate ascending (ending soonest first)
  // This is stable — cards don't jump around when live prices change
  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      if (a.redeemable && !b.redeemable) return -1;
      if (!a.redeemable && b.redeemable) return 1;
      // Ending soonest first; no endDate = pushed to end
      const aEnd = a.endDate ? new Date(a.endDate).getTime() : Infinity;
      const bEnd = b.endDate ? new Date(b.endDate).getTime() : Infinity;
      return aEnd - bEnd;
    });
  }, [positions]);

  if (!address) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-[#f8fafc] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-black/20">
              <path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="18" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <p className="text-sm font-bold text-black/55 mb-1">Connect wallet to view portfolio</p>
          <p className="text-[11px] text-[#9ca3af]">Your Polymarket positions will appear here</p>
        </div>
      </motion.div>
    );
  }

  if (isLoading && positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-[#e5e7eb] border-t-[#1a1a1a] animate-spin" />
        <span className="text-[12px] font-semibold text-[#b5b5b5] tracking-[-0.01em]" style={{ fontFamily: FONT }}>
          Loading your positions
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm font-bold text-rose-500">Failed to load positions</p>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-mono font-bold border border-[#e5e7eb] text-[#6b7280] hover:border-black/40 hover:text-black transition-colors rounded-[8px]"
        >
          <RefreshIcon /> Retry
        </button>
      </motion.div>
    );
  }

  if (positions.length === 0 && tradeStats.totalTrades === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-[#f8fafc] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-black/20">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm font-bold text-black/55 mb-1">No open positions</p>
          <p className="text-[11px] text-[#9ca3af]">Browse markets and place your first trade</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* ── Portfolio Dashboard ── */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-3"
        >
          {/* Portfolio summary — P&L chart card */}
          {(() => {
            const displayPnl = profileStats.pnl[pnlPeriod] ?? 0;
            const isPositive = displayPnl >= 0;
            return (
              <div
                data-portfolio-panel
                className="rounded-[16px] overflow-hidden bg-white border border-[#f1f3f4]"
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)' }}
              >
                <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-2">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">Portfolio P&amp;L</span>
                        <button
                          onClick={handleRefresh}
                          disabled={isRefreshing}
                          className="text-[#b0b4ba] hover:text-[#6b7280] transition-colors"
                        >
                          {isRefreshing ? <SpinnerIcon className="text-[#9ca3af]" /> : <RefreshIcon className="text-[#b0b4ba]" />}
                        </button>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-[28px] sm:text-[32px] font-bold tabular-nums tracking-tight leading-none ${isPositive ? 'text-emerald-600' : 'text-rose-500'}`}
                          style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                        >
                          {profileStatsLoading ? '...' : formatSignedUsd(displayPnl)}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                          {pnlPeriod === 'all' ? 'all-time' : pnlPeriod === 'day' ? '24h' : pnlPeriod === 'week' ? '7d' : '30d'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#6b7280] mt-1.5 tabular-nums">
                        Positions worth <span className="font-semibold text-[#111]">{formatUsd(stats.totalValue)}</span>
                      </div>
                    </div>

                    {/* Period pills — segmented control */}
                    <div className="inline-flex items-center rounded-[10px] bg-[#f5f6f7] p-0.5">
                      {(['all', 'day', 'week', 'month'] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setPnlPeriod(p)}
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-[8px] transition-colors ${
                            pnlPeriod === p
                              ? 'bg-white text-[#111] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                              : 'text-[#9ca3af] hover:text-[#6b7280]'
                          }`}
                        >
                          {p === 'all' ? 'ALL' : p === 'day' ? '1D' : p === 'week' ? '1W' : '1M'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <PnlChart
                    series={profileStats.pnlSeries}
                    period={pnlPeriod}
                    isPositive={isPositive}
                  />
                </div>

                {/* Stats strip — Polymarket profile stats */}
                <div className="grid grid-cols-4 bg-white border-t border-[#f1f3f4]">
                  <div className="px-3 py-3 text-center border-r border-b sm:border-b-0 border-[#f1f3f4]">
                    <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-1">POSITIONS VALUE</span>
                    <span
                      className="text-[14px] sm:text-[16px] font-bold text-[#111] tabular-nums block"
                      style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                    >
                      {profileStatsLoading ? '...' : profileStats.positionsValue >= 1000 ? `$${(profileStats.positionsValue / 1000).toFixed(1)}K` : `$${profileStats.positionsValue.toFixed(0)}`}
                    </span>
                  </div>

                  <div className="px-3 py-3 text-center border-r border-b sm:border-b-0 border-[#f1f3f4]">
                    <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-1">BIGGEST WIN</span>
                    <span
                      className="text-[14px] sm:text-[16px] font-bold text-[#111] tabular-nums block"
                      style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                    >
                      {profileStatsLoading ? '...' : profileStats.biggestWin ? formatUsd(profileStats.biggestWin.amount) : '—'}
                    </span>
                  </div>

                  <div className="px-3 py-3 text-center border-r border-[#f1f3f4]">
                    <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-1">MARKETS</span>
                    <span
                      className="text-[14px] sm:text-[16px] font-bold text-[#111] tabular-nums block"
                      style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                    >
                      {profileStatsLoading ? '...' : profileStats.predictions}
                    </span>
                  </div>

                  <div className="px-3 py-3 text-center">
                    <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-1">TRADES</span>
                    <span
                      className="text-[14px] sm:text-[16px] font-bold text-[#111] tabular-nums block"
                      style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                    >
                      {tradeStats.totalTrades}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Open Orders — always visible when orders exist */}
          {openOrders.length > 0 && (
            <div
              data-portfolio-panel
              className="rounded-[16px] bg-white border border-[#e5e7eb] overflow-hidden"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)' }}
            >
              <div className="px-5 py-3 border-b border-[#f1f3f4] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[13px] font-semibold text-[#111]"
                    style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                  >
                    Open Orders
                  </span>
                  <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full tabular-nums">
                    {openOrders.length}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <OrdersPanel
                  orders={openOrders}
                  loading={ordersLoading}
                  onCancel={cancelOrder}
                  onCancelAll={cancelAllOrders}
                  onRefresh={refreshOrders}
                  onMarketClick={onMarketClick}
                />
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* No positions but has history — show empty positions message */}
      {!stats && tradeStats.totalTrades > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-3"
        >
          {/* Portfolio summary using trade history stats */}
          {(() => {
            const displayPnl = profileStats.pnl[pnlPeriod] ?? 0;
            const isPositive = displayPnl >= 0;
            return (
          <div
            data-portfolio-panel
            className="rounded-[16px] overflow-hidden bg-white border border-[#f1f3f4]"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)' }}
          >
            <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-2">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">Portfolio P&amp;L</span>
                    <button
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      className="text-[#b0b4ba] hover:text-[#6b7280] transition-colors"
                    >
                      {isRefreshing ? <SpinnerIcon className="text-[#9ca3af]" /> : <RefreshIcon className="text-[#b0b4ba]" />}
                    </button>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-[28px] sm:text-[32px] font-bold tabular-nums tracking-tight leading-none ${isPositive ? 'text-emerald-600' : 'text-rose-500'}`}
                      style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                    >
                      {profileStatsLoading ? '...' : formatSignedUsd(displayPnl)}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                      {pnlPeriod === 'all' ? 'all-time' : pnlPeriod === 'day' ? '24h' : pnlPeriod === 'week' ? '7d' : '30d'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#6b7280] mt-1.5 tabular-nums">
                    No active positions
                  </div>
                </div>

                <div className="inline-flex items-center rounded-[10px] bg-[#f5f6f7] p-0.5">
                  {(['all', 'day', 'week', 'month'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPnlPeriod(p)}
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-[8px] transition-colors ${
                        pnlPeriod === p
                          ? 'bg-white text-[#111] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                          : 'text-[#9ca3af] hover:text-[#6b7280]'
                      }`}
                    >
                      {p === 'all' ? 'ALL' : p === 'day' ? '1D' : p === 'week' ? '1W' : '1M'}
                    </button>
                  ))}
                </div>
              </div>

              <PnlChart
                series={profileStats.pnlSeries}
                period={pnlPeriod}
                isPositive={isPositive}
              />
            </div>

            {/* Stats strip — Polymarket profile stats */}
            <div className="grid grid-cols-4 bg-white border-t border-[#f1f3f4]">
              <div className="px-3 py-3 text-center border-r border-b sm:border-b-0 border-[#f1f3f4]">
                <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-1">POSITIONS VALUE</span>
                <span
                  className="text-[16px] font-bold text-[#111] tabular-nums block"
                  style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                >
                  {profileStatsLoading ? '...' : profileStats.positionsValue >= 1000 ? `$${(profileStats.positionsValue / 1000).toFixed(1)}K` : `$${profileStats.positionsValue.toFixed(0)}`}
                </span>
              </div>
              <div className="px-3 py-3 text-center border-r border-b sm:border-b-0 border-[#f1f3f4]">
                <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-1">BIGGEST WIN</span>
                <span
                  className="text-[16px] font-bold text-[#111] tabular-nums block"
                  style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                >
                  {profileStatsLoading ? '...' : profileStats.biggestWin ? formatUsd(profileStats.biggestWin.amount) : '—'}
                </span>
              </div>
              <div className="px-3 py-3 text-center border-r border-[#f1f3f4]">
                <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-1">MARKETS</span>
                <span
                  className="text-[16px] font-bold text-[#111] tabular-nums block"
                  style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                >
                  {profileStatsLoading ? '...' : profileStats.predictions}
                </span>
              </div>
              <div className="px-3 py-3 text-center">
                <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-1">TRADES</span>
                <span
                  className="text-[16px] font-bold text-[#111] tabular-nums block"
                  style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                >
                  {tradeStats.totalTrades}
                </span>
              </div>
            </div>
          </div>
            );
          })()}

          {/* No open positions message */}
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <p className="text-sm font-bold text-black/55 mb-1">No open positions</p>
              <p className="text-[11px] text-[#9ca3af]">All positions have been closed or resolved</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Position grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <AnimatePresence>
          {sortedPositions.map((position, i) => (
            <PositionCard
              key={`${position.conditionId}-${position.outcome}`}
              position={position}
              index={i}
              onSell={onSell}
              onRedeem={onRedeem}
              onMarketClick={onMarketClick}
              isSelling={sellingConditionId === position.conditionId}
              isRedeeming={redeemingConditionId === position.conditionId}
              isSyncing={optimisticKeys.has(`${position.conditionId}:${position.outcome}`)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Trade History — fully merged into portfolio */}
      {recentTrades.length > 0 && (
        <div
          data-portfolio-panel
          className="rounded-[16px] bg-white border border-[#e5e7eb] overflow-hidden"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)' }}
        >
          <div className="px-4 py-3 portfolio-trade-header-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="text-[13px] font-semibold text-[#111]"
                style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
              >
                Trade History
              </span>
              <span className="text-[10px] font-bold text-[#9ca3af] tabular-nums">
                {tradeStats.totalTrades} trades
              </span>
            </div>
            <button
              onClick={async () => {
                const allTrades = await fetchAllTrades();
                if (allTrades.length === 0) return;
                const headers = ['Date', 'Market', 'Side', 'Outcome', 'Price', 'Shares', 'Amount', 'Tx Hash'];
                const escapeCSV = (v: string) => v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
                const rows = allTrades.map((t) => [
                  escapeCSV(t.created_at),
                  escapeCSV(t.marketQuestion || t.condition_id),
                  t.side, t.outcome,
                  t.price.toFixed(4), t.shares.toFixed(4), t.amount.toFixed(2),
                  t.transactionHash,
                ]);
                const csv = [headers.join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `trades_${address?.slice(0, 8) || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
                link.click();
                URL.revokeObjectURL(url);
              }}
              className="portfolio-export-csv-btn text-[10px] font-bold text-[#9ca3af] hover:text-[#111] transition-all px-2.5 py-1 border border-[#e5e7eb] rounded-[8px] hover:border-[#9ca3af]"
            >
              EXPORT CSV
            </button>
          </div>

          {/* Desktop table header */}
          <div className="hidden sm:grid grid-cols-[140px_1fr_90px_90px_90px_80px] gap-3 px-4 py-2 bg-[#fafafa] portfolio-trade-header-border">
            <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider">Action</span>
            <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider">Market</span>
            <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider text-right">Shares</span>
            <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider text-right">@ Price</span>
            <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider text-right">Amount</span>
            <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider text-right">Date</span>
          </div>

          {/* Scrollable trade list */}
          <div className="max-h-[420px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden portfolio-trade-rows">
            {recentTrades.map((trade) => {
              const isBuy = trade.side === 'BUY';
              const isSell = trade.side === 'SELL';
              const isRedeem = trade.side === 'REDEEM';
              const date = new Date(trade.created_at);
              const dateStr = isNaN(date.getTime()) ? '--' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const timeStr = isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
              const priceInCents = Math.round(trade.price * 100);
              const sharesStr = trade.shares > 0 ? trade.shares.toFixed(1) : '--';
              const outcomeUp = trade.outcome ? trade.outcome.toUpperCase() : '';

              // Cash flow: negative for buys, positive for sells/redeems
              const signedAmount = formatSignedUsd(isBuy ? -Math.abs(trade.amount) : trade.amount);

              const marketLabel = trade.marketQuestion || (trade.outcome ? `${trade.outcome} position` : trade.condition_id.slice(0, 14) + '…');

              return (
                <div key={trade.id}>
                  {/* ── Desktop row ── */}
                  <div className="portfolio-trade-row-hover hidden sm:grid grid-cols-[140px_1fr_90px_90px_90px_80px] gap-3 px-4 py-3 items-center hover:bg-[#fafbfc] transition-all portfolio-trade-row last:border-0">
                    {/* Action */}
                    <div className="flex items-center gap-2">
                       <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isBuy ? 'bg-emerald-100 text-emerald-600' : isRedeem ? 'bg-purple-100 text-purple-600' : 'bg-rose-100 text-rose-600'}`}>
                         {isBuy ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
                         ) : isRedeem ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>
                         ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                         )}
                       </div>
                       <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-[#111] leading-tight">{isBuy ? 'Bought' : isRedeem ? 'Redeemed' : 'Sold'}</span>
                          {outcomeUp && <span className={`text-[10px] font-bold ${outcomeUp === 'YES' ? 'text-emerald-600' : outcomeUp === 'NO' ? 'text-rose-500' : 'text-[#6b7280]'} leading-tight`}>{outcomeUp}</span>}
                       </div>
                    </div>
                    {/* Market */}
                    <span
                      className="text-[12px] font-medium text-[#374151] line-clamp-2 leading-snug"
                    >
                      {marketLabel}
                    </span>
                    {/* Shares */}
                    <div className="flex flex-col items-end">
                       <span className="text-[12px] font-mono font-semibold text-[#111] tabular-nums">{sharesStr}</span>
                       <span className="text-[8px] font-bold text-[#9ca3af] uppercase">Shares</span>
                    </div>
                    {/* Price */}
                    <div className="flex flex-col items-end">
                       <span className="text-[12px] font-mono font-semibold text-[#111] tabular-nums">
                         {priceInCents > 0 ? `${priceInCents}¢` : isRedeem ? '0¢' : '--'}
                       </span>
                       <span className="text-[8px] font-bold text-[#9ca3af] uppercase">Price</span>
                    </div>
                    {/* Amount */}
                    <span
                      className={`text-[14px] font-bold tabular-nums text-right ${isBuy ? 'text-[#111]' : 'text-emerald-600'}`}
                      style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                    >
                      {signedAmount}
                    </span>
                    {/* Date */}
                    <div className="text-right">
                      <span className="text-[10px] font-medium text-[#6b7280] block">{dateStr}</span>
                      <span className="text-[9px] font-medium text-[#9ca3af] block">{timeStr}</span>
                    </div>
                  </div>

                  {/* ── Mobile card ── */}
                  <div className="sm:hidden px-4 py-3 hover:bg-[#fafbfc] transition-colors border-b border-[#f5f5f5] last:border-0 relative">
                    <div className="flex justify-between items-start mb-2.5">
                       <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isBuy ? 'bg-emerald-100 text-emerald-600' : isRedeem ? 'bg-purple-100 text-purple-600' : 'bg-rose-100 text-rose-600'}`}>
                             {isBuy ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
                             ) : isRedeem ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>
                             ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                             )}
                          </div>
                          <div>
                             <div className="text-[13px] font-bold text-[#111] leading-[1.2]">
                                {isBuy ? 'Bought' : isRedeem ? 'Redeemed' : 'Sold'} {outcomeUp && <span className={`${outcomeUp === 'YES' ? 'text-emerald-600' : outcomeUp === 'NO' ? 'text-rose-500' : 'text-[#6b7280]'}`}>{outcomeUp}</span>}
                             </div>
                             <div className="text-[11px] font-medium text-[#6b7280] mt-0.5">
                                {sharesStr !== '--' && `${sharesStr} shares`} {(priceInCents > 0 || isRedeem) && `@ ${priceInCents}¢`}
                             </div>
                          </div>
                       </div>
                       <div className="text-right">
                          <div className={`text-[14px] font-bold tabular-nums ${isBuy ? 'text-[#111]' : 'text-emerald-600'}`} style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                             {signedAmount}
                          </div>
                          <div className="text-[10px] font-medium text-[#9ca3af] mt-0.5">{dateStr} {timeStr}</div>
                       </div>
                    </div>
                    <div className="text-[12px] font-medium text-[#374151] line-clamp-2 leading-snug bg-[#f8fafc] p-2.5 rounded-[8px] border border-[#f1f5f9]">
                       {marketLabel}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center py-3">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-[11px] font-semibold text-[#6b7280] hover:text-[#111] transition-colors px-4 py-1.5 border border-[#e5e7eb] rounded-[8px] hover:border-[#9ca3af] disabled:opacity-40"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-1.5">
                      <SpinnerIcon className="text-[#9ca3af]" />
                      Loading...
                    </span>
                  ) : (
                    `Load More (${recentTrades.length} of ${tradeStats.totalTrades})`
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
