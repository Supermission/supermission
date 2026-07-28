import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { fetchPriceHistory, fetchMidpoint } from '@/lib/polymarket/api';

const MAX_IDS = 4;

/**
 * GET /api/markets/compare?ids=id1,id2,id3
 *
 * Returns comparison data for up to 4 markets including price history.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');

    if (!idsParam) {
      return NextResponse.json(
        { error: 'Missing required query parameter: ids' },
        { status: 400 },
      );
    }

    const ids = idsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, MAX_IDS);

    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'No valid ids provided' },
        { status: 400 },
      );
    }

    // Fetch market catalog data from Supabase. Gate on is_active/is_closed so
    // a direct ?ids=<closed_id> probe can't surface a resolved market here.
    const { data: catalogData, error: dbError } = await (supabaseAdmin as any)
      .from('market_catalog')
      .select('condition_id, question, outcome_prices, clob_token_ids, volume, liquidity, spread, categories')
      .eq('is_active', true)
      .eq('is_closed', false)
      .in('condition_id', ids);

    if (dbError) {
      console.error('[/api/markets/compare] Supabase error:', dbError);
      return NextResponse.json(
        { error: 'Failed to fetch market data' },
        { status: 500 },
      );
    }

    if (!catalogData || catalogData.length === 0) {
      return NextResponse.json({ markets: [] });
    }

    // For each market, fetch price history and midpoint in parallel
    const markets = await Promise.all(
      catalogData.map(async (row: any) => {
        const tokenId = row.clob_token_ids?.[0];
        if (!tokenId) {
          return {
            conditionId: row.condition_id,
            question: row.question,
            tokenId: '',
            currentPrice: row.outcome_prices?.[0] ?? 0,
            volume: row.volume ?? 0,
            liquidity: row.liquidity ?? 0,
            spread: row.spread ?? 0,
            categories: row.categories ?? [],
            priceHistory: [],
          };
        }

        // Fetch price history and live midpoint in parallel
        const [priceHistory, midpoint] = await Promise.all([
          fetchPriceHistory(tokenId, 'max', 60).catch(() => []),
          fetchMidpoint(tokenId).catch(() => row.outcome_prices?.[0] ?? 0.5),
        ]);

        return {
          conditionId: row.condition_id,
          question: row.question,
          tokenId,
          currentPrice: midpoint,
          volume: row.volume ?? 0,
          liquidity: row.liquidity ?? 0,
          spread: row.spread ?? 0,
          categories: row.categories ?? [],
          priceHistory,
        };
      }),
    );

    return NextResponse.json({ markets }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
    });
  } catch (err) {
    console.error('[/api/markets/compare] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
