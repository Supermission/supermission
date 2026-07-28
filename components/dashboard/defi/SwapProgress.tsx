'use client';

import { Check, Loader2, ExternalLink } from 'lucide-react';
import type { SwapStep } from '@/lib/hooks/use-uniswap-swap';
import { CHAIN_NAMES, type SupportedChainId } from '@/lib/uniswap/types';

interface SwapProgressProps {
  step: SwapStep;
  message: string;
  txHash?: string;
  chainId: SupportedChainId;
  onClose: () => void;
}

const STEP_ORDER: SwapStep[] = ['fetching_quote', 'checking_balance', 'approving', 'swapping', 'completed'];
const STEP_LABELS: Record<string, string> = {
  fetching_quote: 'Get Quote',
  checking_balance: 'Check Balance',
  approving: 'Approve Token',
  swapping: 'Execute Swap',
  completed: 'Done',
};

const EXPLORER_URLS: Record<number, string> = {
  1: 'https://etherscan.io/tx/',
  8453: 'https://basescan.org/tx/',
  137: 'https://polygonscan.com/tx/',
};

export function SwapProgress({ step, message, txHash, chainId, onClose }: SwapProgressProps) {
  const currentIdx = STEP_ORDER.indexOf(step);
  const isComplete = step === 'completed';
  const isFailed = step === 'failed';

  return (
    <div className="p-4 space-y-4">
      {/* Steps */}
      <div className="space-y-3">
        {STEP_ORDER.map((s, i) => {
          const isActive = s === step;
          const isDone = currentIdx > i || isComplete;

          return (
            <div key={s} className="flex items-center gap-3">
              <div className={`w-6 h-6 flex items-center justify-center border rounded-full flex-shrink-0 ${
                isDone
                  ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] border-transparent text-white'
                  : isActive
                    ? 'border-[#3a3a3a]'
                    : 'border-[#e5e7eb]'
              }`}>
                {isDone ? (
                  <Check size={12} strokeWidth={3} />
                ) : isActive ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <span className="font-mono text-[10px] text-[#6b7280]">{i + 1}</span>
                )}
              </div>
              <span className={`text-xs font-bold uppercase tracking-wider ${
                isDone ? 'text-black' : isActive ? 'text-black' : 'text-[#6b7280]'
              }`} style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                {STEP_LABELS[s]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Status message */}
      <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{message}</p>

      {/* Transaction link */}
      {txHash && (
        <a
          href={`${EXPLORER_URLS[chainId] || EXPLORER_URLS[8453]}${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-mono text-xs underline text-black/60 hover:text-black"
        >
          View on {CHAIN_NAMES[chainId]} Explorer <ExternalLink size={10} />
        </a>
      )}

      {/* Close button when done or failed */}
      {(isComplete || isFailed) && (
        <button
          onClick={onClose}
          className="w-full py-2.5 border border-[#e5e7eb] rounded-[8px] text-xs font-bold uppercase tracking-wider hover:bg-[#f7f7f7] transition-colors"
          style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
        >
          {isComplete ? 'Done' : 'Close'}
        </button>
      )}
    </div>
  );
}
