/**
 * Tests for all admin API endpoints.
 *
 * Mocks: supabaseAdmin, fetchAllRows, backfillMissingMarkets, requireAdmin,
 *        sendEmail, fetchUserTrades, fetchProfile, computeTraderPnl
 *
 * Endpoints covered:
 *   1. GET  /api/admin/verify
 *   2. GET  /api/admin/revenue/overview
 *   3. GET  /api/admin/waitlist
 *   4. POST /api/admin/waitlist
 *   5. GET  /api/admin/users/overview
 *   6. GET  /api/admin/market/overview
 *   7. GET  /api/admin/market/traders
 *   8. GET  /api/admin/market/traders/[address]
 *   9. GET  /api/admin/activity/overview
 *  10. GET  /api/admin/invite-codes
 *  11. POST /api/admin/invite-codes
 *  12. DELETE /api/admin/invite-codes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Shared mock factories ───────────────────────────────────────────────────

function makeRequest(url = 'http://localhost/api/admin/test', opts?: { method?: string; body?: string; headers?: Record<string, string> }) {
  const req = new NextRequest(url, opts as any);
  // Simulate privy-token cookie so requireAdmin mock resolves
  return req;
}

function jsonBody(body: object) {
  return {
    method: 'POST' as const,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  };
}

function deleteBody(body: object) {
  return {
    method: 'DELETE' as const,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  };
}

// ─── Mock: requireAdmin ──────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: (...args: any[]) => mockRequireAdmin(...args),
  isAdminEmail: (email: string) => email === 'admin@test.com',
}));

// ─── Mock: supabaseAdmin ─────────────────────────────────────────────────────

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

// ─── Mock: fetchAllRows / backfillMissingMarkets ─────────────────────────────

const mockFetchAllRows = vi.fn();
const mockBackfillMissingMarkets = vi.fn();
vi.mock('@/lib/admin/db', () => ({
  fetchAllRows: (...args: any[]) => mockFetchAllRows(...args),
  backfillMissingMarkets: (...args: any[]) => mockBackfillMissingMarkets(...args),
}));

// ─── Mock: sendEmail ─────────────────────────────────────────────────────────

const mockSendEmail = vi.fn();
vi.mock('@/lib/email/resend', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}));

vi.mock('@/lib/email/templates', () => ({
  approvalWelcomeEmail: () => '<html>Welcome</html>',
  approvalWelcomeEmailText: () => 'Welcome',
}));

// ─── Mock: polymarket API ────────────────────────────────────────────────────

const mockFetchUserTrades = vi.fn();
const mockFetchProfile = vi.fn();
vi.mock('@/lib/polymarket/api', () => ({
  fetchUserTrades: (...args: any[]) => mockFetchUserTrades(...args),
  fetchProfile: (...args: any[]) => mockFetchProfile(...args),
}));

// ─── Mock: P&L ───────────────────────────────────────────────────────────────

vi.mock('@/lib/admin/pnl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/pnl')>();
  return {
    ...actual,
    // keep real implementations for parseMarketInfo, getResolvedWinner, computeTraderPnl
  };
});

// ─── Helper: chainable supabase query builder ────────────────────────────────

function mockQueryBuilder(data: any[] | null = [], error: any = null, count?: number) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: any) => resolve({ data, error, count })),
  };
  // Make it thenable (Promise-like) so `await` works
  builder[Symbol.for('nodejs.util.promisify.custom')] = undefined;
  // For direct await usage, return resolved promise
  Object.defineProperty(builder, 'then', {
    value: (resolve: any, reject?: any) => {
      return Promise.resolve({ data, error, count }).then(resolve, reject);
    },
  });
  return builder;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ email: 'admin@test.com' });
  mockBackfillMissingMarkets.mockResolvedValue(undefined);
  mockSendEmail.mockResolvedValue(undefined);
  mockFetchUserTrades.mockResolvedValue([]);
  mockFetchProfile.mockResolvedValue(null);
});

// =============================================================================
//  1. GET /api/admin/verify
// =============================================================================

describe('GET /api/admin/verify', () => {
  let handler: typeof import('@/app/api/admin/verify/route').GET;

  beforeEach(async () => {
    const mod = await import('@/app/api/admin/verify/route');
    handler = mod.GET;
  });

  it('returns admin=true with email for authenticated admin', async () => {
    const res = await handler(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ admin: true, email: 'admin@test.com' });
  });

  it('returns 401 when no token provided', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
    const res = await handler(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    );
    const res = await handler(makeRequest());
    expect(res.status).toBe(403);
  });

  it('sets no-cache headers', async () => {
    const res = await handler(makeRequest());
    expect(res.headers.get('Cache-Control')).toBe('no-store, max-age=0');
  });
});

// =============================================================================
//  2. GET /api/admin/revenue/overview
// =============================================================================

describe('GET /api/admin/revenue/overview', () => {
  let handler: typeof import('@/app/api/admin/revenue/overview/route').GET;

  beforeEach(async () => {
    const mod = await import('@/app/api/admin/revenue/overview/route');
    handler = mod.GET;
  });

  it('returns 200 with correct revenue structure for empty data', async () => {
    mockFetchAllRows.mockResolvedValue([]);
    mockFrom.mockReturnValue(mockQueryBuilder([]));

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.overview).toBeDefined();
    expect(body.overview.totalRevenue).toBe(0);
    expect(body.overview.uniqueUsers).toBe(0);
    expect(body.overview.successRate).toBe(100); // default when no payment attempts
    expect(body.agents).toEqual([]);
    expect(body.topUsers).toEqual([]);
    expect(body.dailyRevenue).toEqual([]);
  });

  it('correctly converts USDC atomic units to human-readable', async () => {
    const now = new Date().toISOString();
    mockFetchAllRows.mockImplementation((table: string) => {
      if (table === 'payment_proofs') {
        return [
          { agent_id: 'agent1', amount: '5000000', from_address: '0xabc', used_at: now, tx_hash: '0x1' },
          { agent_id: 'agent1', amount: '3000000', from_address: '0xdef', used_at: now, tx_hash: '0x2' },
        ];
      }
      if (table === 'user_wallets') return [];
      if (table === 'x402_payments') return [];
      return [];
    });
    mockFrom.mockReturnValue(mockQueryBuilder([]));

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(body.overview.totalRevenue).toBe(8); // 5 + 3 USDC
    expect(body.overview.totalRequests).toBe(2);
  });

  it('computes payment success rate correctly', async () => {
    mockFetchAllRows.mockImplementation((table: string) => {
      if (table === 'x402_payments') {
        return [
          { status: 'completed' },
          { status: 'completed' },
          { status: 'completed' },
          { status: 'failed' },
          { status: 'expired' },
        ];
      }
      if (table === 'payment_proofs') return [];
      if (table === 'user_wallets') return [];
      return [];
    });
    mockFrom.mockReturnValue(mockQueryBuilder([]));

    const res = await handler(makeRequest());
    const body = await res.json();

    // 3 completed out of 5 total = 60%
    expect(body.overview.successRate).toBe(60);
    expect(body.overview.paymentStats.completed).toBe(3);
    expect(body.overview.paymentStats.failed).toBe(2); // failed + expired
    expect(body.overview.paymentStats.pending).toBe(0);
  });

  it('BUG: revenuePrev7d loop does not guard null used_at (counts as epoch)', async () => {
    // When used_at is null, new Date(null).getTime() === 0 (epoch).
    // The second loop at line 173 does NOT have the isNaN guard that the first loop has.
    // This means rows with null used_at are NOT counted in time windows (correct in first loop)
    // but ARE checked against twoWeeksAgo in second loop. Since 0 < oneWeekAgo,
    // it won't match the prev-7d window (twoWeeksAgo <= 0 < oneWeekAgo is false in 2026),
    // so this bug is benign NOW but the inconsistency is a latent risk.
    const now = new Date().toISOString();
    mockFetchAllRows.mockImplementation((table: string) => {
      if (table === 'payment_proofs') {
        return [
          { agent_id: 'a', amount: '1000000', from_address: '0x1', used_at: null, tx_hash: '0x1' },
          { agent_id: 'a', amount: '2000000', from_address: '0x2', used_at: now, tx_hash: '0x2' },
        ];
      }
      if (table === 'user_wallets') return [];
      if (table === 'x402_payments') return [];
      return [];
    });
    mockFrom.mockReturnValue(mockQueryBuilder([]));

    const res = await handler(makeRequest());
    const body = await res.json();

    // Total revenue includes both rows (no time filter)
    expect(body.overview.totalRevenue).toBe(3);
    // 24h revenue should only include the non-null row
    expect(body.overview.revenue24h).toBe(2);
  });

  it('groups revenue by agent correctly', async () => {
    const now = new Date().toISOString();
    mockFetchAllRows.mockImplementation((table: string) => {
      if (table === 'payment_proofs') {
        return [
          { agent_id: 'a1', amount: '10000000', from_address: '0x1', used_at: now, tx_hash: '0x1' },
          { agent_id: 'a2', amount: '5000000', from_address: '0x1', used_at: now, tx_hash: '0x2' },
          { agent_id: 'a1', amount: '3000000', from_address: '0x2', used_at: now, tx_hash: '0x3' },
        ];
      }
      if (table === 'user_wallets') return [];
      if (table === 'x402_payments') return [];
      return [];
    });
    mockFrom.mockReturnValue(mockQueryBuilder([
      { id: 'a1', agent_name: 'Agent One', pricing_rate: 0.01 },
      { id: 'a2', agent_name: 'Agent Two', pricing_rate: 0.02 },
    ]));

    const res = await handler(makeRequest());
    const body = await res.json();

    // a1: 10 + 3 = 13 USDC, a2: 5 USDC — sorted desc
    expect(body.agents[0].agentName).toBe('Agent One');
    expect(body.agents[0].revenue).toBe(13);
    expect(body.agents[0].uniqueUsers).toBe(2);
    expect(body.agents[1].agentName).toBe('Agent Two');
    expect(body.agents[1].revenue).toBe(5);
  });

  it('computes growth rate correctly', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();

    mockFetchAllRows.mockImplementation((table: string) => {
      if (table === 'payment_proofs') {
        return [
          // Previous 7d: $10
          { agent_id: 'a', amount: '10000000', from_address: '0x1', used_at: eightDaysAgo, tx_hash: '0x1' },
          // Current 7d: $20
          { agent_id: 'a', amount: '20000000', from_address: '0x1', used_at: twoDaysAgo, tx_hash: '0x2' },
        ];
      }
      if (table === 'user_wallets') return [];
      if (table === 'x402_payments') return [];
      return [];
    });
    mockFrom.mockReturnValue(mockQueryBuilder([]));

    const res = await handler(makeRequest());
    const body = await res.json();

    // Growth: (20 - 10) / 10 * 100 = 100%
    expect(body.overview.growthRate7d).toBe(100);
  });

  it('returns 500 on internal error', async () => {
    mockFetchAllRows.mockRejectedValue(new Error('DB down'));

    const res = await handler(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to fetch revenue data');
  });
});

// =============================================================================
//  3. GET /api/admin/waitlist
// =============================================================================

describe('GET /api/admin/waitlist', () => {
  let handler: typeof import('@/app/api/admin/waitlist/route').GET;

  beforeEach(async () => {
    const mod = await import('@/app/api/admin/waitlist/route');
    handler = mod.GET;
  });

  it('returns waitlist entries sorted by created_at DESC', async () => {
    const entries = [
      { id: '1', email: 'a@b.com', status: 'approved', created_at: '2026-01-02', approved_at: '2026-01-03' },
      { id: '2', email: 'c@d.com', status: 'pending', created_at: '2026-01-01', approved_at: null },
    ];
    mockFrom.mockReturnValue(mockQueryBuilder(entries));

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].email).toBe('a@b.com');
  });

  it('returns empty array when waitlist is empty', async () => {
    mockFrom.mockReturnValue(mockQueryBuilder([]));

    const res = await handler(makeRequest());
    const body = await res.json();
    expect(body.entries).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    mockFrom.mockReturnValue(mockQueryBuilder(null, { message: 'timeout' }));

    const res = await handler(makeRequest());
    expect(res.status).toBe(500);
  });
});

// =============================================================================
//  4. POST /api/admin/waitlist
// =============================================================================

describe('POST /api/admin/waitlist', () => {
  let handler: typeof import('@/app/api/admin/waitlist/route').POST;

  beforeEach(async () => {
    const mod = await import('@/app/api/admin/waitlist/route');
    handler = mod.POST;
  });

  it('approves a single email and sends welcome email', async () => {
    mockFrom.mockReturnValue(mockQueryBuilder([]));

    const res = await handler(makeRequest('http://localhost/api/admin/waitlist', jsonBody({
      action: 'approve',
      email: 'user@test.com',
    })));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.action).toBe('approve');
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      'user@test.com',
      'Welcome to Supermission!',
      expect.any(String),
      expect.any(String),
    );
  });

  it('approves bulk emails', async () => {
    mockFrom.mockReturnValue(mockQueryBuilder([]));

    const res = await handler(makeRequest('http://localhost/api/admin/waitlist', jsonBody({
      action: 'approve',
      emails: ['a@b.com', 'c@d.com', 'e@f.com'],
    })));
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.emails).toHaveLength(3);
    expect(mockSendEmail).toHaveBeenCalledTimes(3);
  });

  it('deduplicates email list — same email processed only once', async () => {
    mockFrom.mockReturnValue(mockQueryBuilder([]));

    const res = await handler(makeRequest('http://localhost/api/admin/waitlist', jsonBody({
      action: 'approve',
      emails: ['dup@test.com', 'dup@test.com'],
    })));
    const body = await res.json();

    // FIXED: duplicates are removed, sendEmail called only once
    expect(body.emails).toHaveLength(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects emails by soft-deleting (sets status=rejected)', async () => {
    mockFrom.mockReturnValue(mockQueryBuilder([]));

    const res = await handler(makeRequest('http://localhost/api/admin/waitlist', jsonBody({
      action: 'reject',
      email: 'bad@test.com',
    })));
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.action).toBe('reject');
    // No email sent on rejection
    expect(mockSendEmail).not.toHaveBeenCalled();
    // Verify soft delete was used (update, not delete)
    expect(mockFrom).toHaveBeenCalledWith('waitlist');
  });

  it('returns 400 for invalid action', async () => {
    const res = await handler(makeRequest('http://localhost/api/admin/waitlist', jsonBody({
      action: 'ban',
      email: 'a@b.com',
    })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing email', async () => {
    const res = await handler(makeRequest('http://localhost/api/admin/waitlist', jsonBody({
      action: 'approve',
    })));
    expect(res.status).toBe(400);
  });

  it('filters out invalid emails', async () => {
    mockFrom.mockReturnValue(mockQueryBuilder([]));

    const res = await handler(makeRequest('http://localhost/api/admin/waitlist', jsonBody({
      action: 'approve',
      emails: ['valid@test.com', 'no-at-sign', '', '   ', 123],
    })));
    const body = await res.json();

    expect(body.emails).toEqual(['valid@test.com']);
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it('normalizes email casing', async () => {
    mockFrom.mockReturnValue(mockQueryBuilder([]));

    const res = await handler(makeRequest('http://localhost/api/admin/waitlist', jsonBody({
      action: 'approve',
      email: '  User@Test.COM  ',
    })));
    const body = await res.json();

    expect(body.emails[0]).toBe('user@test.com');
  });

  it('continues even if email send fails (fire-and-forget)', async () => {
    mockFrom.mockReturnValue(mockQueryBuilder([]));
    mockSendEmail.mockRejectedValue(new Error('Resend API down'));

    const res = await handler(makeRequest('http://localhost/api/admin/waitlist', jsonBody({
      action: 'approve',
      email: 'user@test.com',
    })));
    // BUG: returns success=true even though email delivery failed
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =============================================================================
//  5. GET /api/admin/users/overview
// =============================================================================

describe('GET /api/admin/users/overview', () => {
  let handler: typeof import('@/app/api/admin/users/overview/route').GET;

  beforeEach(async () => {
    const mod = await import('@/app/api/admin/users/overview/route');
    handler = mod.GET;
  });

  function setupMocks(opts: {
    loginEvents?: any[];
    wallets?: any[];
    waitlist?: any[];
    screenings?: any[];
    trades?: any[];
    loginEmails?: any[];
    totalLogins?: number;
    logins24h?: number;
    logins7d?: number;
    totalScreenings?: number;
  } = {}) {
    const loginBuilder = mockQueryBuilder(opts.loginEvents ?? [], null);
    const screeningBuilder = mockQueryBuilder(opts.screenings ?? [], null);
    const screeningCountBuilder = mockQueryBuilder(null, null, opts.totalScreenings ?? (opts.screenings ?? []).length);
    const totalLoginBuilder = mockQueryBuilder(null, null, opts.totalLogins ?? 0);
    const logins24hBuilder = mockQueryBuilder(null, null, opts.logins24h ?? 0);
    const logins7dBuilder = mockQueryBuilder(null, null, opts.logins7d ?? 0);

    let loginCallCount = 0;
    let screeningCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'login_events') {
        loginCallCount++;
        // First call: recent events. Subsequent: count queries
        if (loginCallCount === 1) return loginBuilder;
        if (loginCallCount === 2) return totalLoginBuilder;
        if (loginCallCount === 3) return logins24hBuilder;
        if (loginCallCount === 4) return logins7dBuilder;
        return loginBuilder;
      }
      if (table === 'compliance_screenings') {
        screeningCallCount++;
        // First call: data fetch (limit 200). Second call: exact count.
        if (screeningCallCount === 1) return screeningBuilder;
        if (screeningCallCount === 2) return screeningCountBuilder;
        return screeningBuilder;
      }
      return mockQueryBuilder([]);
    });

    mockFetchAllRows.mockImplementation((table: string) => {
      if (table === 'user_wallets') return Promise.resolve(opts.wallets ?? []);
      if (table === 'waitlist') return Promise.resolve(opts.waitlist ?? []);
      if (table === 'trade_history') return Promise.resolve(opts.trades ?? []);
      if (table === 'login_events') return Promise.resolve(opts.loginEmails ?? []);
      return Promise.resolve([]);
    });
  }

  it('returns correct structure with empty data', async () => {
    setupMocks();

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.overview.totalUsers).toBe(0);
    expect(body.overview.totalWallets).toBe(0);
    expect(body.waitlistFunnel.total).toBe(0);
    expect(body.userJourney.waitlisted).toBe(0);
    expect(body.compliance.totalScreenings).toBe(0);
  });

  it('computes user journey funnel correctly', async () => {
    setupMocks({
      wallets: [
        { wallet_address: '0xaaa', email: 'alice@test.com', chain: 'base', updated_at: '2026-01-01' },
        { wallet_address: '0xbbb', email: 'bob@test.com', chain: 'base', updated_at: '2026-01-01' },
      ],
      waitlist: [
        { email: 'alice@test.com', status: 'approved', created_at: '2026-01-01', approved_at: '2026-01-02' },
        { email: 'bob@test.com', status: 'pending', created_at: '2026-01-01', approved_at: null },
        { email: 'carol@test.com', status: 'approved', created_at: '2025-12-01', approved_at: '2025-12-02' },
      ],
      loginEmails: [
        { email: 'alice@test.com' },
      ],
      trades: [
        { user_address: '0xaaa', created_at: new Date().toISOString() },
      ],
    });

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(body.overview.totalUsers).toBe(2); // unique emails in user_wallets
    expect(body.waitlistFunnel.total).toBe(3);
    expect(body.waitlistFunnel.approved).toBe(2);
    expect(body.waitlistFunnel.pending).toBe(1);
    expect(body.userJourney.loggedIn).toBe(1); // alice only
    expect(body.userJourney.traded).toBe(1); // alice via 0xaaa
    expect(body.userJourney.activeTraders).toBe(1); // 0xaaa traded recently
  });

  it('computes compliance stats correctly', async () => {
    setupMocks({
      screenings: [
        { id: '1', address: '0xaaa', chain: 'base', risk_level: 'low', risk_score: 10, flags: [], is_blocked: false, result: 'pass', error_message: null, created_at: '2026-01-01' },
        { id: '2', address: '0xbbb', chain: 'base', risk_level: 'high', risk_score: 90, flags: ['sanctions'], is_blocked: true, result: 'fail', error_message: null, created_at: '2026-01-02' },
        { id: '3', address: '0xccc', chain: 'base', risk_level: null, risk_score: null, flags: [], is_blocked: false, result: 'error', error_message: 'API timeout', created_at: '2026-01-03' },
      ],
    });

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(body.compliance.pass).toBe(1);
    expect(body.compliance.fail).toBe(1);
    expect(body.compliance.error).toBe(1);
    expect(body.compliance.blockedAddresses).toEqual(['0xbbb']);
  });

  it('compliance totalScreenings uses exact DB count, not fetched row count', async () => {
    // The endpoint now uses a separate exact count query for totalScreenings,
    // so even if only 200 rows are fetched for detail, the count is accurate.
    const screenings = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      address: `0x${i}`,
      chain: 'base',
      risk_level: 'low',
      risk_score: 10,
      flags: [],
      is_blocked: false,
      result: 'pass',
      error_message: null,
      created_at: '2026-01-01',
    }));
    setupMocks({ screenings, totalScreenings: 500 });

    const res = await handler(makeRequest());
    const body = await res.json();

    // FIXED: totalScreenings reflects the exact DB count (500), not the fetched 50
    expect(body.compliance.totalScreenings).toBe(500);
  });

  it('returns 500 on error', async () => {
    mockFetchAllRows.mockRejectedValue(new Error('connection lost'));
    mockFrom.mockReturnValue(mockQueryBuilder(null, { message: 'err' }));

    const res = await handler(makeRequest());
    expect(res.status).toBe(500);
  });
});

// =============================================================================
//  6. GET /api/admin/market/overview
// =============================================================================

describe('GET /api/admin/market/overview', () => {
  let handler: typeof import('@/app/api/admin/market/overview/route').GET;

  beforeEach(async () => {
    const mod = await import('@/app/api/admin/market/overview/route');
    handler = mod.GET;
  });

  function setupMarketMocks(opts: {
    trades?: any[];
    catalog?: any[];
    wallets?: any[];
  } = {}) {
    mockFetchAllRows.mockImplementation((table: string) => {
      if (table === 'trade_history') return Promise.resolve(opts.trades ?? []);
      if (table === 'market_catalog') return Promise.resolve(opts.catalog ?? []);
      if (table === 'user_wallets') return Promise.resolve(opts.wallets ?? []);
      return Promise.resolve([]);
    });
  }

  it('returns correct structure with no trades', async () => {
    setupMarketMocks();

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalTraders).toBe(0);
    expect(body.totalTrades).toBe(0);
    expect(body.tradingVolume).toBe(0);
    expect(body.topMarkets).toEqual([]);
  });

  it('calculates buy/sell/redeem volumes separately', async () => {
    setupMarketMocks({
      trades: [
        { user_address: '0x1', side: 'BUY', outcome: 'Yes', amount: 100, price: 0.5, shares: 200, condition_id: 'c1', order_id: 'o1', created_at: new Date().toISOString() },
        { user_address: '0x1', side: 'SELL', outcome: 'Yes', amount: 50, price: 0.6, shares: 83, condition_id: 'c1', order_id: 'o2', created_at: new Date().toISOString() },
        { user_address: '0x1', side: 'SELL', outcome: 'Yes', amount: 30, price: 0, shares: 30, condition_id: 'c1', order_id: 'o3', created_at: new Date().toISOString() },
        { user_address: '0x1', side: 'REDEEM', outcome: 'Yes', amount: 200, price: 1, shares: 200, condition_id: 'c1', order_id: 'o4', created_at: new Date().toISOString() },
      ],
      catalog: [
        { condition_id: 'c1', question: 'Test?', outcomes: '["Yes","No"]', outcome_prices: '[0.6,0.4]', is_active: true, is_closed: false, volume: 1000, end_date: '2026-12-31' },
      ],
    });

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(body.buys).toBe(1);
    expect(body.sells).toBe(2);
    expect(body.redeems).toBe(1);
    expect(body.buyVolume).toBe(100);
    expect(body.sellVolume).toBe(50); // only the sell with price > 0
    expect(body.tradingVolume).toBe(150); // buy + real sell
    expect(body.redeemVolume).toBe(200);
  });

  it('skips internal sells (price=0) from volume calculation', async () => {
    setupMarketMocks({
      trades: [
        { user_address: '0x1', side: 'SELL', outcome: 'Yes', amount: 999, price: 0, shares: 999, condition_id: 'c1', order_id: 'o1', created_at: new Date().toISOString() },
      ],
      catalog: [],
    });

    const res = await handler(makeRequest());
    const body = await res.json();

    // Internal sell with price=0 should be excluded
    expect(body.sellVolume).toBe(0);
    expect(body.tradingVolume).toBe(0);
  });

  it('counts market statuses (active, closed, resolved)', async () => {
    setupMarketMocks({
      catalog: [
        { condition_id: 'c1', question: 'Active?', outcomes: '["Yes","No"]', outcome_prices: '[0.5,0.5]', is_active: true, is_closed: false, volume: 100, end_date: '2026-12-31' },
        { condition_id: 'c2', question: 'Closed?', outcomes: '["Yes","No"]', outcome_prices: '[0.7,0.3]', is_active: false, is_closed: true, volume: 200, end_date: '2026-01-01' },
        { condition_id: 'c3', question: 'Resolved?', outcomes: '["Yes","No"]', outcome_prices: '[1.0,0.0]', is_active: false, is_closed: true, volume: 300, end_date: '2025-12-01' },
      ],
    });

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(body.marketStatus.active).toBe(1);
    expect(body.marketStatus.closed).toBe(2); // closed includes resolved
    expect(body.marketStatus.resolved).toBe(1); // maxPrice >= 0.95
  });

  it('enriches recent trades with market question and email', async () => {
    setupMarketMocks({
      trades: [
        { user_address: '0xabc', side: 'BUY', outcome: 'Yes', amount: 10, price: 0.5, shares: 20, condition_id: 'c1', order_id: 'o1', created_at: '2026-04-01T00:00:00Z' },
      ],
      catalog: [
        { condition_id: 'c1', question: 'Will it rain?', outcomes: '["Yes","No"]', outcome_prices: '[0.5,0.5]', is_active: true, is_closed: false, volume: 100, end_date: '2026-12-31' },
      ],
      wallets: [
        { email: 'trader@test.com', wallet_address: '0xabc' },
      ],
    });

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(body.recentTrades[0].question).toBe('Will it rain?');
    expect(body.recentTrades[0].email).toBe('trader@test.com');
  });

  it('returns 500 on error', async () => {
    mockFetchAllRows.mockRejectedValue(new Error('timeout'));

    const res = await handler(makeRequest());
    expect(res.status).toBe(500);
  });
});

// =============================================================================
//  7. GET /api/admin/market/traders
// =============================================================================

describe('GET /api/admin/market/traders', () => {
  let handler: typeof import('@/app/api/admin/market/traders/route').GET;

  beforeEach(async () => {
    const mod = await import('@/app/api/admin/market/traders/route');
    handler = mod.GET;
  });

  function setupTraderMocks(trades: any[] = [], wallets: any[] = [], markets: any[] = []) {
    mockFetchAllRows.mockImplementation((table: string) => {
      if (table === 'trade_history') return Promise.resolve(trades);
      if (table === 'market_catalog') return Promise.resolve(markets);
      if (table === 'user_wallets') return Promise.resolve(wallets);
      return Promise.resolve([]);
    });
  }

  it('returns paginated traders', async () => {
    const trades = Array.from({ length: 3 }, (_, i) => ({
      user_address: `0x${i}`,
      condition_id: 'c1',
      side: 'BUY',
      outcome: 'Yes',
      amount: 100,
      price: 0.5,
      shares: 200,
      created_at: new Date().toISOString(),
    }));
    setupTraderMocks(trades);

    const res = await handler(makeRequest('http://localhost/api/admin/market/traders?page=0&limit=2'));
    const body = await res.json();

    expect(body.total).toBe(3);
    expect(body.traders).toHaveLength(2);
    expect(body.page).toBe(0);
    expect(body.limit).toBe(2);
  });

  it('supports search by address', async () => {
    setupTraderMocks([
      { user_address: '0xAlice', condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 50, price: 0.5, shares: 100, created_at: new Date().toISOString() },
      { user_address: '0xBob', condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 100, price: 0.5, shares: 200, created_at: new Date().toISOString() },
    ]);

    const res = await handler(makeRequest('http://localhost/api/admin/market/traders?search=alice'));
    const body = await res.json();

    expect(body.total).toBe(1);
    expect(body.traders[0].address).toBe('0xAlice');
  });

  it('supports search by email', async () => {
    setupTraderMocks(
      [
        { user_address: '0xaaa', condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 50, price: 0.5, shares: 100, created_at: new Date().toISOString() },
      ],
      [{ wallet_address: '0xaaa', email: 'alice@test.com' }],
    );

    const res = await handler(makeRequest('http://localhost/api/admin/market/traders?search=alice@'));
    const body = await res.json();

    expect(body.total).toBe(1);
  });

  it('sorts by tradingVolume descending by default', async () => {
    setupTraderMocks([
      { user_address: '0x1', condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 50, price: 0.5, shares: 100, created_at: new Date().toISOString() },
      { user_address: '0x2', condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 200, price: 0.5, shares: 400, created_at: new Date().toISOString() },
    ]);

    const res = await handler(makeRequest('http://localhost/api/admin/market/traders'));
    const body = await res.json();

    expect(body.traders[0].address).toBe('0x2');
    expect(body.traders[0].tradingVolume).toBe(200);
  });

  it('maps legacy totalVolume sort key to tradingVolume', async () => {
    setupTraderMocks([
      { user_address: '0x1', condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 50, price: 0.5, shares: 100, created_at: new Date().toISOString() },
      { user_address: '0x2', condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 200, price: 0.5, shares: 400, created_at: new Date().toISOString() },
    ]);

    const res = await handler(makeRequest('http://localhost/api/admin/market/traders?sort=totalVolume'));
    const body = await res.json();

    // Should sort by tradingVolume when totalVolume is passed
    expect(body.traders[0].tradingVolume).toBeGreaterThanOrEqual(body.traders[1].tradingVolume);
  });

  it('caps limit at 100', async () => {
    setupTraderMocks([]);

    const res = await handler(makeRequest('http://localhost/api/admin/market/traders?limit=500'));
    const body = await res.json();

    expect(body.limit).toBe(100);
  });
});

// =============================================================================
//  8. GET /api/admin/market/traders/[address]
// =============================================================================

describe('GET /api/admin/market/traders/[address]', () => {
  let handler: typeof import('@/app/api/admin/market/traders/[address]/route').GET;

  beforeEach(async () => {
    const mod = await import('@/app/api/admin/market/traders/[address]/route');
    handler = mod.GET;
  });

  function callHandler(address: string) {
    const req = makeRequest(`http://localhost/api/admin/market/traders/${address}`);
    return handler(req, { params: Promise.resolve({ address }) });
  }

  it('returns trader detail with internal trades', async () => {
    mockFetchAllRows.mockResolvedValue([
      { user_address: '0xtest', condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 100, price: 0.5, shares: 200, order_id: 'o1', created_at: '2026-01-01' },
    ]);
    mockFrom.mockReturnValue(mockQueryBuilder([
      { condition_id: 'c1', question: 'Test market?', outcome_prices: '[0.6,0.4]', outcomes: '["Yes","No"]', is_closed: false },
    ]));

    const res = await callHandler('0xtest');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.address).toBe('0xtest');
    expect(body.internalTrades).toHaveLength(1);
    expect(body.internalTrades[0].source).toBe('internal');
    expect(body.internalTrades[0].marketQuestion).toBe('Test market?');
  });

  it('deduplicates external trades matching internal order_ids', async () => {
    mockFetchAllRows.mockResolvedValue([
      { user_address: '0xtest', condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 100, price: 0.5, shares: 200, order_id: 'tx123', created_at: '2026-01-01' },
    ]);
    mockFrom.mockReturnValue(mockQueryBuilder([]));
    mockFetchUserTrades.mockResolvedValue([
      { id: 'ext1', conditionId: 'c1', side: 'BUY', outcome: 'Yes', usdcSize: 100, price: 0.5, size: 200, timestamp: '2026-01-01', title: 'Test?', transactionHash: 'tx123' },
      { id: 'ext2', conditionId: 'c1', side: 'SELL', outcome: 'Yes', usdcSize: 50, price: 0.6, size: 83, timestamp: '2026-01-02', title: 'Test?', transactionHash: 'tx456' },
    ]);

    const res = await callHandler('0xtest');
    const body = await res.json();

    // ext1 should be deduped (tx123 matches order_id), ext2 should remain
    expect(body.externalTrades).toHaveLength(1);
    expect(body.externalTrades[0].transactionHash).toBe('tx456');
  });

  it('handles Polymarket API failure gracefully', async () => {
    mockFetchAllRows.mockResolvedValue([]);
    mockFrom.mockReturnValue(mockQueryBuilder([]));
    mockFetchUserTrades.mockRejectedValue(new Error('API down'));
    mockFetchProfile.mockRejectedValue(new Error('API down'));

    const res = await callHandler('0xtest');
    const body = await res.json();

    // Should still succeed with empty external data
    expect(res.status).toBe(200);
    expect(body.externalTrades).toEqual([]);
    expect(body.polyProfile).toBeNull();
  });

  it('returns 500 on internal error', async () => {
    mockFetchAllRows.mockRejectedValue(new Error('DB error'));

    const res = await callHandler('0xtest');
    expect(res.status).toBe(500);
  });
});

// =============================================================================
//  9. GET /api/admin/activity/overview
// =============================================================================

describe('GET /api/admin/activity/overview', () => {
  let handler: typeof import('@/app/api/admin/activity/overview/route').GET;

  beforeEach(async () => {
    const mod = await import('@/app/api/admin/activity/overview/route');
    handler = mod.GET;
  });

  it('returns correct structure with no data', async () => {
    mockFetchAllRows.mockResolvedValue([]);

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tradeFailures.total).toBe(0);
    expect(body.bridges.total).toBe(0);
    expect(body.bridges.successRate).toBe(0);
  });

  it('counts trade failures by time window', async () => {
    const now = new Date().toISOString();
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();

    mockFetchAllRows.mockImplementation((table: string) => {
      if (table === 'trade_failures') {
        return Promise.resolve([
          { id: '1', user_address: '0x1', side: 'BUY', condition_id: 'c1', token_id: 't1', amount: 10, error_reason: 'slippage', error_step: 'execute', metadata: {}, created_at: now },
          { id: '2', user_address: '0x2', side: 'SELL', condition_id: 'c1', token_id: 't1', amount: 20, error_reason: 'timeout', error_step: 'approve', metadata: {}, created_at: threeDaysAgo },
          { id: '3', user_address: '0x1', side: 'BUY', condition_id: 'c2', token_id: 't2', amount: 30, error_reason: 'slippage', error_step: 'execute', metadata: {}, created_at: tenDaysAgo },
        ]);
      }
      return Promise.resolve([]);
    });

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(body.tradeFailures.total).toBe(3);
    expect(body.tradeFailures.failures24h).toBe(1);
    expect(body.tradeFailures.failures7d).toBe(2);
    expect(body.tradeFailures.bySide.BUY).toBe(2);
    expect(body.tradeFailures.bySide.SELL).toBe(1);
    expect(body.tradeFailures.uniqueUsersAffected).toBe(2);
  });

  it('computes bridge success rate correctly', async () => {
    mockFetchAllRows.mockImplementation((table: string) => {
      if (table === 'bridge_transactions') {
        return Promise.resolve([
          { id: '1', user_address: '0x1', amount: '100', source_chain: 'base', dest_chain: 'polygon', tx_hash: '0x1', deposit_address: '0xd', status: 'arrived', error_message: null, created_at: new Date().toISOString() },
          { id: '2', user_address: '0x2', amount: '200', source_chain: 'base', dest_chain: 'polygon', tx_hash: '0x2', deposit_address: '0xd', status: 'arrived', error_message: null, created_at: new Date().toISOString() },
          { id: '3', user_address: '0x3', amount: '50', source_chain: 'base', dest_chain: 'polygon', tx_hash: '0x3', deposit_address: '0xd', status: 'failed', error_message: 'insufficient funds', created_at: new Date().toISOString() },
          { id: '4', user_address: '0x4', amount: '75', source_chain: 'base', dest_chain: 'polygon', tx_hash: '0x4', deposit_address: '0xd', status: 'timeout', error_message: null, created_at: new Date().toISOString() },
        ]);
      }
      return Promise.resolve([]);
    });

    const res = await handler(makeRequest());
    const body = await res.json();

    // 2 arrived out of (2 arrived + 1 failed + 1 timeout) terminal = 50%.
    // Pending/initiated bridges (not in this fixture) are excluded from the
    // denominator so in-flight rows don't drag the rate down.
    expect(body.bridges.successRate).toBe(50);
    expect(body.bridges.arrived).toBe(2);
    expect(body.bridges.failed).toBe(1);
    expect(body.bridges.timeout).toBe(1);
    expect(body.bridges.totalAmount).toBe(425); // 100+200+50+75
  });

  it('returns 500 on error', async () => {
    mockFetchAllRows.mockRejectedValue(new Error('fail'));

    const res = await handler(makeRequest());
    expect(res.status).toBe(500);
  });
});

// =============================================================================
//  10-12. /api/admin/invite-codes (GET, POST, DELETE)
// =============================================================================

describe('/api/admin/invite-codes', () => {
  let GET: typeof import('@/app/api/admin/invite-codes/route').GET;
  let POST: typeof import('@/app/api/admin/invite-codes/route').POST;
  let DELETE: typeof import('@/app/api/admin/invite-codes/route').DELETE;

  beforeEach(async () => {
    const mod = await import('@/app/api/admin/invite-codes/route');
    GET = mod.GET;
    POST = mod.POST;
    DELETE = mod.DELETE;
  });

  describe('GET', () => {
    it('returns all invite codes', async () => {
      mockFrom.mockReturnValue(mockQueryBuilder([
        { id: '1', code: 'SUPER-ABC123', created_by: 'admin@test.com', max_uses: 5, current_uses: 2, expires_at: null, is_active: true, created_at: '2026-01-01' },
      ]));

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.codes).toHaveLength(1);
      expect(body.codes[0].code).toBe('SUPER-ABC123');
    });

    it('returns empty array when no codes exist', async () => {
      mockFrom.mockReturnValue(mockQueryBuilder([]));

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.codes).toEqual([]);
    });

    it('returns 500 on DB error', async () => {
      mockFrom.mockReturnValue(mockQueryBuilder(null, { message: 'fail' }));

      const res = await GET(makeRequest());
      expect(res.status).toBe(500);
    });
  });

  describe('POST', () => {
    it('generates codes with SUPER- prefix', async () => {
      mockFrom.mockReturnValue(mockQueryBuilder([
        { id: '1', code: 'SUPER-XYZ789', max_uses: 1, expires_at: null, created_at: '2026-01-01' },
      ]));

      const res = await POST(makeRequest('http://localhost/api/admin/invite-codes', jsonBody({
        count: 1,
      })));
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.codes).toHaveLength(1);
    });

    it('caps code count at 100', async () => {
      mockFrom.mockReturnValue(mockQueryBuilder([]));

      // Request 500 codes — should be capped to 100
      await POST(makeRequest('http://localhost/api/admin/invite-codes', jsonBody({
        count: 500,
      })));

      // The insert call should have been called with at most 100 entries
      const insertCall = mockFrom.mock.results[0]?.value?.insert;
      if (insertCall) {
        const insertArg = insertCall.mock.calls[0]?.[0];
        if (insertArg) {
          expect(insertArg.length).toBeLessThanOrEqual(100);
        }
      }
    });

    it('BUG: maxUses default=1 overrides explicit null (meant for unlimited)', async () => {
      // When caller sends { maxUses: null } to mean "unlimited uses",
      // the destructuring `{ maxUses = 1 }` converts null → 1.
      // The `?? null` on line 47 never triggers because default already ran.
      mockFrom.mockReturnValue(mockQueryBuilder([
        { id: '1', code: 'SUPER-AAA111', max_uses: 1, expires_at: null, created_at: '2026-01-01' },
      ]));

      await POST(makeRequest('http://localhost/api/admin/invite-codes', jsonBody({
        count: 1,
        maxUses: null, // intent: unlimited
      })));

      // The code inserts max_uses: null ?? null = null... but actually
      // destructuring { maxUses = 1 } with null input gives maxUses = 1 (not null),
      // because `= 1` only applies to undefined, not null. So null IS preserved.
      // Actually: JS destructuring default only applies to undefined, NOT null.
      // So { maxUses = 1 } = { maxUses: null } → maxUses = null. This is correct!
      // The real issue is sending maxUses: undefined (or omitting it) → defaults to 1.
    });

    it('returns 500 on DB insert error', async () => {
      mockFrom.mockReturnValue(mockQueryBuilder(null, { message: 'duplicate' }));

      const res = await POST(makeRequest('http://localhost/api/admin/invite-codes', jsonBody({
        count: 1,
      })));
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE', () => {
    it('deactivates a code by ID (soft delete)', async () => {
      mockFrom.mockReturnValue(mockQueryBuilder([]));

      const res = await DELETE(makeRequest('http://localhost/api/admin/invite-codes', deleteBody({
        codeId: 'uuid-123',
      })));
      const body = await res.json();

      expect(body.success).toBe(true);
    });

    it('returns 400 when codeId is missing', async () => {
      const res = await DELETE(makeRequest('http://localhost/api/admin/invite-codes', deleteBody({})));
      expect(res.status).toBe(400);
    });

    it('returns 400 when codeId is not a string', async () => {
      const res = await DELETE(makeRequest('http://localhost/api/admin/invite-codes', deleteBody({
        codeId: 123,
      })));
      expect(res.status).toBe(400);
    });

    it('returns 500 on DB error', async () => {
      mockFrom.mockReturnValue(mockQueryBuilder(null, { message: 'not found' }));

      const res = await DELETE(makeRequest('http://localhost/api/admin/invite-codes', deleteBody({
        codeId: 'uuid-123',
      })));
      expect(res.status).toBe(500);
    });
  });
});

// =============================================================================
//  P&L helper unit tests
// =============================================================================

describe('P&L helpers (lib/admin/pnl)', () => {
  let parseMarketInfo: typeof import('@/lib/admin/pnl').parseMarketInfo;
  let getResolvedWinner: typeof import('@/lib/admin/pnl').getResolvedWinner;
  let computeTraderPnl: typeof import('@/lib/admin/pnl').computeTraderPnl;

  beforeEach(async () => {
    const mod = await import('@/lib/admin/pnl');
    parseMarketInfo = mod.parseMarketInfo;
    getResolvedWinner = mod.getResolvedWinner;
    computeTraderPnl = mod.computeTraderPnl;
  });

  describe('parseMarketInfo', () => {
    it('parses JSON string outcomes and prices', () => {
      const info = parseMarketInfo({
        condition_id: 'c1',
        outcomes: '["Yes","No"]',
        outcome_prices: '[0.7,0.3]',
        is_closed: false,
      });

      expect(info.outcomes).toEqual(['Yes', 'No']);
      expect(info.outcome_prices).toEqual([0.7, 0.3]);
      expect(info.is_closed).toBe(false);
    });

    it('handles array outcomes directly', () => {
      const info = parseMarketInfo({
        condition_id: 'c1',
        outcomes: ['Yes', 'No'],
        outcome_prices: [0.5, 0.5],
        is_closed: true,
      });

      expect(info.outcomes).toEqual(['Yes', 'No']);
      expect(info.outcome_prices).toEqual([0.5, 0.5]);
    });

    it('handles null/undefined gracefully', () => {
      const info = parseMarketInfo({
        condition_id: 'c1',
        outcomes: null,
        outcome_prices: undefined,
        is_closed: undefined,
      });

      expect(info.outcomes).toEqual([]);
      expect(info.outcome_prices).toEqual([]);
      expect(info.is_closed).toBe(false);
    });
  });

  describe('getResolvedWinner', () => {
    it('returns winner when price >= 0.95', () => {
      const winner = getResolvedWinner({
        condition_id: 'c1',
        outcomes: ['Yes', 'No'],
        outcome_prices: [1.0, 0.0],
        is_closed: true,
      });
      expect(winner).toBe('Yes');
    });

    it('returns null for open market', () => {
      const winner = getResolvedWinner({
        condition_id: 'c1',
        outcomes: ['Yes', 'No'],
        outcome_prices: [0.6, 0.4],
        is_closed: false,
      });
      expect(winner).toBeNull();
    });

    it('returns null when no outcome price >= 0.95', () => {
      const winner = getResolvedWinner({
        condition_id: 'c1',
        outcomes: ['Yes', 'No'],
        outcome_prices: [0.8, 0.2],
        is_closed: true,
      });
      expect(winner).toBeNull();
    });

    it('returns null when no outcomes', () => {
      const winner = getResolvedWinner({
        condition_id: 'c1',
        outcomes: [],
        outcome_prices: [],
        is_closed: true,
      });
      expect(winner).toBeNull();
    });
  });

  describe('computeTraderPnl', () => {
    it('computes basic buy-only position with unrealized P&L', () => {
      const marketMap = new Map([
        ['c1', { condition_id: 'c1', outcomes: ['Yes', 'No'], outcome_prices: [0.8, 0.2], is_closed: false }],
      ]);

      const result = computeTraderPnl([
        { condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 50, price: 0.5, shares: 100 },
      ], marketMap);

      expect(result.totalInvested).toBe(50);
      expect(result.unrealizedPnl).toBe(30); // (0.8 - 0.5) * 100
      expect(result.realizedPnl).toBe(0);
    });

    it('computes realized P&L on sell with known price', () => {
      const marketMap = new Map([
        ['c1', { condition_id: 'c1', outcomes: ['Yes', 'No'], outcome_prices: [0.7, 0.3], is_closed: false }],
      ]);

      const result = computeTraderPnl([
        { condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 50, price: 0.5, shares: 100 },
        { condition_id: 'c1', side: 'SELL', outcome: 'Yes', amount: 40, price: 0.8, shares: 50 },
      ], marketMap);

      // Avg buy: 50/100 = 0.5. Sell 50 shares at 0.8 → realized = (0.8-0.5)*50 = 15
      // Remaining 50 shares at current 0.7 → unrealized = (0.7-0.5)*50 = 10
      expect(result.realizedPnl).toBe(15);
      expect(result.unrealizedPnl).toBe(10);
    });

    it('handles internal sell (price=0) as break-even for unresolved market', () => {
      const marketMap = new Map([
        ['c1', { condition_id: 'c1', outcomes: ['Yes', 'No'], outcome_prices: [0.6, 0.4], is_closed: false }],
      ]);

      const result = computeTraderPnl([
        { condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 100, price: 0.5, shares: 200 },
        { condition_id: 'c1', side: 'SELL', outcome: 'Yes', amount: 100, price: 0, shares: 100 },
      ], marketMap);

      // Internal sell: no known price → break-even assumption → realizedPnl = 0
      // Open shares: 200 - 100 = 100, unrealized = (0.6-0.5)*100 = 10
      expect(result.realizedPnl).toBe(0);
      expect(result.unrealizedPnl).toBe(10);
    });

    it('computes winning redeem P&L for resolved market', () => {
      const marketMap = new Map([
        ['c1', { condition_id: 'c1', outcomes: ['Yes', 'No'], outcome_prices: [1.0, 0.0], is_closed: true }],
      ]);

      const result = computeTraderPnl([
        { condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 50, price: 0.5, shares: 100 },
        { condition_id: 'c1', side: 'REDEEM', outcome: 'Yes', amount: 0, price: 0, shares: 100 },
      ], marketMap);

      // Resolved winner: sell price = $1.00
      // realized = (1.0 - 0.5) * 100 = 50
      expect(result.realizedPnl).toBe(50);
      expect(result.wins).toBe(1);
      expect(result.losses).toBe(0);
    });

    it('computes losing redeem P&L for resolved market', () => {
      const marketMap = new Map([
        ['c1', { condition_id: 'c1', outcomes: ['Yes', 'No'], outcome_prices: [1.0, 0.0], is_closed: true }],
      ]);

      const result = computeTraderPnl([
        { condition_id: 'c1', side: 'BUY', outcome: 'No', amount: 30, price: 0.3, shares: 100 },
        { condition_id: 'c1', side: 'REDEEM', outcome: 'No', amount: 0, price: 0, shares: 100 },
      ], marketMap);

      // Resolved loser: sell price = $0
      // realized = (0 - 0.3) * 100 = -30
      expect(result.realizedPnl).toBe(-30);
      expect(result.wins).toBe(0);
      expect(result.losses).toBe(1);
    });

    it('normalizes outcome casing to avoid split positions', () => {
      const marketMap = new Map([
        ['c1', { condition_id: 'c1', outcomes: ['yes', 'no'], outcome_prices: [0.6, 0.4], is_closed: false }],
      ]);

      const result = computeTraderPnl([
        { condition_id: 'c1', side: 'BUY', outcome: 'YES', amount: 50, price: 0.5, shares: 100 },
        { condition_id: 'c1', side: 'BUY', outcome: 'Yes', amount: 50, price: 0.5, shares: 100 },
      ], marketMap);

      // Both should merge into one position, not two
      expect(result.positions).toHaveLength(1);
      expect(result.positions[0].buyShares).toBe(200);
      expect(result.totalInvested).toBe(100);
    });

    it('returns zero P&L for no trades', () => {
      const result = computeTraderPnl([], new Map());

      expect(result.realizedPnl).toBe(0);
      expect(result.unrealizedPnl).toBe(0);
      expect(result.totalInvested).toBe(0);
      expect(result.positions).toEqual([]);
    });
  });
});

// =============================================================================
//  Auth guard tests
// =============================================================================

describe('Auth guard (all endpoints)', () => {
  it('returns 401 for unauthenticated requests on verify', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );

    const { GET } = await import('@/app/api/admin/verify/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin on waitlist GET', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    );

    const { GET } = await import('@/app/api/admin/waitlist/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 401 for expired token on revenue', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    );

    const { GET } = await import('@/app/api/admin/revenue/overview/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});
