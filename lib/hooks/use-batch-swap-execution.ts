'use client';

import { useState, useCallback, useRef } from 'react';

export type SwapItemStatus = 'pending' | 'quoting' | 'swapping' | 'done' | 'failed';

export interface BatchSwapItem {
  symbol: string;
  address: string;
  amount: string;
  priceUSD: number;
  allocationPercent: number;
  status: SwapItemStatus;
  txHash?: string;
  error?: string;
  amountOut?: string;
  priceAtExecution?: number;
}

export interface BatchSwapState {
  items: BatchSwapItem[];
  status: 'idle' | 'executing' | 'completed' | 'partial' | 'failed';
  successCount: number;
  failCount: number;
  totalSpent: number;
}

const INITIAL_STATE: BatchSwapState = {
  items: [],
  status: 'idle',
  successCount: 0,
  failCount: 0,
  totalSpent: 0,
};

/**
 * State-management hook for batch swap execution.
 * Does NOT call swap functions directly — manages batch state and exposes
 * methods to update item status. The actual swap calls (fetchQuote + executeSwap)
 * happen in the BatchBuyExecuteInline component via useLifiSwap.
 */
export function useBatchSwapExecution() {
  const [state, setState] = useState<BatchSwapState>(INITIAL_STATE);
  const executingRef = useRef(false);

  /** Initialize items from plan tokens with status 'pending' */
  const initItems = useCallback((tokens: Array<{
    symbol: string;
    address: string;
    amount?: string;
    allocationUSD?: number;
    priceUSD: number;
    allocationPercent: number;
  }>) => {
    const items: BatchSwapItem[] = tokens.map((t) => ({
      symbol: t.symbol,
      address: t.address,
      amount: t.amount || String(t.allocationUSD || 0),
      priceUSD: t.priceUSD,
      allocationPercent: t.allocationPercent,
      status: 'pending' as SwapItemStatus,
    }));

    setState({
      items,
      status: 'executing',
      successCount: 0,
      failCount: 0,
      totalSpent: 0,
    });

    return items;
  }, []);

  /** Update a single item's status */
  const updateItem = useCallback((index: number, update: Partial<BatchSwapItem>) => {
    setState((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], ...update };
      return { ...prev, items };
    });
  }, []);

  /** Mark a single item as done */
  const markDone = useCallback((index: number, txHash: string, amountOut?: string, priceAtExecution?: number) => {
    setState((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], status: 'done', txHash, amountOut, priceAtExecution };
      const successCount = items.filter((i) => i.status === 'done').length;
      const totalSpent = items
        .filter((i) => i.status === 'done')
        .reduce((sum, i) => sum + parseFloat(i.amount), 0);
      return { ...prev, items, successCount, totalSpent };
    });
  }, []);

  /** Mark a single item as failed */
  const markFailed = useCallback((index: number, error: string) => {
    setState((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], status: 'failed', error };
      const failCount = items.filter((i) => i.status === 'failed').length;
      return { ...prev, items, failCount };
    });
  }, []);

  /** Finalize batch — set overall status based on results */
  const finalize = useCallback(() => {
    setState((prev) => {
      const successCount = prev.items.filter((i) => i.status === 'done').length;
      const failCount = prev.items.filter((i) => i.status === 'failed').length;
      const totalSpent = prev.items
        .filter((i) => i.status === 'done')
        .reduce((sum, i) => sum + parseFloat(i.amount), 0);

      let status: BatchSwapState['status'];
      if (successCount === prev.items.length) {
        status = 'completed';
      } else if (successCount > 0) {
        status = 'partial';
      } else {
        status = 'failed';
      }

      return { ...prev, status, successCount, failCount, totalSpent };
    });
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    executingRef.current = false;
  }, []);

  return {
    state,
    executingRef,
    initItems,
    updateItem,
    markDone,
    markFailed,
    finalize,
    reset,
  };
}
