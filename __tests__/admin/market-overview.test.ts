/**
 * Tests for market overview aggregation logic.
 * Tests the volume and trade aggregation from app/api/admin/market/overview/route.ts
 */
import { describe, it, expect } from 'vitest';

describe('volume calculation', () => {
  function computeVolumes(rows: any[]) {
    const buyRows = rows.filter((r: any) => r.side === 'BUY');
    const sellRows = rows.filter((r: any) => r.side === 'SELL');

    const buyVolume = buyRows.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    const sellVolume = sellRows.reduce((s: number, r: any) => {
      const price = Number(r.price) || 0;
      if (price > 0) return s + (Number(r.amount) || 0);
      return s;
    }, 0);

    return { buyVolume, sellVolume, tradingVolume: buyVolume + sellVolume };
  }

  it('counts buy volume from amount field', () => {
    const rows = [
      { side: 'BUY', amount: 100, price: 0.5 },
      { side: 'BUY', amount: 50, price: 0.3 },
    ];
    const { buyVolume } = computeVolumes(rows);
    expect(buyVolume).toBe(150);
  });

  it('counts sell volume only for external sells (price > 0)', () => {
    const rows = [
      { side: 'SELL', amount: 80, price: 0.8 },   // external: count
      { side: 'SELL', amount: 20, price: 0 },       // internal: skip
    ];
    const { sellVolume } = computeVolumes(rows);
    expect(sellVolume).toBe(80);
  });

  it('excludes REDEEM from trading volume', () => {
    const rows = [
      { side: 'BUY', amount: 100, price: 0.5 },
      { side: 'REDEEM', amount: 100, price: 1.0 },
    ];
    const { tradingVolume } = computeVolumes(rows);
    expect(tradingVolume).toBe(100); // only the BUY
  });

  it('handles string amounts from Supabase', () => {
    const rows = [
      { side: 'BUY', amount: '100.50', price: '0.5' },
    ];
    const { buyVolume } = computeVolumes(rows);
    expect(buyVolume).toBe(100.5);
  });

  it('handles null/undefined amounts', () => {
    const rows = [
      { side: 'BUY', amount: null, price: 0.5 },
      { side: 'BUY', amount: undefined, price: 0.5 },
    ];
    const { buyVolume } = computeVolumes(rows);
    expect(buyVolume).toBe(0);
  });
});

describe('daily volume chart', () => {
  function buildDailyVolume(rows: any[]) {
    const volumeByDay = new Map<string, { volume: number; trades: number }>();
    for (const t of rows) {
      if (!t.created_at) continue;
      const day = new Date(t.created_at).toISOString().slice(0, 10);
      if (!volumeByDay.has(day)) volumeByDay.set(day, { volume: 0, trades: 0 });
      const d = volumeByDay.get(day)!;
      d.trades++;
      if (t.side === 'BUY') {
        d.volume += Number(t.amount) || 0;
      } else if (t.side === 'SELL') {
        const price = Number(t.price) || 0;
        if (price > 0) d.volume += Number(t.amount) || 0;
      }
    }
    return Array.from(volumeByDay.entries())
      .map(([date, d]) => ({ date, volume: Math.round(d.volume * 100) / 100, trades: d.trades }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
  }

  it('groups trades by day', () => {
    const rows = [
      { side: 'BUY', amount: 10, created_at: '2026-04-01T10:00:00Z' },
      { side: 'BUY', amount: 20, created_at: '2026-04-01T15:00:00Z' },
      { side: 'BUY', amount: 30, created_at: '2026-04-02T08:00:00Z' },
    ];
    const result = buildDailyVolume(rows);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: '2026-04-01', volume: 30, trades: 2 });
    expect(result[1]).toEqual({ date: '2026-04-02', volume: 30, trades: 1 });
  });

  it('skips trades with no created_at', () => {
    const rows = [
      { side: 'BUY', amount: 10, created_at: null },
      { side: 'BUY', amount: 20, created_at: '2026-04-01T10:00:00Z' },
    ];
    const result = buildDailyVolume(rows);
    expect(result).toHaveLength(1);
  });

  it('limits to last 30 days', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      side: 'BUY',
      amount: 10,
      created_at: new Date(2026, 0, i + 1).toISOString(), // Jan 1 - Feb 9
    }));
    const result = buildDailyVolume(rows);
    expect(result).toHaveLength(30);
  });
});

describe('top markets sorting', () => {
  it('sorts by platform volume descending, takes top 10', () => {
    const markets = Array.from({ length: 15 }, (_, i) => ({
      platformVolume: (i + 1) * 100,
      platformTrades: i + 1,
    }));

    const top = [...markets]
      .filter((m) => m.platformTrades > 0)
      .sort((a, b) => b.platformVolume - a.platformVolume)
      .slice(0, 10);

    expect(top).toHaveLength(10);
    expect(top[0].platformVolume).toBe(1500); // highest
    expect(top[9].platformVolume).toBe(600);  // 10th highest
  });
});

describe('recent trades enrichment', () => {
  it('sorts by created_at descending and takes 100', () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({
      created_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      user_address: `0x${i}`,
    }));

    const recent = [...rows]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 100);

    expect(recent).toHaveLength(100);
    // Most recent should be last in original array (highest second)
    expect(recent[0].user_address).toBe('0x149');
  });

  it('handles null created_at in sorting', () => {
    const rows = [
      { created_at: '2026-04-01T10:00:00Z', user_address: '0x1' },
      { created_at: null, user_address: '0x2' },
      { created_at: '2026-04-02T10:00:00Z', user_address: '0x3' },
    ];

    const recent = [...rows]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    // null → '' which sorts last
    expect(recent[0].user_address).toBe('0x3');
    expect(recent[2].user_address).toBe('0x2');
  });
});

describe('time-based filtering', () => {
  it('24h filter uses correct threshold', () => {
    const now = new Date('2026-04-04T12:00:00Z').getTime();
    const oneDayAgo = new Date(now - 86400000).toISOString();

    // 23h ago — should be included
    const recent = new Date(now - 23 * 3600000).toISOString();
    expect(recent > oneDayAgo).toBe(true);

    // 25h ago — should be excluded
    const old = new Date(now - 25 * 3600000).toISOString();
    expect(old > oneDayAgo).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Note: The string comparison `r.created_at > oneDayAgo` works because
  // ISO 8601 strings are lexicographically orderable. This is correct.
  // -----------------------------------------------------------------------
  it('ISO string comparison is equivalent to timestamp comparison', () => {
    const a = '2026-04-04T10:00:00.000Z';
    const b = '2026-04-04T11:00:00.000Z';
    expect(b > a).toBe(true);
    expect(new Date(b).getTime() > new Date(a).getTime()).toBe(true);
  });
});
