// Inline swap execution card — renders inside DELPHI chat message
'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useQueryClient } from '@tanstack/react-query';
import { useLifiSwap } from '@/lib/hooks/use-uniswap-swap';
import { useChatStore } from '@/lib/store/chat';
import { TxProgressBar } from './tx-progress-bar';
import { ContractAddress } from '@/components/ui/contract-address';

interface SwapData {
  fromSymbol: string;
  toSymbol: string;
  fromLogoURI: string | null;
  toLogoURI: string | null;
  amountIn: string;
  amountOutFormatted: string;
  priceImpact: number | null;
  gasEstimateUSD: string | null;
  route: string;
  chainId: number;
  toChainId: number;
  fromChainName: string;
  toChainName: string;
  isCrossChain: boolean;
  slippageBps: number;
  params: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    decimalsIn: number;
    decimalsOut: number;
    chainId: number;
    toChainId?: number;
    slippageBps?: number;
  };
  quote: {
    ok: boolean;
    source: string;
    chainId: number;
    toChainId?: number;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    amountOutFormatted?: string;
    priceImpact?: number;
    gasEstimateUSD?: string;
    route?: string;
    methodParameters?: {
      calldata: string;
      value: string;
      to: string;
    };
    spender?: string;
  };
}

const EXPLORER_URLS: Record<number, string> = {
  8453: 'https://basescan.org',
  1: 'https://etherscan.io',
  137: 'https://polygonscan.com',
};

const SWAP_STEPS = [
  { key: 'checking_balance', label: 'Check' },
  {
    key: 'approving',
    label: 'Approve',
    hint: 'One-time permission for the router to spend this token. No funds move yet.',
  },
  {
    key: 'swapping',
    label: 'Execute',
    hint: 'Signing the swap — this is the transaction that actually moves your tokens.',
  },
  { key: 'completed', label: 'Done' },
];

const SIGN_DELAY_SECONDS = 3;

