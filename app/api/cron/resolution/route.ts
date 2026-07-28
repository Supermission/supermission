/**
 * Resolution backfill cron — GET /api/cron/resolution
 *
 * Schedule: every 30 minutes (vercel.json).
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Runs the same backfill that worker-batch used to run on its node-cron
 * timer. Once verified stable on Vercel for ≥24h, the corresponding
 * cron entry in worker/src/index-batch.ts can be removed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runResolutionBackfill } from '@/lib/server/jobs/resolution-backfill';

export const maxDuration = 300; // resolution backfill can take a few minutes on a big batch

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runResolutionBackfill();
    console.log(`[CRON/resolution] backfill complete in ${result.durationMs}ms — checked=${result.unresolvedChecked} resolved=${result.resolved} scored=${result.scored} skipped(notClosed=${result.skippedNotClosed},noOutcome=${result.skippedNoOutcome},fetchFailed=${result.skippedFetchFailed})`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[CRON/resolution] backfill failed:', err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
