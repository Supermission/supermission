'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, ExternalLink, BarChart3 } from 'lucide-react';
import { TradeProgress } from '@/lib/hooks/use-trade-execution';
import { useMarketData } from '@/lib/hooks/use-market-data';
import { useTradeManagement } from '@/lib/hooks/use-trade-management';
import { OfferExpiryTimer, CountdownTimer } from './countdownTimer';
import { ProbabilityBar, KeyInsightsSection } from './marketUI';
import { TradeInterface } from './tradeInterface';
import { generateMarketSummary } from '@/lib/utils/market-utils';
import { useApprovalLimit } from '@/lib/hooks/use-approval-limit';
import { ChatSparkline } from './ChatSparkline';

interface PredictionMarketPanelProps {
  data: any;
  markets?: any[];
  offerCreatedAt?: string;
  onTrade?: (outcome: string, tokenId: string, price: number, question: string, side: 'BUY' | 'SELL') => void;
  onConfirmTrade?: (amount: string) => Promise<void>;
  isWalletConnected?: boolean;
  userAddress?: string | null;
  tradeProgress?: TradeProgress;
  onResetTrade?: () => void;
  initialUserPosition?: string | null;
  onPositionChange?: (position: string | null) => void;
  onMarketChange?: (marketIndex: number, market: any) => void;
}

