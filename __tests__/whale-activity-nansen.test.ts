/**
 * Tests for: Whale activity / smart money moves fails
 *
 * Issue: "It seems I'm unable to fetch on-chain data for smart money moves"
 * The Nansen API client returns a generic error for multiple failure modes:
 * - Missing NANSEN_API_KEY
 * - HTTP errors (4xx, 5xx)
 * - Network failures
 * - Credit exhaustion
 *
 * These tests verify the Nansen client handles each failure mode correctly
 * and that the smart money tool execution properly surfaces errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We can't easily import the private nansenPost function, so we test
// the exported getSmartMoneyNetflows and getSmartMoneyHoldings functions
// by mocking global fetch.

describe('Nansen API client — whale activity error handling', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('returns error when NANSEN_API_KEY is not set', async () => {
    delete process.env.NANSEN_API_KEY;

    // Dynamic import to pick up fresh env
    const { getSmartMoneyNetflows } = await import('@/lib/nansen/client');
    const result = await getSmartMoneyNetflows();

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('not configured');
  });

  it('returns error on HTTP 500 from Nansen API', async () => {
    process.env.NANSEN_API_KEY = 'test-key';

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({ message: 'Internal Server Error' }),
    });

    const { getSmartMoneyNetflows } = await import('@/lib/nansen/client');
    const result = await getSmartMoneyNetflows();

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Unable to fetch');
  });

  it('returns error on HTTP 429 rate limit', async () => {
    process.env.NANSEN_API_KEY = 'test-key';

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers(),
      json: async () => ({ message: 'Rate limit exceeded' }),
    });

    const { getSmartMoneyNetflows } = await import('@/lib/nansen/client');
    const result = await getSmartMoneyNetflows();

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Unable to fetch');
  });

  it('returns error on network failure', async () => {
    process.env.NANSEN_API_KEY = 'test-key';

    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const { getSmartMoneyNetflows } = await import('@/lib/nansen/client');
    const result = await getSmartMoneyNetflows();

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Unable to fetch');
  });

  it('returns error on fetch timeout', async () => {
    process.env.NANSEN_API_KEY = 'test-key';

    global.fetch = vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));

    const { getSmartMoneyNetflows } = await import('@/lib/nansen/client');
    const result = await getSmartMoneyNetflows();

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Unable to fetch');
  });

  it('returns data successfully when API responds with valid data', async () => {
    process.env.NANSEN_API_KEY = 'test-key';

    const mockData = [
      {
        token_address: '0xabc',
        token_symbol: 'ETH',
        chain: 'ethereum',
        net_flow_1h_usd: 1000,
        net_flow_24h_usd: 50000,
        net_flow_7d_usd: 200000,
        net_flow_30d_usd: 800000,
        trader_count: 42,
        token_age_days: 365,
        market_cap_usd: 1e12,
        token_sectors: ['L1'],
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'X-Nansen-Credits-Used': '1',
        'X-Nansen-Credits-Remaining': '99',
      }),
      json: async () => ({ data: mockData }),
    });

    const { getSmartMoneyNetflows } = await import('@/lib/nansen/client');
    const result = await getSmartMoneyNetflows();

    // Should return the unwrapped data array, not { data: [...] }
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0].token_symbol).toBe('ETH');
  });

  it('getSmartMoneyHoldings returns error when API key missing', async () => {
    delete process.env.NANSEN_API_KEY;

    const { getSmartMoneyHoldings } = await import('@/lib/nansen/client');
    const result = await getSmartMoneyHoldings();

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('not configured');
  });

  it('getSmartMoneyHoldings returns error on API failure', async () => {
    process.env.NANSEN_API_KEY = 'test-key';

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      json: async () => ({ message: 'Forbidden — credits exhausted' }),
    });

    const { getSmartMoneyHoldings } = await import('@/lib/nansen/client');
    const result = await getSmartMoneyHoldings();

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Unable to fetch');
  });

  it('error message is user-friendly, does not leak internal details', async () => {
    process.env.NANSEN_API_KEY = 'test-key';

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({ message: 'database connection pool exhausted', detail: 'pg: pool_timeout' }),
    });

    const { getSmartMoneyNetflows } = await import('@/lib/nansen/client');
    const result = await getSmartMoneyNetflows();

    const error = (result as { error: string }).error;
    // Should NOT contain internal database details
    expect(error).not.toContain('database');
    expect(error).not.toContain('pg:');
    expect(error).not.toContain('pool');
    // Should be a generic user-facing message
    expect(error).toContain('Unable to fetch');
  });

  it('sends correct request body structure for netflows', async () => {
    process.env.NANSEN_API_KEY = 'test-key';

    let capturedBody: any;
    global.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ data: [] }),
      };
    });

    const { getSmartMoneyNetflows } = await import('@/lib/nansen/client');
    await getSmartMoneyNetflows({
      chains: ['base', 'ethereum'],
      sortBy: 'net_flow_24h_usd',
      limit: 10,
    });

    expect(capturedBody).toMatchObject({
      chains: ['base', 'ethereum'],
      order_by: [{ field: 'net_flow_24h_usd', direction: 'DESC' }],
      pagination: { page: 1, per_page: 10 },
    });
  });
});
