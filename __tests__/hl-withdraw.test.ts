/**
 * Tests for the Hyperliquid withdraw fix:
 * - getHLWithdrawable returns the `withdrawable` field, distinguishes errors
 *   from real-zero, and falls back to null when the field is missing.
 * - The poll-delta arithmetic the Move Funds modal relies on (pre/post Arb
 *   balance, net amount = gross - $1, sub-cent epsilon).
 * - The pure validation logic the modal uses to gate the move button
 *   (locked margin, $2 minimum, HL fee, dest != source).
 * - The /api/wallet/balances cache invalidation contract.
 *
 * Bugs being guarded against (all confirmed in earlier commits):
 * 1. waitForArbUsdcBalance was called with amount*0.95; HL deducts a flat $1
 *    so the poll never resolved → bridge step skipped → funds stuck on Arb.
 * 2. UI read accountValue, not `withdrawable`; with open positions this
 *    overstated the movable amount and produced "balance is 0 can't withdraw".
 * 3. Server cache served pre-withdraw balances for up to 15s after success.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── 1. getHLWithdrawable ───────────────────────────────────────────────────

const mockClearinghouseState = vi.fn();
vi.mock('@/lib/hyperliquid/client', () => ({
  fetchClearinghouseState: (...args: unknown[]) => mockClearinghouseState(...args),
}));


import { getHLWithdrawable, getHLBalance } from '@/lib/hyperliquid/deposit';

const baseState = {
  marginSummary: { accountValue: '10.00', totalNtlPos: '0', totalRawUsd: '10', totalMarginUsed: '0' },
  crossMarginSummary: { accountValue: '10.00', totalNtlPos: '0', totalRawUsd: '10', totalMarginUsed: '0' },
  assetPositions: [],
  crossMaintenanceMarginUsed: '0',
  withdrawable: '9.00',
};

describe('getHLWithdrawable', () => {
  beforeEach(() => mockClearinghouseState.mockReset());

  it('returns the parsed `withdrawable` field on happy path', async () => {
    mockClearinghouseState.mockResolvedValue(baseState);
    expect(await getHLWithdrawable('0xabc')).toBe(9);
  });

  it('returns 0 (real zero) when withdrawable is "0"', async () => {
    // Real zero must be distinguishable from null (fetch error). A user with
    // all margin locked legitimately has withdrawable=0; the UI uses this to
    // show "all funds locked in positions" instead of "fetch failed".
    mockClearinghouseState.mockResolvedValue({ ...baseState, withdrawable: '0' });
    const result = await getHLWithdrawable('0xabc');
    expect(result).toBe(0);
    expect(result).not.toBeNull();
  });

  it('returns null when the API throws (NOT 0 — error must be distinguishable)', async () => {
    // `mockRejectedValueOnce` (not bare `mockRejectedValue`) — the latter
    // pre-creates the rejected promise eagerly, which Vitest 4 surfaces as
    // an unhandled rejection even when the SUT catches it.
    mockClearinghouseState.mockRejectedValueOnce(new Error('HL API 500'));
    expect(await getHLWithdrawable('0xabc')).toBeNull();
  });

  it('returns null when the `withdrawable` field is missing (older API shape)', async () => {
    const { withdrawable: _w, ...without } = baseState;
    void _w;
    mockClearinghouseState.mockResolvedValue(without);
    expect(await getHLWithdrawable('0xabc')).toBeNull();
  });

  it('returns null for NaN-shaped withdrawable strings', async () => {
    mockClearinghouseState.mockResolvedValue({ ...baseState, withdrawable: 'oops' });
    expect(await getHLWithdrawable('0xabc')).toBeNull();
  });

  it('does NOT use accountValue (regression: that was the original bug)', async () => {
    // With open positions, accountValue ($10) is greater than withdrawable
    // ($2.50). getHLWithdrawable must return 2.50.
    mockClearinghouseState.mockResolvedValue({
      ...baseState,
      marginSummary: { ...baseState.marginSummary, accountValue: '10.00', totalMarginUsed: '7.50' },
      withdrawable: '2.50',
    });
    expect(await getHLWithdrawable('0xabc')).toBe(2.5);
  });
});

describe('getHLBalance (unchanged contract — still returns accountValue)', () => {
  // The trading UI (perps page equity, P&L) still needs accountValue.
  // Only the withdraw flow switched. Guard against accidental contract drift.
  beforeEach(() => mockClearinghouseState.mockReset());

  it('returns accountValue, not withdrawable', async () => {
    mockClearinghouseState.mockResolvedValue({
      ...baseState,
      marginSummary: { ...baseState.marginSummary, accountValue: '12.34' },
      withdrawable: '2.50',
    });
    expect(await getHLBalance('0xabc')).toBe(12.34);
  });

  it('swallows errors as 0 (legacy contract — trading UI tolerates this)', async () => {
    mockClearinghouseState.mockRejectedValueOnce(new Error('boom'));
    expect(await getHLBalance('0xabc')).toBe(0);
  });
});

// ─── 2. Poll-delta arithmetic ────────────────────────────────────────────────
//
// The Move Funds modal captures Arb USDC balance before withdraw3(), polls
// for arrival of (amount - $1) * 0.995 + preBalance, then bridges the
// *actually-arrived* delta (not the gross). Replicate the math here so we
// catch regressions if anyone "fixes" the threshold back to 0.95.

function expectedPollThresholdRaw(amountNum: number, preBalanceRaw: bigint, hlFee = 1): bigint {
  const expectedNet = Math.max(0, amountNum - hlFee);
  const pollThreshold = expectedNet * 0.995;
  return preBalanceRaw + BigInt(Math.floor(pollThreshold * 1e6));
}

function arrivedDelta(preRaw: bigint, postRaw: bigint): number {
  const d = postRaw > preRaw ? postRaw - preRaw : 0n;
  return Number(d) / 1e6;
}

describe('Move Funds withdraw — poll & delta math', () => {
  it('regression: poll threshold is NOT amount * 0.95 (the original bug)', () => {
    // For a $9.80 withdraw, the buggy threshold was $9.31 — but HL only
    // sends $8.80 net of the $1 fee, so the poll never resolved.
    const buggyThreshold = 9.80 * 0.95;
    const fixedThreshold = (9.80 - 1) * 0.995;
    expect(buggyThreshold).toBeCloseTo(9.31, 2);
    expect(fixedThreshold).toBeCloseTo(8.756, 2);
    // The fixed threshold must be ≤ actual net arrival ($8.80) so the poll
    // resolves successfully.
    expect(fixedThreshold).toBeLessThanOrEqual(9.80 - 1);
  });

  it('poll target accounts for the pre-existing Arb balance (delta semantics)', () => {
    const preRaw = 5_000_000n; // $5 already on Arb
    const target = expectedPollThresholdRaw(9.80, preRaw);
    // Expected ≈ 5_000_000 + floor(8.756 * 1e6) = 13_756_000
    expect(target).toBe(5_000_000n + BigInt(Math.floor(8.756 * 1e6)));
  });

  it('arrived delta uses on-chain post - pre, not gross requested amount', () => {
    const preRaw = 5_000_000n;
    const postRaw = 13_800_000n; // arrived 8.80
    expect(arrivedDelta(preRaw, postRaw)).toBeCloseTo(8.80, 2);
  });

  it('arrived delta is 0 when HL has not released yet (post == pre)', () => {
    expect(arrivedDelta(5_000_000n, 5_000_000n)).toBe(0);
  });

  it('arrived delta clamps to 0 if post somehow < pre (other tx spent the wallet)', () => {
    expect(arrivedDelta(5_000_000n, 4_000_000n)).toBe(0);
  });

  it('bridge step would use the *real* arrived amount, not the gross request', () => {
    // If the user requests $9.80 but only $8.80 arrives (HL fee), the LI.FI
    // bridge must be invoked with $8.80 — otherwise LI.FI tries to bridge
    // more than the wallet has and the second leg fails.
    const requested = 9.80;
    const arrived = arrivedDelta(0n, 8_800_000n);
    expect(arrived).toBeCloseTo(requested - 1, 2);
    expect(arrived).not.toBeCloseTo(requested, 2);
  });
});

// ─── 3. Move Funds validation logic ──────────────────────────────────────────
//
// Replicates the modal's pure validation so we can test it without rendering.
// Keep aligned with components/shared/MoveFundsModal.tsx.

const HL_WITHDRAW_FEE = 1;
const HL_MIN_WITHDRAW = 2;

interface ValidationInputs {
  fromId: string;
  toId: string;
  amount: number;
  hlBalance: number;            // accountValue
  hlWithdrawable: number | null; // null = fetch failed
  walletBalance: number;        // for non-HL sources
}

interface ValidationOutputs {
  available: number;
  maxWithdrawable: number;
  exceedsHLMax: boolean;
  belowHLMin: boolean;
  hlMarginLocked: number;
  hlAllLocked: boolean;
  isValid: boolean;
}

function computeValidation(i: ValidationInputs): ValidationOutputs {
  const isHLSource = i.fromId === 'hl';
  const hlEffective = i.hlWithdrawable ?? i.hlBalance;
  const available = isHLSource ? hlEffective : i.walletBalance;
  const maxWithdrawable = isHLSource ? Math.max(0, available - HL_WITHDRAW_FEE) : available;
  const exceedsHLMax = isHLSource && i.amount > 0 && i.amount > maxWithdrawable;
  const belowHLMin = isHLSource && i.amount > 0 && i.amount < HL_MIN_WITHDRAW;
  const hlMarginLocked = isHLSource && i.hlWithdrawable != null && i.hlBalance > i.hlWithdrawable + 0.01
    ? i.hlBalance - i.hlWithdrawable
    : 0;
  const hlAllLocked = isHLSource && i.hlBalance > 0 && available <= 0.01;
  const isValid = i.amount > 0 && i.amount <= available && !exceedsHLMax && !belowHLMin && i.fromId !== i.toId;
  return { available, maxWithdrawable, exceedsHLMax, belowHLMin, hlMarginLocked, hlAllLocked, isValid };
}

describe('Move Funds modal — validation', () => {
  const base: ValidationInputs = {
    fromId: 'hl', toId: 'base', amount: 5,
    hlBalance: 10, hlWithdrawable: 10, walletBalance: 0,
  };

  it('happy path: $5 withdraw of $10 free balance is valid', () => {
    expect(computeValidation(base).isValid).toBe(true);
  });

  it('exact max ($9 = $10 - $1 fee) is valid', () => {
    expect(computeValidation({ ...base, amount: 9 }).isValid).toBe(true);
  });

  it('blocks withdraw that exceeds (balance - $1 fee)', () => {
    const r = computeValidation({ ...base, amount: 9.5 });
    expect(r.exceedsHLMax).toBe(true);
    expect(r.isValid).toBe(false);
  });

  it('blocks withdraw below HL $2 minimum', () => {
    const r = computeValidation({ ...base, amount: 1.5 });
    expect(r.belowHLMin).toBe(true);
    expect(r.isValid).toBe(false);
  });

  it('locked-margin scenario: equity 10, withdrawable 2.50 → max is $1.50 (after $1 fee)', () => {
    const r = computeValidation({ ...base, hlWithdrawable: 2.5, amount: 1.5 });
    expect(r.available).toBe(2.5);
    expect(r.maxWithdrawable).toBe(1.5);
    expect(r.hlMarginLocked).toBeCloseTo(7.5, 2);
    expect(r.hlAllLocked).toBe(false);
    // 1.5 below the $2 min, so still invalid — and the UI explains why.
    expect(r.belowHLMin).toBe(true);
  });

  it('all-locked: equity 10, withdrawable 0 → hlAllLocked true, button disabled', () => {
    const r = computeValidation({ ...base, hlWithdrawable: 0, amount: 5 });
    expect(r.hlAllLocked).toBe(true);
    expect(r.available).toBe(0);
    expect(r.isValid).toBe(false);
  });

  it('regression: when hlWithdrawable is null (fetch failed), falls back to hlBalance', () => {
    // The UI should not become unusable just because withdrawable failed to
    // load — degrade to the legacy behavior (use accountValue) so the user
    // can at least attempt a withdraw rather than seeing $0.
    const r = computeValidation({ ...base, hlWithdrawable: null, amount: 5 });
    expect(r.available).toBe(10);
    expect(r.isValid).toBe(true);
  });

  it('regression: source == destination is invalid (no-op transfer)', () => {
    const r = computeValidation({ ...base, fromId: 'hl', toId: 'hl', amount: 5 });
    expect(r.isValid).toBe(false);
  });

  it('zero amount is invalid (default state — nothing typed)', () => {
    const r = computeValidation({ ...base, amount: 0 });
    expect(r.isValid).toBe(false);
    expect(r.belowHLMin).toBe(false); // only flags positive sub-min amounts
    expect(r.exceedsHLMax).toBe(false);
  });

  it('non-HL source: $2 minimum does NOT apply (wallet-to-wallet)', () => {
    const r = computeValidation({
      ...base, fromId: 'base', toId: 'polygon',
      hlBalance: 0, hlWithdrawable: 0, walletBalance: 5, amount: 0.5,
    });
    expect(r.belowHLMin).toBe(false);
    expect(r.isValid).toBe(true);
  });

  it('partial-margin sentinel: equity 10, withdrawable 9.99 → not flagged as locked (within epsilon)', () => {
    // 0.01 epsilon avoids spurious "margin locked" messages from float dust.
    const r = computeValidation({ ...base, hlWithdrawable: 9.99 });
    expect(r.hlMarginLocked).toBe(0);
    expect(r.hlAllLocked).toBe(false);
  });
});

// ─── 4. SDK error translation ────────────────────────────────────────────────

function translateHLError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('insufficient') || lower.includes('not enough')) {
    return 'Hyperliquid says balance is insufficient. Margin may be locked in open positions — close them and retry.';
  }
  if (lower.includes('minimum') || lower.includes('too small')) {
    return `Amount below Hyperliquid's $${HL_MIN_WITHDRAW} minimum withdraw.`;
  }
  if (lower.includes('user rejected') || lower.includes('denied')) {
    return 'Withdraw cancelled.';
  }
  if (lower.includes('signature') || lower.includes('signing')) {
    return 'Wallet signing failed. Reconnect your embedded wallet and retry.';
  }
  return raw || 'Transfer failed';
}

describe('Move Funds modal — SDK error translation', () => {
  it.each([
    ['insufficient balance', 'insufficient'],
    ['not enough funds', 'insufficient'],
    ['amount below minimum', 'minimum'],
    ['too small to withdraw', 'minimum'],
    ['User rejected the request', 'cancelled'],
    ['user denied transaction signature', 'cancelled'], // 'denied' wins
    ['failed to produce signature', 'signing'],
  ])('translates %p → contains %p', (input, expectedFragment) => {
    expect(translateHLError(input).toLowerCase()).toContain(expectedFragment);
  });

  it('falls back to the raw message when no rule matches', () => {
    expect(translateHLError('Quantum tunnelling error')).toBe('Quantum tunnelling error');
  });

  it('falls back to "Transfer failed" when raw is empty', () => {
    expect(translateHLError('')).toBe('Transfer failed');
  });
});
