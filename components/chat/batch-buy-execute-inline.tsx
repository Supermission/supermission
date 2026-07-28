// Inline batch buy execution card — renders inside DELPHI chat message
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLifiSwap } from '@/lib/hooks/use-uniswap-swap';
import { useChatStore } from '@/lib/store/chat';
import { useBatchSwapExecution, type BatchSwapItem } from '@/lib/hooks/use-batch-swap-execution';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface BatchBuyToken {
  symbol: string;
  address: string;
  amount?: string;
  allocationUSD?: number;
  priceUSD: number;
  allocationPercent: number;
  decimalsOut?: number;
}

interface BatchBuyPlan {
  tokens: BatchBuyToken[];
  fromToken: string;
  fromSymbol: string;
  decimalsIn: number;
  chainId: number;
  totalAmount: string;
  slippageBps?: number;
}

interface BatchBuyExecutionData {
  confirmed: boolean;
}

const EXPLORER_URLS: Record<number, string> = {
  8453: 'https://basescan.org',
  1: 'https://etherscan.io',
  137: 'https://polygonscan.com',
};

// Track which batch executions have already run — prevents re-execution on chat history revisit
const executedBatches = new Set<string>();

const SIGN_DELAY_SECONDS = 3;

export function BatchBuyExecuteInline({ data, messageId, isHistory }: { data: BatchBuyExecutionData; messageId?: string; isHistory?: boolean }) {
  const { fetchQuote, executeSwap, reset: resetSwap } = useLifiSwap();
  const { state, executingRef, initItems, updateItem, markDone, markFailed, finalize } = useBatchSwapExecution();
  const queryClient = useQueryClient();
  const feedbackSent = useRef(false);
  const abortedRef = useRef(false);
  const [aborted, setAborted] = useState(false);
  const [countdown, setCountdown] = useState(SIGN_DELAY_SECONDS);
  const addMessage = useChatStore((s) => s.addMessage);
  const getMessages = useChatStore((s) => s.getMessages);

  // Find the plan from the most recent batch_buy_plan_ready message
  const [plan, setPlan] = useState<BatchBuyPlan | null>(null);

  useEffect(() => {
    const messages = getMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const action = (msg.metadata as { action?: { type: string; data?: any } })?.action;
      if (action?.type === 'batch_buy_plan_ready' && action.data) {
        setPlan(action.data as BatchBuyPlan);
        break;
      }
    }
  }, [getMessages]);

  // Determine if this is a stale/historical message — don't re-execute
  const [isStale] = useState(() => {
    // History mode — loaded from DB, never re-execute
    if (isHistory) return true;
    // Check module-level set first
    const batchKey = messageId || `batch-${Date.now()}`;
    if (executedBatches.has(batchKey)) return true;
    // Check message age — if older than 60 seconds, it's from history
    const messages = getMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const action = (msg.metadata as { action?: { type: string } })?.action;
      if (action?.type === 'batch_buy_execution_ready') {
        if (msg.timestamp && Date.now() - msg.timestamp > 60_000) return true;
        break;
      }
    }
    return false;
  });

  // Countdown ticker — only runs while plan is loaded and we haven't aborted/started
  useEffect(() => {
    if (isHistory || isStale || !plan) return;
    if (abortedRef.current || executingRef.current) return;
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [plan, isHistory, isStale, countdown, executingRef]);

  const handleCancel = () => {
    abortedRef.current = true;
    setAborted(true);
    addMessage({ role: 'assistant', content: 'Batch buy canceled.' });
  };

  // Auto-execute on mount when plan is found — ONLY for live messages, after countdown
  useEffect(() => {
    if (!plan || executingRef.current || state.status !== 'idle' || isStale) return;
    if (abortedRef.current) return;
    if (countdown > 0) return;
    const batchKey = messageId || `batch-${Date.now()}`;
    executedBatches.add(batchKey);
    executingRef.current = true;

    const run = async () => {
      const tokens = plan.tokens;
      const items = initItems(tokens);

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Small delay between swaps to avoid rate limiting
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 1500));
        }

        // Reset swap hook state between swaps
        resetSwap();

        // Step 1: Quote
        updateItem(i, { status: 'quoting' });

        try {
          const amountIn = token.amount || String(token.allocationUSD || 0);
          const quote = await fetchQuote({
            tokenIn: plan.fromToken,
            tokenOut: token.address,
            amountIn,
            decimalsIn: plan.decimalsIn || 6,
            decimalsOut: token.decimalsOut ?? 18,
            chainId: plan.chainId as any,
            slippageBps: plan.slippageBps ?? 100,
          });

          if (!quote || !quote.methodParameters) {
            markFailed(i, 'Failed to get quote');
            continue;
          }

          // Step 2: Execute swap
          updateItem(i, { status: 'swapping' });

          const txHash = await executeSwap(
            {
              tokenIn: plan.fromToken,
              tokenOut: token.address,
              amountIn: amountIn,
              decimalsIn: plan.decimalsIn || 6,
              decimalsOut: token.decimalsOut ?? 18,
              chainId: plan.chainId as any,
              slippageBps: plan.slippageBps ?? 100,
            },
            quote,
          );

          if (txHash) {
            markDone(i, txHash, quote.amountOutFormatted || quote.amountOut, token.priceUSD);
          } else {
            markFailed(i, 'Transaction failed');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error
            ? (err as { shortMessage?: string }).shortMessage || err.message
            : 'Swap failed';
          markFailed(i, msg);
          // Continue to next token — don't abort batch on individual failure
        }
      }

      finalize();
    };

    run();
  }, [plan, state.status, countdown, isStale, executingRef, initItems, updateItem, markDone, markFailed, finalize, fetchQuote, executeSwap, resetSwap]);

  // Refresh portfolio + wallet balance when batch completes (no duplicate chat message)
  useEffect(() => {
    if (isHistory) return;
    if (feedbackSent.current) return;
    if (state.status !== 'completed' && state.status !== 'partial' && state.status !== 'failed') return;

    feedbackSent.current = true;
    queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
    window.dispatchEvent(new Event('trade-completed'));
  }, [isHistory, state.status, queryClient]);

  if (!plan) {
    return (
      <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] p-4">
        <span className="text-[13px] text-[#9ca3af]">Loading batch buy plan...</span>
      </div>
    );
  }

  // For historical/stale messages, show static card — don't re-execute
  if (isStale && state.status === 'idle') {
    return (
      <div
        className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] p-4"
        style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
      >
        <span className="text-[12px] text-[#9ca3af]">Batch buy was executed previously.</span>
      </div>
    );
  }

  const completedCount = state.items.filter((i) => i.status === 'done').length;
  const failedCount = state.items.filter((i) => i.status === 'failed').length;
  const processedCount = completedCount + failedCount;
  const isFinished = state.status === 'completed' || state.status === 'partial' || state.status === 'failed';

  return (
    <div
      className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] overflow-hidden"
      style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-[#e5e7eb]">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#1a1a1a]">
            Batch Buy — {plan.tokens.length} tokens
          </span>
          <span className="text-[11px] text-[#9ca3af]">
            {isFinished
              ? `${completedCount}/${state.items.length} complete`
              : `${processedCount}/${state.items.length} processing...`}
          </span>
        </div>
      </div>

      {/* Countdown / cancel window */}
      {!aborted && state.status === 'idle' && countdown > 0 && (
        <div className="px-4 py-2 border-b border-[#e5e7eb] flex items-center justify-between">
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
      {aborted && state.status === 'idle' && (
        <div className="px-4 py-2 border-b border-[#e5e7eb]">
          <span className="text-[12px] text-[#9ca3af]">Batch buy canceled.</span>
        </div>
      )}

      {/* Token list */}
      <div className="px-4 py-2 space-y-1.5">
        {state.items.map((item, idx) => (
          <BatchSwapRow key={idx} item={item} chainId={plan.chainId} fromSymbol={plan.fromSymbol} />
        ))}

        {/* Show pending items from plan if state hasn't initialized yet */}
        {state.items.length === 0 && plan.tokens.map((token, idx) => (
          <div key={idx} className="flex items-center gap-2 py-1">
            <span className="w-4 h-4 rounded-full bg-[#e5e7eb] flex-shrink-0" />
            <span className="text-[12px] text-[#9ca3af]">
              {token.symbol} — {token.amount} {plan.fromSymbol}
            </span>
          </div>
        ))}
      </div>

      {/* Footer summary */}
      {isFinished && (
        <div className="px-4 py-2.5 border-t border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <span
              className={`text-[12px] font-semibold ${
                state.status === 'completed'
                  ? 'text-emerald-600'
                  : state.status === 'partial'
                    ? 'text-amber-600'
                    : 'text-rose-500'
              }`}
            >
              {state.status === 'completed'
                ? 'All swaps confirmed'
                : state.status === 'partial'
                  ? `${completedCount} succeeded, ${failedCount} failed`
                  : 'All swaps failed'}
            </span>
            <span className="text-[11px] text-[#9ca3af]">
              {state.totalSpent.toFixed(4)} {plan.fromSymbol} spent
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Single row showing swap progress for one token */
function BatchSwapRow({
  item,
  chainId,
  fromSymbol,
}: {
  item: BatchSwapItem;
  chainId: number;
  fromSymbol: string;
}) {
  const explorerUrl = EXPLORER_URLS[chainId] || 'https://basescan.org';

  return (
    <div className="flex items-center gap-2 py-1">
      {/* Status icon */}
      {item.status === 'pending' && (
        <span className="w-4 h-4 rounded-full bg-[#e5e7eb] flex-shrink-0" />
      )}
      {(item.status === 'quoting' || item.status === 'swapping') && (
        <Loader2 className="w-4 h-4 text-[#6b7280] animate-spin flex-shrink-0" />
      )}
      {item.status === 'done' && (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
      )}
      {item.status === 'failed' && (
        <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
      )}

      {/* Token info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-[#1a1a1a]">{item.symbol}</span>
          <span className="text-[11px] text-[#9ca3af]">({item.allocationPercent}%)</span>
        </div>
      </div>

      {/* Status text */}
      <div className="text-right flex-shrink-0">
        {item.status === 'pending' && (
          <span className="text-[11px] text-[#9ca3af]">{item.amount} {fromSymbol}</span>
        )}
        {item.status === 'quoting' && (
          <span className="text-[11px] text-[#6b7280]">getting quote...</span>
        )}
        {item.status === 'swapping' && (
          <span className="text-[11px] text-[#6b7280]">swapping...</span>
        )}
        {item.status === 'done' && item.txHash && (
          <a
            href={`${explorerUrl}/tx/${item.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-emerald-600 hover:underline"
          >
            {item.amount} {fromSymbol} @ ${item.priceUSD.toFixed(4)}
          </a>
        )}
        {item.status === 'failed' && (
          <span className="text-[11px] text-rose-500 truncate max-w-[140px] inline-block">
            {item.error || 'Failed'}
          </span>
        )}
      </div>
    </div>
  );
}
