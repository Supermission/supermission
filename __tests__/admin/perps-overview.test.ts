/**
 * Tests for perps (Hyperion) overview aggregation logic.
 * Tests the logic from app/api/admin/perps/overview/route.ts
 */
import { describe, it, expect } from 'vitest';

// --- Session aggregation ---

function aggregateSessions(sessions: any[], messages: any[], now: number) {
  const oneDayAgo = new Date(now - 86400000).toISOString();
  const oneWeekAgo = new Date(now - 7 * 86400000).toISOString();

  const sessions24h = sessions.filter((s: any) => s.created_at && s.created_at > oneDayAgo).length;
  const sessions7d = sessions.filter((s: any) => s.created_at && s.created_at > oneWeekAgo).length;
  const uniqueUsers = new Set(sessions.map((s: any) => s.user_id));
  const avgMessagesPerSession = sessions.length > 0
    ? Math.round((messages.length / sessions.length) * 100) / 100
    : 0;

  return { total: sessions.length, sessions24h, sessions7d, uniqueUsers: uniqueUsers.size, avgMessagesPerSession };
}

describe('session aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateSessions([], [], Date.now());
    expect(result.total).toBe(0);
    expect(result.sessions24h).toBe(0);
    expect(result.sessions7d).toBe(0);
    expect(result.uniqueUsers).toBe(0);
    expect(result.avgMessagesPerSession).toBe(0);
  });

  it('counts sessions by time window', () => {
    const now = Date.now();
    const sessions = [
      { user_id: 'u1', created_at: new Date(now).toISOString() },                    // within 24h and 7d
      { user_id: 'u2', created_at: new Date(now - 3 * 86400000).toISOString() },       // within 7d only
      { user_id: 'u3', created_at: new Date(now - 10 * 86400000).toISOString() },      // outside both
    ];
    const result = aggregateSessions(sessions, [], now);
    expect(result.total).toBe(3);
    expect(result.sessions24h).toBe(1);
    expect(result.sessions7d).toBe(2);
    expect(result.uniqueUsers).toBe(3);
  });

  it('computes average messages per session', () => {
    const now = Date.now();
    const sessions = [
      { user_id: 'u1', created_at: new Date(now).toISOString() },
      { user_id: 'u2', created_at: new Date(now).toISOString() },
    ];
    const messages = [
      { session_id: 's1', role: 'user' },
      { session_id: 's1', role: 'assistant' },
      { session_id: 's2', role: 'user' },
      { session_id: 's2', role: 'assistant' },
      { session_id: 's2', role: 'user' },
      { session_id: 's2', role: 'assistant' },
    ];
    const result = aggregateSessions(sessions, messages, now);
    expect(result.avgMessagesPerSession).toBe(3); // 6/2
  });

  it('deduplicates unique users', () => {
    const now = Date.now();
    const sessions = [
      { user_id: 'u1', created_at: new Date(now).toISOString() },
      { user_id: 'u1', created_at: new Date(now).toISOString() },
      { user_id: 'u2', created_at: new Date(now).toISOString() },
    ];
    const result = aggregateSessions(sessions, [], now);
    expect(result.uniqueUsers).toBe(2);
  });
});

// --- Trade aggregation ---

