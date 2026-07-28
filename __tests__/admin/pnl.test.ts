/**
 * Tests for lib/admin/pnl.ts — the P&L calculation engine.
 * This is the single source of truth for all admin panel P&L numbers.
 */
import { describe, it, expect } from 'vitest';
import {
  computeTraderPnl,
  parseMarketInfo,
  getResolvedWinner,
  type Trade,
  type MarketInfo,
} from '@/lib/admin/pnl';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrade(overrides: Partial<Trade> & { condition_id: string; side: string }): Trade {
  return {
    outcome: 'Yes',
    amount: 0,
    price: 0,
    shares: 0,
    ...overrides,
  };
}

function makeMarket(overrides: Partial<MarketInfo> & { condition_id: string }): MarketInfo {
  return {
    outcomes: ['Yes', 'No'],
    outcome_prices: [0.5, 0.5],
    is_closed: false,
    ...overrides,
  };
}

function marketMap(...markets: MarketInfo[]): Map<string, MarketInfo> {
  return new Map(markets.map((m) => [m.condition_id, m]));
}

// ---------------------------------------------------------------------------
// parseMarketInfo
// ---------------------------------------------------------------------------

describe('parseMarketInfo', () => {
  it('parses normal arrays', () => {
    const info = parseMarketInfo({
      condition_id: 'c1',
      outcomes: ['Yes', 'No'],
      outcome_prices: [0.7, 0.3],
      is_closed: false,
    });
    expect(info.outcomes).toEqual(['Yes', 'No']);
    expect(info.outcome_prices).toEqual([0.7, 0.3]);
    expect(info.is_closed).toBe(false);
  });

  it('parses JSON-encoded strings', () => {
    const info = parseMarketInfo({
      condition_id: 'c1',
      outcomes: '["Yes","No"]',
      outcome_prices: '["0.7","0.3"]',
      is_closed: true,
    });
    expect(info.outcomes).toEqual(['Yes', 'No']);
    expect(info.outcome_prices).toEqual([0.7, 0.3]);
  });

  it('handles missing/null outcomes gracefully', () => {
    const info = parseMarketInfo({
      condition_id: 'c1',
      outcomes: null,
      outcome_prices: null,
    });
    expect(info.outcomes).toEqual([]);
    expect(info.outcome_prices).toEqual([]);
  });

  it('handles undefined outcomes', () => {
    const info = parseMarketInfo({ condition_id: 'c1' });
    expect(info.outcomes).toEqual([]);
    expect(info.outcome_prices).toEqual([]);
  });

  it('defaults is_closed to false when missing', () => {
    const info = parseMarketInfo({ condition_id: 'c1' });
    expect(info.is_closed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getResolvedWinner
// ---------------------------------------------------------------------------

describe('getResolvedWinner', () => {
  it('returns winner when one outcome >= 0.95', () => {
    const m = makeMarket({ condition_id: 'c1', outcome_prices: [1.0, 0.0], is_closed: true });
    expect(getResolvedWinner(m)).toBe('Yes');
  });

  it('returns null if market is not closed', () => {
    const m = makeMarket({ condition_id: 'c1', outcome_prices: [1.0, 0.0], is_closed: false });
    expect(getResolvedWinner(m)).toBeNull();
  });

  it('returns null if no outcome >= 0.95', () => {
    const m = makeMarket({ condition_id: 'c1', outcome_prices: [0.6, 0.4], is_closed: true });
    expect(getResolvedWinner(m)).toBeNull();
  });

  it('returns null for empty outcomes', () => {
    const m = makeMarket({ condition_id: 'c1', outcomes: [], outcome_prices: [], is_closed: true });
    expect(getResolvedWinner(m)).toBeNull();
  });

  it('handles exactly 0.95 threshold', () => {
    const m = makeMarket({ condition_id: 'c1', outcome_prices: [0.95, 0.05], is_closed: true });
    expect(getResolvedWinner(m)).toBe('Yes');
  });

  it('handles 0.94 — just below threshold', () => {
    const m = makeMarket({ condition_id: 'c1', outcome_prices: [0.94, 0.06], is_closed: true });
    expect(getResolvedWinner(m)).toBeNull();
  });

  it('picks the highest-priced outcome among multiple', () => {
    const m: MarketInfo = {
      condition_id: 'c1',
      outcomes: ['A', 'B', 'C'],
      outcome_prices: [0.02, 0.97, 0.01],
      is_closed: true,
    };
    expect(getResolvedWinner(m)).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// computeTraderPnl — basic scenarios
// ---------------------------------------------------------------------------

describe('computeTraderPnl', () => {
  it('returns zeros for empty trade list', () => {
    const result = computeTraderPnl([], new Map());
    expect(result.realizedPnl).toBe(0);
    expect(result.unrealizedPnl).toBe(0);
    expect(result.netPnl).toBe(0);
    expect(result.totalInvested).toBe(0);
    expect(result.roi).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.losses).toBe(0);
    expect(result.positions).toEqual([]);
  });

  it('computes simple buy-only position with unrealized P&L', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', amount: 10, price: 0.5, shares: 20 }),
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1', outcome_prices: [0.7, 0.3] }));
    const result = computeTraderPnl(trades, mm);

    expect(result.totalInvested).toBe(10);
    expect(result.realizedPnl).toBe(0);
    // unrealized = (0.7 - 0.5) * 20 = 4.0
    expect(result.unrealizedPnl).toBe(4);
    expect(result.netPnl).toBe(4);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].openShares).toBe(20);
  });

  it('computes simple buy+sell with known prices', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', amount: 10, price: 0.5, shares: 20 }),
      makeTrade({ condition_id: 'c1', side: 'SELL', amount: 14, price: 0.7, shares: 20 }),
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1' }));
    const result = computeTraderPnl(trades, mm);

    // avgBuyPrice = 10/20 = 0.5, avgSellPrice = 14/20 = 0.7
    // realized = (0.7 - 0.5) * 20 = 4.0
    expect(result.realizedPnl).toBe(4);
    expect(result.unrealizedPnl).toBe(0);
    expect(result.positions[0].openShares).toBe(0);
  });

  it('computes internal sell (price=0) as break-even for open market', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', amount: 10, price: 0.5, shares: 20 }),
      makeTrade({ condition_id: 'c1', side: 'SELL', amount: 20, price: 0, shares: 20 }), // internal: amount=shares, not USDC
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1', is_closed: false }));
    const result = computeTraderPnl(trades, mm);

    // Internal sell with no price data, market unresolved → break-even
    expect(result.realizedPnl).toBe(0);
  });

  it('computes internal sell on resolved winner market', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 10, price: 0.5, shares: 20 }),
      makeTrade({ condition_id: 'c1', side: 'SELL', outcome: 'Yes', amount: 20, price: 0, shares: 20 }), // internal
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1', outcome_prices: [1.0, 0.0], is_closed: true }));
    const result = computeTraderPnl(trades, mm);

    // Market resolved, Yes won → sell at $1.00/share
    // realized = (1.0 - 0.5) * 20 = 10.0
    expect(result.realizedPnl).toBe(10);
    expect(result.wins).toBe(1);
    expect(result.losses).toBe(0);
  });

  it('computes internal sell on resolved loser market', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', outcome: 'No', amount: 10, price: 0.5, shares: 20 }),
      makeTrade({ condition_id: 'c1', side: 'SELL', outcome: 'No', amount: 20, price: 0, shares: 20 }),
    ];
    // Yes won, so No is the loser
    const mm = marketMap(makeMarket({ condition_id: 'c1', outcome_prices: [1.0, 0.0], is_closed: true }));
    const result = computeTraderPnl(trades, mm);

    // No lost → sell at $0/share
    // realized = (0 - 0.5) * 20 = -10.0
    expect(result.realizedPnl).toBe(-10);
    expect(result.wins).toBe(0);
    expect(result.losses).toBe(1);
  });

  // -----------------------------------------------------------------------
  // BUG: openShares can go NEGATIVE if sellShares > buyShares
  // -----------------------------------------------------------------------
  it('BUG: handles sellShares > buyShares (data inconsistency) — openShares goes negative', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', amount: 5, price: 0.5, shares: 10 }),
      makeTrade({ condition_id: 'c1', side: 'SELL', amount: 8, price: 0.8, shares: 15 }), // sold more than bought
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1', outcome_prices: [0.6, 0.4] }));
    const result = computeTraderPnl(trades, mm);

    // openShares = buyShares - min(buyShares, sellShares) = 10 - 10 = 0
    // BUT closedShares = min(10, 15) = 10, which is correct
    // The 5 extra sell shares are just ignored in closedShares calculation
    // However, avgSellPrice is computed from ALL 15 shares of knownSellRevenue
    expect(result.positions[0].openShares).toBe(0);
    // This test documents the current behavior — extra sells are partially lost
  });

  // -----------------------------------------------------------------------
  // BUG: outcome casing mismatch creates phantom positions
  // -----------------------------------------------------------------------
  it('normalizes outcome casing (Yes vs YES vs yes)', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', outcome: 'YES', amount: 10, price: 0.5, shares: 20 }),
      makeTrade({ condition_id: 'c1', side: 'SELL', outcome: 'Yes', amount: 14, price: 0.7, shares: 20 }),
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1' }));
    const result = computeTraderPnl(trades, mm);

    // Should be ONE position, not two
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].openShares).toBe(0);
    expect(result.realizedPnl).toBe(4);
  });

  // -----------------------------------------------------------------------
  // REDEEM handling
  // -----------------------------------------------------------------------
  it('handles REDEEM with known price/amount', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 5, price: 0.5, shares: 10 }),
      makeTrade({ condition_id: 'c1', side: 'REDEEM', outcome: 'Yes', amount: 10, price: 1.0, shares: 10 }),
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1', outcome_prices: [1.0, 0.0], is_closed: true }));
    const result = computeTraderPnl(trades, mm);

    // Redeem at $1.00, bought at $0.50 → realized = (1.0 - 0.5) * 10 = 5.0
    expect(result.realizedPnl).toBe(5);
  });

  it('handles legacy REDEEM (amount=0, shares>0) on winner', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 5, price: 0.5, shares: 10 }),
      makeTrade({ condition_id: 'c1', side: 'REDEEM', outcome: 'Yes', amount: 0, price: 0, shares: 10 }),
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1', outcome_prices: [1.0, 0.0], is_closed: true }));
    const result = computeTraderPnl(trades, mm);

    // Legacy redeem on winner: resolution assigns $1/share
    // realized = (1.0 - 0.5) * 10 = 5.0
    expect(result.realizedPnl).toBe(5);
  });

  it('handles legacy REDEEM (amount=0) on loser', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', outcome: 'No', amount: 5, price: 0.5, shares: 10 }),
      makeTrade({ condition_id: 'c1', side: 'REDEEM', outcome: 'No', amount: 0, price: 0, shares: 10 }),
    ];
    // Yes won, so No lost
    const mm = marketMap(makeMarket({ condition_id: 'c1', outcome_prices: [1.0, 0.0], is_closed: true }));
    const result = computeTraderPnl(trades, mm);

    // Losing redeem: $0/share → realized = (0 - 0.5) * 10 = -5.0
    expect(result.realizedPnl).toBe(-5);
  });

  // -----------------------------------------------------------------------
  // Edge cases with string values (Supabase returns strings sometimes)
  // -----------------------------------------------------------------------
  it('handles string amounts/prices/shares from DB', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', amount: '10' as any, price: '0.5' as any, shares: '20' as any }),
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1', outcome_prices: [0.7, 0.3] }));
    const result = computeTraderPnl(trades, mm);

    expect(result.totalInvested).toBe(10);
    expect(result.unrealizedPnl).toBe(4);
  });

  // -----------------------------------------------------------------------
  // BUG: NaN propagation from garbage data
  // -----------------------------------------------------------------------
  it('BUG: handles NaN/garbage string values without crashing', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', amount: 'abc' as any, price: 'xyz' as any, shares: 'foo' as any }),
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1' }));
    const result = computeTraderPnl(trades, mm);

    // Number('abc') is NaN, NaN || 0 = 0, so this should not crash
    expect(result.totalInvested).toBe(0);
    expect(Number.isNaN(result.netPnl)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Mixed known + unknown sells
  // -----------------------------------------------------------------------
  it('handles mix of known and unknown sell prices', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 20, price: 0.5, shares: 40 }),
      // Known sell: 10 shares at $0.8 = $8
      makeTrade({ condition_id: 'c1', side: 'SELL', outcome: 'Yes', amount: 8, price: 0.8, shares: 10 }),
      // Unknown sell (internal): 10 shares, price=0
      makeTrade({ condition_id: 'c1', side: 'SELL', outcome: 'Yes', amount: 10, price: 0, shares: 10 }),
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1', is_closed: false }));
    const result = computeTraderPnl(trades, mm);

    // knownSellShares=10, knownSellRevenue=8
    // unknownSellShares=10, unknownSellPrice=avgBuyPrice=0.5 (unresolved market)
    // unknownRevenue = 10 * 0.5 = 5
    // totalRevenue = 8 + 5 = 13, avgSellPrice = 13/20 = 0.65
    // closedShares = min(40, 20) = 20
    // realizedPnl = (0.65 - 0.5) * 20 = 3.0
    expect(result.realizedPnl).toBe(3);
    expect(result.positions[0].openShares).toBe(20); // 40 bought - 20 sold
  });

  // -----------------------------------------------------------------------
  // Closed market with open shares → realized, not unrealized
  // -----------------------------------------------------------------------
  it('converts unrealized to realized for closed markets', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 5, price: 0.5, shares: 10 }),
      // No sells — still open shares
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1', outcome_prices: [1.0, 0.0], is_closed: true }));
    const result = computeTraderPnl(trades, mm);

    // Market closed, openShares=10, currentPrice=1.0
    // unrealized would be (1.0-0.5)*10 = 5, but closed → moved to realized
    expect(result.unrealizedPnl).toBe(0);
    expect(result.realizedPnl).toBe(5);
  });

  // -----------------------------------------------------------------------
  // ROI calculation
  // -----------------------------------------------------------------------
  it('computes ROI correctly', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', amount: 100, price: 0.5, shares: 200 }),
      makeTrade({ condition_id: 'c1', side: 'SELL', amount: 140, price: 0.7, shares: 200 }),
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1' }));
    const result = computeTraderPnl(trades, mm);

    // netPnl = 40, totalInvested = 100 → roi = 40%
    expect(result.roi).toBe(40);
  });

  it('returns 0 ROI when no investment', () => {
    const result = computeTraderPnl([], new Map());
    expect(result.roi).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Multiple positions across markets
  // -----------------------------------------------------------------------
  it('tracks positions across multiple markets independently', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 10, price: 0.5, shares: 20 }),
      makeTrade({ condition_id: 'c2', side: 'BUY', outcome: 'No', amount: 8, price: 0.4, shares: 20 }),
    ];
    const mm = marketMap(
      makeMarket({ condition_id: 'c1', outcome_prices: [0.6, 0.4] }),
      makeMarket({ condition_id: 'c2', outcome_prices: [0.7, 0.3] }),
    );
    const result = computeTraderPnl(trades, mm);

    expect(result.positions).toHaveLength(2);
    expect(result.totalInvested).toBe(18);
    // c1: unrealized = (0.6 - 0.5) * 20 = 2
    // c2: unrealized = (0.3 - 0.4) * 20 = -2
    // Fixed: round2() now normalizes -0 to 0 via `|| 0`
    expect(result.unrealizedPnl).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Win/loss counting
  // -----------------------------------------------------------------------
  it('counts wins and losses only for resolved markets', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 10, shares: 20 }),
      makeTrade({ condition_id: 'c2', side: 'BUY', outcome: 'No', amount: 10, shares: 20 }),
      makeTrade({ condition_id: 'c3', side: 'BUY', outcome: 'Yes', amount: 10, shares: 20 }), // open market
    ];
    const mm = marketMap(
      makeMarket({ condition_id: 'c1', outcome_prices: [1.0, 0.0], is_closed: true }), // Yes won → win
      makeMarket({ condition_id: 'c2', outcome_prices: [1.0, 0.0], is_closed: true }), // Yes won, bet on No → loss
      makeMarket({ condition_id: 'c3', outcome_prices: [0.6, 0.4], is_closed: false }), // not resolved
    );
    const result = computeTraderPnl(trades, mm);

    expect(result.wins).toBe(1);
    expect(result.losses).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Market not in map → currentPrice = 0
  // -----------------------------------------------------------------------
  it('handles trades for unknown markets (not in marketMap)', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'unknown_market', side: 'BUY', amount: 10, price: 0.5, shares: 20 }),
    ];
    const result = computeTraderPnl(trades, new Map());

    expect(result.totalInvested).toBe(10);
    // currentPrice = 0 (not in map), unrealized = (0 - 0.5) * 20 = -10
    expect(result.unrealizedPnl).toBe(-10);
    expect(result.netPnl).toBe(-10);
  });

  // -----------------------------------------------------------------------
  // BUG: outcome matching is case-insensitive for positions but
  // getResolvedWinner returns original casing → comparison could fail
  // -----------------------------------------------------------------------
  it('winner comparison is case-insensitive', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', outcome: 'YES', amount: 5, price: 0.5, shares: 10 }),
      makeTrade({ condition_id: 'c1', side: 'SELL', outcome: 'YES', amount: 10, price: 0, shares: 10 }),
    ];
    // Market has "Yes" not "YES" — but getResolvedWinner returns "Yes"
    const mm = marketMap(makeMarket({
      condition_id: 'c1',
      outcomes: ['Yes', 'No'],
      outcome_prices: [1.0, 0.0],
      is_closed: true,
    }));
    const result = computeTraderPnl(trades, mm);

    // Should still match as winner despite "yes" (normalized) vs "Yes" (from market)
    expect(result.wins).toBe(1);
    expect(result.realizedPnl).toBe(5); // (1.0 - 0.5) * 10
  });

  // -----------------------------------------------------------------------
  // Rounding
  // -----------------------------------------------------------------------
  it('rounds results to 2 decimal places', () => {
    const trades: Trade[] = [
      makeTrade({ condition_id: 'c1', side: 'BUY', amount: 1.005, price: 0.5, shares: 2.01 }),
    ];
    const mm = marketMap(makeMarket({ condition_id: 'c1', outcome_prices: [0.6, 0.4] }));
    const result = computeTraderPnl(trades, mm);

    // All monetary values should be rounded to 2 decimal places
    expect(result.totalInvested.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
  });
});
