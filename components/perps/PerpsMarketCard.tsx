'use client';

import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type { MarketData } from '@/lib/hyperliquid/types';
import {
  formatPrice,
  formatVolume,
  formatOI,
  formatFundingRate,
  timeToNextFunding,
  pctChange,
} from '@/lib/hyperliquid/utils';
import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { useHLTrade } from '@/lib/hyperliquid/hooks';
import { playOrderSound } from './PerpsTradePanel';
import { toast } from 'sonner';
import { CoinIcon } from './CoinIcon';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

const AMOUNT_PRESETS = [1, 5, 10, 25, 50, 100];

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin w-3 h-3 ${className || ''}`} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
    </svg>
  );
}

interface PerpsMarketCardProps {
  market: MarketData;
  index?: number;
  activeCardId?: string | null;
  onActivate?: (id: string | null) => void;
  compact?: boolean;
}

export const PerpsMarketCard = memo(function PerpsMarketCard({ market, index = 0, activeCardId, onActivate, compact = false }: PerpsMarketCardProps) {
  const router = useRouter();

  const midPx = parseFloat(market.midPx);
  const prevPx = parseFloat(market.prevDayPx);
  const change = pctChange(midPx, prevPx);
  const isPositive = change >= 0;

  const volume = parseFloat(market.dayNtlVlm);
  const oi = parseFloat(market.openInterest) * parseFloat(market.markPx);
  const fundingNum = parseFloat(market.funding);
  const isFundingPositive = fundingNum >= 0;

  const [countdown, setCountdown] = useState(timeToNextFunding());
  useEffect(() => {
    const iv = setInterval(() => setCountdown(timeToNextFunding()), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Price flash: track previous price, flash green/red on change
  const prevMidRef = useRef(midPx);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (prevMidRef.current !== midPx && prevMidRef.current > 0) {
      setFlash(midPx > prevMidRef.current ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 600);
      prevMidRef.current = midPx;
      return () => clearTimeout(t);
    }
    prevMidRef.current = midPx;
  }, [midPx]);

  // Inline trade state
  const [selectedSide, setSelectedSide] = useState<'long' | 'short' | null>(null);
  const [selectedLeverage, setSelectedLeverage] = useState(1);
  const [customAmount, setCustomAmount] = useState('');
  const [pendingTrade, setPendingTrade] = useState<{ amount: number; side: 'long' | 'short' } | null>(null);
  const [isEditingLeverage, setIsEditingLeverage] = useState(false);
  const [leverageEditValue, setLeverageEditValue] = useState('');
  const [tradeSuccess, setTradeSuccess] = useState<{ side: 'long' | 'short'; coin: string; amount: number } | null>(null);
  const { placeOrder, isExecuting } = useHLTrade();

  // Close when another card activates
  useEffect(() => {
    if (activeCardId && activeCardId !== market.coin) {
      setSelectedSide(null);
      setCustomAmount('');
      setPendingTrade(null);
    }
  }, [activeCardId, market.coin]);

  const decimals = midPx >= 1000 ? 2 : midPx >= 1 ? 4 : 6;
  const category = market.category || '';
  const isLong = selectedSide === 'long';
  const isSpot = market.marketType === 'spot';

  const handleSideClick = useCallback((e: React.MouseEvent, side: 'long' | 'short') => {
    e.stopPropagation();
    if (isExecuting) return;
    setSelectedSide(side);
    setCustomAmount('');
    setPendingTrade(null);
    onActivate?.(market.coin);
  }, [isExecuting, onActivate, market.coin]);

  const handleCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSide(null);
    setCustomAmount('');
    setPendingTrade(null);
    onActivate?.(null);
  }, [onActivate]);

  const handleAmountSelect = useCallback((e: React.MouseEvent, amount: number) => {
    e.stopPropagation();
    if (!selectedSide || isExecuting) return;
    setPendingTrade({ amount, side: selectedSide });
  }, [selectedSide, isExecuting]);

  const handleCustomSubmit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const val = parseFloat(customAmount);
    if (!val || val < 1 || !selectedSide || isExecuting) return;
    setPendingTrade({ amount: val, side: selectedSide });
  }, [customAmount, selectedSide, isExecuting]);

  const handleConfirmTrade = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!pendingTrade) return;
    const sizeInCoin = midPx > 0 ? (pendingTrade.amount * selectedLeverage) / midPx : 0;
    // Ensure at least the minimum lot size (1 unit at szDecimals precision)
    const minLot = Math.pow(10, -market.szDecimals);
    const roundedSz = Math.max(minLot, parseFloat(sizeInCoin.toFixed(market.szDecimals)));
    // Spot needs Ioc with wider slippage; perps use FrontendMarket
    const slippage = isSpot ? 0.03 : 0.005;
    const orderLimitPx = pendingTrade.side === 'long'
      ? midPx * (1 + slippage)
      : midPx * (1 - slippage);
    try {
      await placeOrder({
        coin: market.coin,
        isBuy: pendingTrade.side === 'long',
        sz: roundedSz,
        limitPx: orderLimitPx,
        orderType: { limit: { tif: isSpot ? 'Ioc' as const : 'FrontendMarket' as const } },
        reduceOnly: false,
        leverage: selectedLeverage,
      });
      playOrderSound(pendingTrade.side === 'long');
      setTradeSuccess({ side: pendingTrade.side, coin: market.coin, amount: pendingTrade.amount });
      setPendingTrade(null);
      setSelectedSide(null);
      setTimeout(() => {
        setTradeSuccess(null);
        onActivate?.(null);
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Trade failed';
      if (msg.includes('not activated') || msg.includes('does not exist') || msg.includes('deposit')) {
        toast.error('Deposit USDC to Hyperliquid first. Use the banner at the top of this page.', { duration: 4000 });
        // Scroll to top so they see the deposit banner
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        toast.error(msg, { duration: 4000 });
      }
    }
  }, [pendingTrade, midPx, selectedLeverage, market.coin, market.szDecimals, placeOrder, onActivate]);

  const handleCancelConfirm = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingTrade(null);
  }, []);

  return (
    <motion.div
      data-market-card
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.25 }}
      onClick={() => router.push(isSpot ? `/spot/${market.coin}` : `/perps/${market.coin}`)}
      className={`perps-card rounded-[12px] cursor-pointer group flex flex-col relative transition-all duration-200 ${
        isExecuting
          ? 'border-2 border-amber-400 shadow-sm'
          : 'border hover:-translate-y-[1px]'
      }`}
    >
      {/* Subtle top glimmer to match market card sheen */}
      <div className="perps-card-glimmer pointer-events-none absolute inset-x-0 top-0 h-14 rounded-b-[20px] transition-opacity duration-200" />
      {isExecuting && <div className="h-[2px] bg-amber-400 animate-pulse" />}

      {/* ── Top section ── */}
      <div className={compact ? 'p-2.5 pb-2' : 'p-4 pb-3'}>
        <div className={`flex items-start ${compact ? 'gap-2 mb-1.5' : 'gap-3 mb-3'}`}>
          <CoinIcon symbol={market.coin} size={compact ? 24 : 32} className={compact ? 'w-6 h-6' : 'w-8 h-8'} />
          <div className="flex-1 min-w-0">
            <h3 className={`perps-card-title font-bold leading-tight truncate ${compact ? 'text-[11px]' : 'text-[13px]'}`} style={{ fontFamily: FONT }}>
              {market.coin}/USDC
            </h3>
            <div className="flex items-baseline gap-1.5">
              <span
                className={`perps-card-price font-bold tabular-nums transition-colors duration-300 ${compact ? 'text-[16px]' : 'text-[20px]'} ${
                  flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''
                }`}
                style={{ fontFamily: FONT }}
              >
                ${formatPrice(midPx, decimals)}
              </span>
              <span
                className={`font-bold tabular-nums transition-all duration-300 ${compact ? 'text-[10px]' : 'text-[12px]'} ${
                  flash === 'up' ? 'text-emerald-500' : flash === 'down' ? 'text-rose-400' : isPositive ? 'text-emerald-600' : 'text-rose-500'
                }`}
                style={{ fontFamily: FONT }}
              >
                {isPositive ? '+' : ''}{change.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Tags - hide some on compact */}
        <div className={`flex items-center gap-1 flex-wrap ${compact ? 'mb-1.5' : 'mb-3'}`}>
          {!isSpot && <span className={`font-semibold text-[#7c8db0] bg-[#f0f4ff] rounded-md ${compact ? 'text-[8px] px-1 py-px' : 'text-[9px] px-1.5 py-[2px]'}`}>{market.maxLeverage}x</span>}
          {isSpot && <span className={`font-semibold text-[#7c8db0] bg-[#f0f4ff] rounded-md ${compact ? 'text-[8px] px-1 py-px' : 'text-[9px] px-1.5 py-[2px]'}`}>SPOT</span>}
          {!compact && category && (() => {
            const colorMap: Record<string, string> = {
              'Layer 1': 'text-blue-700 bg-blue-50',
              'Layer 2': 'text-violet-700 bg-violet-50',
              'DeFi': 'text-cyan-700 bg-cyan-50',
              'Meme': 'text-orange-700 bg-orange-50',
              'AI': 'text-fuchsia-700 bg-fuchsia-50',
              'Gaming': 'text-pink-700 bg-pink-50',
              'Stocks': 'text-slate-700 bg-slate-100',
              'RWA': 'text-teal-700 bg-teal-50',
              'Infra': 'text-amber-700 bg-amber-50',
            };
            return <span className={`text-[9px] font-semibold px-1.5 py-[2px] rounded-md uppercase ${colorMap[category] || 'text-[#9ca3af] bg-[#f8fafc]'}`}>{category}</span>;
          })()}
          {!compact && Math.abs(fundingNum) > 0.0005 && (
            <span className={`text-[9px] font-semibold px-1.5 py-[2px] rounded-md ${isFundingPositive ? 'text-emerald-700 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
              {isFundingPositive ? 'Longs Pay' : 'Shorts Pay'}
            </span>
          )}
        </div>

        {/* Stats — single row */}
        <div className={`flex items-center ${compact ? 'gap-2 text-[9px]' : 'gap-3 text-[11px]'} ${compact ? 'mb-1.5' : 'mb-3'}`} style={{ fontFamily: FONT }}>
          <span className="perps-card-stat-label"><span className={`uppercase font-bold tracking-wider ${compact ? 'text-[8px]' : 'text-[9px]'}`}>Vol</span> <span className="perps-card-stat-value font-bold">{formatVolume(volume)}</span></span>
          {!isSpot && (
            <>
              <span className="perps-card-divider">|</span>
              {!compact && <><span className="perps-card-stat-label"><span className="uppercase text-[9px] font-bold tracking-wider">OI</span> <span className="perps-card-stat-value font-bold">{formatOI(oi)}</span></span>
              <span className="perps-card-divider">|</span></>}
              <span className={`font-bold ${isFundingPositive ? 'perps-card-funding-positive' : 'perps-card-funding-negative'}`}>
                {formatFundingRate(market.funding)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Trade buttons ── */}
      <div className={`${compact ? 'px-2.5' : 'px-4'} ${!selectedSide ? (compact ? 'pb-2.5' : 'pb-4') : ''}`} onClick={(e) => e.stopPropagation()}>
        {!selectedSide && (
          <div className={`flex ${compact ? 'gap-1.5' : 'gap-2'}`}>
            <button
              onClick={(e) => handleSideClick(e, 'long')}
              disabled={isExecuting}
              className={`group/side relative overflow-hidden flex-1 rounded-[6px] font-bold transition-all duration-150 ${compact ? 'py-2 text-[10px]' : 'py-2.5 text-[11px]'} ${
                isExecuting
                  ? 'opacity-40 cursor-not-allowed bg-emerald-50 text-emerald-600'
                  : 'text-emerald-600 bg-gradient-to-b from-emerald-50 to-emerald-100/60 shadow-[0_1px_3px_rgba(16,185,129,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] hover:shadow-[0_3px_12px_rgba(16,185,129,0.2),inset_0_1px_0_rgba(255,255,255,0.7)] hover:from-emerald-500 hover:to-emerald-600 hover:text-white active:scale-[0.97]'
              }`}
              style={{ fontFamily: FONT }}
            >
              {!isExecuting && <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-500 to-emerald-600 opacity-0 group-hover/side:opacity-100 transition-opacity duration-150" />}
              <span className="relative z-10 transition-colors duration-150 group-hover/side:text-white">{isSpot ? 'BUY' : 'LONG'}</span>
            </button>
            <button
              onClick={(e) => handleSideClick(e, 'short')}
              disabled={isExecuting}
              className={`group/side relative overflow-hidden flex-1 rounded-[6px] font-bold transition-all duration-150 ${compact ? 'py-2 text-[10px]' : 'py-2.5 text-[11px]'} ${
                isExecuting
                  ? 'opacity-40 cursor-not-allowed bg-rose-50 text-rose-500'
                  : 'text-rose-500 bg-gradient-to-b from-rose-50 to-rose-100/60 shadow-[0_1px_3px_rgba(244,63,94,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] hover:shadow-[0_3px_12px_rgba(244,63,94,0.2),inset_0_1px_0_rgba(255,255,255,0.7)] hover:from-rose-500 hover:to-rose-600 hover:text-white active:scale-[0.97]'
              }`}
              style={{ fontFamily: FONT }}
            >
              {!isExecuting && <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-rose-500 to-rose-600 opacity-0 group-hover/side:opacity-100 transition-opacity duration-150" />}
              <span className="relative z-10 transition-colors duration-150 group-hover/side:text-white">{isSpot ? 'SELL' : 'SHORT'}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Amount picker — inline, same pattern as prediction market cards ── */}
      <AnimatePresence>
        {selectedSide && !isExecuting && !pendingTrade && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="px-4 pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-[10px] bg-white shadow-[0_6px_24px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden border border-[#e5e7eb]">
              {/* Header */}
              <div className={`px-3 py-2 flex items-center justify-between ${isLong ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                <span className="text-[10px] font-bold text-white tracking-wide" style={{ fontFamily: FONT }}>
                  {isSpot ? (isLong ? 'BUY' : 'SELL') : (isLong ? 'LONG' : 'SHORT')} {market.coin} @ ${formatPrice(midPx, decimals)}
                </span>
                <button
                  onClick={handleCancel}
                  className="h-5 w-5 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 transition-colors"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Amount grid */}
              <div className="p-2.5">
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {AMOUNT_PRESETS.map(amt => {
                    const belowMin = amt * selectedLeverage < 10;
                    return (
                      <button
                        key={amt}
                        onClick={(e) => handleAmountSelect(e, amt)}
                        disabled={belowMin}
                        className={`py-2 rounded-[6px] text-[11px] font-bold transition-all duration-150 active:scale-[0.96] ${
                          belowMin
                            ? 'opacity-40 cursor-not-allowed ' + (isLong ? 'text-emerald-600 bg-emerald-50/60' : 'text-rose-500 bg-rose-50/60')
                            : isLong
                              ? 'text-emerald-600 bg-emerald-50/60 hover:bg-emerald-500 hover:text-white hover:shadow-[0_2px_8px_rgba(16,185,129,0.25)]'
                              : 'text-rose-500 bg-rose-50/60 hover:bg-rose-500 hover:text-white hover:shadow-[0_2px_8px_rgba(244,63,94,0.25)]'
                        }`}
                        style={{ fontFamily: FONT }}
                      >
                        ${amt}
                      </button>
                    );
                  })}
                </div>

                {/* Leverage — segmented bar (perps only) */}
                {!isSpot && <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider" style={{ fontFamily: FONT }}>Leverage</span>
                    {isEditingLeverage ? (
                      <input
                        autoFocus
                        type="number"
                        min={1}
                        max={market.maxLeverage}
                        value={leverageEditValue}
                        onChange={(e) => { e.stopPropagation(); setLeverageEditValue(e.target.value); }}
                        onBlur={() => {
                          const val = Math.max(1, Math.min(market.maxLeverage, Math.round(Number(leverageEditValue) || selectedLeverage)));
                          setSelectedLeverage(val);
                          setIsEditingLeverage(false);
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            const val = Math.max(1, Math.min(market.maxLeverage, Math.round(Number(leverageEditValue) || selectedLeverage)));
                            setSelectedLeverage(val);
                            setIsEditingLeverage(false);
                          } else if (e.key === 'Escape') {
                            setIsEditingLeverage(false);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-10 text-right text-[11px] font-bold tabular-nums bg-transparent border-b-2 outline-none"
                        style={{ fontFamily: FONT, color: isLong ? '#22c55e' : '#ef4444', borderColor: isLong ? '#22c55e' : '#ef4444' }}
                      />
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setLeverageEditValue(String(selectedLeverage)); setIsEditingLeverage(true); }}
                        className={`text-[11px] font-bold cursor-pointer hover:opacity-70 transition-opacity ${isLong ? 'text-emerald-600' : 'text-rose-500'}`}
                        style={{ fontFamily: FONT }}
                      >
                        {selectedLeverage}x
                      </button>
                    )}
                  </div>
                  {(() => {
                    const steps = [1, 2, 5, 10, 20, 50].filter(s => s <= market.maxLeverage);
                    if (!steps.includes(market.maxLeverage)) steps.push(market.maxLeverage);
                    const totalBars = 20;
                    const filledBars = selectedLeverage >= market.maxLeverage ? totalBars : Math.round((selectedLeverage / market.maxLeverage) * totalBars);
                    const activeColor = isLong ? '#22c55e' : '#ef4444';
                    return (
                      <>
                        <div
                          className="flex gap-[2px] h-3 cursor-pointer touch-none select-none"
                          ref={(el) => { if (el) (el as HTMLDivElement & { _barEl?: boolean })._barEl = true; }}
                          onPointerDown={(e) => {
                            const el = e.currentTarget;
                            (e.target as HTMLElement).setPointerCapture(e.pointerId);
                            (el as HTMLDivElement & { _dragging?: boolean })._dragging = true;
                            const rect = el.getBoundingClientRect();
                            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            const lev = pct >= 0.95 ? market.maxLeverage : Math.max(1, Math.round(pct * market.maxLeverage));
                            setSelectedLeverage(lev);
                          }}
                          onPointerMove={(e) => {
                            const el = e.currentTarget;
                            if (!(el as HTMLDivElement & { _dragging?: boolean })._dragging) return;
                            const rect = el.getBoundingClientRect();
                            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            const lev = pct >= 0.95 ? market.maxLeverage : Math.max(1, Math.round(pct * market.maxLeverage));
                            setSelectedLeverage(lev);
                          }}
                          onPointerUp={(e) => {
                            (e.currentTarget as HTMLDivElement & { _dragging?: boolean })._dragging = false;
                          }}
                          onPointerCancel={(e) => {
                            (e.currentTarget as HTMLDivElement & { _dragging?: boolean })._dragging = false;
                          }}
                        >
                          {Array.from({ length: totalBars }).map((_, i) => (
                            <div
                              key={i}
                              className="flex-1 rounded-[1px] transition-colors duration-100"
                              style={{ background: i < filledBars ? activeColor : '#e5e7eb' }}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between mt-1">
                          {steps.map(s => (
                            <button
                              key={s}
                              onClick={(e) => { e.stopPropagation(); setSelectedLeverage(s); }}
                              className={`text-[8px] font-bold transition-colors ${
                                selectedLeverage === s
                                  ? isLong ? 'text-emerald-600' : 'text-rose-500'
                                  : 'text-[#b0b4ba] hover:text-[#666]'
                              }`}
                              style={{ fontFamily: FONT }}
                            >
                              {s}x
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>}

                {/* Custom input */}
                <div className="flex gap-1.5">
                  <div className="flex-1 flex items-center bg-[#f8fafc] rounded-[6px] px-2.5">
                    <span className="text-[10px] font-bold text-black/25">$</span>
                    <input
                      type="number"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="CUSTOM"
                      min="1"
                      className="w-full px-1.5 py-2 text-[10px] font-bold bg-transparent focus:outline-none placeholder:text-black/20"
                      style={{ fontFamily: FONT }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <button
                    onClick={handleCustomSubmit}
                    disabled={!customAmount || parseFloat(customAmount) < 1}
                    className={`px-3.5 py-2 rounded-[6px] text-[10px] font-bold transition-all duration-150 ${
                      !customAmount || parseFloat(customAmount) < 1
                        ? 'bg-[#f0f0f0] text-black/15 cursor-not-allowed'
                        : isLong
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 active:scale-[0.96]'
                          : 'bg-rose-500 text-white hover:bg-rose-600 shadow-sm shadow-rose-500/20 active:scale-[0.96]'
                    }`}
                    style={{ fontFamily: FONT }}
                  >
                    Go
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Confirmation panel ── */}
        {pendingTrade && !isExecuting && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="px-4 pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const sizeInCoin = midPx > 0 ? (pendingTrade.amount * selectedLeverage) / midPx : 0;
              const isConfirmLong = pendingTrade.side === 'long';
              return (
                <div className="rounded-[10px] bg-white shadow-[0_6px_24px_rgba(0,0,0,0.08)] overflow-hidden border border-[#e5e7eb]">
                  <div className={`px-3 py-2 ${isConfirmLong ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <span className="text-[10px] font-bold text-white tracking-wide" style={{ fontFamily: FONT }}>
                      Confirm {isSpot ? (isConfirmLong ? 'Buy' : 'Sell') : (isConfirmLong ? 'Long' : 'Short')}
                    </span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[10px] text-[#9ca3af] font-semibold">Market</span>
                      <span className="text-[10px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>{market.coin}/USDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-[#9ca3af] font-semibold">Size</span>
                      <span className="text-[10px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                        {sizeInCoin.toFixed(market.szDecimals)} {market.coin} (~${pendingTrade.amount})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-[#9ca3af] font-semibold">Entry</span>
                      <span className="text-[10px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>${formatPrice(midPx, decimals)}</span>
                    </div>
                    {!isSpot && (
                      <div className="flex justify-between">
                        <span className="text-[10px] text-[#9ca3af] font-semibold">Leverage</span>
                        <span className="text-[10px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>{selectedLeverage}x (cross)</span>
                      </div>
                    )}
                    {pendingTrade.amount * selectedLeverage < 10 && (
                      <div className="px-2 py-1.5 bg-amber-50 rounded-[6px] border border-amber-200">
                        <span className="text-[9px] font-semibold text-amber-600" style={{ fontFamily: FONT }}>
                          Minimum notional size is $10 USDC
                        </span>
                      </div>
                    )}
                    <div className="flex gap-1.5 pt-1.5">
                      <button
                        onClick={handleCancelConfirm}
                        className="flex-1 py-2 rounded-[6px] text-[10px] font-bold bg-[#f8fafc] text-[#9ca3af] hover:bg-[#f0f0f0] transition-colors"
                        style={{ fontFamily: FONT }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmTrade}
                        disabled={pendingTrade.amount * selectedLeverage < 10}
                        className={`flex-1 py-2 rounded-[6px] text-[10px] font-bold text-white transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed ${
                          isConfirmLong ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
                        }`}
                        style={{ fontFamily: FONT }}
                      >
                        {isSpot ? (isConfirmLong ? 'Buy' : 'Sell') : (isConfirmLong ? 'Open Long' : 'Open Short')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
        {/* ── Executing state ── */}
        {isExecuting && pendingTrade && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="px-4 pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`rounded-[10px] overflow-hidden border ${pendingTrade.side === 'long' ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
              <div className="flex flex-col items-center justify-center py-5 gap-2">
                <div className={`w-6 h-6 border-2 ${pendingTrade.side === 'long' ? 'border-emerald-300 border-t-emerald-600' : 'border-rose-300 border-t-rose-500'} rounded-full animate-spin`} />
                <span className="text-[11px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                  Opening {pendingTrade.side === 'long' ? 'Long' : 'Short'}...
                </span>
                <span className="text-[9px] text-[#9ca3af]" style={{ fontFamily: FONT }}>
                  ${pendingTrade.amount} · {market.coin} · {selectedLeverage}x
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Success state ── */}
        {tradeSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="px-4 pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`rounded-[10px] overflow-hidden border ${tradeSuccess.side === 'long' ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
              <div className="flex flex-col items-center justify-center py-4 gap-1.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${tradeSuccess.side === 'long' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-[12px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                  {tradeSuccess.side === 'long' ? 'Long' : 'Short'} {tradeSuccess.coin} Opened
                </span>
                <span className="text-[9px] text-[#9ca3af]" style={{ fontFamily: FONT }}>
                  ${tradeSuccess.amount} at ${formatPrice(midPx, decimals)}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
