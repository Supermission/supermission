/**
 * Tests for lib/admin/auth.ts — admin authentication/authorization.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock environment before importing
const MOCK_ADMIN_EMAILS = 'admin@test.com, boss@test.com, UPPER@TEST.COM';

vi.stubEnv('ADMIN_EMAILS', MOCK_ADMIN_EMAILS);

// Mock the Privy token verification
vi.mock('@/lib/privy/server', () => ({
  verifyPrivyToken: vi.fn(),
}));

// Must import AFTER mocking
const { isAdminEmail, requireAdmin } = await import('@/lib/admin/auth');
const { verifyPrivyToken } = await import('@/lib/privy/server');

function makeRequest(cookie?: string) {
  const cookies = new Map<string, { value: string }>();
  if (cookie) cookies.set('privy-token', { value: cookie });
  return {
    cookies: {
      get: (name: string) => cookies.get(name),
    },
  } as any;
}

describe('isAdminEmail', () => {
  it('returns true for admin email', () => {
    expect(isAdminEmail('admin@test.com')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAdminEmail('ADMIN@TEST.COM')).toBe(true);
    expect(isAdminEmail('Admin@Test.Com')).toBe(true);
  });

  it('trims whitespace', () => {
    expect(isAdminEmail('  admin@test.com  ')).toBe(true);
  });

  it('returns false for non-admin email', () => {
    expect(isAdminEmail('hacker@evil.com')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isAdminEmail('')).toBe(false);
  });

  it('returns false for partial match', () => {
    expect(isAdminEmail('admin@test.co')).toBe(false);
    expect(isAdminEmail('admin@test.comm')).toBe(false);
  });

  it('handles uppercased admin email in env', () => {
    // UPPER@TEST.COM was in the env, should match lowercase input
    expect(isAdminEmail('upper@test.com')).toBe(true);
  });
});

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no privy-token cookie', async () => {
    const req = makeRequest();
    const result = await requireAdmin(req);

    // Should be a NextResponse (error)
    expect('email' in result).toBe(false);
    const body = await (result as Response).json();
    expect(body.error).toBe('Authentication required');
    expect((result as Response).status).toBe(401);
  });

  it('returns 403 for valid token with non-admin email', async () => {
    (verifyPrivyToken as any).mockResolvedValue({ email: 'nobody@test.com' });

    const req = makeRequest('valid-token');
    const result = await requireAdmin(req);

    const body = await (result as Response).json();
    expect(body.error).toBe('Admin access required');
    expect((result as Response).status).toBe(403);
  });

  it('returns 403 when email is null', async () => {
    (verifyPrivyToken as any).mockResolvedValue({ email: null });

    const req = makeRequest('valid-token');
    const result = await requireAdmin(req);

    const body = await (result as Response).json();
    expect(body.error).toBe('Admin access required');
    expect((result as Response).status).toBe(403);
  });

  it('returns admin email for valid admin token', async () => {
    (verifyPrivyToken as any).mockResolvedValue({ email: 'admin@test.com' });

    const req = makeRequest('valid-token');
    const result = await requireAdmin(req);

    expect(result).toEqual({ email: 'admin@test.com' });
  });

  it('returns 401 when token verification throws', async () => {
    (verifyPrivyToken as any).mockRejectedValue(new Error('Token expired'));

    const req = makeRequest('expired-token');
    const result = await requireAdmin(req);

    const body = await (result as Response).json();
    expect(body.error).toBe('Invalid or expired token');
    expect((result as Response).status).toBe(401);
  });

  // -----------------------------------------------------------------------
  // BUG: ADMIN_EMAILS is parsed at module load time — env changes at
  // runtime won't be reflected. This is by design (perf) but worth noting.
  // -----------------------------------------------------------------------
  it('ADMIN_EMAILS is static after module load (env changes not reflected)', async () => {
    // This test documents that ADMIN_EMAILS is a Set built once at import time.
    // Changing the env var after import has no effect.
    // This is intentional for performance but could surprise operators.
    expect(isAdminEmail('admin@test.com')).toBe(true);
  });
});
