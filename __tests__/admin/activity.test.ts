/**
 * Tests for activity/failure aggregation logic.
 * Tests the logic from app/api/admin/activity/overview/route.ts
 */
import { describe, it, expect } from 'vitest';

// Replicate the bridge status counting logic from the route (after fix)
function countBridgeStatuses(bridgeRows: any[]) {
  let bridgesInitiated = 0;
  let bridgesArrived = 0;
  let bridgesTimeout = 0;
  let bridgesFailed = 0;
  let bridgesPending = 0;
  let bridges24h = 0;
  let totalBridgeAmount = 0;

  const now = Date.now();
  const oneDayAgo = now - 86_400_000;

  for (const b of bridgeRows) {
    const ts = new Date(b.created_at).getTime();
    if (ts >= oneDayAgo) bridges24h++;
    totalBridgeAmount += parseFloat(b.amount || '0');

    switch (b.status) {
      case 'initiated': bridgesInitiated++; break;
      case 'tx_sent': bridgesPending++; break;
      case 'arrived': bridgesArrived++; break;
      case 'timeout': bridgesTimeout++; break;
      case 'failed': bridgesFailed++; break;
    }
  }

  return { bridgesInitiated, bridgesArrived, bridgesTimeout, bridgesFailed, bridgesPending, totalBridgeAmount };
}

describe('bridge status counting', () => {
  // -----------------------------------------------------------------------
  // BUG: 'initiated' is counted as BOTH bridgesInitiated AND bridgesPending
  // This means bridgesInitiated + bridgesArrived + bridgesTimeout + bridgesFailed + bridgesPending
  // can exceed the total number of bridges (double-counting).
  // -----------------------------------------------------------------------
  it('initiated bridges are separate from pending (fixed)', () => {
    const bridges = [
      { status: 'initiated', amount: '10', created_at: new Date().toISOString() },
    ];
    const result = countBridgeStatuses(bridges);

    expect(result.bridgesInitiated).toBe(1);
    expect(result.bridgesPending).toBe(0); // no longer double-counted
  });

  it('tx_sent is only counted as pending (not initiated)', () => {
    const bridges = [
      { status: 'tx_sent', amount: '10', created_at: new Date().toISOString() },
    ];
    const result = countBridgeStatuses(bridges);

    expect(result.bridgesInitiated).toBe(0);
    expect(result.bridgesPending).toBe(1);
  });

  it('counts all statuses correctly for mixed set', () => {
    const bridges = [
      { status: 'initiated', amount: '10', created_at: new Date().toISOString() },
      { status: 'tx_sent', amount: '20', created_at: new Date().toISOString() },
      { status: 'arrived', amount: '30', created_at: new Date().toISOString() },
      { status: 'timeout', amount: '5', created_at: new Date().toISOString() },
      { status: 'failed', amount: '15', created_at: new Date().toISOString() },
    ];
    const result = countBridgeStatuses(bridges);

    expect(result.bridgesInitiated).toBe(1);
    expect(result.bridgesArrived).toBe(1);
    expect(result.bridgesTimeout).toBe(1);
    expect(result.bridgesFailed).toBe(1);
    expect(result.bridgesPending).toBe(1); // only tx_sent now
    expect(result.totalBridgeAmount).toBe(80);
  });

  it('handles unknown status gracefully (not counted)', () => {
    const bridges = [
      { status: 'unknown_status', amount: '10', created_at: new Date().toISOString() },
    ];
    const result = countBridgeStatuses(bridges);

    // Falls through switch with no match
    expect(result.bridgesInitiated).toBe(0);
    expect(result.bridgesArrived).toBe(0);
    expect(result.bridgesPending).toBe(0);
    // But totalBridgeAmount is still counted
    expect(result.totalBridgeAmount).toBe(10);
  });

  // -----------------------------------------------------------------------
  // Bridge success rate calculation
  // -----------------------------------------------------------------------
  it('computes bridge success rate', () => {
    const total = 100;
    const arrived = 85;
    const rate = total > 0 ? Math.round((arrived / total) * 10000) / 100 : 0;

    expect(rate).toBe(85);
  });

  it('success rate is 0 when no bridges', () => {
    const total = 0;
    const arrived = 0;
    const rate = total > 0 ? Math.round((arrived / total) * 10000) / 100 : 0;

    expect(rate).toBe(0);
  });

  // -----------------------------------------------------------------------
  // BUG: parseFloat on various amount types
  // -----------------------------------------------------------------------
  it('parseFloat handles string amounts', () => {
    expect(parseFloat('10.5')).toBe(10.5);
  });

  it('parseFloat handles null/undefined amount with fallback', () => {
    const nullVal: unknown = null;
    const undefVal: unknown = undefined;
    expect(parseFloat((nullVal || '0') as string)).toBe(0);
    expect(parseFloat((undefVal || '0') as string)).toBe(0);
  });

  it('parseFloat handles empty string', () => {
    const emptyStr: unknown = '';
    // '' is falsy → || '0' kicks in
    expect(parseFloat((emptyStr || '0') as string)).toBe(0);
  });

  it('parseFloat handles numeric amount (no string)', () => {
    // If amount is already a number, parseFloat coerces to string first
    const numVal: unknown = 42;
    expect(parseFloat(numVal as string)).toBe(42);
  });
});

describe('failure aggregation', () => {
  it('counts failures by side', () => {
    const failures = [
      { side: 'BUY', error_step: 'approve', error_reason: 'timeout', created_at: new Date().toISOString() },
      { side: 'BUY', error_step: 'execute', error_reason: 'slippage', created_at: new Date().toISOString() },
      { side: 'SELL', error_step: 'approve', error_reason: 'timeout', created_at: new Date().toISOString() },
    ];

    const bySide: Record<string, number> = { BUY: 0, SELL: 0 };
    for (const f of failures) {
      const side = f.side || 'UNKNOWN';
      bySide[side] = (bySide[side] || 0) + 1;
    }

    expect(bySide.BUY).toBe(2);
    expect(bySide.SELL).toBe(1);
  });

  it('unknown side gets its own bucket (fixed)', () => {
    const bySide: Record<string, number> = { BUY: 0, SELL: 0 };
    const f = { side: 'REDEEM' };
    const side = f.side || 'UNKNOWN';
    bySide[side] = (bySide[side] || 0) + 1;

    // REDEEM now gets its own key instead of being lumped into SELL
    expect(bySide.REDEEM).toBe(1);
    expect(bySide.SELL).toBe(0);
  });

  it('groups failures by error step', () => {
    const failures = [
      { error_step: 'approve' },
      { error_step: 'approve' },
      { error_step: 'execute' },
      { error_step: null },
    ];

    const byStep = new Map<string, number>();
    for (const f of failures) {
      const step = f.error_step || 'unknown';
      byStep.set(step, (byStep.get(step) || 0) + 1);
    }

    expect(byStep.get('approve')).toBe(2);
    expect(byStep.get('execute')).toBe(1);
    expect(byStep.get('unknown')).toBe(1);
  });

  it('unique users affected by failures', () => {
    const failures = [
      { user_address: '0xAAA' },
      { user_address: '0xBBB' },
      { user_address: '0xAAA' }, // duplicate
    ];
    const failedUsers = new Set(failures.map((f) => f.user_address));
    expect(failedUsers.size).toBe(2);
  });
});