function aggregateTrades(trades: any[], now: number) {
  const oneDayAgo = new Date(now - 86400000).toISOString();
  const oneWeekAgo = new Date(now - 7 * 86400000).toISOString();

  const trades24h = trades.filter((t: any) => t.created_at && t.created_at > oneDayAgo);
  const trades7d = trades.filter((t: any) => t.created_at && t.created_at > oneWeekAgo);

  const totalVolume = trades.reduce(
    (s: number, t: any) => s + (Number(t.size) || 0) * (Number(t.price) || 0), 0,
  );
  const volume24h = trades24h.reduce(
    (s: number, t: any) => s + (Number(t.size) || 0) * (Number(t.price) || 0), 0,
  );

  // By coin
  const coinMap = new Map<string, { trades: number; volume: number; totalLeverage: number }>();
  for (const t of trades) {
    const coin = t.coin;
    if (!coinMap.has(coin)) coinMap.set(coin, { trades: 0, volume: 0, totalLeverage: 0 });
    const c = coinMap.get(coin)!;
    c.trades++;
    c.volume += (Number(t.size) || 0) * (Number(t.price) || 0);
    c.totalLeverage += Number(t.leverage) || 0;
  }
  const byCoin = Array.from(coinMap.entries())
    .map(([coin, data]) => ({
      coin,
      trades: data.trades,
      volume: Math.round(data.volume * 100) / 100,
      avgLeverage: data.trades > 0 ? Math.round((data.totalLeverage / data.trades) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.volume - a.volume);

  // By side
  const buySideCount = trades.filter((t: any) => t.side === 'buy').length;
  const sellSideCount = trades.filter((t: any) => t.side === 'sell').length;

  // By order type
  const byOrderType: Record<string, number> = {};
  for (const t of trades) {
    const ot = t.order_type || 'unknown';
    byOrderType[ot] = (byOrderType[ot] || 0) + 1;
  }

  // Average leverage
  const totalLeverageSum = trades.reduce((s: number, t: any) => s + (Number(t.leverage) || 0), 0);
  const avgLeverage = trades.length > 0 ? Math.round((totalLeverageSum / trades.length) * 100) / 100 : 0;

  // P&L
  const tradesWithPnl = trades.filter((t: any) => t.pnl != null);
  const totalPnl = tradesWithPnl.reduce((s: number, t: any) => s + (Number(t.pnl) || 0), 0);
  const profitableTrades = tradesWithPnl.filter((t: any) => (Number(t.pnl) || 0) > 0).length;
  const winRate = tradesWithPnl.length > 0
    ? Math.round((profitableTrades / tradesWithPnl.length) * 10000) / 100
    : 0;

  return {
    totalTrades: trades.length,
    trades24h: trades24h.length,
    trades7d: trades7d.length,
    totalVolume: Math.round(totalVolume * 100) / 100,
    volume24h: Math.round(volume24h * 100) / 100,
    byCoin,
    bySide: { buy: buySideCount, sell: sellSideCount },
    byOrderType,
    avgLeverage,
    totalPnl: Math.round(totalPnl * 100) / 100,
    profitableTrades,
    winRate,
  };
}

describe('trade aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateTrades([], Date.now());
    expect(result.totalTrades).toBe(0);
    expect(result.totalVolume).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.avgLeverage).toBe(0);
    expect(result.byCoin).toEqual([]);
  });

  it('computes volume as size * price', () => {
    const now = Date.now();
    const trades = [
      { coin: 'BTC', side: 'buy', size: 0.5, price: 60000, leverage: 5, order_type: 'market', pnl: null, created_at: new Date(now).toISOString() },
      { coin: 'ETH', side: 'sell', size: 10, price: 3000, leverage: 3, order_type: 'limit', pnl: 100, created_at: new Date(now).toISOString() },
    ];
    const result = aggregateTrades(trades, now);
    expect(result.totalVolume).toBe(60000); // 30000 + 30000
    expect(result.volume24h).toBe(60000);
  });

  it('groups by coin with average leverage', () => {
    const now = Date.now();
    const trades = [
      { coin: 'BTC', side: 'buy', size: 1, price: 100, leverage: 5, order_type: 'market', pnl: null, created_at: new Date(now).toISOString() },
      { coin: 'BTC', side: 'buy', size: 1, price: 200, leverage: 10, order_type: 'market', pnl: null, created_at: new Date(now).toISOString() },
      { coin: 'ETH', side: 'sell', size: 1, price: 50, leverage: 2, order_type: 'limit', pnl: null, created_at: new Date(now).toISOString() },
    ];
    const result = aggregateTrades(trades, now);
    const btc = result.byCoin.find(c => c.coin === 'BTC');
    const eth = result.byCoin.find(c => c.coin === 'ETH');
    expect(btc?.trades).toBe(2);
    expect(btc?.volume).toBe(300);
    expect(btc?.avgLeverage).toBe(7.5);
    expect(eth?.trades).toBe(1);
    expect(eth?.volume).toBe(50);
  });

  it('byCoin sorted by volume descending', () => {
    const now = Date.now();
    const trades = [
      { coin: 'ETH', side: 'buy', size: 1, price: 50, leverage: 1, order_type: 'market', pnl: null, created_at: new Date(now).toISOString() },
      { coin: 'BTC', side: 'buy', size: 1, price: 1000, leverage: 1, order_type: 'market', pnl: null, created_at: new Date(now).toISOString() },
    ];
    const result = aggregateTrades(trades, now);
    expect(result.byCoin[0].coin).toBe('BTC');
    expect(result.byCoin[1].coin).toBe('ETH');
  });

  it('counts buy and sell sides', () => {
    const now = Date.now();
    const trades = [
      { coin: 'BTC', side: 'buy', size: 1, price: 100, leverage: 1, order_type: 'market', pnl: null, created_at: new Date(now).toISOString() },
      { coin: 'BTC', side: 'buy', size: 1, price: 100, leverage: 1, order_type: 'market', pnl: null, created_at: new Date(now).toISOString() },
      { coin: 'BTC', side: 'sell', size: 1, price: 100, leverage: 1, order_type: 'market', pnl: null, created_at: new Date(now).toISOString() },
    ];
    const result = aggregateTrades(trades, now);
    expect(result.bySide).toEqual({ buy: 2, sell: 1 });
  });

  it('counts by order type', () => {
    const now = Date.now();
    const trades = [
      { coin: 'BTC', side: 'buy', size: 1, price: 100, leverage: 1, order_type: 'market', pnl: null, created_at: new Date(now).toISOString() },
      { coin: 'BTC', side: 'buy', size: 1, price: 100, leverage: 1, order_type: 'limit', pnl: null, created_at: new Date(now).toISOString() },
      { coin: 'BTC', side: 'buy', size: 1, price: 100, leverage: 1, order_type: 'market', pnl: null, created_at: new Date(now).toISOString() },
    ];
    const result = aggregateTrades(trades, now);
    expect(result.byOrderType).toEqual({ market: 2, limit: 1 });
  });

  it('computes win rate from trades with non-null pnl', () => {
    const now = Date.now();
    const trades = [
      { coin: 'BTC', side: 'buy', size: 1, price: 100, leverage: 1, order_type: 'market', pnl: 50, created_at: new Date(now).toISOString() },
      { coin: 'BTC', side: 'buy', size: 1, price: 100, leverage: 1, order_type: 'market', pnl: -20, created_at: new Date(now).toISOString() },
      { coin: 'BTC', side: 'buy', size: 1, price: 100, leverage: 1, order_type: 'market', pnl: 10, created_at: new Date(now).toISOString() },
      { coin: 'BTC', side: 'buy', size: 1, price: 100, leverage: 1, order_type: 'market', pnl: null, created_at: new Date(now).toISOString() }, // ignored
    ];
    const result = aggregateTrades(trades, now);
    expect(result.profitableTrades).toBe(2);
    expect(result.winRate).toBe(66.67); // 2/3
    expect(result.totalPnl).toBe(40);
  });

  it('pnl of exactly 0 is not profitable', () => {
    const now = Date.now();
    const trades = [
      { coin: 'BTC', side: 'buy', size: 1, price: 100, leverage: 1, order_type: 'market', pnl: 0, created_at: new Date(now).toISOString() },
    ];
    const result = aggregateTrades(trades, now);
    expect(result.profitableTrades).toBe(0);
    expect(result.winRate).toBe(0);
  });

  it('handles string numeric values', () => {
    const now = Date.now();
    const trades = [
      { coin: 'BTC', side: 'buy', size: '0.5', price: '60000', leverage: '10', order_type: 'market', pnl: '100.5', created_at: new Date(now).toISOString() },
    ];
    const result = aggregateTrades(trades, now);
    expect(result.totalVolume).toBe(30000);
    expect(result.avgLeverage).toBe(10);
    expect(result.totalPnl).toBe(100.5);
  });
});

