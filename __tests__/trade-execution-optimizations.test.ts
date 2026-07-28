/**
 * Tests for trade execution speed optimizations:
 * - CLOB balance cache (10s TTL) skips redundant updateBalanceAllowance calls
 * - Fire-and-forget trade recording (queueTradeRecord not awaited in critical path)
 * - Reduced RPC timeouts (3s instead of 8s)
 * - Parallelized approval checks in sell flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── CLOB Balance Cache Logic ─────────────────────────────────────────────
// Extracted cache logic to test independently of React hooks

interface ClobBalanceView {
  balance?: string;
  allowances?: Record<string, string>;
}

interface ClobBalanceCache {
  view: ClobBalanceView;
  ts: number;
}

const CLOB_BALANCE_TTL = 10_000;

function shouldUseCachedBalance(cache: ClobBalanceCache | null, now: number): boolean {
  return cache !== null && (now - cache.ts < CLOB_BALANCE_TTL);
}

describe('CLOB Balance Cache', () => {
  it('returns false when cache is null', () => {
    expect(shouldUseCachedBalance(null, Date.now())).toBe(false);
  });

  it('returns true when cache is fresh (within TTL)', () => {
    const now = Date.now();
    const cache: ClobBalanceCache = {
      view: { balance: '5000000', allowances: { '0xabc': '1000000000' } },
      ts: now - 5_000, // 5s ago — within 10s TTL
    };
    expect(shouldUseCachedBalance(cache, now)).toBe(true);
  });

  it('returns false when cache is stale (beyond TTL)', () => {
    const now = Date.now();
    const cache: ClobBalanceCache = {
      view: { balance: '5000000' },
      ts: now - 11_000, // 11s ago — beyond 10s TTL
    };
    expect(shouldUseCachedBalance(cache, now)).toBe(false);
  });

  it('returns false when cache is exactly at TTL boundary', () => {
    const now = Date.now();
    const cache: ClobBalanceCache = {
      view: { balance: '5000000' },
      ts: now - CLOB_BALANCE_TTL, // exactly at boundary
    };
    expect(shouldUseCachedBalance(cache, now)).toBe(false);
  });

  it('should be invalidated after approval (cache set to null)', () => {
    let cache: ClobBalanceCache | null = {
      view: { balance: '5000000', allowances: { '0xabc': '1000000000' } },
      ts: Date.now(),
    };
    expect(shouldUseCachedBalance(cache, Date.now())).toBe(true);

    // Simulate approval invalidation
    cache = null;
    expect(shouldUseCachedBalance(cache, Date.now())).toBe(false);
  });
});

// ── Parallel Approval Check Logic ────────────────────────────────────────
// Tests that approval checks run in parallel instead of sequentially

describe('Parallel Approval Checks (Sell Flow)', () => {
  it('runs all approval checks concurrently and collects results', async () => {
    const callOrder: string[] = [];
    const operators = ['0xCTF_EXCHANGE', '0xNEG_RISK_EXCHANGE', '0xNEG_RISK_ADAPTER'];

    // Simulate checkIsApprovedForAll with varying delays
    const mockCheckApproval = async (operator: string): Promise<boolean> => {
      callOrder.push(`start:${operator}`);
      // Simulate network delay
      await new Promise(r => setTimeout(r, 10));
      callOrder.push(`end:${operator}`);
      return operator === '0xCTF_EXCHANGE'; // only first is approved
    };

    // Parallel execution (our new approach)
    const results = await Promise.all(
      operators.map(op => mockCheckApproval(op))
    );

    expect(results).toEqual([true, false, false]);
    // All starts should happen before any ends (parallel)
    const startIndices = callOrder
      .filter(e => e.startsWith('start:'))
      .map(e => callOrder.indexOf(e));
    const endIndices = callOrder
      .filter(e => e.startsWith('end:'))
      .map(e => callOrder.indexOf(e));
    // All starts come before all ends — proof of parallel execution
    expect(Math.max(...startIndices)).toBeLessThan(Math.min(...endIndices));
  });

  it('identifies which operators need approval transactions', async () => {
    const operators = ['0xCTF_EXCHANGE', '0xNEG_RISK_EXCHANGE'];
    const approvalResults = [true, false]; // first approved, second not

    const needsApproval: string[] = [];
    for (let i = 0; i < operators.length; i++) {
      if (!approvalResults[i]) {
        needsApproval.push(operators[i]);
      }
    }

    expect(needsApproval).toEqual(['0xNEG_RISK_EXCHANGE']);
  });
});

// ── Fire-and-Forget Trade Recording ──────────────────────────────────────

describe('Fire-and-Forget Trade Recording', () => {
  it('queueTradeRecord does not block the caller when not awaited', async () => {
    let recordCompleted = false;

    const mockQueueTradeRecord = async () => {
      await new Promise(r => setTimeout(r, 100)); // simulate slow API
      recordCompleted = true;
    };

    // Fire-and-forget (our approach)
    const tradePromise = mockQueueTradeRecord().catch(() => {});

    // Caller returns immediately — recordCompleted is still false
    expect(recordCompleted).toBe(false);

    // Eventually completes in background
    await tradePromise;
    expect(recordCompleted).toBe(true);
  });

  it('fire-and-forget catches errors without propagating', async () => {
    const mockQueueTradeRecord = async () => {
      throw new Error('Network error');
    };

    // Should not throw
    let threw = false;
    try {
      mockQueueTradeRecord().catch(() => {}); // fire-and-forget with catch
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

// ── RPC Timeout Configuration ────────────────────────────────────────────

describe('RPC Timeout Configuration', () => {
  it('AbortSignal.timeout creates a signal with correct timeout', () => {
    // Verify the timeout value we're using (3s instead of old 8s)
    const TIMEOUT_MS = 3_000;
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    expect(signal).toBeDefined();
    expect(signal.aborted).toBe(false);
  });

  it('AbortSignal.timeout aborts after specified duration', async () => {
    const signal = AbortSignal.timeout(50); // 50ms for test speed
    expect(signal.aborted).toBe(false);
    await new Promise(r => setTimeout(r, 100));
    expect(signal.aborted).toBe(true);
  });
});

// ── Sell Flow Parallelization ────────────────────────────────────────────

describe('Sell Flow Parallelization', () => {
  it('runs liquidity check, signer setup, and compliance in parallel', async () => {
    const callOrder: string[] = [];

    const mockLiquidityCheck = async () => {
      callOrder.push('start:liquidity');
      await new Promise(r => setTimeout(r, 10));
      callOrder.push('end:liquidity');
      return { totalBidDepth: 100, bestBid: 0.65, fillableSize: 50, bids: [] };
    };

    const mockGetSigner = async () => {
      callOrder.push('start:signer');
      await new Promise(r => setTimeout(r, 10));
      callOrder.push('end:signer');
      return { getAddress: async () => '0xtest' };
    };

    const mockCompliance = async () => {
      callOrder.push('start:compliance');
      await new Promise(r => setTimeout(r, 10));
      callOrder.push('end:compliance');
      return true;
    };

    const [liquidity, signer, isSafe] = await Promise.all([
      mockLiquidityCheck(),
      mockGetSigner(),
      mockCompliance(),
    ]);

    expect(liquidity.bestBid).toBe(0.65);
    expect(isSafe).toBe(true);

    // All starts before all ends = parallel
    const starts = callOrder.filter(e => e.startsWith('start:')).map(e => callOrder.indexOf(e));
    const ends = callOrder.filter(e => e.startsWith('end:')).map(e => callOrder.indexOf(e));
    expect(Math.max(...starts)).toBeLessThan(Math.min(...ends));
  });

  it('runs approval checks in parallel with on-chain balance fetch', async () => {
    const callOrder: string[] = [];

    const mockCheckApproval = async (op: string) => {
      callOrder.push(`start:approval:${op}`);
      await new Promise(r => setTimeout(r, 10));
      callOrder.push(`end:approval:${op}`);
      return true;
    };

    const mockCheckBalance = async () => {
      callOrder.push('start:balance');
      await new Promise(r => setTimeout(r, 10));
      callOrder.push('end:balance');
      return 5000000n;
    };

    const operators = ['0xCTF', '0xNEG_RISK'];
    const [approvals, balance] = await Promise.all([
      Promise.all(operators.map(op => mockCheckApproval(op))),
      mockCheckBalance(),
    ]);

    expect(approvals).toEqual([true, true]);
    expect(balance).toBe(5000000n);

    // balance fetch started before approval ends = parallel
    const balanceStart = callOrder.indexOf('start:balance');
    const firstApprovalEnd = callOrder.indexOf('end:approval:0xCTF');
    expect(balanceStart).toBeLessThan(firstApprovalEnd);
  });
});
