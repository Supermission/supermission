import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

const GAMMA_API = 'https://gamma-api.polymarket.com';

interface GammaMarket {
  id: string;
  question: string;
  description: string;
  slug: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  outcomes: string;
  outcomePrices: string;
  clobTokenIds: string;
  volume: string;
  volume24hr: string;
  volume1wk: string;
  liquidity: string;
  spread: string;
  startDate: string;
  endDate: string;
  conditionId: string;
  resolutionSource: string;
  image: string;
  icon: string;
}

interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  tags: { label: string }[];
  markets: GammaMarket[];
  image: string;
  icon: string;
}

/**
 * POST /api/markets/sync — Sync market catalog from Polymarket Gamma API
 *
 * Should be called by cron job. Protected by CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
  try {
    // Protect with cron secret
    const cronSecret = request.headers.get('x-cron-secret');
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allMarkets = await fetchAllMarkets();

    if (allMarkets.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No markets fetched' });
    }

    // Upsert into market_catalog
    const { error } = await (supabaseAdmin as any)
      .from('market_catalog')
      .upsert(allMarkets, { onConflict: 'condition_id' });

    if (error) {
      console.error('[/api/markets/sync] Upsert error:', error);
      return NextResponse.json({ error: 'Failed to sync markets', detail: error.message, code: error.code }, { status: 500 });
    }

    // Mark markets no longer in the feed as inactive
    const activeConditionIds = allMarkets.map(m => m.condition_id);
    const safeIds = activeConditionIds.filter(id => /^0x[a-fA-F0-9]+$/.test(id));
    if (safeIds.length === 0) {
      console.warn('[/api/markets/sync] No active markets returned from Gamma — skipping deactivation');
    } else {
      await (supabaseAdmin as any)
        .from('market_catalog')
        .update({ is_active: false })
        .eq('is_active', true)
        .not('condition_id', 'in', `(${safeIds.join(',')})`);
    }

    return NextResponse.json({
      synced: allMarkets.length,
      message: `Synced ${allMarkets.length} markets`,
    });
  } catch (err) {
    console.error('[/api/markets/sync] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function fetchAllMarkets() {
  const now = new Date();
  const endDateMin = new Date(now);
  endDateMin.setDate(endDateMin.getDate() + 1);
  const endDateMax = new Date(now);
  endDateMax.setDate(endDateMax.getDate() + 90); // Wider window for terminal browsing

  const results: any[] = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const url = new URL(`${GAMMA_API}/events`);
    url.searchParams.set('active', 'true');
    url.searchParams.set('closed', 'false');
    url.searchParams.set('archived', 'false');
    url.searchParams.set('liquidity_min', '500');
    url.searchParams.set('volume_min', '1000');
    url.searchParams.set('end_date_min', endDateMin.toISOString());
    url.searchParams.set('end_date_max', endDateMax.toISOString());
    url.searchParams.set('limit', pageSize.toString());
    url.searchParams.set('offset', offset.toString());

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`[sync] Gamma API error: ${res.status}`);
      break;
    }

    const events: GammaEvent[] = await res.json();
    if (!events || events.length === 0) break;

    for (const event of events) {
      if (!event.markets) continue;
      const categories = event.tags?.map(t => t.label) || [];

      for (const market of event.markets) {
        if (!market.active || market.archived || market.closed) continue;
        if (!market.conditionId) continue;

        const liquidity = parseFloat(market.liquidity || '0');
        const volume = parseFloat(market.volume || '0');
        const volume24h = parseFloat(market.volume24hr || '0');
        const spread = parseFloat(market.spread || '1');

        if (liquidity < 500) continue;
        if (volume < 1000) continue;

        let outcomes: string[] = [];
        let outcomePrices: number[] = [];
        let clobTokenIds: string[] = [];

        try {
          outcomes = JSON.parse(market.outcomes || '[]');
          outcomePrices = JSON.parse(market.outcomePrices || '[]').map(Number);
          clobTokenIds = JSON.parse(market.clobTokenIds || '[]');
        } catch (error) {
          console.warn('[markets/sync] malformed market JSON, skipping:', market.conditionId, error);
          continue;
        }

        if (clobTokenIds.length < 2) continue;

        // Compute trending/hot flags (same logic as worker/priceSync.ts)
        // Without this, the sync route upsert clobbers the worker's trending flags to null
        const avgDailyVol = volume > 0 ? volume / 30 : 0;
        const isVolSpike = volume24h > 0 && avgDailyVol > 0 && volume24h > avgDailyVol * 3;
        const isTrending = isVolSpike;

        const startDate = market.startDate ? new Date(market.startDate).getTime() : 0;
        const isNew = (Date.now() - startDate) < 48 * 60 * 60 * 1000;
        const isHot = isNew && volume > 10000;

        results.push({
          condition_id: market.conditionId,
          market_id: market.id,
          event_id: event.id,
          question: market.question,
          description: market.description || null,
          slug: market.slug,
          clob_token_ids: clobTokenIds,
          outcomes,
          outcome_prices: outcomePrices,
          volume,
          volume_24h: volume24h,
          volume_1wk: parseFloat(market.volume1wk || '0'),
          liquidity,
          spread,
          categories,
          tags: categories,
          is_active: true,
          is_closed: false,
          is_trending: isTrending,
          is_hot: isHot,
          end_date: market.endDate || null,
          start_date: market.startDate || null,
          resolution_source: market.resolutionSource || null,
          event_slug: event.slug || null,
          icon: market.icon || market.image || event.icon || event.image || null,
          last_synced_at: new Date().toISOString(),
        });
      }
    }

    if (events.length < pageSize) break;
    offset += pageSize;
  }

  return results;
}