// --- User aggregation ---

function aggregateUsers(trades: any[], preferences: any[], emailMap: Map<string, string>) {
  const uniqueTraders = new Set(trades.map((t: any) => t.user_id));

  const riskDistribution: Record<string, number> = { conservative: 0, moderate: 0, aggressive: 0 };
  for (const p of preferences) {
    const level = p.risk_level || 'moderate';
    riskDistribution[level] = (riskDistribution[level] || 0) + 1;
  }

  // Top traders by volume
  const traderStats = new Map<string, { walletAddress: string; trades: number; volume: number; pnl: number }>();
  for (const t of trades) {
    const uid = t.user_id;
    if (!traderStats.has(uid)) {
      traderStats.set(uid, { walletAddress: t.wallet_address || '', trades: 0, volume: 0, pnl: 0 });
    }
    const s = traderStats.get(uid)!;
    s.trades++;
    s.volume += (Number(t.size) || 0) * (Number(t.price) || 0);
    s.pnl += Number(t.pnl) || 0;
    if (t.wallet_address) s.walletAddress = t.wallet_address;
  }

  const topTraders = Array.from(traderStats.entries())
    .map(([userId, data]) => ({
      userId,
      walletAddress: data.walletAddress,
      email: emailMap.get(data.walletAddress.toLowerCase()) || null,
      trades: data.trades,
      volume: Math.round(data.volume * 100) / 100,
      pnl: Math.round(data.pnl * 100) / 100,
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 20);

  return { totalTraders: uniqueTraders.size, riskDistribution, topTraders };
}

describe('user aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateUsers([], [], new Map());
    expect(result.totalTraders).toBe(0);
    expect(result.riskDistribution).toEqual({ conservative: 0, moderate: 0, aggressive: 0 });
    expect(result.topTraders).toEqual([]);
  });

  it('counts unique traders', () => {
    const trades = [
      { user_id: 'u1', wallet_address: '0xA', size: 1, price: 100, pnl: 10 },
      { user_id: 'u1', wallet_address: '0xA', size: 1, price: 200, pnl: -5 },
      { user_id: 'u2', wallet_address: '0xB', size: 1, price: 50, pnl: 3 },
    ];
    const result = aggregateUsers(trades, [], new Map());
    expect(result.totalTraders).toBe(2);
  });

  it('aggregates risk distribution from preferences', () => {
    const prefs = [
      { risk_level: 'conservative' },
      { risk_level: 'aggressive' },
      { risk_level: 'aggressive' },
      { risk_level: null }, // defaults to moderate
    ];
    const result = aggregateUsers([], prefs, new Map());
    expect(result.riskDistribution).toEqual({ conservative: 1, moderate: 1, aggressive: 2 });
  });

  it('builds top traders sorted by volume, limited to 20', () => {
    const trades = Array.from({ length: 25 }, (_, i) => ({
      user_id: `u${i}`, wallet_address: `0x${i}`, size: 1, price: (i + 1) * 100, pnl: i,
    }));
    const result = aggregateUsers(trades, [], new Map());
    expect(result.topTraders).toHaveLength(20);
    expect(result.topTraders[0].volume).toBe(2500); // u24: 1 * 2500
    expect(result.topTraders[0].userId).toBe('u24');
  });

  it('resolves email from wallet address map', () => {
    const trades = [
      { user_id: 'u1', wallet_address: '0xAbC', size: 1, price: 100, pnl: 0 },
    ];
    const emailMap = new Map([['0xabc', 'user@test.com']]);
    const result = aggregateUsers(trades, [], emailMap);
    expect(result.topTraders[0].email).toBe('user@test.com');
  });

  it('email is null when wallet not in map', () => {
    const trades = [
      { user_id: 'u1', wallet_address: '0xUnknown', size: 1, price: 100, pnl: 0 },
    ];
    const result = aggregateUsers(trades, [], new Map());
    expect(result.topTraders[0].email).toBeNull();
  });
});

