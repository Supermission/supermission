import { useState, useCallback } from 'react';
import { useTradeExecution } from './use-trade-execution';
import { useApprovalLimit } from './use-approval-limit';
import type { AllocationItem } from '@/lib/ai/prediction-market-allocator';
import type { BatchProgress } from '@/components/prediction-markets/allocation-confirm-panel';
import type { ClobClient } from '@polymarket/clob-client-v2';

/**
 * Hook for executing batch prediction market trades sequentially.
 * Trade 1 runs the full executeTrade() flow (balance checks, compliance, approvals).
 * Trades 2+ use executeTradeQuick() — a fast path that skips redundant checks
 * and reuses the ClobClient/signer from trade 1.
 */
export function useBatchTradeExecution() {
  const tradeExecution = useTradeExecution();
  const { maxApproval } = useApprovalLimit();

  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    current: 0,
    total: 0,
    currentMarket: '',
    status: 'idle',
    results: [],
  });

  const executeBatch = useCallback(async (allocations: AllocationItem[]) => {
    if (allocations.length === 0) return;

    setBatchProgress({
      current: 0,
      total: allocations.length,
      currentMarket: allocations[0].question,
      status: 'executing',
      results: [],
    });

    const results: BatchProgress['results'] = [];

    // Cached after first successful trade for fast-path execution
    let cachedClobClient: ClobClient | null = null;
    let cachedAddress: string | null = null;

    for (let i = 0; i < allocations.length; i++) {
      const alloc = allocations[i];

      setBatchProgress(prev => ({
        ...prev,
        current: i,
        currentMarket: alloc.question,
      }));

      // Resolve token ID from clob_token_ids
      let tokenId = '';
      try {
        const tokenIds = typeof alloc.clob_token_ids === 'string'
          ? JSON.parse(alloc.clob_token_ids)
          : alloc.clob_token_ids;

        if (Array.isArray(tokenIds) && tokenIds.length > 0) {
          // Resolve token by matching outcome to market outcomes array, fallback to index 0/1
          const outcomeIdx = alloc.outcome?.toLowerCase() === 'no' ? 1 : 0;
          tokenId = tokenIds[outcomeIdx] || tokenIds[0];
        }
      } catch {
        // If parsing fails, skip this trade
        results.push({
          condition_id: alloc.condition_id,
          success: false,
          error: 'Invalid token IDs',
        });
        continue;
      }

      if (!tokenId) {
        results.push({
          condition_id: alloc.condition_id,
          success: false,
          error: 'No token ID found',
        });
        continue;
      }

      try {
        let orderId: string | undefined;

        if (i === 0 || !cachedClobClient || !cachedAddress) {
          // First trade (or no cached client): full flow with balance checks, compliance, approvals
          const { response, clobClient, address } = await tradeExecution.executeTrade({
            tokenId,
            price: 0.5, // Market order — uses best available price
            size: String(alloc.amount),
            side: 'BUY',
            outcome: alloc.outcome,
            question: alloc.question,
            marketId: alloc.condition_id,
            endDate: alloc.end_date,
            marketSlug: alloc.slug,
            maxApprovalUsdc: maxApproval,
          });

          orderId = response?.orderID || response?.id;

          // Cache for subsequent fast-path trades
          cachedClobClient = clobClient;
          cachedAddress = address;
        } else {
          // Fast path: skip balance checks, compliance, CLOB sync
          const response = await tradeExecution.executeTradeQuick({
            tokenId,
            price: 0.5,
            size: String(alloc.amount),
            outcome: alloc.outcome,
            question: alloc.question,
            marketId: alloc.condition_id,
            clobClient: cachedClobClient,
            address: cachedAddress,
          });

          orderId = response?.orderID || response?.id;
        }

        results.push({
          condition_id: alloc.condition_id,
          success: true,
          orderId,
        });
      } catch (err: unknown) {
        results.push({
          condition_id: alloc.condition_id,
          success: false,
          error: err instanceof Error ? err.message : 'Trade failed',
        });
        // Continue to next trade — don't abort batch on individual failure
      }

      // Update results as we go
      setBatchProgress(prev => ({
        ...prev,
        results: [...results],
      }));
    }

    // Mark batch as complete
    const hasAnySuccess = results.some(r => r.success);
    setBatchProgress(prev => ({
      ...prev,
      current: prev.total,
      currentMarket: '',
      status: hasAnySuccess ? 'completed' : 'failed',
      results,
    }));

    return results;
  }, [tradeExecution, maxApproval]);

  const reset = useCallback(() => {
    setBatchProgress({
      current: 0,
      total: 0,
      currentMarket: '',
      status: 'idle',
      results: [],
    });
    tradeExecution.reset();
  }, [tradeExecution]);

  return {
    executeBatch,
    batchProgress,
    reset,
    isExecuting: batchProgress.status === 'executing',
  };
}
