// Inline Uniswap V3 LP remove/collect card — renders inside chat message
'use client';

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUniswapLP } from '@/lib/hooks/use-uniswap-lp';
import { useChatStore } from '@/lib/store/chat';
import { TxProgressBar } from './tx-progress-bar';

interface RemoveLiquidityData {
  tokenId: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  liquidity: string;
  percentage: number;
  estimatedAmount0: string;
  estimatedAmount1: string;
  feeAmount0: string;
  feeAmount1: string;
  feeTier: string;
  inRange: boolean;
}

interface CollectFeesData {
  tokenId: string;
  token0Symbol: string;
  token1Symbol: string;
  feeAmount0: string;
  feeAmount1: string;
  feeTier: string;
}

const REMOVE_STEPS = [
  { key: 'removing_liquidity', label: 'Remove' },
  { key: 'collecting', label: 'Collect' },
  { key: 'completed', label: 'Done' },
];

const COLLECT_STEPS = [
  { key: 'collecting', label: 'Collect' },
  { key: 'completed', label: 'Done' },
];

export function UniswapLPRemoveInline({ data, mode, isHistory }: { data: RemoveLiquidityData | CollectFeesData; mode: 'remove' | 'collect'; isHistory?: boolean }) {
  const { removeLiquidity, collectFees, progress, isExecuting, reset } = useUniswapLP();
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const feedbackSent = useRef(false);
  const addMessage = useChatStore((s) => s.addMessage);

  const isDone = progress.step === 'completed';
  const isFailed = progress.step === 'failed';
  const showProgress = confirmed && (isExecuting || isDone || isFailed);

  const isRemove = mode === 'remove';
  const removeData = isRemove ? (data as RemoveLiquidityData) : null;
  const steps = isRemove ? REMOVE_STEPS : COLLECT_STEPS;

  useEffect(() => {
    if (isHistory) return;
    if (feedbackSent.current) return;

    if (progress.step === 'completed' && progress.txHash) {
      feedbackSent.current = true;
      if (isRemove) {
        addMessage({
          role: 'assistant',
          content: `Liquidity removed from position #${data.tokenId}: ~${removeData!.estimatedAmount0} ${data.token0Symbol} + ${removeData!.estimatedAmount1} ${data.token1Symbol}. Transaction: https://basescan.org/tx/${progress.txHash}`,
        });
      } else {
        addMessage({
          role: 'assistant',
          content: `Fees collected from position #${data.tokenId}: ${data.feeAmount0} ${data.token0Symbol} + ${data.feeAmount1} ${data.token1Symbol}. Transaction: https://basescan.org/tx/${progress.txHash}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
      window.dispatchEvent(new Event('trade-completed'));
    } else if (progress.step === 'failed' && progress.error) {
      feedbackSent.current = true;
      addMessage({
        role: 'assistant',
        content: `${isRemove ? 'Liquidity removal' : 'Fee collection'} failed: ${progress.error}`,
      });
    }
  }, [isHistory, progress.step, progress.txHash, progress.error, data, addMessage, queryClient, isRemove, removeData]);

  const handleConfirm = async () => {
    setConfirmed(true);
    feedbackSent.current = false;
    try {
      if (isRemove && removeData) {
        await removeLiquidity({
          tokenId: removeData.tokenId,
          liquidity: removeData.liquidity,
          percentage: removeData.percentage,
          token0Decimals: removeData.token0Decimals,
          token1Decimals: removeData.token1Decimals,
        });
      } else {
        await collectFees({ tokenId: data.tokenId });
      }
    } catch {
      // error is already in progress state
    }
  };

  const handleReset = () => {
    setConfirmed(false);
    feedbackSent.current = false;
    reset();
  };

  if (isHistory) {
    return (
      <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] overflow-hidden">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-[#1a1a1a] truncate">
                {isRemove
                  ? `Remove ${removeData!.percentage}% Liquidity: Position #${data.tokenId}`
                  : `Collect Fees: Position #${data.tokenId}`
                }
              </span>
            </div>
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-[#e5e7eb]">
          <span className="text-[12px] text-[#9ca3af]">{isRemove ? 'LP removal' : 'Fee collection'} offer expired (from previous session)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-[#1a1a1a] truncate">
              {isRemove
                ? `Remove ${removeData!.percentage}% Liquidity: Position #${data.tokenId}`
                : `Collect Fees: Position #${data.tokenId}`
              }
            </span>
          </div>
          <span className="text-[12px] text-[#6b7280] whitespace-nowrap">
            {data.token0Symbol}/{data.token1Symbol} {data.feeTier}
          </span>
        </div>
        {/* Estimated amounts */}
        <div className="mt-1 text-[11px] text-[#6b7280]">
          {isRemove ? (
            <span>~{removeData!.estimatedAmount0} {data.token0Symbol} + {removeData!.estimatedAmount1} {data.token1Symbol}</span>
          ) : (
            <span>Fees: {data.feeAmount0} {data.token0Symbol} + {data.feeAmount1} {data.token1Symbol}</span>
          )}
        </div>
      </div>

      {/* Progress */}
      {showProgress && (
        <TxProgressBar
          steps={steps}
          currentStep={progress.step}
          failed={isFailed}
          statusMessage={progress.message}
        />
      )}

      {/* Action */}
      <div className="px-4 py-2.5 border-t border-[#e5e7eb]">
        {!confirmed && !isExecuting && (
          <button
            onClick={handleConfirm}
            className="w-full h-9 bg-gradient-to-b from-[#1a1a1a] to-[#2d2d2d] text-white text-[12px] font-semibold rounded-[8px] hover:opacity-90 transition-opacity"
          >
            {isRemove ? 'Confirm Remove' : 'Confirm Collect'}
          </button>
        )}

        {isDone && progress.txHash && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-green-600">
              {isRemove ? 'Liquidity removed' : 'Fees collected'}
            </span>
            <a
              href={`https://basescan.org/tx/${progress.txHash}`}
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
              {progress.error || 'Operation failed'}
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
