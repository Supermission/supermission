/**
 * Daily cleanup cron — GET /api/cron/daily-cleanup
 *
 * Schedule: 4am UTC daily.
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Prunes stale rows across Supabase: inactive markets >7d, signals
 * >7d, read notifications >30d, resolved predictions >180d, and
 * misc tracking tables >90d.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDailyCleanup } from '@/lib/server/jobs/daily-cleanup';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runDailyCleanup();
    const trackingStr = Object.entries(result.deletedTracking).map(([k, n]) => `${k}:${n}`).join(', ');
    console.log(`[CRON/daily-cleanup] done in ${result.durationMs}ms — markets=${result.deletedMarkets} signals=${result.deletedSignals} notifs=${result.deletedNotifications} predictions=${result.deletedPredictions} tracking=(${trackingStr})`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[CRON/daily-cleanup] failed:', err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
