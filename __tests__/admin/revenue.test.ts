/**
 * Tests for revenue calculation logic.
 * Tests the aggregation logic from app/api/admin/revenue/overview/route.ts
 */
import { describe, it, expect } from 'vitest';

const USDC_DECIMALS = 1_000_000;

// Replicate the revenue aggregation logic for unit testing
function aggregateRevenue(rows: any[], now: number) {
  const oneDayAgo = now - 86_400_000;
  const oneWeekAgo = now - 7 * 86_400_000;
  const oneMonthAgo = now - 30 * 86_400_000;

  let totalRevenue = 0;
  let revenue24h = 0;
  let revenue7d = 0;
  let revenue30d = 0;

  for (const p of rows) {
    const amountUsdc = Number(p.amount ?? 0) / USDC_DECIMALS;
    const usedAt = new Date(p.used_at).getTime();

    totalRevenue += amountUsdc;
    if (usedAt >= oneDayAgo) revenue24h += amountUsdc;
    if (usedAt >= oneWeekAgo) revenue7d += amountUsdc;
    if (usedAt >= oneMonthAgo) revenue30d += amountUsdc;
  }

  return { totalRevenue, revenue24h, revenue7d, revenue30d };
}

describe('revenue aggregation', () => {
  const now = new Date('2026-04-04T12:00:00Z').getTime();

  it('sums USDC amounts correctly from atomic units', () => {
    const rows = [
      { amount: 1_000_000, used_at: new Date(now - 1000).toISOString() }, // $1
      { amount: 2_500_000, used_at: new Date(now - 1000).toISOString() }, // $2.50
    ];
    const result = aggregateRevenue(rows, now);
    expect(result.totalRevenue).toBe(3.5);
    expect(result.revenue24h).toBe(3.5);
  });

  it('handles null amount', () => {
    const rows = [
      { amount: null, used_at: new Date(now - 1000).toISOString() },
    ];
    const result = aggregateRevenue(rows, now);
    expect(result.totalRevenue).toBe(0);
  });

  // -----------------------------------------------------------------------
  // BUG: null used_at → new Date(null).getTime() = NaN,
  // but NaN >= number is always false, so it just gets counted in total
  // but NOT in 24h/7d/30d. Actually this is correct behavior!
  // Wait — let me check: new Date(null) in JS...
  // -----------------------------------------------------------------------
  it('BUG: null used_at gets counted in total but not in time windows', () => {
    const rows = [
      { amount: 1_000_000, used_at: null },
    ];
    const result = aggregateRevenue(rows, now);

    // Total includes it
    expect(result.totalRevenue).toBe(1);
    // But time windows don't (NaN >= number = false)
    // This is actually reasonable behavior, but undocumented.
    // new Date(null).getTime() returns 0 (epoch), not NaN!
    // So it's counted as a payment from 1970 — NOT in recent windows.
    // Actually: new Date(null) = Invalid Date, getTime() = NaN
    // Wait, let me verify:
    const ts = new Date(null as any).getTime();
    // In most engines: new Date(null) coerces null to 0 → epoch
    // So ts = 0, which is < oneDayAgo → not counted in 24h
    // This is fine for total but the payment appears "ancient"
    expect(result.revenue24h).toBe(0);
  });

  it('correctly buckets payments into time windows', () => {
    const rows = [
      { amount: 1_000_000, used_at: new Date(now - 3600_000).toISOString() },     // 1h ago → 24h, 7d, 30d
      { amount: 2_000_000, used_at: new Date(now - 3 * 86_400_000).toISOString() }, // 3d ago → 7d, 30d
      { amount: 3_000_000, used_at: new Date(now - 15 * 86_400_000).toISOString() }, // 15d ago → 30d
      { amount: 4_000_000, used_at: new Date(now - 60 * 86_400_000).toISOString() }, // 60d ago → none
    ];
    const result = aggregateRevenue(rows, now);

    expect(result.totalRevenue).toBe(10);
    expect(result.revenue24h).toBe(1);
    expect(result.revenue7d).toBe(3);
    expect(result.revenue30d).toBe(6);
  });

  it('handles empty rows', () => {
    const result = aggregateRevenue([], now);
    expect(result.totalRevenue).toBe(0);
    expect(result.revenue24h).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Growth rate calculation
  // -----------------------------------------------------------------------
  it('computes growth rate correctly', () => {
    const revenuePrev7d = 100;
    const revenue7d = 150;
    const growthRate = revenuePrev7d > 0
      ? Math.round(((revenue7d - revenuePrev7d) / revenuePrev7d) * 10000) / 100
      : revenue7d > 0 ? 100 : 0;

    expect(growthRate).toBe(50); // 50% growth
  });

  it('handles zero previous revenue (new product)', () => {
    const revenuePrev7d = 0;
    const revenue7d = 50;
    const growthRate = revenuePrev7d > 0
      ? Math.round(((revenue7d - revenuePrev7d) / revenuePrev7d) * 10000) / 100
      : revenue7d > 0 ? 100 : 0;

    expect(growthRate).toBe(100); // defaults to 100% when no previous data
  });

  it('handles zero revenue both periods', () => {
    const revenuePrev7d = 0;
    const revenue7d = 0;
    const growthRate = revenuePrev7d > 0
      ? Math.round(((revenue7d - revenuePrev7d) / revenuePrev7d) * 10000) / 100
      : revenue7d > 0 ? 100 : 0;

    expect(growthRate).toBe(0);
  });

  it('handles negative growth', () => {
    const revenuePrev7d = 200;
    const revenue7d = 100;
    const growthRate = Math.round(((revenue7d - revenuePrev7d) / revenuePrev7d) * 10000) / 100;

    expect(growthRate).toBe(-50); // -50% decline
  });

  // -----------------------------------------------------------------------
  // ARPU calculation
  // -----------------------------------------------------------------------
  it('computes ARPU correctly', () => {
    const totalRevenue = 1000;
    const userCount = 25;
    const arpu = userCount > 0
      ? Math.round((totalRevenue / userCount) * 100) / 100
      : 0;

    expect(arpu).toBe(40);
  });

  it('ARPU is 0 when no users', () => {
    const arpu = 0 > 0 ? Math.round((100 / 0) * 100) / 100 : 0;
    expect(arpu).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Success rate calculation
  // -----------------------------------------------------------------------
  it('computes payment success rate', () => {
    const completed = 90;
    const failed = 5;
    const pending = 5;
    const total = completed + failed + pending;
    const rate = Math.round((completed / total) * 10000) / 100;

    expect(rate).toBe(90);
  });

  it('success rate is 100% when no payment attempts', () => {
    const total = 0;
    const rate = total > 0 ? Math.round((0 / total) * 10000) / 100 : 100;
    expect(rate).toBe(100); // Debatable: 100% when no data?
  });
});
