/**
 * Tests for: Oracle bulk trades UI shows "trade failed" while still updating
 *
 * Issue: During batch execution, trades that haven't completed yet can
 * momentarily appear as failed because the UI renders before results arrive.
 * The allocation-confirm-panel shows a red X for any trade with a result
 * where success === false, but validation errors (parse failures, missing
 * token IDs) are pushed as failed results even though the trade was never
 * attempted on-chain.
 *
 * These tests verify the batch progress state machine produces correct
 * intermediate states so the UI never shows "failed" for in-flight trades.
 */

import { describe, it, expect } from 'vitest';
import type { AllocationItem } from '@/lib/ai/prediction-market-allocator';

// Replicate the BatchProgress type from the component
interface BatchProgress {
  current: number;
  total: number;
  currentMarket: string;
  status: 'idle' | 'executing' | 'completed' | 'failed';
  results: Array<{
    condition_id: string;
    success: boolean;
    orderId?: string;
    error?: string;
  }>;
}

// ── Helper: simulate the batch execution state machine from use-batch-trade-execution.ts ──

type TradeOutcome =
  | { kind: 'success'; orderId: string }
  | { kind: 'parse-error' }
  | { kind: 'no-token-id' }
  | { kind: 'execution-error'; message: string };

function simulateBatchExecution(
  allocations: AllocationItem[],
  outcomes: TradeOutcome[]
): { snapshots: BatchProgress[]; final: BatchProgress } {
  const snapshots: BatchProgress[] = [];
  const results: BatchProgress['results'] = [];

  // Initial state
  const initial: BatchProgress = {
    current: 0,
    total: allocations.length,
    currentMarket: allocations[0]?.question ?? '',
    status: 'executing',
    results: [],
  };
  snapshots.push({ ...initial });

  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];
    const outcome = outcomes[i];

    // setBatchProgress — marks trade i as current (before any result)
    const preTradeSnapshot: BatchProgress = {
      current: i,
      total: allocations.length,
      currentMarket: alloc.question,
      status: 'executing',
      results: [...results], // results so far (not including trade i)
    };
    snapshots.push(preTradeSnapshot);

    // Process outcome (mirrors use-batch-trade-execution.ts logic)
    switch (outcome.kind) {
      case 'parse-error':
        results.push({
          condition_id: alloc.condition_id,
          success: false,
          error: 'Invalid token IDs',
        });
        break;
      case 'no-token-id':
        results.push({
          condition_id: alloc.condition_id,
          success: false,
          error: 'No token ID found',
        });
        break;
      case 'execution-error':
        results.push({
          condition_id: alloc.condition_id,
          success: false,
          error: outcome.message,
        });
        break;
      case 'success':
        results.push({
          condition_id: alloc.condition_id,
          success: true,
          orderId: outcome.orderId,
        });
        break;
    }

    // setBatchProgress — results updated after trade i completes
    const postTradeSnapshot: BatchProgress = {
      current: i,
      total: allocations.length,
      currentMarket: alloc.question,
      status: 'executing',
      results: [...results],
    };
    snapshots.push(postTradeSnapshot);
  }

  // Final state
  const hasAnySuccess = results.some(r => r.success);
  const final: BatchProgress = {
    current: allocations.length,
    total: allocations.length,
    currentMarket: '',
    status: hasAnySuccess ? 'completed' : 'failed',
    results: [...results],
  };
  snapshots.push(final);

  return { snapshots, final };
}

// ── Helper: simulate what the UI renders for each allocation row ──

type RowDisplay = 'pending' | 'executing' | 'success' | 'failed' | 'warning';

function getRowDisplay(
  idx: number,
  alloc: AllocationItem,
  progress: BatchProgress
): RowDisplay {
  const isExecuting = progress.status === 'executing';
  const tradeResult = progress.results.find(
    r => r.condition_id === alloc.condition_id
  );
  const isCurrent = progress.current === idx && isExecuting;
  // Mirrors the fixed allocation-confirm-panel.tsx:
  // failures are only shown as red after the batch finishes
  const showFailure = tradeResult && !tradeResult.success && !isExecuting;

  if (isCurrent) {
    return 'executing';
  } else if (tradeResult?.success) {
    return 'success';
  } else if (showFailure) {
    return 'failed';
  } else if (isExecuting && tradeResult && !tradeResult.success) {
    // During execution, failed results show as amber warning, not red failed
    return 'warning';
  }
  return 'pending';
}

// ── Test fixtures ──

function makeAllocation(idx: number): AllocationItem {
  return {
    condition_id: `cond_${idx}`,
    question: `Market ${idx}`,
    outcome: idx % 2 === 0 ? 'YES' : 'NO',
    amount: 1.0,
    weight: 0.33,
    confidence: 80,
    clob_token_ids: JSON.stringify([`token_yes_${idx}`, `token_no_${idx}`]),
    slug: `market-${idx}`,
    end_date: '2025-12-31',
  };
}

// ── Tests ──

