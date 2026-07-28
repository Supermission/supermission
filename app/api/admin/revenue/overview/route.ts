import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/admin/db';

// USDC has 6 decimals — amounts in payment_proofs are stored in atomic units
const USDC_DECIMALS = 1_000_000;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // Parallel fetch all data sources, paginating past 1000-row limit
    const [rows, agentRows, walletMappings, x402Rows] = await Promise.all([
      fetchAllRows('payment_proofs', 'agent_id, amount, from_address, used_at, tx_hash'),
      supabaseAdmin
        .from('marketplace_agents')
        .select('id, agent_name, pricing_rate')
        .then(({ data }) => data || []),
      fetchAllRows('user_wallets', 'wallet_address, email'),
      fetchAllRows('x402_payments', 'status'),
    ]);

    const agentMap = new Map<string, { name: string; rate: number }>();
    for (const a of agentRows) {
      agentMap.set(a.id, { name: a.agent_name, rate: a.pricing_rate || 0 });
    }

    const walletToEmail = new Map<string, string>();
    for (const w of walletMappings) {
      if (w.wallet_address && w.email) {
        walletToEmail.set(w.wallet_address.toLowerCase(), w.email);
      }
    }
    const now = Date.now();
    const oneDayAgo = now - 86_400_000;
    const oneWeekAgo = now - 7 * 86_400_000;
    const oneMonthAgo = now - 30 * 86_400_000;

    // --- Aggregate stats ---
    let totalRevenue = 0;
    // knownUserRevenue excludes payments with no from_address so that ARPU
    // (divided by userStats.size) uses a consistent numerator/denominator.
    let knownUserRevenue = 0;
    let revenue24h = 0;
    let revenue7d = 0;
    let revenue30d = 0;
    let totalRequests = rows.length;
    let requests24h = 0;

    // Per-agent aggregation
    const agentStats = new Map<string, {
      agentId: string;
      agentName: string;
      revenue: number;
      requests: number;
      uniqueUsers: Set<string>;
      avgPayment: number;
    }>();

    // Per-user aggregation
    const userStats = new Map<string, {
      address: string;
      email: string | null;
      totalSpent: number;
      requests: number;
      lastUsed: string;
    }>();

    // Revenue over time (daily buckets for last 30 days)
    const dailyRevenue = new Map<string, number>();

    for (const p of rows) {
      const amountUsdc = Number(p.amount ?? 0) / USDC_DECIMALS;
      const fromAddr = (p.from_address || '').toLowerCase();

      totalRevenue += amountUsdc;

      // Only bucket into time windows and daily chart if we have a valid timestamp
      const usedAt = p.used_at ? new Date(p.used_at).getTime() : NaN;
      const dateKey = p.used_at ? new Date(p.used_at).toISOString().slice(0, 10) : null;

      if (!isNaN(usedAt)) {
        if (usedAt >= oneDayAgo) { revenue24h += amountUsdc; requests24h++; }
        if (usedAt >= oneWeekAgo) revenue7d += amountUsdc;
        if (usedAt >= oneMonthAgo) revenue30d += amountUsdc;
      }

      // Per-agent
      const agentId = p.agent_id || 'unknown';
      if (!agentStats.has(agentId)) {
        const info = agentMap.get(agentId);
        agentStats.set(agentId, {
          agentId,
          agentName: info?.name || agentId,
          revenue: 0,
          requests: 0,
          uniqueUsers: new Set(),
          avgPayment: 0,
        });
      }
      const as = agentStats.get(agentId)!;
      as.revenue += amountUsdc;
      as.requests++;
      if (fromAddr) as.uniqueUsers.add(fromAddr);

      // Per-user
      if (fromAddr) {
        knownUserRevenue += amountUsdc;
        if (!userStats.has(fromAddr)) {
          userStats.set(fromAddr, {
            address: fromAddr,
            email: walletToEmail.get(fromAddr) || null,
            totalSpent: 0,
            requests: 0,
            lastUsed: p.used_at || '',
          });
        }
        const us = userStats.get(fromAddr)!;
        us.totalSpent += amountUsdc;
        us.requests++;
        if (p.used_at && p.used_at > us.lastUsed) us.lastUsed = p.used_at;
      }

      // Daily revenue
      if (dateKey) {
        dailyRevenue.set(dateKey, (dailyRevenue.get(dateKey) || 0) + amountUsdc);
      }
    }

    // Format agent stats
    const agentList = Array.from(agentStats.values())
      .map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        revenue: Math.round(a.revenue * 100) / 100,
        requests: a.requests,
        uniqueUsers: a.uniqueUsers.size,
        avgPayment: a.requests > 0 ? Math.round((a.revenue / a.requests) * 10000) / 10000 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Top paying users
    const topUsers = Array.from(userStats.values())
      .map((u) => ({
        ...u,
        totalSpent: Math.round(u.totalSpent * 100) / 100,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 50);

    // Daily revenue sorted by date
    const dailyData = Array.from(dailyRevenue.entries())
      .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30); // Last 30 days

    // Payment success rate from x402_payments (already fetched in parallel above).
    // Denominator is terminal states only — counting in-flight rows (pending,
    // signing, …) drags the rate down artificially until they resolve.
    let completed = 0;
    let failed = 0;
    let pending = 0;
    for (const r of x402Rows) {
      if (r.status === 'completed') completed++;
      else if (r.status === 'failed' || r.status === 'expired') failed++;
      else pending++;
    }
    const totalPaymentAttempts = completed + failed + pending;
    const terminalPayments = completed + failed;
    const successRate = terminalPayments > 0
      ? Math.round((completed / terminalPayments) * 10000) / 100
      : 100;

    // Revenue growth: compare current 7d vs previous 7d
    const twoWeeksAgo = now - 14 * 86_400_000;
    let revenuePrev7d = 0;
    for (const p of rows) {
      const usedAt = p.used_at ? new Date(p.used_at).getTime() : NaN;
      const amountUsdc = Number(p.amount ?? 0) / USDC_DECIMALS;
      if (!isNaN(usedAt) && usedAt >= twoWeeksAgo && usedAt < oneWeekAgo) {
        revenuePrev7d += amountUsdc;
      }
    }
    // null when there's nothing to compare against — "new" week is not the
    // same as "+100% growth".
    const growthRate7d = revenuePrev7d > 0
      ? Math.round(((revenue7d - revenuePrev7d) / revenuePrev7d) * 10000) / 100
      : null;

    // Average revenue per user — use revenue attributable to those users
    // (totalRevenue includes payments with no from_address, which don't
    // contribute to userStats.size).
    const arpu = userStats.size > 0
      ? Math.round((knownUserRevenue / userStats.size) * 100) / 100
      : 0;

    // Payment failure breakdown by status
    const failureBreakdown: Record<string, number> = {};
    for (const r of x402Rows) {
      if (r.status !== 'completed') {
        failureBreakdown[r.status] = (failureBreakdown[r.status] || 0) + 1;
      }
    }

    return NextResponse.json({
      overview: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        revenue24h: Math.round(revenue24h * 100) / 100,
        revenue7d: Math.round(revenue7d * 100) / 100,
        revenue30d: Math.round(revenue30d * 100) / 100,
        totalRequests,
        requests24h,
        uniqueUsers: userStats.size,
        successRate,
        growthRate7d,
        arpu,
        paymentStats: { completed, failed, pending },
        failureBreakdown,
      },
      agents: agentList,
      topUsers,
      dailyRevenue: dailyData,
    });
  } catch (err: any) {
    console.error('Admin revenue overview error:', err);
    return NextResponse.json({ error: 'Failed to fetch revenue data' }, { status: 500 });
  }
}
