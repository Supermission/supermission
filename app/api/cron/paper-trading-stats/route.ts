/**
 * Paper trading stats cron — GET /api/cron/paper-trading-stats
 *
 * Schedule: 4:05am UTC daily (5-minute offset after daily-cleanup).
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Rebuilds the paper_trading_stats snapshot from prediction_log:
 * hit rate, Brier score, calibration, P&L, ROI, drawdown, Sharpe,
 * Sortino, and breakdowns by signal type / confidence / category /
 * market type / coin / timeframe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runPaperTradingStats } from '@/lib/server/jobs/paper-trading-stats';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runPaperTradingStats();
    console.log(`[CRON/paper-trading-stats] done in ${result.durationMs}ms — resolved=${result.totalResolved} correct=${result.correctPredictions} hit_rate=${result.hitRate} pnl=${result.cumulativePnl} roi=${result.roiPct} daily_pnl=${result.dailyPnl}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[CRON/paper-trading-stats] failed:', err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
