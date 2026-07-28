'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEmbeddedAddress } from '@/lib/hooks/use-embedded-address';
import { PriceChart } from './PriceChart';
import { SignalPanel } from './SignalPanel';
import OrderBookLadder from './OrderBookLadder';
import SpreadIndicator from './SpreadIndicator';
import LimitOrderForm from './LimitOrderForm';
import OpenOrdersPanel from './OpenOrdersPanel';
import TopHoldersPanel from './TopHoldersPanel';
import { useSSEPrices } from '@/lib/hooks/use-sse-prices';
import type { MarketCatalogItem, LivePrices } from '@/lib/types/market';
import { getMarketAssetTag, getMarketTimeframeTag, ASSET_TAG_STYLES, TIMEFRAME_TAG_STYLE } from '@/lib/types/market';
import { WORKER_API } from '@/lib/config/worker';
import { PolymarketAvailable } from './PolymarketAvailable';

const AMOUNT_PRESETS = [1, 5, 10, 25, 50, 100];

interface MarketDetailPanelProps {
  market: MarketCatalogItem | null;
  livePrices?: LivePrices;
  isWatched?: boolean;
  tradingConditionId?: string | null;
  onToggleWatch?: (conditionId: string) => void;
  onClose: () => void;
  onMarketClick?: (market: MarketCatalogItem) => void;
  onTrade?: (params: {
    conditionId: string;
    tokenId: string;
    side: 'BUY';
    outcome: string;
    amount: number;
  }) => void;
  onPricesUpdate?: (prices: Record<string, LivePrices>) => void;
}