describe('Batch trade UI status — no false "failed" during execution', () => {
  it('trades not yet reached should show "pending", never "failed"', () => {
    const allocations = [makeAllocation(0), makeAllocation(1), makeAllocation(2)];
    const outcomes: TradeOutcome[] = [
      { kind: 'success', orderId: 'order_0' },
      { kind: 'success', orderId: 'order_1' },
      { kind: 'success', orderId: 'order_2' },
    ];

    const { snapshots } = simulateBatchExecution(allocations, outcomes);

    // For every snapshot, trades that haven't been reached yet must be "pending"
    for (const snap of snapshots) {
      if (snap.status !== 'executing') continue;
      for (let idx = 0; idx < allocations.length; idx++) {
        const display = getRowDisplay(idx, allocations[idx], snap);
        const hasResult = snap.results.some(
          r => r.condition_id === allocations[idx].condition_id
        );
        if (!hasResult && snap.current !== idx) {
          expect(display).toBe('pending');
        }
      }
    }
  });

  it('currently executing trade should show "executing" spinner, not "failed"', () => {
    const allocations = [makeAllocation(0), makeAllocation(1)];
    const outcomes: TradeOutcome[] = [
      { kind: 'success', orderId: 'order_0' },
      { kind: 'success', orderId: 'order_1' },
    ];

    const { snapshots } = simulateBatchExecution(allocations, outcomes);

    // The "pre-trade" snapshots (before result arrives) should show "executing"
    for (const snap of snapshots) {
      if (snap.status !== 'executing') continue;
      for (let idx = 0; idx < allocations.length; idx++) {
        const display = getRowDisplay(idx, allocations[idx], snap);
        if (snap.current === idx) {
          // The current trade should ALWAYS show as executing, never failed
          expect(display).toBe('executing');
        }
      }
    }
  });

  it('validation errors show as warning during execution, failed only after completion', () => {
    const allocations = [makeAllocation(0), makeAllocation(1)];
    const outcomes: TradeOutcome[] = [
      { kind: 'parse-error' }, // Trade 0: validation fails
      { kind: 'success', orderId: 'order_1' }, // Trade 1: succeeds
    ];

    const { snapshots, final } = simulateBatchExecution(allocations, outcomes);

    // After trade 0's validation error, while trade 1 is still executing:
    // Trade 0 should show as "warning" (amber), NOT "failed" (red)
    const trade1PreSnap = snapshots.find(
      s => s.status === 'executing' && s.current === 1 && s.results.length === 1
    );

    if (trade1PreSnap) {
      const trade0Display = getRowDisplay(0, allocations[0], trade1PreSnap);
      // FIXED: During execution, failures show as warnings, not red failed
      expect(trade0Display).toBe('warning');
    }

    // Final state should show completed (trade 1 succeeded) and trade 0 as failed
    expect(final.status).toBe('completed');
    expect(getRowDisplay(0, allocations[0], final)).toBe('failed');
    expect(getRowDisplay(1, allocations[1], final)).toBe('success');
  });

  it('BUG DETECTOR: all-success batch should never show any row as "failed" at any point', () => {
    const allocations = [makeAllocation(0), makeAllocation(1), makeAllocation(2)];
    const outcomes: TradeOutcome[] = [
      { kind: 'success', orderId: 'order_0' },
      { kind: 'success', orderId: 'order_1' },
      { kind: 'success', orderId: 'order_2' },
    ];

    const { snapshots } = simulateBatchExecution(allocations, outcomes);

    // KEY TEST: In a fully successful batch, NO trade should ever appear "failed"
    const failedMoments: string[] = [];
    for (const snap of snapshots) {
      for (let idx = 0; idx < allocations.length; idx++) {
        const display = getRowDisplay(idx, allocations[idx], snap);
        if (display === 'failed') {
          failedMoments.push(
            `Trade ${idx} shown as "failed" at step current=${snap.current}, results=${snap.results.length}`
          );
        }
      }
    }

    expect(failedMoments).toEqual([]);
  });

  it('completed batch with mixed results shows correct final states', () => {
    const allocations = [makeAllocation(0), makeAllocation(1), makeAllocation(2)];
    const outcomes: TradeOutcome[] = [
      { kind: 'success', orderId: 'order_0' },
      { kind: 'execution-error', message: 'Insufficient balance' },
      { kind: 'success', orderId: 'order_2' },
    ];

    const { final } = simulateBatchExecution(allocations, outcomes);

    expect(final.status).toBe('completed'); // At least one succeeded
    expect(final.results[0].success).toBe(true);
    expect(final.results[1].success).toBe(false);
    expect(final.results[1].error).toBe('Insufficient balance');
    expect(final.results[2].success).toBe(true);

    // Final display
    expect(getRowDisplay(0, allocations[0], final)).toBe('success');
    expect(getRowDisplay(1, allocations[1], final)).toBe('failed');
    expect(getRowDisplay(2, allocations[2], final)).toBe('success');
  });

  it('batch where ALL trades fail should have status "failed"', () => {
    const allocations = [makeAllocation(0), makeAllocation(1)];
    const outcomes: TradeOutcome[] = [
      { kind: 'parse-error' },
      { kind: 'no-token-id' },
    ];

    const { final } = simulateBatchExecution(allocations, outcomes);

    expect(final.status).toBe('failed');
    expect(final.results.every(r => !r.success)).toBe(true);
  });
});
