// components/dashboard/activity/TradeRow.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import type { UnifiedTrade } from '@/lib/types/trading-activity';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

const SOURCE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  polymarket: { bg: 'bg-purple-50', text: 'text-purple-600', label: 'Markets' },
  hyperliquid: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Perps' },
  defi: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Swap' },
  agent: { bg: 'bg-cyan-50', text: 'text-cyan-600', label: 'Agent' },
};

const SIDE_COLORS: Record<string, { bg: string; text: string }> = {
  BUY: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  SELL: { bg: 'bg-rose-50', text: 'text-rose-500' },
  LONG: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  SHORT: { bg: 'bg-rose-50', text: 'text-rose-500' },
  CLOSE: { bg: 'bg-slate-50', text: 'text-slate-600' },
  REDEEM: { bg: 'bg-purple-50', text: 'text-purple-600' },
  SWAP: { bg: 'bg-amber-50', text: 'text-amber-600' },
};

function formatDate(ts: number): string {
  if (!ts) return '--';
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

interface TradeRowProps {
  trade: UnifiedTrade;
  mode: 'list' | 'card';
}

export function TradeRow({ trade, mode }: TradeRowProps) {
  const [expanded, setExpanded] = useState(false);
  const src = SOURCE_COLORS[trade.source] || SOURCE_COLORS.polymarket;
  const side = SIDE_COLORS[trade.side] || SIDE_COLORS.BUY;
  const hasPnl = trade.pnl !== null && trade.pnl !== 0;
  const pnlPositive = (trade.pnl ?? 0) > 0;

  if (mode === 'card') {
    return (
      <div
        className="bg-white rounded-[14px] border border-black/[0.06] overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-shadow cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Side banner */}
        <div className={`flex items-center justify-between px-3 py-1.5 ${
          trade.side === 'BUY' || trade.side === 'LONG' ? 'bg-emerald-500'
          : trade.side === 'SELL' || trade.side === 'SHORT' ? 'bg-rose-500'
          : trade.side === 'REDEEM' ? 'bg-purple-500'
          : 'bg-amber-500'
        }`}>
          <span className="text-[9px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: FONT }}>{trade.side}</span>
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-white/20 text-white`} style={{ fontFamily: FONT }}>{src.label}</span>
        </div>

        <div className="px-3.5 py-3">
          {/* Title + date */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              {trade.agentName && (
                <span className="inline-flex items-center gap-1 text-[8px] font-bold text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded-md mb-1 mr-1">{trade.agentName}</span>
              )}
              <p className="text-[13px] font-semibold text-[#1a1a1a] leading-tight" style={{ fontFamily: FONT }}>{trade.title}</p>
              <p className="text-[10px] text-[#9ca3af] mt-0.5 truncate" style={{ fontFamily: FONT }}>{trade.subtitle}</p>
            </div>
            <span className="text-[9px] text-[#9ca3af] whitespace-nowrap flex-shrink-0" style={{ fontFamily: FONT }}>{formatDate(trade.timestamp)}</span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-[#f8f9fa] rounded-[6px] px-2 py-1.5 text-center">
              <span className="text-[7px] font-bold text-[#9ca3af] uppercase block">Amount</span>
              <span className="text-[12px] font-bold text-[#1a1a1a] tabular-nums block" style={{ fontFamily: FONT }}>
                ${Math.abs(trade.amount).toFixed(2)}
              </span>
            </div>
            {trade.size !== null && (
              <div className="bg-[#f8f9fa] rounded-[6px] px-2 py-1.5 text-center">
                <span className="text-[7px] font-bold text-[#9ca3af] uppercase block">Size</span>
                <span className="text-[12px] font-bold text-[#1a1a1a] tabular-nums block" style={{ fontFamily: FONT }}>
                  {trade.size.toFixed(trade.source === 'polymarket' ? 1 : 4)}
                </span>
              </div>
            )}
            {hasPnl && (
              <div className={`rounded-[6px] px-2 py-1.5 text-center ${pnlPositive ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                <span className={`text-[7px] font-bold uppercase block ${pnlPositive ? 'text-emerald-600' : 'text-rose-500'}`}>P&L</span>
                <span className={`text-[12px] font-bold tabular-nums block ${pnlPositive ? 'text-emerald-700' : 'text-rose-600'}`} style={{ fontFamily: FONT }}>
                  {pnlPositive ? '+' : ''}${trade.pnl!.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- List mode ---

  return (
    <div>
      <button
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[#fafbfc] transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Side badge */}
        <span className={`text-[8px] font-bold uppercase tracking-wider w-12 text-center py-1 rounded-md flex-shrink-0 ${side.bg} ${side.text}`} style={{ fontFamily: FONT }}>
          {trade.side}
        </span>

        {/* Source badge */}
        <span className={`text-[8px] font-bold w-12 text-center py-1 rounded-md flex-shrink-0 ${src.bg} ${src.text}`} style={{ fontFamily: FONT }}>
          {src.label}
        </span>

        {/* Agent badge */}
        {trade.agentName && (
          <span className="text-[7px] font-bold text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded-md flex-shrink-0">{trade.agentName}</span>
        )}

        {/* Title + subtitle */}
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-semibold text-[#1a1a1a] block truncate" style={{ fontFamily: FONT }}>{trade.title}</span>
          <span className="text-[9px] text-[#9ca3af] block truncate">{trade.subtitle}</span>
        </div>

        {/* Amount + P&L */}
        <div className="text-right flex-shrink-0">
          <span className={`text-[12px] font-bold tabular-nums block ${
            hasPnl ? (pnlPositive ? 'text-emerald-600' : 'text-rose-500') : 'text-[#1a1a1a]'
          }`} style={{ fontFamily: FONT }}>
            {hasPnl ? `${pnlPositive ? '+' : ''}$${trade.pnl!.toFixed(2)}` : `$${Math.abs(trade.amount).toFixed(2)}`}
          </span>
          <span className="text-[9px] text-[#9ca3af] tabular-nums block">{formatDate(trade.timestamp)}</span>
        </div>

        {/* Expand chevron */}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round"
          className={`flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 ml-[6.5rem] border-l-2 border-[#f0f0f0]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]" style={{ fontFamily: FONT }}>
                {trade.price !== null && (
                  <div><span className="text-[#9ca3af] font-medium block">Price</span><span className="font-bold text-[#1a1a1a] tabular-nums">{trade.source === 'polymarket' ? `${Math.round(trade.price * 100)}\u00a2` : `$${trade.price.toFixed(2)}`}</span></div>
                )}
                {trade.size !== null && (
                  <div><span className="text-[#9ca3af] font-medium block">Size</span><span className="font-bold text-[#1a1a1a] tabular-nums">{trade.size.toFixed(4)}</span></div>
                )}
                {trade.leverage !== null && (
                  <div><span className="text-[#9ca3af] font-medium block">Leverage</span><span className="font-bold text-[#1a1a1a]">{trade.leverage}x</span></div>
                )}
                {trade.entryPrice !== null && (
                  <div><span className="text-[#9ca3af] font-medium block">Entry</span><span className="font-bold text-[#1a1a1a] tabular-nums">${trade.entryPrice.toFixed(2)}</span></div>
                )}
                {trade.exitPrice !== null && (
                  <div><span className="text-[#9ca3af] font-medium block">Exit</span><span className="font-bold text-[#1a1a1a] tabular-nums">${trade.exitPrice.toFixed(2)}</span></div>
                )}
                {trade.liquidationPrice !== null && (
                  <div><span className="text-[#9ca3af] font-medium block">Liq. Price</span><span className="font-bold text-rose-500 tabular-nums">${trade.liquidationPrice.toFixed(2)}</span></div>
                )}
                {trade.tokenIn && trade.tokenOut && (
                  <div><span className="text-[#9ca3af] font-medium block">Route</span><span className="font-bold text-[#1a1a1a]">{trade.tokenIn} &rarr; {trade.tokenOut}</span></div>
                )}
                <div><span className="text-[#9ca3af] font-medium block">Amount</span><span className="font-bold text-[#1a1a1a] tabular-nums">${Math.abs(trade.amount).toFixed(2)}</span></div>
              </div>

              {/* View Market link */}
              {trade.marketUrl && (
                <Link
                  href={trade.marketUrl}
                  className="inline-flex items-center gap-1 mt-2 text-[9px] font-bold text-[#1a1a1a] hover:underline"
                  style={{ fontFamily: FONT }}
                  onClick={(e) => e.stopPropagation()}
                >
                  View Market
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