export function PredictionMarketPanel({
  data,
  markets,
  offerCreatedAt,
  onTrade,
  onConfirmTrade,
  tradeProgress,
  onResetTrade,
  initialUserPosition,
  onPositionChange,
  onMarketChange,
}: PredictionMarketPanelProps) {
  const [offerExpired, setOfferExpired] = useState(false);
  const [currentMarketIndex, setCurrentMarketIndex] = useState(0);

  const allMarkets = markets && markets.length > 0 ? markets : [data];
  const hasMultipleMarkets = allMarkets.length > 1;
  const deal = allMarkets[currentMarketIndex] || data;

  // Custom hooks
  const { marketData, loading, livePrices, fetchLivePrices, setMarketData, setLivePrices } = useMarketData({
    deal,
    currentMarketIndex
  });

  const {
    showTradeInterface,
    selectedOutcome,
    tradeAction,
    amount,
    isSubmitting,
    userPosition,
    setAmount,
    setIsSubmitting,
    setUserPosition,
    handleTrade,
    handleCloseTrade
  } = useTradeManagement({
    deal,
    marketData,
    livePrices,
    onTrade,
    initialUserPosition,
    onPositionChange
  });

  const { maxApproval, setMaxApproval } = useApprovalLimit();

  // Navigation handlers
  const handlePrevMarket = useCallback(() => {
    if (currentMarketIndex > 0) {
      const newIndex = currentMarketIndex - 1;
      setCurrentMarketIndex(newIndex);
      setMarketData(null);
      setLivePrices(null);
      onMarketChange?.(newIndex, allMarkets[newIndex]);
    }
  }, [currentMarketIndex, allMarkets, onMarketChange, setMarketData, setLivePrices]);

  const handleNextMarket = useCallback(() => {
    if (currentMarketIndex < allMarkets.length - 1) {
      const newIndex = currentMarketIndex + 1;
      setCurrentMarketIndex(newIndex);
      setMarketData(null);
      setLivePrices(null);
      onMarketChange?.(newIndex, allMarkets[newIndex]);
    }
  }, [currentMarketIndex, allMarkets, onMarketChange, setMarketData, setLivePrices]);

  const handleOfferExpire = useCallback(() => {
    setOfferExpired(true);
  }, []);

  // Update user position when initialUserPosition changes
  useEffect(() => {
    if (initialUserPosition !== undefined) {
      setUserPosition(initialUserPosition);
    }
  }, [initialUserPosition, setUserPosition]);

  // Refresh prices every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!showTradeInterface) {
        fetchLivePrices();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchLivePrices, showTradeInterface]);

  // Handle inline trade submission
  const handleInlineTradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amountNum = parseFloat(amount);
    if (!amount || amountNum < 1) {
      return;
    }

    if (!onConfirmTrade) return;

    setIsSubmitting(true);
    try {
      await onConfirmTrade(amount);
    } catch (error) {
      console.error('[InlineTrade] Error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTradeClose = (tradeCompleted: boolean) => {
    handleCloseTrade(tradeCompleted);
    if (onResetTrade) {
      onResetTrade();
    }
  };

  if (!deal) {
    return (
      <div className="border border-black bg-white p-4">
        <p className="font-mono text-xs font-bold uppercase tracking-wider text-black/60">NO MARKET DATA AVAILABLE</p>
      </div>
    );
  }

  const isYesOpportunity = deal?.opportunity === 'BUY YES';
  const yesRaw = livePrices?.yes ?? deal?.current_yes_price;
  const noRaw = livePrices?.no ?? deal?.current_no_price;
  const pricesReady = yesRaw != null && noRaw != null;
  const yesPrice = Math.round((yesRaw ?? 0) * 100);
  const noPrice = Math.round((noRaw ?? 0) * 100);

  const currentPrice = selectedOutcome === 'YES'
    ? (yesRaw ?? 0)
    : selectedOutcome === 'NO'
      ? (noRaw ?? 0)
      : 0;

  const isInProgress = tradeProgress &&
    tradeProgress.step !== 'idle' &&
    tradeProgress.step !== 'completed' &&
    tradeProgress.step !== 'failed';

  return (
    <>
      {/* Horizontal Multi-Market Strip (Phase 5B) */}
      {hasMultipleMarkets && (
        <div className="mb-2">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {allMarkets.map((m: any, i: number) => {
              const q = m?.market_question || m?.question || 'Market';
              const isActive = i === currentMarketIndex;
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (showTradeInterface) return;
                    setCurrentMarketIndex(i);
                    setMarketData(null);
                    setLivePrices(null);
                    onMarketChange?.(i, allMarkets[i]);
                  }}
                  disabled={showTradeInterface}
                  className={`flex-shrink-0 max-w-[200px] px-3 py-2 border-2 text-left transition-all duration-200 ${
                    isActive
                      ? 'bg-black text-white border-black'
                      : showTradeInterface
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-white text-black border-black/20 hover:border-black'
                  }`}
                >
                  <span className="block text-[9px] font-mono font-bold uppercase tracking-wider leading-tight line-clamp-2">
                    {q.length > 60 ? q.slice(0, 60) + '...' : q}
                  </span>
                  <span className={`text-[8px] font-mono font-bold uppercase tracking-widest mt-0.5 ${
                    isActive ? 'text-white/60' : 'text-black/30'
                  }`}>
                    {i + 1}/{allMarkets.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="font-sans w-full">
        {/* Main Market Panel */}
        <motion.div
          className="relative overflow-hidden border-2 border-black bg-white w-full"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          key={currentMarketIndex}
        >
          {/* Header Section */}
          <div className="flex flex-col gap-2 p-5 border-b border-black bg-white">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <OfferExpiryTimer createdAt={offerCreatedAt} onExpire={handleOfferExpire} />
                <span className="text-black/20">|</span>
                <CountdownTimer endDate={deal?.end_date} />
              </div>
              {hasMultipleMarkets && (
                <span className="font-mono text-[10px] font-bold text-black/50 uppercase tracking-wider">
                  {currentMarketIndex + 1}/{allMarkets.length}
                </span>
              )}
            </div>

            <h2 className="text-base font-black leading-tight tracking-tight text-black uppercase">
              {deal?.market_question || deal?.question || 'Prediction Market'}
            </h2>
            <p className="font-mono text-xs leading-snug text-black/70">
              {generateMarketSummary(deal, livePrices)}
            </p>
          </div>

          {/* Recommendation + Probability */}
          <div className="grid grid-cols-2 divide-x divide-black bg-white">
            <div className="p-5 flex flex-col justify-center">
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-black/60 mb-1">REC</span>
              <span
                className={`text-4xl font-black tracking-tighter uppercase ${isYesOpportunity ? 'text-green-700' : 'text-red-700'
                  }`}
              >
                {isYesOpportunity ? 'YES' : 'NO'}
              </span>
            </div>
            <div className="p-5 flex flex-col justify-center">
              <ProbabilityBar yesPercent={yesPrice} noPercent={noPrice} isYesRecommended={isYesOpportunity} isLive={!!livePrices} />
            </div>
          </div>

          {/* Sparkline + Volume Stats (Phase 5A) */}
          {(() => {
            const tokenIds = deal?.clobTokenIds || deal?.clob_token_ids;
            const parsedIds = typeof tokenIds === 'string' ? (() => { try { return JSON.parse(tokenIds); } catch { return []; } })() : tokenIds;
            const yesTokenId = Array.isArray(parsedIds) && parsedIds.length > 0 ? parsedIds[0] : null;
            const condId = deal?.condition_id || deal?.conditionId;
            if (!yesTokenId || !condId) return null;

            return (
              <div className="border-t border-black/10 bg-white px-5 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 size={10} className="text-black/30" />
                  <span className="text-[8px] font-mono font-bold uppercase tracking-widest text-black/30">24H PRICE</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <ChatSparkline conditionId={condId} tokenId={yesTokenId} width={160} height={36} />
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <span className="block text-[7px] font-mono font-bold uppercase tracking-widest text-black/30">VOL</span>
                      <span className="font-mono text-[11px] font-bold text-black">
                        ${deal?.volume >= 1_000_000 ? `${(deal.volume / 1_000_000).toFixed(1)}M` : deal?.volume >= 1_000 ? `${(deal.volume / 1_000).toFixed(0)}K` : (deal?.volume || 0).toFixed(0)}
                      </span>
                    </div>
                    {deal?.liquidity > 0 && (
                      <div className="text-right">
                        <span className="block text-[7px] font-mono font-bold uppercase tracking-widest text-black/30">LIQ</span>
                        <span className="font-mono text-[11px] font-bold text-black">
                          ${deal.liquidity >= 1_000 ? `${(deal.liquidity / 1_000).toFixed(0)}K` : deal.liquidity.toFixed(0)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Key Insights */}
          <KeyInsightsSection deal={deal} />

          {/* Trade Buttons */}
          <div className="p-5 bg-white border-t border-black">
            {offerExpired && !showTradeInterface && (
              <div className="mb-2 p-2 bg-red-50 border border-red-200">
                <p className="font-mono text-[10px] font-bold text-red-700 uppercase tracking-wider text-center">
                  OFFER EXPIRED - REQUEST A NEW SIGNAL
                </p>
              </div>
            )}

            {/* Trade selection buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleTrade('YES', 'BUY')}
                disabled={offerExpired || isInProgress || !pricesReady}
                className={`group relative flex items-center justify-center gap-2 px-4 py-3 border-2 transition-all duration-300 ${offerExpired || !pricesReady
                  ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed opacity-50'
                  : isInProgress
                    ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed'
                    : showTradeInterface && selectedOutcome === 'YES' && tradeAction === 'BUY'
                      ? 'bg-green-700 border-green-700 text-white ring-2 ring-green-400 ring-offset-1'
                      : isYesOpportunity
                        ? 'bg-green-700 border-green-700 text-white hover:bg-white hover:text-green-700'
                        : 'bg-white border-black text-black hover:bg-black hover:text-white'
                  }`}
              >
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-bold tracking-widest uppercase">
                  BUY YES
                </span>
              </button>

              <button
                onClick={() => handleTrade('NO', 'BUY')}
                disabled={offerExpired || isInProgress || !pricesReady}
                className={`group relative flex items-center justify-center gap-2 px-4 py-3 border-2 transition-all duration-300 ${offerExpired || !pricesReady
                  ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed opacity-50'
                  : isInProgress
                    ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed'
                    : showTradeInterface && selectedOutcome === 'NO' && tradeAction === 'BUY'
                      ? 'bg-red-700 border-red-700 text-white ring-2 ring-red-400 ring-offset-1'
                      : !isYesOpportunity
                        ? 'bg-red-700 border-red-700 text-white hover:bg-white hover:text-red-700'
                        : 'bg-white border-black text-black hover:bg-black hover:text-white'
                  }`}
              >
                <TrendingDown className="h-4 w-4" />
                <span className="text-sm font-bold tracking-widest uppercase">
                  BUY NO
                </span>
              </button>
            </div>

            {!pricesReady && !offerExpired && (
              <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-wider text-black/50 text-center">
                Prices loading…
              </p>
            )}

            {/* Inline Trade Interface */}
            <TradeInterface
              showTradeInterface={showTradeInterface}
              selectedOutcome={selectedOutcome}
              tradeAction={tradeAction}
              amount={amount}
              isSubmitting={isSubmitting}
              tradeProgress={tradeProgress}
              onAmountChange={setAmount}
              onSubmit={handleInlineTradeSubmit}
              onClose={handleTradeClose}
              currentPrice={currentPrice}
              livePrices={livePrices}
              deal={deal}
              maxApproval={maxApproval}
              onMaxApprovalChange={setMaxApproval}
            />

            {/* Footer: Stats + View in Terminal (Phase 5A/5C) */}
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-black/50">
                  VOL: ${((deal?.volume || 0) / 1000).toFixed(1)}K
                </span>
                {marketData && !showTradeInterface && (
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-green-700">
                    READY
                  </span>
                )}
              </div>
              <a
                href={`/markets?detail=${deal?.condition_id || deal?.conditionId || ''}`}
                className="flex items-center gap-1 px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-widest text-black/40 border border-black/10 hover:border-black hover:text-black transition-colors"
              >
                <ExternalLink size={9} />
                VIEW IN TERMINAL
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}