export function SwapExecuteInline({ data, isHistory }: { data: SwapData; isHistory?: boolean }) {
  const { executeSwap, progress, isSwapping, reset } = useLifiSwap();
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [countdown, setCountdown] = useState(SIGN_DELAY_SECONDS);
  const [aborted, setAborted] = useState(false);
  const feedbackSent = useRef(false);
  const executingRef = useRef(false);
  const abortedRef = useRef(false);
  const addMessage = useChatStore((s) => s.addMessage);

  const explorerUrl = EXPLORER_URLS[data.toChainId] || EXPLORER_URLS[data.chainId] || 'https://basescan.org';
  const isDone = progress.step === 'completed';
  const isFailed = progress.step === 'failed';
  const showProgress = confirmed && (isSwapping || isDone || isFailed);

  // Countdown before wallet signature — gives user a beat to read the card and cancel.
  // User already confirmed via text chat; the countdown is an abort window, not a confirmation step.
  useEffect(() => {
    if (isHistory) return;
    if (executingRef.current || abortedRef.current) return;
    if (countdown <= 0) {
      handleConfirm();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, isHistory]);

  const handleCancel = () => {
    abortedRef.current = true;
    setAborted(true);
    addMessage({ role: 'assistant', content: 'Swap canceled.' });
  };

  // Send feedback message to chat so the AI knows the outcome
  useEffect(() => {
    if (isHistory) return;
    if (feedbackSent.current) return;

    if (progress.step === 'completed' && progress.txHash) {
      feedbackSent.current = true;
      const chain = data.isCrossChain ? ` (${data.fromChainName} to ${data.toChainName})` : '';
      addMessage({
        role: 'assistant',
        content: `Swap confirmed: ${data.amountIn} ${data.fromSymbol} → ${data.amountOutFormatted} ${data.toSymbol}${chain}. Transaction: ${explorerUrl}/tx/${progress.txHash}`,
      });
      // Refresh portfolio + navbar wallet balance
      queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
      window.dispatchEvent(new Event('trade-completed'));
    } else if (progress.step === 'failed' && progress.error) {
      feedbackSent.current = true;
      addMessage({
        role: 'assistant',
        content: `Swap failed: ${progress.error}`,
      });
    }
  }, [isHistory, progress.step, progress.txHash, progress.error, data, explorerUrl, addMessage]);

  const handleConfirm = async () => {
    if (executingRef.current) return;
    executingRef.current = true;
    setConfirmed(true);
    feedbackSent.current = false;
    try {
      await executeSwap(data.params as any, data.quote as any);
    } catch {
      // error handled via progress state
    }
  };

  const handleReset = () => {
    setConfirmed(false);
    feedbackSent.current = false;
    executingRef.current = false;
    reset();
  };

  if (isHistory) {
    return (
      <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] overflow-hidden">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex items-center gap-1.5">
              {data.fromLogoURI && (
                <Image src={data.fromLogoURI} alt={data.fromSymbol} className="w-5 h-5 rounded-full" width={20} height={20} unoptimized />
              )}
              <span className="font-semibold text-[#1a1a1a]">
                {data.amountIn} {data.fromSymbol}
              </span>
            </div>
            <span className="text-[#9ca3af]">&rarr;</span>
            <div className="flex items-center gap-1.5">
              {data.toLogoURI && (
                <Image src={data.toLogoURI} alt={data.toSymbol} className="w-5 h-5 rounded-full" width={20} height={20} unoptimized />
              )}
              <span className="font-semibold text-[#1a1a1a]">
                {data.amountOutFormatted} {data.toSymbol}
              </span>
            </div>
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-[#e5e7eb]">
          <span className="text-[12px] text-[#9ca3af]">Swap offer expired (from previous session)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] overflow-hidden">
      {/* Swap details */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 text-[13px]">
          <div className="flex items-center gap-1.5">
            {data.fromLogoURI && (
              <Image src={data.fromLogoURI} alt={data.fromSymbol} className="w-5 h-5 rounded-full" width={20} height={20} unoptimized />
            )}
            <span className="font-semibold text-[#1a1a1a]">
              {data.amountIn} {data.fromSymbol}
            </span>
          </div>
          <span className="text-[#9ca3af]">&rarr;</span>
          <div className="flex items-center gap-1.5">
            {data.toLogoURI && (
              <Image src={data.toLogoURI} alt={data.toSymbol} className="w-5 h-5 rounded-full" width={20} height={20} unoptimized />
            )}
            <span className="font-semibold text-[#1a1a1a]">
              {data.amountOutFormatted} {data.toSymbol}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-1 text-[11px] text-[#9ca3af]">
          {data.isCrossChain && <span>{data.fromChainName} &rarr; {data.toChainName}</span>}
          {data.gasEstimateUSD && <span>Gas ~${data.gasEstimateUSD}</span>}
          {data.priceImpact != null && <span>Impact {data.priceImpact}%</span>}
          <span>Slippage {(data.slippageBps / 100).toFixed(1)}%</span>
        </div>
        {data.quote?.methodParameters?.to && (
          <div className="mt-1.5">
            <ContractAddress
              address={data.quote.methodParameters.to}
              chainId={data.chainId}
              label="Router"
            />
          </div>
        )}
      </div>

      {/* Step progress bar */}
      {showProgress && (
        <TxProgressBar
          steps={SWAP_STEPS}
          currentStep={progress.step}
          failed={isFailed}
          statusMessage={progress.message}
        />
      )}

      {/* Action area */}
      <div className="px-4 py-2.5 border-t border-[#e5e7eb]">
        {!confirmed && !isSwapping && !aborted && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#9ca3af]">
              Signing in {countdown}s…
            </span>
            <button
              type="button"
              onClick={handleCancel}
              className="text-[11px] font-semibold text-[#6b7280] hover:text-[#1a1a1a] transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
        {aborted && !isSwapping && (
          <span className="text-[12px] text-[#9ca3af]">Swap canceled.</span>
        )}

        {isDone && progress.txHash && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-green-600">
              {data.isCrossChain ? 'Cross-chain swap confirmed' : 'Swap confirmed'}
            </span>
            <a
              href={`${explorerUrl}/tx/${progress.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-medium text-[#6b7280] hover:text-[#1a1a1a] underline transition-colors"
            >
              View transaction
            </a>
          </div>
        )}

        {isFailed && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-red-500 truncate mr-2">
              {progress.error || 'Swap failed'}
            </span>
            <button
              onClick={handleReset}
              className="text-[11px] font-medium text-[#6b7280] hover:text-[#1a1a1a] underline transition-colors flex-shrink-0"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
