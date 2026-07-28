import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/admin/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // Parallel: RPC aggregations + small/limited direct queries
    const [
      statsRows,           // paper_trading_stats — small table, ordered
      accuracyTotals,      // RPC: totals only
      accuracyByCategory,  // RPC: grouped
      accuracyByConfidence,// RPC: grouped
      recentAccuracyRes,   // last 50 rows only
      experimentRows,      // experiments — small table
      defaultsRes,         // single row
      liveTradeTotals,     // RPC: totals
      liveByCoin,          // RPC: grouped
      liveByStrategy,      // RPC: grouped
      recentLiveRes,       // last 50 rows only
    ] = await Promise.all([
      fetchAllRows(
        'paper_trading_stats',
        'snapshot_date, total_predictions, correct_predictions, hit_rate, brier_score, cumulative_pnl, roi_pct, by_category, calibration_data',
        (q: any) => q.order('snapshot_date', { ascending: true }),
      ),
      supabaseAdmin.rpc('admin_accuracy_totals'),
      supabaseAdmin.rpc('admin_accuracy_by_category'),
      supabaseAdmin.rpc('admin_accuracy_by_confidence'),
      supabaseAdmin
        .from('ai_accuracy_log')
        .select('condition_id, predicted_outcome, predicted_confidence, actual_outcome, was_correct, category, edge_at_prediction, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      fetchAllRows(
        'experiments',
        'id, name, status, group_a_params, group_b_params, winner, group_a_stats, group_b_stats, created_at',
      ),
      supabaseAdmin.from('experiment_defaults').select('params').limit(1).single(),
      supabaseAdmin.rpc('admin_live_trades_totals'),
      supabaseAdmin.rpc('admin_live_trades_by_coin'),
      supabaseAdmin.rpc('admin_live_trades_by_strategy'),
      supabaseAdmin
        .from('live_trades')
        .select('condition_id, outcome, direction, coin, amount, buy_price, strategy, confidence, status, pnl, is_correct, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    // --- Paper Trading ---
    const latestStats = statsRows.length > 0 ? statsRows[statsRows.length - 1] : null;
    const history = statsRows.map((r: any) => ({
      date: r.snapshot_date,
      hitRate: Number(r.hit_rate) || 0,
      brierScore: Number(r.brier_score) || 0,
      pnl: Number(r.cumulative_pnl) || 0,
      roi: Number(r.roi_pct) || 0,
      predictions: Number(r.total_predictions) || 0,
    }));
    const totalPredictions = latestStats ? Number(latestStats.total_predictions) || 0 : 0;
    const overallCorrect = latestStats ? Number(latestStats.correct_predictions) || 0 : 0;
    const overallHitRate = totalPredictions > 0 ? overallCorrect / totalPredictions : 0;
    const overallPnl = latestStats ? Number(latestStats.cumulative_pnl) || 0 : 0;

    // --- Accuracy (from RPCs) ---
    const accTotals = accuracyTotals.data?.[0] || accuracyTotals.data || { total: 0, correct: 0 };
    const accuracyTotal = Number(accTotals.total) || 0;
    const accuracyCorrect = Number(accTotals.correct) || 0;
    const accuracyHitRate = accuracyTotal > 0 ? accuracyCorrect / accuracyTotal : 0;

    const byCategory = (accuracyByCategory.data || []).map((r: any) => ({
      category: r.category,
      total: Number(r.total) || 0,
      correct: Number(r.correct) || 0,
      hitRate: Number(r.total) > 0 ? Number(r.correct) / Number(r.total) : 0,
    }));

    const byConfidenceBucket = (accuracyByConfidence.data || []).map((r: any) => ({
      bucket: r.bucket,
      total: Number(r.total) || 0,
      correct: Number(r.correct) || 0,
      hitRate: Number(r.total) > 0 ? Number(r.correct) / Number(r.total) : 0,
    }));

    const recentAccuracy = recentAccuracyRes.data || [];

    // --- Experiments ---
    const activeExperiments = experimentRows.filter(
      (r: any) => r.status === 'active' || r.status === 'running',
    );
    const completedExperiments = experimentRows.filter((r: any) => r.winner != null);
    const currentDefaults = defaultsRes.data?.params || null;

    // --- Live Trades (from RPCs) ---
    const ltTotals = liveTradeTotals.data?.[0] || liveTradeTotals.data || { total: 0, total_pnl: 0, correct: 0, resolved: 0 };
    const liveTotalTrades = Number(ltTotals.total) || 0;
    const liveTotalPnl = Number(ltTotals.total_pnl) || 0;
    const liveResolved = Number(ltTotals.resolved) || 0;
    const liveCorrect = Number(ltTotals.correct) || 0;
    const liveWinRate = liveResolved > 0 ? liveCorrect / liveResolved : 0;

    const byCoin = (liveByCoin.data || []).map((r: any) => ({
      coin: r.coin,
      trades: Number(r.trades) || 0,
      pnl: Math.round((Number(r.total_pnl) || 0) * 100) / 100,
      winRate: Number(r.resolved) > 0 ? Number(r.correct) / Number(r.resolved) : 0,
    }));

    const byStrategy = (liveByStrategy.data || []).map((r: any) => ({
      strategy: r.strategy,
      trades: Number(r.trades) || 0,
      pnl: Math.round((Number(r.total_pnl) || 0) * 100) / 100,
    }));

    const recentTrades = recentLiveRes.data || [];

    return NextResponse.json({
      paperTrading: {
        latestStats,
        history,
        totalPredictions,
        overallHitRate,
        overallPnl,
      },
      accuracy: {
        total: accuracyTotal,
        correct: accuracyCorrect,
        hitRate: accuracyHitRate,
        byCategory,
        byConfidenceBucket,
        recentAccuracy,
      },
      experiments: {
        active: activeExperiments,
        completed: completedExperiments,
        currentDefaults,
      },
      liveTrades: {
        totalTrades: liveTotalTrades,
        totalPnl: Math.round(liveTotalPnl * 100) / 100,
        winRate: liveWinRate,
        byCoin,
        byStrategy,
        recentTrades,
      },
    });
  } catch (err: any) {
    console.error('Admin AI overview error:', err);
    return NextResponse.json({ error: 'Failed to fetch AI overview' }, { status: 500 });
  }
}
