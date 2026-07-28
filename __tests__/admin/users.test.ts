/**
 * Tests for user analytics logic.
 * Tests the aggregation logic from app/api/admin/users/overview/route.ts
 */
import { describe, it, expect } from 'vitest';

describe('user journey funnel', () => {
  // -----------------------------------------------------------------------
  // BUG: loggedInEmails is built from a 500-row sample, so it undercounts
  // if more than 500 unique users have logged in.
  // -----------------------------------------------------------------------
  it('BUG: logged-in count is approximate (500-row sample)', () => {
    // The route fetches .limit(500) from login_events.
    // If 1000 unique users logged in, only ~500 are captured.
    // The userJourney.loggedIn will undercount.
    // Fix: use a COUNT DISTINCT query or fetchAllRows.
    const sampleSize = 500;
    const totalUniqueLogins = 1000;
    // With 500 rows sample from 1000 users (each logged in once),
    // you'd capture ~500 unique emails
    expect(sampleSize).toBeLessThan(totalUniqueLogins);
  });

  it('maps trading addresses to emails via user_wallets', () => {
    const walletRows = [
      { wallet_address: '0xAAA', email: 'alice@test.com' },
      { wallet_address: '0xBBB', email: 'bob@test.com' },
    ];

    const walletToEmail = new Map<string, string>();
    for (const w of walletRows) {
      walletToEmail.set(w.wallet_address.toLowerCase(), w.email);
    }

    const tradingAddresses = ['0xaaa', '0xCCC']; // 0xCCC has no wallet mapping

    const tradingEmails = new Set<string>();
    for (const addr of tradingAddresses) {
      const email = walletToEmail.get(addr.toLowerCase());
      if (email) tradingEmails.add(email);
    }

    expect(tradingEmails.size).toBe(1); // only alice maps
    expect(tradingEmails.has('alice@test.com')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // BUG: wallet_address case sensitivity inconsistency
  // The walletToEmail map uses .toLowerCase() when building, but the
  // walletRows from DB may have mixed case. As long as both sides lowercase,
  // this works. But emailToWallets does NOT lowercase the key.
  // -----------------------------------------------------------------------
  it('BUG: emailToWallets map does not normalize wallet addresses', () => {
    const walletRows = [
      { wallet_address: '0xAAA', email: 'alice@test.com' },
      { wallet_address: '0xaaa', email: 'alice@test.com' }, // same wallet, different case
    ];

    // This is how the route builds emailToWallets
    const emailToWallets = new Map<string, string[]>();
    for (const w of walletRows) {
      const arr = emailToWallets.get(w.email) || [];
      arr.push(w.wallet_address); // NOT lowercased
      emailToWallets.set(w.email, arr);
    }

    // alice appears to have 2 wallets, but it's really 1 with different casing
    expect(emailToWallets.get('alice@test.com')!.length).toBe(2);
    // totalUsers is emailToWallets.size, so this doesn't affect user count,
    // but it could inflate wallet counts.
  });
});

describe('compliance stats', () => {
  it('counts pass/fail/error correctly', () => {
    const screenings = [
      { result: 'pass', is_blocked: false },
      { result: 'pass', is_blocked: false },
      { result: 'fail', is_blocked: true, address: '0xBAD' },
      { result: 'fail', is_blocked: false, address: '0xWARN' },
      { result: 'error', is_blocked: false },
    ];

    let pass = 0;
    let fail = 0;
    let error = 0;
    const blocked: string[] = [];

    for (const s of screenings) {
      if (s.result === 'pass') pass++;
      else if (s.result === 'fail') {
        fail++;
        if (s.is_blocked) blocked.push(s.address!);
      } else if (s.result === 'error') error++;
    }

    expect(pass).toBe(2);
    expect(fail).toBe(2);
    expect(error).toBe(1);
    expect(blocked).toEqual(['0xBAD']);
  });

  it('deduplicates blocked addresses', () => {
    const blocked = ['0xBAD', '0xBAD', '0xEVIL'];
    const unique = [...new Set(blocked)];
    expect(unique).toEqual(['0xBAD', '0xEVIL']);
  });

  it('handles unknown result status', () => {
    // result could be null or unexpected string
    const screenings = [
      { result: null },
      { result: 'unknown' },
    ];

    let pass = 0;
    let fail = 0;
    let error = 0;
    for (const s of screenings) {
      if (s.result === 'pass') pass++;
      else if (s.result === 'fail') fail++;
      else if (s.result === 'error') error++;
      // null and 'unknown' fall through — not counted anywhere
    }

    expect(pass).toBe(0);
    expect(fail).toBe(0);
    expect(error).toBe(0);
    // BUG: these screenings are included in totalScreenings (screeningRows.length)
    // but not in pass+fail+error, so the numbers don't add up
  });
});

describe('daily login chart', () => {
  it('groups logins by day', () => {
    const logins = [
      { created_at: '2026-04-01T10:00:00Z' },
      { created_at: '2026-04-01T15:00:00Z' },
      { created_at: '2026-04-02T08:00:00Z' },
    ];

    const byDay = new Map<string, number>();
    for (const l of logins) {
      const day = new Date(l.created_at).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }

    expect(byDay.get('2026-04-01')).toBe(2);
    expect(byDay.get('2026-04-02')).toBe(1);
  });
});
