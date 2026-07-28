import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // All RPCs + limited direct queries in parallel
    const [
      sessionStats,
      tradeStats,
      byCoinRes,
      byOrderTypeRes,
      riskDistRes,
      dailyVolumeRes,
      topTradersRes,
      recentTradesRes,
      walletRows,
    ] = await Promise.all([
      supabaseAdmin.rpc('admin_perps_session_stats'),
      supabaseAdmin.rpc('admin_perps_trade_stats'),
      supabaseAdmin.rpc('admin_perps_by_coin'),
      supabaseAdmin.rpc('admin_perps_by_order_type'),
      supabaseAdmin.rpc('admin_perps_risk_distribution'),
      supabaseAdmin.rpc('admin_perps_daily_volume'),
      supabaseAdmin.rpc('admin_perps_top_traders'),
      supabaseAdmin
        .from('hyperion_trades')
        .select('coin, side, size, price, leverage, pnl, status, order_type, agent_reasoning, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('user_wallets')
        .select('email, wallet_address'),
    ]);

    // Parse RPC results
    const ss = sessionStats.data?.[0] || sessionStats.data || {};
    const ts = tradeStats.data?.[0] || tradeStats.data || {};

    // Email lookup
    const emailMap = new Map<string, string>();
    for (const w of (walletRows.data || [])) {
      if (w.wallet_address && w.email) {
        emailMap.set(w.wallet_address.toLowerCase(), w.email);
      }
    }

    // Sessions
    const totalSessions = Number(ss.total) || 0;
    const totalMessages = Number(ss.total_messages) || 0;
    const avgMessagesPerSession = totalSessions > 0
      ? Math.round((totalMessages / totalSessions) * 100) / 100
      : 0;

    // Trade stats
    const resolvedCount = Number(ts.resolved_count) || 0;
    const profitableCount = Number(ts.profitable_count) || 0;
    const winRate = resolvedCount > 0
      ? Math.round((profitableCount / resolvedCount) * 10000) / 100
      : 0;

    // By coin
    const byCoin = (byCoinRes.data || []).map((r: any) => ({
      coin: r.coin,
      trades: Number(r.trades) || 0,
      volume: Math.round((Number(r.volume) || 0) * 100) / 100,
      avgLeverage: Math.round((Number(r.avg_leverage) || 0) * 100) / 100,
    }));

    // By order type
    const byOrderType: Record<string, number> = {};
    for (const r of (byOrderTypeRes.data || [])) {
      byOrderType[r.order_type] = Number(r.count) || 0;
    }

    // Risk distribution
    const riskDistribution: Record<string, number> = { conservative: 0, moderate: 0, aggressive: 0 };
    for (const r of (riskDistRes.data || [])) {
      riskDistribution[r.risk_level] = Number(r.count) || 0;
    }

    // Daily volume
    const dailyVolume = (dailyVolumeRes.data || []).map((r: any) => ({
      date: r.day,
      volume: Math.round((Number(r.volume) || 0) * 100) / 100,
      trades: Number(r.trades) || 0,
      pnl: Math.round((Number(r.pnl) || 0) * 100) / 100,
    }));

    // Top traders with email lookup
    const topTraders = (topTradersRes.data || []).map((r: any) => ({
      userId: r.user_id,
      walletAddress: r.wallet_address || '',
      email: emailMap.get((r.wallet_address || '').toLowerCase()) || null,
      trades: Number(r.trades) || 0,
      volume: Math.round((Number(r.volume) || 0) * 100) / 100,
      pnl: Math.round((Number(r.pnl) || 0) * 100) / 100,
    }));

    // Distinct trader counts via dedicated RPCs. Supabase's { count: 'exact' }
    // returns row count (trades, not traders), and `admin_perps_top_traders`
    // is capped at 20 rows so it can't be used for an all-time total.
    const [activeTradersRes, totalTradersRes] = await Promise.all([
      supabaseAdmin.rpc('admin_perps_active_traders_24h'),
      supabaseAdmin.rpc('admin_perps_total_traders'),
    ]);
    const activeTraders24h = Number(activeTradersRes.data) || 0;
    const totalTraders = Number(totalTradersRes.data) || 0;

    // Recent trades
    const recentTrades = (recentTradesRes.data || []).map((t: any) => ({
      coin: t.coin,
      side: t.side,
      size: Number(t.size) || 0,
      price: Number(t.price) || 0,
      leverage: Number(t.leverage) || 0,
      pnl: t.pnl != null ? Number(t.pnl) : null,
      status: t.status,
      orderType: t.order_type,
      agentReasoning: t.agent_reasoning || null,
      createdAt: t.created_at,
    }));

    return NextResponse.json({
      sessions: {
        total: totalSessions,
        sessions24h: Number(ss.sessions_24h) || 0,
        sessions7d: Number(ss.sessions_7d) || 0,
        uniqueUsers: Number(ss.unique_users) || 0,
        avgMessagesPerSession,
      },
      trades: {
        totalTrades: Number(ts.total_trades) || 0,
        trades24h: Number(ts.trades_24h) || 0,
        trades7d: Number(ts.trades_7d) || 0,
        totalVolume: Math.round((Number(ts.total_volume) || 0) * 100) / 100,
        volume24h: Math.round((Number(ts.volume_24h) || 0) * 100) / 100,
        byCoin,
        bySide: {
          buy: Number(ts.buy_count) || 0,
          sell: Number(ts.sell_count) || 0,
        },
        byOrderType,
        avgLeverage: Math.round((Number(ts.avg_leverage) || 0) * 100) / 100,
        totalPnl: Math.round((Number(ts.total_pnl) || 0) * 100) / 100,
        profitableTrades: profitableCount,
        winRate,
      },
      users: {
        totalTraders,
        activeTraders24h: activeTraders24h || 0,
        riskDistribution,
        topTraders,
      },
      recentTrades,
      dailyVolume,
    });
  } catch (err: any) {
    console.error('Admin perps overview error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch perps overview' },
      { status: 500 },
    );
  }
}
