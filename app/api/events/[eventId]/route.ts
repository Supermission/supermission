import { NextRequest, NextResponse } from 'next/server';
import { fetchEvent } from '@/lib/polymarket/api';
import { supabaseAdmin } from '@/lib/supabase/client';

/**
 * GET /api/events/[eventId] — Event detail endpoint
 *
 * Fetches event data from Gamma API and enriches with local catalog data
 * (categories, AI sentiment, etc.) from the market_catalog table.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    if (!eventId) {
      return NextResponse.json(
        { error: 'Missing eventId parameter' },
        { status: 400 }
      );
    }

    // Fetch event from Gamma API
    const event = await fetchEvent(eventId);

    if (!event || !event.id) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // Fetch matching local market catalog entries for enrichment
    let localMarkets: any[] = [];
    try {
      const { data, error } = await (supabaseAdmin as any)
        .from('market_catalog')
        .select('condition_id, market_id, question, slug, outcomes, outcome_prices, clob_token_ids, volume, volume_24h, liquidity, spread, categories, end_date, icon, ai_sentiment, is_trending, is_hot, price_change_24h')
        .eq('event_id', eventId);

      if (error) {
        console.warn('[events/route] Supabase query error:', error.message);
      } else {
        localMarkets = data || [];
      }
    } catch (dbErr: any) {
      // Non-fatal: we still have Gamma data
      console.warn('[events/route] Failed to fetch local markets:', dbErr.message);
    }

    return NextResponse.json({
      event,
      localMarkets,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (err: any) {
    console.error('[events/route] Error:', err);

    // Distinguish between upstream API errors and internal errors
    const status = err.message?.includes('HTTP 404') ? 404 : 500;
    return NextResponse.json(
      { error: err.message || 'Failed to fetch event' },
      { status }
    );
  }
}
