/**
 * AI accuracy tracking cron — GET /api/cron/ai-accuracy
 *
 * Schedule: every 30 minutes (offset +10 from resolution backfill so
 * they don't pile up simultaneously on Supabase).
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Scores our AI predictions against the actual Polymarket resolution
 * and appends one row per market to ai_accuracy_log (idempotent — rows
 * already in the log are filtered out before Gamma lookup).
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAiAccuracyTracking } from '@/lib/server/jobs/resolution-backfill';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runAiAccuracyTracking();
    console.log(`[CRON/ai-accuracy] done in ${result.durationMs}ms — closed=${result.closedFound} alreadyScored=${result.alreadyScored} unscored=${result.unscored} inserted=${result.inserted} skipped=${result.skipped}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[CRON/ai-accuracy] failed:', err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
