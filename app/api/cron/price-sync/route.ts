/**
 * priceSync cron — GET /api/cron/price-sync
 *
 * Schedule: every 5 minutes.
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Pulls fresh prices from worker-realtime's /internal/prices, computes
 * price_change_24h from the stored anchor, writes flags + prices to
 * market_catalog. Rotates the anchor in place once every ~23h.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runPriceSync } from '@/lib/server/jobs/price-sync';

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runPriceSync();
    console.log(`[CRON/price-sync] done in ${result.durationMs}ms — fetched=${result.fetchedPrices} loaded=${result.marketsLoaded} updated=${result.updated} missing=${result.missingPrice} rotated=${result.rotated}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[CRON/price-sync] failed:', err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
