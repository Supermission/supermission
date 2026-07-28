// Inline batch yield execution card — handles Uniswap V3 LP + Morpho deposits sequentially
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUniswapLP } from '@/lib/hooks/use-uniswap-lp';
import { useMorphoDeposit } from '@/lib/hooks/use-morpho-deposit';
import { useChatStore } from '@/lib/store/chat';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface BatchYieldPosition {
  index: number;
  protocol: string;
  label: string;
  amountUSD: number;
  status: 'ready' | 'error';
  error?: string;
  lpData?: any;
  morphoData?: any;
}

interface BatchYieldPlan {
  positions: BatchYieldPosition[];
  totalUSD: number;
  readyCount: number;
  totalCount: number;
}

type ItemStatus = 'pending' | 'executing' | 'done' | 'failed';

interface YieldItem {
  label: string;
  protocol: string;
  amountUSD: number;
  status: ItemStatus;
  txHash?: string;
  error?: string;
}

// Track which batch executions have already run
const executedBatches = new Set<string>();

export function BatchYieldExecuteInline({ data, messageId }: { data: { confirmed: boolean }; messageId?: string }) {
  const { addLiquidity, reset: resetLP } = useUniswapLP();
  const { executeDeposit, reset: resetMorpho } = useMorphoDeposit();
  const queryClient = useQueryClient();
  const feedbackSent = useRef(false);
  const executingRef = useRef(false);
  const addMessage = useChatStore((s) => s.addMessage);
  const getMessages = useChatStore((s) => s.getMessages);

  const [plan, setPlan] = useState<BatchYieldPlan | null>(null);
  const [items, setItems] = useState<YieldItem[]>([]);
  const [batchStatus, setBatchStatus] = useState<'idle' | 'executing' | 'completed' | 'partial' | 'failed'>('idle');

  // Find the plan from the most recent batch_yield_plan_ready message
  useEffect(() => {
    const messages = getMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const action = (msg.metadata as { action?: { type: string; data?: any } })?.action;
      if (action?.type === 'batch_yield_plan_ready' && action.data) {
        setPlan(action.data as BatchYieldPlan);
        break;
      }
    }
  }, [getMessages]);

  // Determine if stale/historical
  const [isStale] = useState(() => {
    const batchKey = messageId || `batch-yield-${Date.now()}`;
    if (executedBatches.has(batchKey)) return true;
    const messages = getMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const action = (msg.metadata as { action?: { type: string } })?.action;
      if (action?.type === 'batch_yield_execution_ready') {
        if (msg.timestamp && Date.now() - msg.timestamp > 60_000) return true;
        break;
      }
    }
    return false;
  });

  // Auto-execute on mount
  useEffect(() => {
    if (!plan || executingRef.current || batchStatus !== 'idle' || isStale) return;
    const batchKey = messageId || `batch-yield-${Date.now()}`;
    executedBatches.add(batchKey);
    executingRef.current = true;

    const readyPositions = plan.positions.filter((p) => p.status === 'ready');

    // Initialize items
    const initialItems: YieldItem[] = readyPositions.map((p) => ({
      label: p.label,
      protocol: p.protocol,
      amountUSD: p.amountUSD,
      status: 'pending' as ItemStatus,
    }));
    setItems(initialItems);
    setBatchStatus('executing');

    const run = async () => {
      const results: Array<{ status: 'done' | 'failed'; txHash?: string; error?: string }> = [];

      for (let i = 0; i < readyPositions.length; i++) {
        const pos = readyPositions[i];

        // Small delay between executions
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 2000));
        }

        // Update status to executing
        setItems((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: 'executing' };
          return next;
        });

        try {
          let txHash: string | undefined;

          if (pos.protocol === 'uniswap_v3' && pos.lpData) {
            resetLP();
            txHash = await addLiquidity({
              token0Address: pos.lpData.token0Address as `0x${string}`,
              token1Address: pos.lpData.token1Address as `0x${string}`,
              token0Symbol: pos.lpData.token0Symbol,
              token1Symbol: pos.lpData.token1Symbol,
              token0Decimals: pos.lpData.token0Decimals,
              token1Decimals: pos.lpData.token1Decimals,
              fee: pos.lpData.fee,
              tickLower: pos.lpData.tickLower,
              tickUpper: pos.lpData.tickUpper,
              amount0: pos.lpData.amount0,
              amount1: pos.lpData.amount1,
            });
          } else if (pos.protocol === 'morpho' && pos.morphoData) {
            resetMorpho();
            txHash = await executeDeposit({
              vaultAddress: pos.morphoData.vaultAddress as `0x${string}`,
              assetAddress: pos.morphoData.assetAddress as `0x${string}`,
              assetDecimals: pos.morphoData.assetDecimals,
              amount: pos.morphoData.amount,
            });
          }

          if (txHash) {
            results.push({ status: 'done', txHash });
            setItems((prev) => {
              const next = [...prev];
              next[i] = { ...next[i], status: 'done', txHash };
              return next;
            });
          } else {
            results.push({ status: 'failed', error: 'No transaction hash returned' });
            setItems((prev) => {
              const next = [...prev];
              next[i] = { ...next[i], status: 'failed', error: 'Transaction failed' };
              return next;
            });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error
            ? (err as { shortMessage?: string }).shortMessage || err.message
            : 'Failed';
          results.push({ status: 'failed', error: msg });
          setItems((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], status: 'failed', error: msg };
            return next;
          });
          // Continue to next position
        }
      }

      // Finalize
      const successCount = results.filter((r) => r.status === 'done').length;
      if (successCount === results.length) {
        setBatchStatus('completed');
      } else if (successCount > 0) {
        setBatchStatus('partial');
      } else {
        setBatchStatus('failed');
      }
    };

    run();
  }, [plan, batchStatus, isStale, messageId, addLiquidity, executeDeposit, resetLP, resetMorpho]);

  // Refresh portfolio when batch completes
  useEffect(() => {
    if (feedbackSent.current) return;
    if (batchStatus !== 'completed' && batchStatus !== 'partial' && batchStatus !== 'failed') return;

    feedbackSent.current = true;
    queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
    window.dispatchEvent(new Event('trade-completed'));

    const successCount = items.filter((i) => i.status === 'done').length;
    const failCount = items.filter((i) => i.status === 'failed').length;
    const successItems = items.filter((i) => i.status === 'done');
    const txLinks = successItems.map((i) => `${i.label}: https://basescan.org/tx/${i.txHash}`).join('\n');

    addMessage({
      role: 'assistant',
      content: `Batch yield allocation ${batchStatus}: ${successCount} succeeded, ${failCount} failed.\n${txLinks}`,
    });
  }, [batchStatus, items, queryClient, addMessage]);

  if (!plan) {
    return (
      <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] p-4">
        <span className="text-[13px] text-[#9ca3af]">Loading yield allocation plan...</span>
      </div>
    );
  }

  if (isStale && batchStatus === 'idle') {
    return (
      <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] p-4">
        <span className="text-[12px] text-[#9ca3af]">Batch yield allocation was executed previously.</span>
      </div>
    );
  }

  const completedCount = items.filter((i) => i.status === 'done').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;
  const processedCount = completedCount + failedCount;
  const isFinished = batchStatus === 'completed' || batchStatus === 'partial' || batchStatus === 'failed';

  return (
    <div
      className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] overflow-hidden"
      style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-[#e5e7eb]">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#1a1a1a]">
            Batch Yield — {items.length} positions
          </span>
          <span className="text-[11px] text-[#9ca3af]">
            {isFinished
              ? `${completedCount}/${items.length} complete`
              : `${processedCount}/${items.length} processing...`}
          </span>
        </div>
      </div>

      {/* Position list */}
      <div className="px-4 py-2 space-y-1.5">
        {items.map((item, idx) => (
          <YieldItemRow key={idx} item={item} />
        ))}

        {items.length === 0 && plan.positions.filter((p) => p.status === 'ready').map((pos, idx) => (
          <div key={idx} className="flex items-center gap-2 py-1">
            <span className="w-4 h-4 rounded-full bg-[#e5e7eb] flex-shrink-0" />
            <span className="text-[12px] text-[#9ca3af]">
              {pos.label} — ${pos.amountUSD}
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
                batchStatus === 'completed'
                  ? 'text-emerald-600'
                  : batchStatus === 'partial'
                    ? 'text-amber-600'
                    : 'text-rose-500'
              }`}
            >
              {batchStatus === 'completed'
                ? 'All positions deployed'
                : batchStatus === 'partial'
                  ? `${completedCount} succeeded, ${failedCount} failed`
                  : 'All positions failed'}
            </span>
            <span className="text-[11px] text-[#9ca3af]">
              ${plan.totalUSD.toFixed(2)} total
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function YieldItemRow({ item }: { item: YieldItem }) {
  const protocolLabel = item.protocol === 'uniswap_v3' ? 'LP' : item.protocol === 'morpho' ? 'Morpho' : item.protocol;

  return (
    <div className="flex items-center gap-2 py-1">
      {item.status === 'pending' && (
        <span className="w-4 h-4 rounded-full bg-[#e5e7eb] flex-shrink-0" />
      )}
      {item.status === 'executing' && (
        <Loader2 className="w-4 h-4 text-[#6b7280] animate-spin flex-shrink-0" />
      )}
      {item.status === 'done' && (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
      )}
      {item.status === 'failed' && (
        <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-[#1a1a1a]">{item.label}</span>
          <span className="text-[11px] text-[#9ca3af]">({protocolLabel})</span>
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        {item.status === 'pending' && (
          <span className="text-[11px] text-[#9ca3af]">${item.amountUSD}</span>
        )}
        {item.status === 'executing' && (
          <span className="text-[11px] text-[#6b7280]">deploying...</span>
        )}
        {item.status === 'done' && item.txHash && (
          <a
            href={`https://basescan.org/tx/${item.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-emerald-600 hover:underline"
          >
            ${item.amountUSD} deployed
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
