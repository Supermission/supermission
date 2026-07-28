'use client';

import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { NormalizedQuoteResponse } from '@/lib/uniswap/types';
import { CHAIN_NAMES } from '@/lib/uniswap/types';
import type { SwapParams } from '@/lib/hooks/use-uniswap-swap';
import { SwapProgress } from './SwapProgress';
import type { SwapStep } from '@/lib/hooks/use-uniswap-swap';

interface SwapConfirmationProps {
  quote: NormalizedQuoteResponse;
  params: SwapParams;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  swapProgress: { step: SwapStep; message: string; txHash?: string };
  isSwapping: boolean;
}

export function SwapConfirmation({
  quote,
  params,
  tokenInSymbol,
  tokenOutSymbol,
  onConfirm,
  onClose,
  swapProgress,
  isSwapping,
}: SwapConfirmationProps) {
  const [confirmed, setConfirmed] = useState(false);
  const isProcessing = swapProgress.step !== 'idle' && swapProgress.step !== 'failed';
  const isComplete = swapProgress.step === 'completed';
  const isCrossChain = params.toChainId && params.toChainId !== params.chainId;

  const handleConfirm = async () => {
    setConfirmed(true);
    try {
      await onConfirm();
    } catch {
      // Error handled by hook
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={!isProcessing ? onClose : undefined}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-md bg-white border border-[#e5e7eb] rounded-[12px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] rounded-t-[12px]">
            <span className="text-sm font-bold uppercase tracking-wider text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              {confirmed ? (isCrossChain ? 'Cross-Chain Swap in Progress' : 'Swap in Progress') : (isCrossChain ? 'Confirm Cross-Chain Swap' : 'Confirm Swap')}
            </span>
            {!isProcessing && (
              <button onClick={onClose} className="hover:bg-[#f7f7f7] p-1 transition-colors rounded-[8px]">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Review details (before confirm) */}
          {!confirmed && (
            <div className="p-4 space-y-4">
              {/* Cross-chain route indicator */}
              {isCrossChain && (
                <div className="flex items-center justify-center gap-2 py-2 px-3 bg-black/5 border border-[#e5e7eb] rounded-[8px]">
                  <span className="font-mono text-xs font-bold uppercase">{CHAIN_NAMES[params.chainId] || `Chain ${params.chainId}`}</span>
                  <span className="font-mono text-xs text-black/40">→</span>
                  <span className="font-mono text-xs font-bold uppercase">{CHAIN_NAMES[params.toChainId!] || `Chain ${params.toChainId}`}</span>
                </div>
              )}

              {/* Swap summary */}
              <div className="p-3 bg-neutral-50 border border-[#e5e7eb] rounded-[8px] space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>You Pay</span>
                  <span className="font-mono text-sm font-bold">
                    {params.amountIn} {tokenInSymbol}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>You Receive</span>
                  <span className="font-mono text-sm font-bold">
                    {quote.amountOutFormatted || quote.amountOut} {tokenOutSymbol}
                  </span>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2">
                {quote.priceImpact !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-[10px] text-[#6b7280] uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Price Impact</span>
                    <span className={`font-mono text-xs font-bold ${
                      quote.priceImpact > 3 ? 'text-red-600' : quote.priceImpact > 1 ? 'text-amber-600' : 'text-black/60'
                    }`}>
                      {quote.priceImpact.toFixed(2)}%
                    </span>
                  </div>
                )}
                {quote.gasEstimateUSD && (
                  <div className="flex justify-between">
                    <span className="text-[10px] text-[#6b7280] uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Est. Gas</span>
                    <span className="font-mono text-xs text-black/60">${quote.gasEstimateUSD}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[10px] text-[#6b7280] uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Slippage</span>
                  <span className="font-mono text-xs text-black/60">{(params.slippageBps || 50) / 100}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-[#6b7280] uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Source</span>
                  <span className="font-mono text-xs text-black/60 uppercase">{quote.source}</span>
                </div>
                {quote.route && (
                  <div className="flex justify-between">
                    <span className="text-[10px] text-[#6b7280] uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{isCrossChain ? 'Bridge' : 'Route'}</span>
                    <span className="font-mono text-[10px] text-[#6b7280] truncate max-w-[200px]">{quote.route}</span>
                  </div>
                )}
              </div>

              {/* X402 fee note */}
              <div className="p-2 bg-black/5 border border-[#e5e7eb] rounded-[8px]">
                <p className="text-[10px] text-[#6b7280] text-center" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  Service fee: $0.10 USDC (covers gas for embedded wallets)
                </p>
              </div>

              {/* High price impact warning */}
              {quote.priceImpact !== undefined && quote.priceImpact > 3 && (
                <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-[8px]">
                  <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                  <p className="text-[10px] text-red-700" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    High price impact! You may receive significantly fewer tokens.
                  </p>
                </div>
              )}

              <button
                onClick={handleConfirm}
                disabled={isSwapping}
                className="w-full py-3.5 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]"
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                {isCrossChain ? 'Confirm Cross-Chain Swap' : 'Confirm Swap'}
              </button>
            </div>
          )}

          {/* Progress (after confirm) */}
          {confirmed && (
            <SwapProgress
              step={swapProgress.step}
              message={swapProgress.message}
              txHash={swapProgress.txHash}
              chainId={params.chainId}
              onClose={onClose}
            />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