// --- Daily volume chart ---

describe('daily volume chart', () => {
  it('groups trades by date', () => {
    const trades = [
      { size: 1, price: 100, pnl: 10, created_at: '2026-04-01T10:00:00Z' },
      { size: 2, price: 100, pnl: 20, created_at: '2026-04-01T15:00:00Z' },
      { size: 1, price: 50, pnl: -5, created_at: '2026-04-02T08:00:00Z' },
    ];

    const volumeByDay = new Map<string, { volume: number; trades: number; pnl: number }>();
    for (const t of trades) {
      if (!t.created_at) continue;
      const day = new Date(t.created_at).toISOString().slice(0, 10);
      if (!volumeByDay.has(day)) volumeByDay.set(day, { volume: 0, trades: 0, pnl: 0 });
      const d = volumeByDay.get(day)!;
      d.volume += (Number(t.size) || 0) * (Number(t.price) || 0);
      d.trades++;
      d.pnl += Number(t.pnl) || 0;
    }

    const dailyVolume = Array.from(volumeByDay.entries())
      .map(([date, d]) => ({
        date,
        volume: Math.round(d.volume * 100) / 100,
        trades: d.trades,
        pnl: Math.round(d.pnl * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    expect(dailyVolume).toHaveLength(2);
    expect(dailyVolume[0]).toEqual({ date: '2026-04-01', volume: 300, trades: 2, pnl: 30 });
    expect(dailyVolume[1]).toEqual({ date: '2026-04-02', volume: 50, trades: 1, pnl: -5 });
  });

  it('limits to last 30 days', () => {
    const trades = Array.from({ length: 40 }, (_, i) => {
      const d = new Date('2026-01-01');
      d.setDate(d.getDate() + i);
      return { size: 1, price: 100, pnl: 0, created_at: d.toISOString() };
    });

    const volumeByDay = new Map<string, { volume: number; trades: number; pnl: number }>();
    for (const t of trades) {
      const day = new Date(t.created_at).toISOString().slice(0, 10);
      if (!volumeByDay.has(day)) volumeByDay.set(day, { volume: 0, trades: 0, pnl: 0 });
      const d = volumeByDay.get(day)!;
      d.volume += (Number(t.size) || 0) * (Number(t.price) || 0);
      d.trades++;
    }

    const dailyVolume = Array.from(volumeByDay.entries())
      .map(([date, d]) => ({ date, volume: d.volume, trades: d.trades, pnl: d.pnl }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    expect(dailyVolume.length).toBeLessThanOrEqual(30);
  });

  it('skips trades with no created_at', () => {
    const trades = [
      { size: 1, price: 100, pnl: 0, created_at: null },
      { size: 1, price: 100, pnl: 0, created_at: '2026-04-01T00:00:00Z' },
    ];

    const volumeByDay = new Map<string, number>();
    for (const t of trades) {
      if (!t.created_at) continue;
      const day = new Date(t.created_at).toISOString().slice(0, 10);
      volumeByDay.set(day, (volumeByDay.get(day) || 0) + 1);
    }

    expect(volumeByDay.size).toBe(1);
    expect(volumeByDay.get('2026-04-01')).toBe(1);
  });
});

// --- Recent trades formatting ---

describe('recent trades formatting', () => {
  it('sorts by created_at descending and limits to 50', () => {
    const trades = Array.from({ length: 60 }, (_, i) => ({
      coin: 'BTC', side: 'buy', size: 1, price: 100, leverage: 5,
      pnl: null, status: 'filled', order_type: 'market',
      agent_reasoning: null,
      created_at: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }));

    const recent = [...trades]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 50);

    expect(recent).toHaveLength(50);
    // First should be the latest date
    expect(recent[0].created_at).toBe('2026-04-60T00:00:00Z');
  });

  it('maps trade fields correctly', () => {
    const trade = {
      coin: 'BTC', side: 'buy', size: 0.5, price: 60000, leverage: 10,
      pnl: 100.5, status: 'filled', order_type: 'market',
      agent_reasoning: 'BTC showing strong momentum', created_at: '2026-04-01T00:00:00Z',
    };

    const mapped = {
      coin: trade.coin,
      side: trade.side,
      size: Number(trade.size) || 0,
      price: Number(trade.price) || 0,
      leverage: Number(trade.leverage) || 0,
      pnl: trade.pnl != null ? Number(trade.pnl) : null,
      status: trade.status,
      orderType: trade.order_type,
      agentReasoning: trade.agent_reasoning || null,
      createdAt: trade.created_at,
    };

    expect(mapped.size).toBe(0.5);
    expect(mapped.price).toBe(60000);
    expect(mapped.pnl).toBe(100.5);
    expect(mapped.agentReasoning).toBe('BTC showing strong momentum');
  });

  it('null pnl stays null (not 0)', () => {
    const pnl = null;
    const mapped = pnl != null ? Number(pnl) : null;
    expect(mapped).toBeNull();
  });

  it('null agent_reasoning becomes null', () => {
    const reasoning = null;
    const mapped = reasoning || null;
    expect(mapped).toBeNull();
  });
});