function formatVolume(v: number | undefined | null): string {
  if (v == null) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatTimeLeft(endDate: string | null): string {
  if (!endDate) return '--';
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

/* ─── Inline icons ─── */
function BookmarkIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return filled ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5 3a2 2 0 00-2 2v16l9-4 9 4V5a2 2 0 00-2-2H5z" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 3a2 2 0 00-2 2v16l9-4 9 4V5a2 2 0 00-2-2H5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`animate-spin ${className || ''}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
    </svg>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MarketDetailPanel({
  market,
  livePrices,
  isWatched,
  tradingConditionId,
  onToggleWatch,
  onClose,
  onMarketClick,
  onTrade,
  onPricesUpdate,
}: MarketDetailPanelProps) {
  const address = useEmbeddedAddress();
  const [selectedOutcome, setSelectedOutcome] = useState<'Yes' | 'No' | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [pendingTrade, setPendingTrade] = useState<{ amount: number; outcome: 'Yes' | 'No' } | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [tradeMode, setTradeMode] = useState<'market' | 'limit'>('market');
  const [priceHistoryTab, setPriceHistoryTab] = useState<'graph' | 'spread'>('graph');
  const [relatedMarkets, setRelatedMarkets] = useState<MarketCatalogItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // Subscribe to live prices for the selected market via SSE
  // Pass empty array when no market is selected to avoid opening an unfiltered connection
  const sseConditionIds = useMemo(
    () => (market ? [market.condition_id] : []),
    [market?.condition_id]
  );
  const { prices: ssePrices } = useSSEPrices(sseConditionIds);
  const sseLive = market ? ssePrices[market.condition_id] : undefined;

  useEffect(() => {
    if (onPricesUpdate && Object.keys(ssePrices).length > 0) {
      onPricesUpdate(ssePrices);
    }
  }, [ssePrices, onPricesUpdate]);

  // Reset tabs when market changes
  useEffect(() => { setPriceHistoryTab('graph'); }, [market?.condition_id]);

  // Fetch related markets by event_id
  useEffect(() => {
    if (!market?.event_id) {
      setRelatedMarkets([]);
      return;
    }
    const controller = new AbortController();
    setRelatedLoading(true);
    fetch(`${WORKER_API}/v1/events/${market.event_id}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        const allMarkets: MarketCatalogItem[] = data.localMarkets || [];
        setRelatedMarkets(allMarkets.filter(m => m.condition_id !== market.condition_id));
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setRelatedMarkets([]);
      })
      .finally(() => setRelatedLoading(false));

    return () => controller.abort();
  }, [market?.event_id, market?.condition_id]);

  const handleOutcomeClick = useCallback((outcome: 'Yes' | 'No') => {
    if (!market) return;
    setSelectedOutcome(outcome);
    setCustomAmount('');
  }, [market]);

  const handleCancel = useCallback(() => {
    setSelectedOutcome(null);
    setCustomAmount('');
  }, []);

  const handleAmountSelect = useCallback((amount: number) => {
    if (!market || !onTrade || !selectedOutcome) return;
    setPendingTrade({ amount, outcome: selectedOutcome });
  }, [market, onTrade, selectedOutcome]);

  const handleConfirmTrade = useCallback(() => {
    if (!market || !onTrade || !pendingTrade) return;
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
  }, [market, onTrade, pendingTrade]);

  const handleCancelConfirm = useCallback(() => {
    setPendingTrade(null);
  }, []);

  const handleCustomSubmit = useCallback(() => {
    const val = parseFloat(customAmount);
    if (!val || val < 1 || val > 1000) return;
    handleAmountSelect(val);
  }, [customAmount, handleAmountSelect]);

  if (!market) return null;

  // Priority: SSE live prices > parent-provided livePrices > static outcome_prices.
  // Only label as "Live" when the source is a real SSE-fed tick; the
  // outcome_prices fallback is a catalog snapshot up to ~1h stale and
  // should not be presented as live — that contradicts the trade-freshness
  // guard, which reads from the same SSE feed.
  const hasLive = !!(sseLive || livePrices);
  const rawYes = hasLive
    ? (sseLive?.yes ?? livePrices?.yes ?? null)
    : (market.outcome_prices?.[0] ?? null);
  const rawNo = hasLive
    ? (sseLive?.no ?? livePrices?.no ?? null)
    : (market.outcome_prices?.[1] ?? null);
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
  const isYes = selectedOutcome === 'Yes';
  const outcomeLabels = market.outcomes || ['Yes', 'No'];
  const yesLabel = outcomeLabels[0] || 'Yes';
  const noLabel = outcomeLabels[1] || 'No';

  return (
    <AnimatePresence>
      {market && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[55]"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-white z-[60] overflow-y-auto border-l border-[#e5e7eb] rounded-l-[16px] shadow-[-8px_0_30px_rgba(0,0,0,0.06)]"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* ── Header ── */}
            <div className="sticky top-0 z-10 bg-white border-b border-[#e5e7eb] px-5 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between">
                <button
                  onClick={onClose}
                  className="flex items-center gap-2 text-[11px] font-bold text-[#9ca3af] hover:text-black transition-colors group detail-panel-back-btn"
                >
                  <span className="flex items-center justify-center h-7 w-7 border border-[#e5e7eb] rounded-md group-hover:border-black/20 group-hover:bg-[#f8fafc] transition-all detail-panel-back-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M5 12l6-6M5 12l6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                  Back
                </button>
                <div className="flex items-center gap-1.5">
                  {onToggleWatch && (
                    <button
                      onClick={() => onToggleWatch(market.condition_id)}
                      aria-label={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
                      className="h-8 w-8 flex items-center justify-center border border-[#e5e7eb] rounded-md hover:border-black/20 hover:bg-[#f8fafc] transition-all"
                    >
                      <BookmarkIcon
                        filled={isWatched}
                        className={isWatched ? 'text-black' : 'text-black/20'}
                      />
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="h-8 w-8 flex items-center justify-center border border-[#e5e7eb] rounded-md hover:border-black/20 hover:bg-black hover:text-white text-black/30 transition-all"
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-0">
              {/* ── Question + description ── */}
              <div className="pb-5">
                <h2 data-market-detail-title className="text-[22px] sm:text-[24px] font-black leading-snug text-black tracking-tight">
                  {market.question}
                </h2>
                {market.description && (
                  <p
                    data-market-detail-description
                    onClick={() => setDescExpanded(prev => !prev)}
                    className={`mt-3 text-[13px] text-[#9ca3af] leading-relaxed cursor-pointer ${descExpanded ? '' : 'line-clamp-3'}`}
                  >
                    {market.description}
                  </p>
                )}

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {market.categories?.map(cat => (
                    <span key={cat} className="text-[9px] font-semibold text-[#9ca3af] bg-[#f8fafc] px-2 py-[3px] rounded-md">
                      {cat}
                    </span>
                  ))}
                  {market.favourite_outcome && (
                    <span className={`inline-flex items-center gap-1.5 text-[8px] font-bold px-2 py-[3px] rounded-md ${
                      market.ai_sentiment === 'bullish'
                        ? 'text-emerald-700 bg-emerald-50'
                        : market.ai_sentiment === 'bearish'
                        ? 'text-rose-600 bg-rose-50'
                        : 'text-[#9ca3af] bg-[#f8fafc]'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        market.ai_sentiment === 'bullish' ? 'bg-emerald-500' : market.ai_sentiment === 'bearish' ? 'bg-rose-500' : 'bg-black/30'
                      }`} />
                      AI Pick: {market.favourite_outcome}
                    </span>
                  )}
                  {(() => { const a = getMarketAssetTag(market.question); return a ? (
                    <span className={`text-[9px] font-semibold px-2 py-[3px] rounded-md ${ASSET_TAG_STYLES[a] || 'text-[#9ca3af] bg-[#f8fafc]'}`}>
                      {a}
                    </span>
                  ) : null; })()}
                  {(() => { const t = getMarketTimeframeTag(market); return t ? (
                    <span className={`text-[9px] font-semibold px-2 py-[3px] rounded-md ${TIMEFRAME_TAG_STYLE}`}>
                      {t}
                    </span>
                  ) : null; })()}
                  {market.is_trending && (
                    <span className="text-[9px] font-semibold text-orange-600/80 bg-orange-50 px-2 py-[3px] rounded-md">
                      Trending
                    </span>
                  )}
                </div>
              </div>

              {/* ── AI Signals — top of detail view (hidden when no signals) ── */}
              <SignalPanel
                conditionId={market.condition_id}
                sourceArticleUrls={market.source_article_urls}
                marketAI={{
                  ai_sentiment: market.ai_sentiment,
                  ai_confidence: market.ai_confidence,
                  ai_summary: market.ai_summary,
                  favourite_outcome: market.favourite_outcome,
                }}
              />

              {/* ── Market stats ── */}
              <div className="py-5 border-b border-[#e5e7eb]">
                <div className="flex items-center justify-between mb-3">
                  <span data-market-detail-section-label className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">
                    Market data
                  </span>
                  {market.clob_token_ids?.[0] && (
                    <SpreadIndicator tokenId={market.clob_token_ids[0]} />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-px bg-[#e5e7eb] rounded-[12px] overflow-hidden">
                  <StatCell label="Volume" value={formatVolume(market.volume)} />
                  <StatCell label="24h vol" value={formatVolume(market.volume_24h)} />
                  <StatCell label="Liquidity" value={formatVolume(market.liquidity)} />
                  <StatCell label="Spread" value={`${(market.spread * 100).toFixed(2)}%`} />
                  {market.price_change_24h !== 0 && (
                    <StatCell
                      label="24h change"
                      value={`${market.price_change_24h > 0 ? '+' : ''}${(market.price_change_24h * 100).toFixed(2)}%`}
                      valueColor={market.price_change_24h > 0 ? 'text-emerald-600' : 'text-rose-500'}
                    />
                  )}
                  <StatCell label="Ends" value={formatTimeLeft(market.end_date)} />
                </div>
              </div>

              {/* ── Live Prices — hero section ── */}
              <div className="border-b border-[#e5e7eb] py-5">
                {hasPrices ? (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <span data-market-detail-section-label className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">
                        {hasLive ? 'Live prices' : 'Last known prices'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-0">
                      <div className="pr-4 border-r border-[#e5e7eb]">
                        <span className="block text-[9px] font-bold text-emerald-600/50 mb-1">{yesLabel}</span>
                        <span className="text-[32px] font-mono font-black text-emerald-600 leading-none tabular-nums">
                          {yesPriceDisplay}<span className="text-[16px] font-bold text-emerald-500/50">¢</span>
                        </span>
                      </div>
                      <div className="pl-4">
                        <span className="block text-[9px] font-bold text-rose-500/50 mb-1">{noLabel}</span>
                        <span className="text-[32px] font-mono font-black text-rose-500 leading-none tabular-nums">
                          {noPriceDisplay}<span className="text-[16px] font-bold text-rose-400/50">¢</span>
                        </span>
                      </div>
                    </div>
                    {/* Probability bars */}
                    <div className="mt-5 space-y-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[13px] font-bold text-emerald-600 tabular-nums w-[56px] text-right flex-shrink-0" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                          {yesPriceDisplay}%
                        </span>
                        <div className="flex-1 h-[10px] bg-[#f1f3f4] rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-emerald-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(yesPercent, 1)}%` }}
                            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </div>
                        <span className="text-[12px] font-semibold text-[#9ca3af] flex-shrink-0" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                          {yesLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-[13px] font-bold text-rose-500 tabular-nums w-[56px] text-right flex-shrink-0" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                          {noPriceDisplay}%
                        </span>
                        <div className="flex-1 h-[10px] bg-[#f1f3f4] rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-rose-400 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(noPercent, 1)}%` }}
                            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
                          />
                        </div>
                        <span className="text-[12px] font-semibold text-[#9ca3af] flex-shrink-0" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                          {noLabel}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-4 text-center">
                    <span className="text-[10px] font-bold text-black/30">
                      Price unavailable
                    </span>
                    <div className="mt-3 h-2.5 bg-[#f8fafc] overflow-hidden rounded-full">
                      <div className="h-full w-full bg-[#f8fafc] animate-pulse" />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Unified Trade Section ── */}
              <div className="py-5 border-b border-[#e5e7eb]">
                {!hasPrices ? (
                  <div className="py-3 text-center">
                    <span className="text-[10px] font-bold text-black/25">
                      Trading unavailable, no price data
                    </span>
                  </div>
                ) : (<>
                {/* Market | Limit toggle */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[10px] font-bold text-[#9ca3af]">
                    Trade
                  </span>
                  <div className="flex bg-[#f8fafc] p-0.5 rounded-md">
                    {(['market', 'limit'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => { setTradeMode(mode); setSelectedOutcome(null); setCustomAmount(''); }}
                        className={`px-3 py-1 text-[10px] font-bold transition-all rounded-md ${
                          tradeMode === mode
                            ? 'bg-black text-white'
                            : 'text-black/35 hover:text-black/55'
                        }`}
                      >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Market Order ── */}
                {tradeMode === 'market' && (
                  <>
                    {!selectedOutcome && (
                      <div className="flex gap-2.5">
                        <button
                          onClick={() => handleOutcomeClick('Yes')}
                          disabled={isTrading}
                          className={`flex-1 py-3 rounded-[10px] text-[12px] font-bold transition-all duration-150
                            ${isTradingYes
                              ? 'opacity-40 cursor-not-allowed bg-emerald-50 text-emerald-600 shadow-none'
                              : 'text-emerald-600 bg-gradient-to-b from-emerald-50 to-emerald-100/60 shadow-[0_2px_6px_rgba(16,185,129,0.1),inset_0_1px_0_rgba(255,255,255,0.8)] hover:shadow-[0_4px_16px_rgba(16,185,129,0.2),inset_0_1px_0_rgba(255,255,255,0.8)] hover:from-emerald-500 hover:to-emerald-600 hover:text-white active:scale-[0.97]'
                            }`}
                        >
                          {isTradingYes ? (
                            <span className="flex items-center justify-center gap-2">
                              <SpinnerIcon className="text-emerald-500" />
                              Buying...
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              <span>{yesLabel}</span>
                              <span className="font-mono opacity-60">{yesPriceDisplay}¢</span>
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => handleOutcomeClick('No')}
                          disabled={isTrading}
                          className={`flex-1 py-3 rounded-[10px] text-[12px] font-bold transition-all duration-150
                            ${isTradingNo
                              ? 'opacity-40 cursor-not-allowed bg-rose-50 text-rose-500 shadow-none'
                              : 'text-rose-500 bg-gradient-to-b from-rose-50 to-rose-100/60 shadow-[0_2px_6px_rgba(244,63,94,0.1),inset_0_1px_0_rgba(255,255,255,0.8)] hover:shadow-[0_4px_16px_rgba(244,63,94,0.2),inset_0_1px_0_rgba(255,255,255,0.8)] hover:from-rose-500 hover:to-rose-600 hover:text-white active:scale-[0.97]'
                            }`}
                        >
                          {isTradingNo ? (
                            <span className="flex items-center justify-center gap-2">
                              <SpinnerIcon className="text-rose-400" />
                              Buying...
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              <span>{noLabel}</span>
                              <span className="font-mono opacity-60">{noPriceDisplay}¢</span>
                            </span>
                          )}
                        </button>
                      </div>
                    )}

                    <AnimatePresence>
                      {selectedOutcome && !isTrading && !pendingTrade && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                        >
                          <div className="rounded-[12px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.10),0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
                            {/* Header */}
                            <div className={`px-4 py-2.5 flex items-center justify-between ${isYes ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                              <div className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                                <span className="text-[11px] font-bold text-white tracking-wide">
                                  Buy {isYes ? yesLabel : noLabel}
                                </span>
                                <span className="text-[10px] font-mono text-white/60">
                                  @ {isYes ? yesPriceDisplay : noPriceDisplay}¢
                                </span>
                              </div>
                              <button
                                onClick={handleCancel}
                                className="h-6 w-6 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 transition-colors"
                              >
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                                  <path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="3" strokeLinecap="round" />
                                </svg>
                              </button>
                            </div>

                            {/* Amount grid */}
                            <div className="p-3">
                              <div className="flex justify-end mb-2">
                                <PolymarketAvailable />
                              </div>
                              <div className="grid grid-cols-6 gap-1.5 mb-2.5">
                                {AMOUNT_PRESETS.map(amt => (
                                  <button
                                    key={amt}
                                    onClick={() => handleAmountSelect(amt)}
                                    className={`py-2.5 rounded-[6px] text-[11px] font-bold transition-all duration-150 active:scale-[0.96]
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
                              <div className="flex gap-2">
                                <div className="flex-1 flex items-center bg-[#f8fafc] rounded-[8px] px-3">
                                  <span className="text-[11px] font-bold text-black/25">$</span>
                                  <input
                                    type="number"
                                    value={customAmount}
                                    onChange={(e) => setCustomAmount(e.target.value)}
                                    placeholder="CUSTOM"
                                    min="1"
                                    max="1000"
                                    className="w-full px-1.5 py-2.5 text-[11px] font-mono font-bold bg-transparent focus:outline-none placeholder:text-black/20"
                                  />
                                </div>
                                <button
                                  onClick={handleCustomSubmit}
                                  disabled={!customAmount || parseFloat(customAmount) < 1}
                                  className={`px-5 py-2.5 rounded-[8px] text-[11px] font-bold transition-all duration-150
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
                        const confirmPriceDisplay = confirmIsYes ? yesPriceDisplay : noPriceDisplay;
                        const confirmLabel = confirmIsYes ? yesLabel : noLabel;
                        const estShares = confirmPrice > 0 ? pendingTrade.amount / confirmPrice : 0;
                        const potentialPayout = estShares * 1;
                        const potentialProfit = potentialPayout - pendingTrade.amount;
                        const returnPct = ((potentialProfit / pendingTrade.amount) * 100).toFixed(0);

                        return (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 4 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                          >
                            <div className="rounded-[12px] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)] overflow-hidden">
                              {/* Header strip */}
                              <div className={`px-4 py-2.5 flex items-center justify-between ${confirmIsYes ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                <div className="flex items-center gap-2">
                                  <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                                  <span className="text-[11px] font-bold text-white tracking-wide">
                                    Review Order
                                  </span>
                                </div>
                                <button
                                  onClick={handleCancelConfirm}
                                  className="h-6 w-6 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 transition-colors"
                                >
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                                    <path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="3" strokeLinecap="round" />
                                  </svg>
                                </button>
                              </div>

                              {/* Hero amount */}
                              <div className="px-4 pt-4 pb-2 text-center">
                                <span className="text-[28px] font-black text-black tabular-nums tracking-tight">
                                  ${pendingTrade.amount}
                                </span>
                                <div className="flex items-center justify-center gap-2 mt-1">
                                  <span className={`inline-block h-2 w-2 rounded-full ${confirmIsYes ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                  <span className={`text-[10px] font-bold uppercase tracking-wider ${confirmIsYes ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    {confirmLabel} @ {confirmPriceDisplay}¢
                                  </span>
                                </div>
                              </div>

                              {/* Returns grid */}
                              <div className="mx-4 mb-2 grid grid-cols-2 gap-px rounded-[8px] overflow-hidden bg-[#e5e7eb]">
                                <div className="bg-[#f8faf8] px-3 py-2.5 text-center">
                                  <span className="block text-[8px] font-bold text-black/35 uppercase tracking-wider mb-1">If correct</span>
                                  <span className="block text-[16px] font-mono font-black text-emerald-600 tabular-nums leading-tight">
                                    +${potentialProfit.toFixed(2)}
                                  </span>
                                  <span className="block text-[9px] font-mono font-bold text-emerald-500/70 mt-0.5">
                                    {returnPct}% return
                                  </span>
                                </div>
                                <div className="bg-[#faf8f8] px-3 py-2.5 text-center">
                                  <span className="block text-[8px] font-bold text-black/35 uppercase tracking-wider mb-1">If wrong</span>
                                  <span className="block text-[16px] font-mono font-black text-rose-500 tabular-nums leading-tight">
                                    -${pendingTrade.amount.toFixed(2)}
                                  </span>
                                  <span className="block text-[9px] font-mono font-bold text-rose-400/70 mt-0.5">
                                    100% loss
                                  </span>
                                </div>
                              </div>

                              {/* Details row */}
                              <div className="mx-4 mb-3 flex items-center justify-center gap-4 py-1.5">
                                <span className="text-[9px] font-mono text-black/35">
                                  <span className="font-bold text-black/50">{estShares.toFixed(2)}</span> shares
                                </span>
                                <span className="h-3 w-px bg-black/10" />
                                <span className="text-[9px] font-mono text-black/35">
                                  Payout <span className="font-bold text-black/50">${potentialPayout.toFixed(2)}</span>
                                </span>
                              </div>

                              {/* Buttons */}
                              <div className="px-4 pb-4 flex gap-2.5">
                                <button
                                  onClick={handleCancelConfirm}
                                  className="flex-1 py-2.5 text-[11px] font-bold rounded-[8px] border border-[#e5e7eb] text-black/45 hover:text-black/65 hover:border-black/15 bg-white transition-all active:scale-[0.97]"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleConfirmTrade}
                                  className={`flex-[1.5] py-2.5 text-[11px] font-bold rounded-[8px] text-white transition-all active:scale-[0.97] shadow-sm
                                    ${confirmIsYes
                                      ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25'
                                      : 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/25'
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
                  </>
                )}

                {/* ── Limit Order ── */}
                {tradeMode === 'limit' && market.clob_token_ids?.[0] && (
                  <LimitOrderForm
                    tokenId={market.clob_token_ids[0]}
                    noTokenId={market.clob_token_ids[1]}
                    conditionId={market.condition_id}
                    outcomes={market.outcomes || ['Yes', 'No']}
                  />
                )}

                {tradeMode === 'limit' && !market.clob_token_ids?.[0] && (
                  <p className="text-[11px] text-[#9ca3af] text-center py-4">Limit orders unavailable for this market</p>
                )}
                </>)}
              </div>

              {/* ── Open Orders (compact, only when has orders) ── */}
              <div className="py-4 border-b border-[#e5e7eb]">
                <OpenOrdersPanel conditionId={market.condition_id} />
              </div>

              {/* ── Price history (Graph / Spread tabs) ── */}
              {market.clob_token_ids?.[0] && (
                <div className="py-5 border-b border-[#e5e7eb]">
                  <div className="mb-3 flex flex-col items-start gap-2">
                    <span data-market-detail-section-label className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">
                      Price history
                    </span>
                    <div data-market-price-history-tabs className="flex bg-[#f8fafc] p-0.5 rounded-md">
                      {(['graph', 'spread'] as const).map(tab => (
                        <button
                          key={tab}
                          data-active={priceHistoryTab === tab ? 'true' : 'false'}
                          onClick={() => setPriceHistoryTab(tab)}
                          className={`px-2.5 py-1 text-[9px] font-bold transition-all rounded-md ${
                            priceHistoryTab === tab
                              ? 'bg-black text-white'
                              : 'text-black/35 hover:text-black/55'
                          }`}
                        >
                          {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {priceHistoryTab === 'graph' ? (
                    <PriceChart
                      conditionId={market.condition_id}
                      tokenId={market.clob_token_ids[0]}
                      height={160}
                    />
                  ) : (
                    <OrderBookLadder tokenId={market.clob_token_ids[0]} maxRows={8} />
                  )}
                </div>
              )}


              {/* ── Top holders ── */}
              <div className="py-5 border-b border-[#e5e7eb]">
                <TopHoldersPanel conditionId={market.condition_id} yesProbability={rawYes} />
              </div>

              {/* ── Related Markets ── */}
              {(relatedMarkets.length > 0 || relatedLoading) && (
                <div className="py-5 border-b border-[#e5e7eb]">
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-black/30">
                      <path d="M4 6h16M4 12h10M4 18h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span className="text-[10px] font-bold text-[#9ca3af]">
                      Related markets
                    </span>
                    <span className="text-[9px] font-mono text-black/30">{relatedMarkets.length + 1}</span>
                  </div>
                  {relatedLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <SpinnerIcon className="text-black/20" />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {/* Current market — highlighted */}
                      {(() => {
                        const curYes = market.outcome_prices?.[0] ?? null;
                        const curYesDisplay = curYes !== null ? (curYes * 100).toFixed(1) : '--';
                        return (
                          <div className="w-full text-left px-3 py-2.5 border-2 border-[#e5e7eb] bg-[#f8fafc] rounded-[12px] relative">
                            <span className="absolute top-1.5 right-2 text-[7px] font-bold text-[#9ca3af] bg-[#e5e7eb] px-1.5 py-0.5 rounded-md">
                              Current
                            </span>
                            <div className="flex items-start justify-between gap-3 pr-14">
                              <p className="text-[11px] font-bold leading-snug text-black flex-1">
                                {market.question}
                              </p>
                              <div className="flex-shrink-0 text-right">
                                <span className="text-[13px] font-mono font-black text-emerald-600 tabular-nums">
                                  {curYesDisplay}<span className="text-[10px] text-emerald-500/50">¢</span>
                                </span>
                                <span className="block text-[8px] font-bold text-black/30">
                                  Yes
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#e5e7eb]">
                              <span className="text-[8px] font-mono font-bold text-black/35 tabular-nums">VOL {formatVolume(market.volume)}</span>
                              <span className="text-[8px] font-mono font-bold text-black/35 tabular-nums">24H {formatVolume(market.volume_24h)}</span>
                              <span className="text-[8px] font-mono font-bold text-black/35 tabular-nums">LIQ {formatVolume(market.liquidity)}</span>
                              <span className="text-[8px] font-mono font-bold text-black/35 tabular-nums">{formatTimeLeft(market.end_date)}</span>
                            </div>
                          </div>
                        );
                      })()}
                      {/* Other related markets */}
                      {relatedMarkets.map(rm => {
                        const rmYes = rm.outcome_prices?.[0] ?? null;
                        const rmYesDisplay = rmYes !== null ? (rmYes * 100).toFixed(1) : '--';
                        return (
                          <button
                            key={rm.condition_id}
                            onClick={() => onMarketClick?.(rm)}
                            className="w-full text-left px-3 py-2.5 border border-[#e5e7eb] rounded-[12px] hover:border-black/15 hover:bg-[#f7f7f7] transition-all group"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-[11px] font-semibold leading-snug text-black/75 group-hover:text-black transition-colors flex-1">
                                {rm.question}
                              </p>
                              <div className="flex-shrink-0 text-right">
                                <span className="text-[13px] font-mono font-black text-emerald-600 tabular-nums">
                                  {rmYesDisplay}<span className="text-[10px] text-emerald-500/50">¢</span>
                                </span>
                                <span className="block text-[8px] font-bold text-black/30">
                                  Yes
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#e5e7eb]">
                              <span className="text-[8px] font-mono font-bold text-black/30 tabular-nums">VOL {formatVolume(rm.volume)}</span>
                              <span className="text-[8px] font-mono font-bold text-black/30 tabular-nums">24H {formatVolume(rm.volume_24h)}</span>
                              <span className="text-[8px] font-mono font-bold text-black/30 tabular-nums">LIQ {formatVolume(rm.liquidity)}</span>
                              <span className="text-[8px] font-mono font-bold text-black/30 tabular-nums">{formatTimeLeft(rm.end_date)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Polymarket link ── */}
              {(market.event_slug || market.slug) && (
                <div className="py-5">
                  <a
                    href={market.event_slug && market.slug && market.event_slug !== market.slug
                      ? `https://polymarket.com/event/${market.event_slug}/${market.slug}`
                      : `https://polymarket.com/event/${market.event_slug || market.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-3 border border-[#e5e7eb] rounded-[12px] text-[10px] font-bold text-[#9ca3af] hover:text-black hover:border-black transition-all"
                  >
                    View on Polymarket
                    <ExternalIcon />
                  </a>
                </div>
              )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─── Stat cell ─── */
function StatCell({
  label,
  value,
  valueColor = 'text-black',
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white px-3 py-2.5">
      <span data-market-detail-stat-label className="block text-[8px] font-semibold text-[#9ca3af] mb-0.5">
        {label}
      </span>
      <span data-market-detail-stat-value className={`font-mono text-[12px] font-bold tabular-nums ${valueColor}`}>
        {value}
      </span>
    </div>
  );
}
