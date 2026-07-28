import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, TrendingUp, TrendingDown, ChevronDown } from 'lucide-react';
import { TradeProgress, TradeStep } from '@/lib/hooks/use-trade-execution';
import { PolymarketAvailable } from '@/components/markets/PolymarketAvailable';

interface TradeInterfaceProps {
  showTradeInterface: boolean;
  selectedOutcome: string | null;
  tradeAction: 'BUY' | 'SELL';
  amount: string;
  isSubmitting: boolean;
  tradeProgress?: TradeProgress;
  onAmountChange: (amount: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  onClose: (tradeCompleted: boolean) => void;
  currentPrice: number;
  livePrices: { yes: number; no: number } | null;
  deal: any;
  maxApproval: number;
  onMaxApprovalChange: (value: number) => void;
}

export function TradeInterface({
  showTradeInterface,
  selectedOutcome,
  tradeAction,
  amount,
  isSubmitting,
  tradeProgress,
  onAmountChange,
  onSubmit,
  onClose,
  currentPrice,
  maxApproval,
  onMaxApprovalChange,
}: TradeInterfaceProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isInProgress = tradeProgress &&
    tradeProgress.step !== 'idle' &&
    tradeProgress.step !== 'completed' &&
    tradeProgress.step !== 'failed';
  const isCompleted = tradeProgress?.step === 'completed';
  const isFailed = tradeProgress?.step === 'failed';

  const amountNum = amount ? parseFloat(amount) || 0 : 0;
  const estimatedShares = currentPrice > 0 && !isNaN(amountNum) ? amountNum / currentPrice : 0;
  const potentialProfit = !isNaN(estimatedShares) ? estimatedShares * (1 - currentPrice) : 0;

  const formatNumber = (num: unknown, decimals: number = 2): string => {
    if (num === null || num === undefined) return '0.00';
    const n = typeof num === 'number' ? num : parseFloat(String(num));
    if (isNaN(n) || !isFinite(n)) return '0.00';
    return n.toFixed(decimals);
  };

  return (
    <AnimatePresence>
      {showTradeInterface && selectedOutcome && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-3 border border-[#e5e7eb] rounded-[12px] overflow-hidden"
        >
          {/* Trade Header */}
          <div className={`flex items-center justify-between px-3 py-2 ${
            tradeAction === 'SELL'
              ? 'bg-orange-600'
              : selectedOutcome === 'YES'
                ? 'bg-green-700'
                : 'bg-red-700'
          } text-white`}>
            <div className="flex items-center gap-2">
              {tradeAction === 'SELL' ? (
                <ArrowRight className="h-4 w-4 rotate-180" />
              ) : selectedOutcome === 'YES' ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              <span className="text-xs font-semibold">
                {tradeAction} {selectedOutcome}
              </span>
            </div>
            {!isInProgress && !isCompleted && (
              <button
                onClick={() => onClose(false)}
                className="hover:bg-white/20 p-1 transition-colors"
              >
                <span className="text-white font-mono text-xs">&times;</span>
              </button>
            )}
          </div>

          {/* Trade Form */}
          <form onSubmit={onSubmit} className="p-3 space-y-3 bg-white">
            {/* Amount Input */}
            {!isInProgress && !isCompleted && !isFailed && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-[#6b7280]">
                      Amount (pUSD) - Min $1
                    </label>
                    <PolymarketAvailable />
                  </div>

                  {/* Quick Amount Buttons */}
                  <div className="flex gap-2 mb-2">
                    {[1, 5, 10, 25].map((quickAmount) => (
                      <button
                        key={quickAmount}
                        type="button"
                        onClick={() => onAmountChange(quickAmount.toString())}
                        disabled={isSubmitting}
                        className={`flex-1 py-1.5 border rounded-lg font-mono text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          amount === quickAmount.toString()
                            ? selectedOutcome === 'YES'
                              ? 'bg-green-700 border-green-700 text-white'
                              : 'bg-red-700 border-red-700 text-white'
                            : 'border-[#e5e7eb] bg-white text-[#3a3a3a] hover:bg-[#f7f7f7]'
                        }`}
                      >
                        ${quickAmount}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-black/40 font-mono text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={amount}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        // Enforce minimum of $1
                        if (val < 1 && e.target.value !== '') {
                          onAmountChange('1');
                        } else {
                          onAmountChange(e.target.value);
                        }
                      }}
                      placeholder="1.00"
                      className="w-full pl-6 pr-3 py-2 border border-[#e5e7eb] rounded-lg font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#3a3a3a] disabled:bg-gray-100 disabled:cursor-not-allowed"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                {/* Trade Details */}
                {amount && amountNum > 0 && (
                  <div className="space-y-1 p-2 bg-[#f8fafc] border border-[#e5e7eb] rounded-lg">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[9px] font-mono text-[#6b7280]">
                        Current Price
                      </span>
                      <span className="font-mono text-xs font-bold text-black">
                        ${formatNumber(currentPrice)}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-[9px] font-mono text-[#6b7280]">
                        Est. Shares
                      </span>
                      <span className="font-mono text-xs font-bold text-black">
                        {formatNumber(estimatedShares)}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline pt-1 border-t border-[#e5e7eb]">
                      <span className="text-[9px] font-mono text-[#6b7280]">
                        Max Profit
                      </span>
                      <span className={`font-mono text-xs font-bold ${
                        potentialProfit > 0 ? 'text-green-700' : 'text-black'
                      }`}>
                        ${formatNumber(Math.abs(potentialProfit))}
                      </span>
                    </div>
                  </div>
                )}

                {/* Advanced Settings */}
                <div className="border border-[#e5e7eb] rounded-lg">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] text-[#6b7280] hover:text-[#3a3a3a] transition-colors"
                  >
                    <span>Advanced</span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  </button>
                  {showAdvanced && (
                    <div className="px-2 pb-2 space-y-1.5">
                      <label className="block text-[11px] font-semibold text-[#6b7280]">
                        Max Approval (pUSD)
                      </label>
                      <p className="text-[9px] text-[#6b7280]">
                        One-time approval per contract. Higher = fewer future approvals.
                      </p>
                      <div className="flex gap-1.5 mb-1.5">
                        {[100, 1000, 10000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => onMaxApprovalChange(preset)}
                            className={`flex-1 py-1 border rounded-lg font-mono text-[10px] font-bold transition-colors ${
                              maxApproval === preset
                                ? 'bg-[#3a3a3a] border-[#3a3a3a] text-white'
                                : 'border-[#e5e7eb] bg-white text-[#3a3a3a] hover:border-[#3a3a3a]'
                            }`}
                          >
                            ${preset.toLocaleString()}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={maxApproval}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (val > 0) onMaxApprovalChange(val);
                        }}
                        className="w-full px-2 py-1.5 border border-[#e5e7eb] rounded-lg font-mono text-xs focus:outline-none focus:border-[#3a3a3a]"
                        disabled={isSubmitting}
                      />
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className={`w-full px-3 py-2.5 border rounded-lg font-mono text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    tradeAction === 'SELL'
                      ? 'bg-orange-600 border-orange-600 text-white hover:bg-orange-700 disabled:hover:bg-orange-600'
                      : selectedOutcome === 'YES'
                        ? 'bg-green-700 border-green-700 text-white hover:bg-green-800 disabled:hover:bg-green-700'
                        : 'bg-red-700 border-red-700 text-white hover:bg-red-800 disabled:hover:bg-red-700'
                  }`}
                  disabled={!amount || amountNum < 1 || isNaN(amountNum) || isSubmitting}
                >
                  {isSubmitting ? 'PROCESSING...' : `CONFIRM ${tradeAction} ${selectedOutcome}`}
                </button>
              </>
            )}

            {/* Progress / Completion / Failure */}
            {(isInProgress || isCompleted || isFailed) && tradeProgress && (
              <CookingProgress
                tradeProgress={tradeProgress}
                isCompleted={!!isCompleted}
                isFailed={!!isFailed}
                onClose={onClose}
                selectedOutcome={selectedOutcome}
                currentPrice={currentPrice}
                amount={amount}
              />
            )}
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Phase mapping ──
type Phase = 'early' | 'middle' | 'late';

const PHASE_MAP: Record<TradeStep, Phase> = {
  idle: 'early',
  checking_balance: 'early',
  switching_to_polygon: 'early',
  funding_gas: 'early',
  bridging: 'early',
  waiting_bridge: 'early',
  approving: 'middle',
  swapping_usdc: 'middle',
  signing_order: 'middle',
  submitting_order: 'late',
  switching_to_base: 'late',
  redeeming: 'middle',
  completed: 'late',
  failed: 'late',
};

const PHASE_MESSAGES: Record<Phase, string[]> = {
  early: [
    "Finding the best price for you...",
    "Setting things up...",
    "Warming up...",
  ],
  middle: [
    "We're cooking...",
    "Preparing your position...",
    "Almost ready...",
  ],
  late: [
    "Placing your order...",
    "Securing your position...",
    "Final touches...",
  ],
};

interface CookingProgressProps {
  tradeProgress: TradeProgress;
  isCompleted: boolean;
  isFailed: boolean;
  onClose: (tradeCompleted: boolean) => void;
  selectedOutcome: string | null;
  currentPrice: number;
  amount: string;
}

function CookingProgress({
  tradeProgress,
  isCompleted,
  isFailed,
  onClose,
  selectedOutcome,
  currentPrice,
  amount,
}: CookingProgressProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const phaseRef = useRef<Phase>('early');

  const phase = PHASE_MAP[tradeProgress.step] || 'early';

  // Reset message index when phase changes
  useEffect(() => {
    if (phase !== phaseRef.current) {
      phaseRef.current = phase;
      setMessageIndex(0);
    }
  }, [phase]);

  // Rotate messages every 2.5s
  useEffect(() => {
    if (isCompleted || isFailed) return;
    const messages = PHASE_MESSAGES[phase];
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % messages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [phase, isCompleted, isFailed]);

  const currentMessage = PHASE_MESSAGES[phase][messageIndex % PHASE_MESSAGES[phase].length];

  // ── Completed state ──
  if (isCompleted) {
    const amountNum = parseFloat(amount) || 0;
    const shares = currentPrice > 0 ? amountNum / currentPrice : 0;

    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center py-4">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-center"
          >
            <p className="font-mono text-lg font-black text-green-700">
              YOU&apos;RE IN
            </p>
            <div className="mt-2 space-y-0.5">
              <p className="font-mono text-xs text-black/60">
                {selectedOutcome} @ ${currentPrice.toFixed(2)} &middot; ~{shares.toFixed(1)} shares
              </p>
            </div>
          </motion.div>
        </div>
        <button
          type="button"
          onClick={() => onClose(true)}
          className="w-full px-3 py-2 bg-green-700 border border-green-700 rounded-lg text-white font-mono text-xs font-bold hover:bg-green-800 transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  // ── Failed state ──
  if (isFailed) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center py-4">
          <p className="font-mono text-sm font-black text-red-700">
            SOMETHING WENT WRONG
          </p>
          <p className="mt-1 font-mono text-[10px] text-black/50">
            Don&apos;t worry, no funds were lost.
          </p>
        </div>

        {tradeProgress.error && (
          <div className="border border-[#e5e7eb] rounded-lg">
            <button
              type="button"
              onClick={() => setShowErrorDetails(!showErrorDetails)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] text-[#6b7280] hover:text-[#3a3a3a] transition-colors"
            >
              <span>Details</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${showErrorDetails ? 'rotate-180' : ''}`} />
            </button>
            {showErrorDetails && (
              <div className="px-2 pb-2">
                <p className="text-[9px] font-mono text-red-700 break-all">
                  {tradeProgress.error}
                </p>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => onClose(false)}
          className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#3a3a3a] rounded-lg text-white font-mono text-xs font-bold hover:bg-gray-800 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // ── In-progress state ──
  return (
    <div className="flex flex-col items-center py-6">
      <motion.p
        key={currentMessage}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.3 }}
        className="font-mono text-sm font-bold text-[#3a3a3a]"
      >
        <motion.span
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {currentMessage}
        </motion.span>
      </motion.p>
    </div>
  );
}
