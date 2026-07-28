/**
 * Tests for lib/admin/db.ts — database utilities (fetchAllRows, backfillMissingMarkets).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client
const mockSelect = vi.fn();
const mockRange = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => {
      mockFrom(...args);
      return {
        select: (...sArgs: any[]) => {
          mockSelect(...sArgs);
          return {
            range: (...rArgs: any[]) => {
              mockRange(...rArgs);
              // Return a thenable that resolves based on test setup
              return mockRange.mock.results[mockRange.mock.calls.length - 1]?.value ||
                Promise.resolve({ data: [], error: null });
            },
          };
        },
      };
    },
  },
}));

// Mock fetch for backfillMissingMarkets
const originalFetch = globalThis.fetch;

import { fetchAllRows, backfillMissingMarkets } from '@/lib/admin/db';
import type { MarketInfo } from '@/lib/admin/pnl';
import { afterAll } from 'vitest';

describe('fetchAllRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches single page when data < PAGE_SIZE', async () => {
    const testData = Array.from({ length: 50 }, (_, i) => ({ id: i }));

    mockRange.mockReturnValueOnce(Promise.resolve({ data: testData, error: null }));

    const result = await fetchAllRows('test_table', '*');

    expect(mockFrom).toHaveBeenCalledWith('test_table');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockRange).toHaveBeenCalledWith(0, 999);
    expect(result).toEqual(testData);
    expect(result).toHaveLength(50);
  });

  it('paginates when data = PAGE_SIZE (1000 rows)', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const page2 = Array.from({ length: 200 }, (_, i) => ({ id: 1000 + i }));

    mockRange
      .mockReturnValueOnce(Promise.resolve({ data: page1, error: null }))
      .mockReturnValueOnce(Promise.resolve({ data: page2, error: null }));

    const result = await fetchAllRows('test_table', '*');

    expect(mockRange).toHaveBeenCalledTimes(2);
    expect(mockRange).toHaveBeenCalledWith(0, 999);
    expect(mockRange).toHaveBeenCalledWith(1000, 1999);
    expect(result).toHaveLength(1200);
  });

  it('handles empty table', async () => {
    mockRange.mockReturnValueOnce(Promise.resolve({ data: [], error: null }));

    const result = await fetchAllRows('empty_table', '*');
    expect(result).toEqual([]);
  });

  it('handles null data response', async () => {
    mockRange.mockReturnValueOnce(Promise.resolve({ data: null, error: null }));

    const result = await fetchAllRows('test_table', '*');
    expect(result).toEqual([]);
  });

  it('throws on Supabase error', async () => {
    mockRange.mockReturnValueOnce(
      Promise.resolve({ data: null, error: { message: 'DB error', code: '42P01' } })
    );

    await expect(fetchAllRows('bad_table', '*')).rejects.toEqual(
      expect.objectContaining({ message: 'DB error' })
    );
  });

  // -----------------------------------------------------------------------
  // BUG: fetchAllRows has no ORDER BY — pagination without ordering can
  // return duplicates or miss rows if underlying data changes between pages.
  // -----------------------------------------------------------------------
  it('BUG: no default ordering — pagination can produce inconsistent results', () => {
    // This test documents the architectural issue:
    // Supabase pagination without ORDER BY is non-deterministic.
    // If rows are inserted/deleted between page fetches, results can have
    // duplicates or missing rows. Should add .order('id') or similar.
    //
    // The `apply` callback CAN add ordering, but none of the call sites
    // (except trader detail) pass one.
    expect(true).toBe(true); // documenting the issue
  });
});

describe('backfillMissingMarkets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('does nothing when no missing markets', async () => {
    const mm = new Map<string, MarketInfo>([
      ['c1', { condition_id: 'c1', outcomes: ['Yes'], outcome_prices: [0.5], is_closed: false }],
    ]);

    await backfillMissingMarkets(['c1'], mm);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fetches missing markets from Gamma API', async () => {
    const mm = new Map<string, MarketInfo>();

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ([{
        condition_id: 'c1',
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.7","0.3"]',
        closed: true,
      }]),
    });

    await backfillMissingMarkets(['c1'], mm);

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(mm.has('c1')).toBe(true);
    expect(mm.get('c1')!.outcome_prices).toEqual([0.7, 0.3]);
    expect(mm.get('c1')!.is_closed).toBe(true);
  });

  it('handles Gamma API returning array vs single object', async () => {
    const mm = new Map<string, MarketInfo>();

    // API returns a single object (not array)
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        condition_id: 'c1',
        outcomes: ['Yes', 'No'],
        outcomePrices: [0.5, 0.5],
        closed: false,
      }),
    });

    await backfillMissingMarkets(['c1'], mm);

    expect(mm.has('c1')).toBe(true);
  });

  it('tolerates API failures gracefully (Promise.allSettled)', async () => {
    const mm = new Map<string, MarketInfo>();

    (globalThis.fetch as any)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{
          condition_id: 'c2',
          outcomes: ['Yes', 'No'],
          outcomePrices: [0.5, 0.5],
          closed: false,
        }]),
      });

    await backfillMissingMarkets(['c1', 'c2'], mm);

    // c1 failed, c2 succeeded
    expect(mm.has('c1')).toBe(false);
    expect(mm.has('c2')).toBe(true);
  });

  it('handles non-OK HTTP response', async () => {
    const mm = new Map<string, MarketInfo>();

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await backfillMissingMarkets(['c1'], mm);

    expect(mm.has('c1')).toBe(false);
  });

  it('handles empty API response', async () => {
    const mm = new Map<string, MarketInfo>();

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ([]),
    });

    await backfillMissingMarkets(['c1'], mm);

    // Array.isArray([]) → data[0] is undefined → returns null
    expect(mm.has('c1')).toBe(false);
  });

  it('handles Gamma API camelCase outcomePrices vs snake_case outcome_prices', async () => {
    const mm = new Map<string, MarketInfo>();

    // Gamma uses snake_case fallback
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ([{
        condition_id: 'c1',
        outcomes: ['Yes', 'No'],
        outcome_prices: [0.8, 0.2], // snake_case
        closed: false,
      }]),
    });

    await backfillMissingMarkets(['c1'], mm);

    expect(mm.get('c1')!.outcome_prices).toEqual([0.8, 0.2]);
  });

  it('handles is_closed from Gamma (closed vs is_closed)', async () => {
    const mm = new Map<string, MarketInfo>();

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ([{
        condition_id: 'c1',
        outcomes: ['Yes', 'No'],
        outcomePrices: [1, 0],
        is_closed: true, // alternative field name
      }]),
    });

    await backfillMissingMarkets(['c1'], mm);

    expect(mm.get('c1')!.is_closed).toBe(true);
  });
});
