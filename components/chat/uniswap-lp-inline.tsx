// Compact inline Uniswap V3 LP preview — renders inside chat message (no button)
'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUniswapLP } from '@/lib/hooks/use-uniswap-lp';
import { useChatStore } from '@/lib/store/chat';
import { TxProgressBar } from './tx-progress-bar';

export interface UniswapLPData {
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  fee: number;
  tickLower: number;
  tickUpper: number;
  amount0: string;
  amount1: string;
  lowerPrice: string;
  upperPrice: string;
  currentPrice: string;
  estimatedAPR: number;
  ilRisk: string;
  poolAddress: string;
  rangeRationale: string;
}

const LP_STEPS = [
  { key: 'checking_balance', label: 'Check' },
  { key: 'approving_token0', label: 'Approve 1' },
  { key: 'approving_token1', label: 'Approve 2' },
  { key: 'adding_liquidity', label: 'Mint' },
  { key: 'completed', label: 'Done' },
];

/** Preview-only card shown after prepare_uniswap_lp — no button, no execution */
export function UniswapLPInline({ data, isHistory }: { data: UniswapLPData; isHistory?: boolean }) {
  if (isHistory) {
    return (
      <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] overflow-hidden">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-[#1a1a1a] truncate">
                Add Liquidity: {data.amount0} {data.token0Symbol} + {data.amount1} {data.token1Symbol}
              </span>
            </div>
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-[#e5e7eb]">
          <span className="text-[12px] text-[#9ca3af]">LP offer expired (from previous session)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-[#1a1a1a] truncate">
              Add Liquidity: {data.amount0} {data.token0Symbol} + {data.amount1} {data.token1Symbol}
            </span>
          </div>
          <span className="text-[12px] text-[#6b7280] whitespace-nowrap">{(data.fee / 10000).toFixed(2)}% fee</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-[#6b7280]">
          <span>Range: {data.lowerPrice}–{data.upperPrice}</span>
          <span>~{data.estimatedAPR.toFixed(0)}% APR</span>
          <span>IL: {data.ilRisk}</span>
        </div>
      </div>
    </div>
  );
}

// Track which LP executions have already run — prevents re-execution on chat history revisit
const executedLPs = new Set<string>();

/** Auto-executing LP card — triggered by execute_uniswap_lp after user says yes/go */
export function UniswapLPExecuteInline({ data, messageId }: { data: { confirmed: boolean }; messageId?: string }) {
  const { addLiquidity, progress, isExecuting, reset } = useUniswapLP();
  const queryClient = useQueryClient();
  const feedbackSent = useRef(false);
  const executingRef = useRef(false);
  const addMessage = useChatStore((s) => s.addMessage);
  const getMessages = useChatStore((s) => s.getMessages);

  // Find LP params from the most recent uniswap_lp_ready message
  const [lpData, setLpData] = useState<UniswapLPData | null>(null);

  useEffect(() => {
    const messages = getMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const action = (msg.metadata as { action?: { type: string; data?: any } })?.action;
      if (action?.type === 'uniswap_lp_ready' && action.data) {
        setLpData(action.data as UniswapLPData);
        break;
      }
    }
  }, [getMessages]);

  // Determine if stale/historical
  const [isStale] = useState(() => {
    const lpKey = messageId || `lp-${Date.now()}`;
    if (executedLPs.has(lpKey)) return true;
    const messages = getMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const action = (msg.metadata as { action?: { type: string } })?.action;
      if (action?.type === 'uniswap_lp_execution_ready') {
        if (msg.timestamp && Date.now() - msg.timestamp > 60_000) return true;
        break;
      }
    }
    return false;
  });

  const isDone = progress.step === 'completed';
  const isFailed = progress.step === 'failed';

  // Send feedback to chat
  useEffect(() => {
    if (feedbackSent.current || !lpData) return;

    if (progress.step === 'completed' && progress.txHash) {
      feedbackSent.current = true;
      addMessage({
        role: 'assistant',
        content: `LP position created: ${lpData.amount0} ${lpData.token0Symbol} + ${lpData.amount1} ${lpData.token1Symbol} in ${lpData.token0Symbol}/${lpData.token1Symbol} ${(lpData.fee / 10000).toFixed(2)}% pool. Transaction: https://basescan.org/tx/${progress.txHash}`,
      });
      queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
      window.dispatchEvent(new Event('trade-completed'));
    } else if (progress.step === 'failed' && progress.error) {
      feedbackSent.current = true;
      addMessage({
        role: 'assistant',
        content: `LP position failed: ${progress.error}`,
      });
    }
  }, [progress.step, progress.txHash, progress.error, lpData, addMessage, queryClient]);

  // Auto-execute on mount
  useEffect(() => {
    if (!lpData || executingRef.current || isExecuting || isStale) return;
    if (progress.step !== 'idle') return;

    const lpKey = messageId || `lp-${Date.now()}`;
    executedLPs.add(lpKey);
    executingRef.current = true;

    addLiquidity({
      token0Address: lpData.token0Address as `0x${string}`,
      token1Address: lpData.token1Address as `0x${string}`,
      token0Symbol: lpData.token0Symbol,
      token1Symbol: lpData.token1Symbol,
      token0Decimals: lpData.token0Decimals,
      token1Decimals: lpData.token1Decimals,
      fee: lpData.fee,
      tickLower: lpData.tickLower,
      tickUpper: lpData.tickUpper,
      amount0: lpData.amount0,
      amount1: lpData.amount1,
    }).catch(() => {
      // error already in progress state
    });
  }, [lpData, isExecuting, isStale, progress.step, messageId, addLiquidity]);

  if (!lpData) {
    return (
      <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] p-4">
        <span className="text-[13px] text-[#9ca3af]">Loading LP position...</span>
      </div>
    );
  }

  if (isStale && progress.step === 'idle') {
    return (
      <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] p-4">
        <span className="text-[12px] text-[#9ca3af]">LP position was executed previously.</span>
      </div>
    );
  }

  return (
    <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-[#1a1a1a] truncate">
              Add Liquidity: {lpData.amount0} {lpData.token0Symbol} + {lpData.amount1} {lpData.token1Symbol}
            </span>
          </div>
          <span className="text-[12px] text-[#6b7280] whitespace-nowrap">{(lpData.fee / 10000).toFixed(2)}% fee</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-[#6b7280]">
          <span>Range: {lpData.lowerPrice}–{lpData.upperPrice}</span>
          <span>~{lpData.estimatedAPR.toFixed(0)}% APR</span>
          <span>IL: {lpData.ilRisk}</span>
        </div>
      </div>

      {(isExecuting || isDone || isFailed) && (
        <TxProgressBar
          steps={LP_STEPS}
          currentStep={progress.step}
          failed={isFailed}
          statusMessage={progress.message}
        />
      )}

      <div className="px-4 py-2.5 border-t border-[#e5e7eb]">
        {isDone && progress.txHash && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-green-600">Liquidity added</span>
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
              {progress.error || 'Failed to add liquidity'}
            </span>
          </div>
        )}

        {!isDone && !isFailed && (
          <span className="text-[12px] text-[#6b7280]">Executing...</span>
        )}
      </div>
    </div>
  );
}
