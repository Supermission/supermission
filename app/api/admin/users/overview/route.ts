import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/admin/db';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = Date.now();
    const oneDayAgo = now - 86_400_000;
    const oneWeekAgo = now - 7 * 86_400_000;
    const oneDayAgoIso = new Date(oneDayAgo).toISOString();
    const oneWeekAgoIso = new Date(oneWeekAgo).toISOString();

    // Parallel fetch all data sources + accurate counts.
    // Use fetchAllRows for tables that may exceed 1000 rows.
    const [
      { data: loginEvents },
      walletRows,
      waitlistRows,
      { data: screenings },
      { count: totalLoginsCount },
      { count: logins24hCount },
      { count: logins7dCount },
      { count: totalScreeningsCount },
      tradeRows,
      allLoginEmails,
    ] = await Promise.all([
      supabaseAdmin
        .from('login_events')
        .select('id, email, wallet_addresses, waitlist_status, ip_address, user_agent, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      fetchAllRows('user_wallets', 'wallet_address, email, chain, updated_at'),
      fetchAllRows('waitlist', 'email, status, created_at, approved_at'),
      supabaseAdmin
        .from('compliance_screenings')
        .select('id, address, chain, risk_level, risk_score, flags, is_blocked, result, error_message, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      // Accurate total login count
      supabaseAdmin
        .from('login_events')
        .select('*', { count: 'exact', head: true }),
      // Accurate 24h login count
      supabaseAdmin
        .from('login_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgoIso),
      // Accurate 7d login count
      supabaseAdmin
        .from('login_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneWeekAgoIso),
      // Accurate total compliance screenings count
      supabaseAdmin
        .from('compliance_screenings')
        .select('*', { count: 'exact', head: true }),
      // Fetch trade history for user journey funnel (paginated)
      fetchAllRows(
        'trade_history',
        'user_address, created_at',
        (q) => q.order('created_at', { ascending: true }),
      ),
      // Fetch all unique login emails for accurate loggedIn count
      fetchAllRows('login_events', 'email'),
    ]);

    const logins = loginEvents || [];
    const screeningRows = screenings || [];

    // --- Login chart data (from the 500 sample — fine for chart) ---
    const loginsByDay = new Map<string, number>();
    for (const l of logins) {
      const day = new Date(l.created_at).toISOString().slice(0, 10);
      loginsByDay.set(day, (loginsByDay.get(day) || 0) + 1);
    }

    // --- Waitlist funnel ---
    let approved = 0;
    let pending = 0;
    let rejected = 0;
    let total = waitlistRows.length;
    for (const w of waitlistRows) {
      if (w.status === 'approved') approved++;
      else if (w.status === 'rejected') rejected++;
      else pending++;
    }

    // --- User journey funnel ---
    // Unique emails from wallets (full table, no limit) = true total users
    const emailToWallets = new Map<string, Set<string>>();
    for (const w of walletRows) {
      if (!emailToWallets.has(w.email)) emailToWallets.set(w.email, new Set());
      emailToWallets.get(w.email)!.add(w.wallet_address.toLowerCase());
    }
    const totalUsers = emailToWallets.size;

    // Users who have logged in (unique emails from full login_events table)
    const loggedInEmails = new Set<string>();
    for (const l of allLoginEmails) loggedInEmails.add(l.email);

    // Users who have traded (from trade_history)
    const tradingAddresses = new Set<string>();
    const firstTradeByAddress = new Map<string, string>();
    for (const t of tradeRows) {
      if (!tradingAddresses.has(t.user_address)) {
        tradingAddresses.add(t.user_address);
        firstTradeByAddress.set(t.user_address, t.created_at);
      }
    }

    // Map trading addresses to emails via user_wallets
    const walletToEmail = new Map<string, string>();
    for (const w of walletRows) {
      walletToEmail.set(w.wallet_address.toLowerCase(), w.email);
    }
    const tradingEmails = new Set<string>();
    for (const addr of tradingAddresses) {
      const email = walletToEmail.get(addr.toLowerCase());
      if (email) tradingEmails.add(email);
    }

    // Active traders (traded in last 7d). Tracked in both address and email
    // units: the funnel card divides by `traded` (email-count), so comparing
    // addresses against emails can produce >100% when one email has multiple
    // wallets.
    const activeTraders = new Set<string>();
    const activeTraderEmails = new Set<string>();
    for (const t of tradeRows) {
      if (new Date(t.created_at).getTime() >= oneWeekAgo) {
        activeTraders.add(t.user_address);
        const email = walletToEmail.get(t.user_address.toLowerCase());
        if (email) activeTraderEmails.add(email);
      }
    }

    // --- Compliance stats ---
    let compliancePass = 0;
    let complianceFail = 0;
    let complianceError = 0;
    const blockedAddresses: string[] = [];
    for (const s of screeningRows) {
      if (s.result === 'pass') compliancePass++;
      else if (s.result === 'fail') {
        complianceFail++;
        if (s.is_blocked) blockedAddresses.push(s.address);
      } else if (s.result === 'error') complianceError++;
    }

    // Daily login chart (last 30 days)
    const dailyLogins = Array.from(loginsByDay.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    // Recent logins (last 50)
    const recentLogins = logins.slice(0, 50).map((l) => ({
      email: l.email,
      walletCount: l.wallet_addresses?.length || 0,
      waitlistStatus: l.waitlist_status,
      ipAddress: l.ip_address,
      userAgent: l.user_agent,
      createdAt: l.created_at,
    }));

    // Recent compliance screenings
    const recentScreenings = screeningRows.slice(0, 50).map((s) => ({
      address: s.address,
      chain: s.chain,
      riskLevel: s.risk_level,
      riskScore: s.risk_score,
      flags: s.flags,
      isBlocked: s.is_blocked,
      result: s.result,
      errorMessage: s.error_message,
      createdAt: s.created_at,
    }));

    return NextResponse.json({
      overview: {
        totalUsers,
        totalWallets: walletRows.length,
        logins24h: logins24hCount || 0,
        logins7d: logins7dCount || 0,
        totalLogins: totalLoginsCount || 0,
      },
      waitlistFunnel: {
        total,
        approved,
        pending,
        rejected,
        approvalRate: total > 0 ? Math.round((approved / total) * 10000) / 100 : 0,
      },
      userJourney: {
        waitlisted: total,
        approved,
        loggedIn: loggedInEmails.size,
        traded: tradingEmails.size,
        // email-count so the funnel percentage (activeTraders / traded)
        // compares like-units.
        activeTraders: activeTraderEmails.size,
        totalTraders: tradingAddresses.size,
      },
      compliance: {
        totalScreenings: totalScreeningsCount || 0,
        pass: compliancePass,
        fail: complianceFail,
        error: complianceError,
        blockedAddresses: [...new Set(blockedAddresses)],
      },
      dailyLogins,
      recentLogins,
      recentScreenings,
    });
  } catch (err: any) {
    console.error('Admin users overview error:', err);
    return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 });
  }
}
