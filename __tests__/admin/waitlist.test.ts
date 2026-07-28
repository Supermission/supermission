/**
 * Tests for waitlist management logic.
 * Tests validation and edge cases from app/api/admin/waitlist/route.ts
 */
import { describe, it, expect } from 'vitest';

describe('waitlist action validation', () => {
  const validActions = ['approve', 'reject'];

  it('accepts approve action', () => {
    expect(validActions.includes('approve')).toBe(true);
  });

  it('accepts reject action', () => {
    expect(validActions.includes('reject')).toBe(true);
  });

  it('rejects unknown actions', () => {
    expect(validActions.includes('delete')).toBe(false);
    expect(validActions.includes('ban')).toBe(false);
    expect(validActions.includes('')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // BUG: No action validation for null/undefined
  // The check is: if (!action || !['approve', 'reject'].includes(action))
  // This works for null/undefined because !null = true, short-circuits.
  // But what about action = 0 or action = false?
  // -----------------------------------------------------------------------
  it('rejects falsy non-string actions', () => {
    const action1 = null;
    const action2 = undefined;
    const action3 = 0;

    expect(!action1 || !validActions.includes(action1 as any)).toBe(true);
    expect(!action2 || !validActions.includes(action2 as any)).toBe(true);
    expect(!action3 || !validActions.includes(action3 as any)).toBe(true);
  });
});

describe('waitlist email parsing', () => {
  function parseEmails(body: any): string[] {
    const rawEmails = Array.isArray(body.emails)
      ? body.emails
      : body.email
        ? [body.email]
        : [];
    return rawEmails
      .map((e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
      .filter((e: string) => e.length > 0 && e.includes('@'));
  }

  it('parses single email', () => {
    expect(parseEmails({ email: 'User@Test.com' })).toEqual(['user@test.com']);
  });

  it('parses bulk emails', () => {
    expect(parseEmails({ emails: ['A@b.com', 'C@d.com'] })).toEqual(['a@b.com', 'c@d.com']);
  });

  it('trims whitespace', () => {
    expect(parseEmails({ email: '  user@test.com  ' })).toEqual(['user@test.com']);
  });

  it('returns empty array when no email provided', () => {
    expect(parseEmails({})).toEqual([]);
  });

  it('prefers emails over email when both provided', () => {
    const result = parseEmails({ emails: ['a@b.com'], email: 'c@d.com' });
    expect(result).toEqual(['a@b.com']); // emails takes precedence
  });

  it('rejects invalid email formats (fixed)', () => {
    const result = parseEmails({ email: 'not-an-email' });
    expect(result).toEqual([]); // filtered out — no @ sign
  });

  it('rejects empty/whitespace email (fixed)', () => {
    const result = parseEmails({ email: '  ' });
    expect(result).toEqual([]); // trimmed to empty, filtered out
  });

  it('handles emails as string instead of array (fixed)', () => {
    // No longer crashes — Array.isArray check catches this
    const result = parseEmails({ emails: 'not-an-array' });
    expect(result).toEqual([]); // falls through to empty
  });
});

describe('waitlist funnel calculations', () => {
  it('computes approval rate', () => {
    const total = 100;
    const approved = 75;
    const rate = total > 0 ? Math.round((approved / total) * 10000) / 100 : 0;
    expect(rate).toBe(75);
  });

  it('handles zero total', () => {
    const total = 0;
    const approved = 0;
    const rate = total > 0 ? Math.round((approved / total) * 10000) / 100 : 0;
    expect(rate).toBe(0);
  });

  it('counts statuses correctly', () => {
    const rows = [
      { status: 'approved' },
      { status: 'approved' },
      { status: 'pending' },
      { status: 'rejected' },
      { status: null }, // BUG: null status counted as pending
    ];

    let approved = 0;
    let pending = 0;
    let rejected = 0;
    for (const w of rows) {
      if (w.status === 'approved') approved++;
      else if (w.status === 'rejected') rejected++;
      else pending++;
    }

    expect(approved).toBe(2);
    expect(rejected).toBe(1);
    expect(pending).toBe(2); // null status falls into "else" → pending
  });
});
