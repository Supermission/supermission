'use client';

import { useState, useCallback, useEffect, memo } from 'react';
import Image from 'next/image';
import { useSharedNow } from '@/lib/hooks/use-shared-now';
import { motion, AnimatePresence } from 'framer-motion';
import { MiniProbabilityBar } from './MiniProbabilityBar';
import type { MarketCatalogItem, LivePrices } from '@/lib/types/market';
import { getMarketAssetTag, getMarketTimeframeTag, ASSET_TAG_STYLES, TIMEFRAME_TAG_STYLE } from '@/lib/types/market';

const AMOUNT_PRESETS = [1, 5, 10, 25, 50, 100];

interface MarketCardProps {
  market: MarketCatalogItem;
  index?: number;
  livePrices?: LivePrices;
  isWatched?: boolean;
  tradingConditionId?: string | null;
  onToggleWatch?: (conditionId: string) => void;
  onTrade?: (params: {
    conditionId: string;
    tokenId: string;
    side: 'BUY';
    outcome: string;
    amount: number;
  }) => void;
  onClick?: (market: MarketCatalogItem) => void;
  activeCardId?: string | null;
  onActivate?: (conditionId: string | null) => void;
  observeRef?: (el: Element | null) => void;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const FONT = "var(--font-bricolage, 'Bricolage Grotesque', sans-serif)";

function LiveCountdown({ endDate }: { endDate: string | null }) {
  const now = useSharedNow();

  if (!endDate) return null;

  const diff = new Date(endDate).getTime() - now;

  if (diff <= 0) {
    return (
      <span className="text-[11px] font-bold text-rose-500 bg-rose-50 px-2.5 py-1 rounded-[8px] tabular-nums" style={{ fontFamily: FONT }}>
        Ended
      </span>
    );
  }

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  const isUrgent = diff < 3600000;
  const isSoon = diff < 86400000;

  const color = isUrgent
    ? 'text-rose-600 bg-rose-50'
    : isSoon
    ? 'text-amber-600 bg-amber-50'
    : 'text-[#48484b] bg-[#f1f3f4]';

  const timeStr = days > 0
    ? `${days}D ${hours}H`
    : hours > 0
    ? `${hours}H ${mins}M`
    : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-[8px] tabular-nums ${color}`} style={{ fontFamily: FONT }}>
      {timeStr}
    </span>
  );
}

/* ─── Inline SVG icons ─── */
function BookmarkIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return filled ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5 3a2 2 0 00-2 2v16l9-4 9 4V5a2 2 0 00-2-2H5z" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 3a2 2 0 00-2 2v16l9-4 9 4V5a2 2 0 00-2-2H5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
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

export const MarketCard = memo(function MarketCard({
  market,
  index = 0,
  livePrices,
  isWatched,
  tradingConditionId,
  onToggleWatch,
  onTrade,
  onClick,
  activeCardId,
  onActivate,
  observeRef,
}: MarketCardProps) {
  const rawYes = livePrices?.yes ?? market.outcome_prices?.[0] ?? null;
  const rawNo = livePrices?.no ?? market.outcome_prices?.[1] ?? null;
  const hasPrices = rawYes !== null && rawNo !== null;
  const yesPrice = rawYes ?? 0;
  const noPrice = rawNo ?? 0;
  const yesPercent = yesPrice * 100;
  const noPercent = noPrice * 100;
  const yesPriceDisplay = yesPercent.toFixed(2);
  const noPriceDisplay = noPercent.toFixed(2);
  const isTradingYes = tradingConditionId === `${market.condition_id}:Yes`;
  const isTradingNo = tradingConditionId === `${market.condition_id}:No`;
  const isTrading = isTradingYes || isTradingNo;

  const [selectedOutcome, setSelectedOutcome] = useState<'Yes' | 'No' | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [pendingTrade, setPendingTrade] = useState<{ amount: number; outcome: 'Yes' | 'No' } | null>(null);

  // Close this card's modal when another card becomes active
  useEffect(() => {
    if (activeCardId && activeCardId !== market.condition_id) {
      setSelectedOutcome(null);
      setCustomAmount('');
      setPendingTrade(null);
    }
  }, [activeCardId, market.condition_id]);

  const handleClick = useCallback(() => onClick?.(market), [onClick, market]);

  const handleOutcomeClick = useCallback((e: React.MouseEvent, outcome: 'Yes' | 'No') => {
    e.stopPropagation();
    if (isTrading) return;
    setSelectedOutcome(outcome);
    setCustomAmount('');
    onActivate?.(market.condition_id);
  }, [isTrading, onActivate, market.condition_id]);

  const handleCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOutcome(null);
    setCustomAmount('');
    onActivate?.(null);
  }, [onActivate]);

  const handleAmountSelect = useCallback((e: React.MouseEvent, amount: number) => {
    e.stopPropagation();
    if (!onTrade || !selectedOutcome || isTrading) return;
    setPendingTrade({ amount, outcome: selectedOutcome });
  }, [onTrade, selectedOutcome, isTrading]);

  const handleConfirmTrade = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onTrade || !pendingTrade || isTrading) return;
    const tokenIndex = pendingTrade.outcome === 'Yes' ? 0 : 1;
    onTrade({
      conditionId: market.condition_id,
      tokenId: market.clob_token_ids?.[tokenIndex] || '',
      side: 'BUY',
      outcome: market.outcomes?.[tokenIndex] || pendingTrade.outcome,
      amount: pendingTrade.amount,
    });
    setPendingTrade(null);
    setSelectedOutcome(null);
    setCustomAmount('');
  }, [onTrade, market, pendingTrade, isTrading]);

  const handleCancelConfirm = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingTrade(null);
  }, []);

  const handleCustomSubmit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const val = parseFloat(customAmount);
    if (!val || val < 1 || val > 1000 || !onTrade || !selectedOutcome || isTrading) return;
    setPendingTrade({ amount: val, outcome: selectedOutcome });
  }, [customAmount, onTrade, selectedOutcome, isTrading]);

  const isYes = selectedOutcome === 'Yes';
  const outcomeLabels = market.outcomes || ['Yes', 'No'];
  const yesLabel = outcomeLabels[0] || 'Yes';
  const noLabel = outcomeLabels[1] || 'No';

  const assetTag = getMarketAssetTag(market.question);
  const timeframeTag = getMarketTimeframeTag(market);

  return (
    <motion.div
      ref={observeRef}
      data-market-card
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.25 }}
      onClick={handleClick}
      className={`bg-white rounded-[12px] transition-all duration-200 cursor-pointer group flex flex-col relative h-fit mt-3
        ${isTrading
          ? 'border-2 border-amber-400 shadow-sm'
          : market.favourite_outcome && market.ai_sentiment === 'bullish'
          ? 'border-2 border-emerald-400 hover:border-emerald-500 hover:shadow-[0_4px_24px_rgba(16,185,129,0.15)] hover:-translate-y-[1px]'
          : market.favourite_outcome && market.ai_sentiment === 'bearish'
          ? 'border-2 border-rose-400 hover:border-rose-500 hover:shadow-[0_4px_24px_rgba(244,63,94,0.15)] hover:-translate-y-[1px]'
          : 'border border-[#e5e7eb] hover:border-black/[0.2] hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:-translate-y-[1px]'
        }`}
    >
      {/* Trading pulse */}
      {isTrading && <div className="h-[2px] bg-amber-400 animate-pulse" />}

      {/* Top-edge pills: AI Pick + Asset/Timeframe tags */}
      {(market.favourite_outcome || assetTag || timeframeTag) && !isTrading && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center gap-1">
          {market.favourite_outcome && (
            <span className={`inline-flex items-center gap-1 text-[8px] font-black px-3 py-1 rounded-full shadow-sm ${
              market.ai_sentiment === 'bullish'
                ? 'bg-emerald-500 text-white'
                : market.ai_sentiment === 'bearish'
                ? 'bg-rose-500 text-white'
                : 'bg-black/30 text-white'
            }`}>
              <span className="h-1 w-1 rounded-full bg-white/60" />
              AI Pick: {market.favourite_outcome}
            </span>
          )}
          {assetTag && (
            <span data-market-card-tag className={`inline-flex items-center text-[8px] font-black px-2.5 py-1 rounded-full shadow-sm ${ASSET_TAG_STYLES[assetTag] || 'text-[#9ca3af] bg-[#f8fafc]'}`}>
              {assetTag}
            </span>
          )}
          {timeframeTag && (
            <span data-market-card-tag className={`inline-flex items-center text-[8px] font-bold px-2.5 py-1 rounded-full shadow-sm ${TIMEFRAME_TAG_STYLE}`}>
              {timeframeTag}
            </span>
          )}
        </div>
      )}

      {/* ── Top section: question + bookmark ── */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3 mb-3">
          {market.icon ? (
            <Image
              src={market.icon}
              alt=""
              width={32}
              height={32}
              loading="lazy"
              className="w-8 h-8 rounded-md object-cover flex-shrink-0 bg-[#f8fafc]"
            />
          ) : (
            <div className="w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center bg-[#e5e7eb] text-[11px] font-black text-black/30">
              {market.categories?.[0]?.[0] || '?'}
            </div>
          )}
          <h3 className="text-[13px] font-bold leading-[1.35] text-black line-clamp-2 flex-1">
            {market.question}
          </h3>
          {onToggleWatch && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleWatch(market.condition_id);
              }}
              aria-label={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
              className="flex-shrink-0 p-1 -m-1 transition-colors"
            >
              <BookmarkIcon
                filled={isWatched}
                className={isWatched
                  ? 'text-black'
                  : 'text-black/15 group-hover:text-black/30'
                }
              />
            </button>
          )}
        </div>

        {/* Tags row */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {market.categories?.[0] && (
            <span data-market-card-tag className="text-[9px] font-semibold text-[#9ca3af] bg-[#f8fafc] px-1.5 py-[2px] rounded-md">
              {market.categories[0]}
            </span>
          )}
          {market.is_trending && (
            <span className="text-[9px] font-semibold text-orange-600/80 bg-orange-50 px-1.5 py-[2px] rounded-md">
              Hot
            </span>
          )}
          {market.is_hot && (
            <span className="text-[9px] font-semibold text-rose-600/80 bg-rose-50 px-1.5 py-[2px] rounded-md">
              Trending
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-end justify-between mb-3">
          <div className="flex items-baseline gap-4">
            <div>
              <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-0.5">VOL</span>
              <span className="text-[13px] font-bold text-[#1a1a1a] tabular-nums" style={{ fontFamily: FONT }}>
                {formatVolume(market.volume)}
              </span>
            </div>
            {market.volume_24h > 0 && (
              <div>
                <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-0.5">24H</span>
                <span className="text-[13px] font-bold text-[#1a1a1a] tabular-nums" style={{ fontFamily: FONT }}>
                  {formatVolume(market.volume_24h)}
                </span>
              </div>
            )}
          </div>
          {market.end_date && <LiveCountdown endDate={market.end_date} />}
        </div>

        {/* Probability bars */}
        {hasPrices ? (
          <MiniProbabilityBar yesPercent={yesPercent} noPercent={noPercent} yesLabel={yesLabel} noLabel={noLabel} />
        ) : (
          <div className="py-2 text-center">
            <span className="text-[9px] font-bold text-black/25">Price unavailable</span>
          </div>
        )}
      </div>

      {/* ── Trade buttons ── */}
      <div className={`px-4 pt-1 ${!selectedOutcome ? 'pb-4' : ''}`} onClick={(e) => e.stopPropagation()}>
        {!selectedOutcome && hasPrices && (
          <div className="flex gap-2">
            <button
              onClick={(e) => handleOutcomeClick(e, 'Yes')}
              disabled={isTrading}
              data-market-outcome-button="yes"
              aria-label={`Buy ${yesLabel} at ${yesPriceDisplay}%`}
              className={`flex-1 py-2.5 rounded-[8px] text-[11px] font-bold transition-all duration-150
                ${isTradingYes
                  ? 'opacity-40 cursor-not-allowed bg-emerald-50 text-emerald-600 shadow-none'
                  : 'text-emerald-600 bg-gradient-to-b from-emerald-50 to-emerald-100/60 shadow-[0_1px_3px_rgba(16,185,129,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] hover:shadow-[0_3px_12px_rgba(16,185,129,0.2),inset_0_1px_0_rgba(255,255,255,0.7)] hover:from-emerald-500 hover:to-emerald-600 hover:text-white active:scale-[0.97]'
                }`}
            >
              {isTradingYes ? (
                <span className="flex items-center justify-center gap-1.5">
                  <SpinnerIcon className="text-emerald-500" />
                  {yesLabel}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  {yesLabel}
                  <span data-market-outcome-price className="opacity-60">{yesPriceDisplay}%</span>
                </span>
              )}
            </button>
            <button
              onClick={(e) => handleOutcomeClick(e, 'No')}
              disabled={isTrading}
              data-market-outcome-button="no"
              aria-label={`Buy ${noLabel} at ${noPriceDisplay}%`}
              className={`flex-1 py-2.5 rounded-[8px] text-[11px] font-bold transition-all duration-150
                ${isTradingNo
                  ? 'opacity-40 cursor-not-allowed bg-rose-50 text-rose-500 shadow-none'
                  : 'text-rose-500 bg-gradient-to-b from-rose-50 to-rose-100/60 shadow-[0_1px_3px_rgba(244,63,94,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] hover:shadow-[0_3px_12px_rgba(244,63,94,0.2),inset_0_1px_0_rgba(255,255,255,0.7)] hover:from-rose-500 hover:to-rose-600 hover:text-white active:scale-[0.97]'
                }`}
            >
              {isTradingNo ? (
                <span className="flex items-center justify-center gap-1.5">
                  <SpinnerIcon className="text-rose-400" />
                  {noLabel}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  {noLabel}
                  <span data-market-outcome-price className="opacity-60">{noPriceDisplay}%</span>
                </span>
              )}
            </button>
          </div>
        )}

      </div>

      {/* Amount picker & confirmation — inline, pushes content down */}
      <AnimatePresence>
        {selectedOutcome && !isTrading && !pendingTrade && (
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
              <div className={`px-3 py-2 flex items-center justify-between ${isYes ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                <span className="text-[10px] font-bold text-white tracking-wide">
                  Buy {isYes ? yesLabel : noLabel}
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
                  {AMOUNT_PRESETS.map(amt => (
                    <button
                      key={amt}
                      onClick={(e) => handleAmountSelect(e, amt)}
                      className={`py-2 rounded-[6px] text-[11px] font-bold transition-all duration-150 active:scale-[0.96]
                        ${isYes
                          ? 'text-emerald-600 bg-emerald-50/60 hover:bg-emerald-500 hover:text-white hover:shadow-[0_2px_8px_rgba(16,185,129,0.25)]'
                          : 'text-rose-500 bg-rose-50/60 hover:bg-rose-500 hover:text-white hover:shadow-[0_2px_8px_rgba(244,63,94,0.25)]'
                        }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>

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
                      max="1000"
                      aria-label="Custom trade amount in dollars"
                      className="w-full px-1.5 py-2 text-[10px] font-mono font-bold bg-transparent focus:outline-none placeholder:text-black/20"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <button
                    onClick={handleCustomSubmit}
                    disabled={!customAmount || parseFloat(customAmount) < 1}
                    className={`px-3.5 py-2 rounded-[6px] text-[10px] font-bold transition-all duration-150
                      ${!customAmount || parseFloat(customAmount) < 1
                        ? 'bg-[#f0f0f0] text-black/15 cursor-not-allowed'
                        : isYes
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 active:scale-[0.96]'
                          : 'bg-rose-500 text-white hover:bg-rose-600 shadow-sm shadow-rose-500/20 active:scale-[0.96]'
                      }`}
                  >
                    Buy
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Confirmation panel ── */}
        {pendingTrade && !isTrading && (() => {

          const confirmIsYes = pendingTrade.outcome === 'Yes';
          const confirmPrice = confirmIsYes ? yesPrice : noPrice;
          const confirmLabel = confirmIsYes ? yesLabel : noLabel;
          const estShares = confirmPrice > 0 ? pendingTrade.amount / confirmPrice : 0;
          const potentialPayout = estShares * 1;
          const potentialProfit = potentialPayout - pendingTrade.amount;
          const returnPct = ((potentialProfit / pendingTrade.amount) * 100).toFixed(0);

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="px-4 pb-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-[10px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.10),0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden border border-[#e5e7eb]">
                {/* Header strip */}
                <div className={`px-3 py-2 flex items-center justify-between ${confirmIsYes ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                    <span className="text-[10px] font-bold text-white tracking-wide">
                      Review Order
                    </span>
                  </div>
                  <button
                    onClick={handleCancelConfirm}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 transition-colors"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                {/* Hero amount */}
                <div className="px-3 pt-3 pb-2 text-center">
                  <span className="text-[22px] font-black text-black tabular-nums tracking-tight">
                    ${pendingTrade.amount}
                  </span>
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${confirmIsYes ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${confirmIsYes ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {confirmLabel}
                    </span>
                  </div>
                </div>

                {/* Returns grid */}
                <div className="mx-3 mb-3 grid grid-cols-2 gap-px rounded-[8px] overflow-hidden bg-[#e5e7eb]">
                  <div className="bg-[#f8faf8] px-2.5 py-2 text-center">
                    <span className="block text-[7px] font-bold text-black/35 uppercase tracking-wider mb-0.5">If correct</span>
                    <span className="block text-[13px] font-mono font-black text-emerald-600 tabular-nums leading-tight">
                      +${potentialProfit.toFixed(2)}
                    </span>
                    <span className="block text-[8px] font-mono font-bold text-emerald-500/70 mt-0.5">
                      {returnPct}% return
                    </span>
                  </div>
                  <div className="bg-[#faf8f8] px-2.5 py-2 text-center">
                    <span className="block text-[7px] font-bold text-black/35 uppercase tracking-wider mb-0.5">If wrong</span>
                    <span className="block text-[13px] font-mono font-black text-rose-500 tabular-nums leading-tight">
                      -${pendingTrade.amount.toFixed(2)}
                    </span>
                    <span className="block text-[8px] font-mono font-bold text-rose-400/70 mt-0.5">
                      100% loss
                    </span>
                  </div>
                </div>

                {/* Buttons */}
                <div className="px-3 pb-3 flex gap-2">
                  <button
                    onClick={handleCancelConfirm}
                    className="flex-1 py-2 text-[10px] font-bold rounded-[6px] border border-[#e5e7eb] text-black/45 hover:text-black/65 hover:border-black/15 bg-white transition-all active:scale-[0.97]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmTrade}
                    className={`flex-[1.4] py-2 text-[10px] font-bold rounded-[6px] text-white transition-all active:scale-[0.97] shadow-sm
                      ${confirmIsYes
                        ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                        : 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'
                      }`}
                  >
                    Confirm Trade
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </motion.div>
  );
});
