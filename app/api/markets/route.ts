import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { safeParseInt, safeParseFloat } from '@/lib/validation';

/**
 * GET /api/markets — Public market catalog endpoint
 *
 * Query params:
 *   category  - Filter by category (e.g. "Politics", "Crypto")
 *   sort      - Sort order: volume (default), trending, newest, ending_soon, price_change
 *   limit     - Page size (default 50, max 100)
 *   offset    - Pagination offset (default 0)
 *   search    - Full-text search on question
 *   trending  - If "true", only show trending markets
 *   withAiSignals - If "true", only return markets with AI signals (favourite_outcome or ai_sentiment)
 *   minConfidence - Minimum AI confidence (0-100)
 *   sentiment - Filter by sentiment (bullish/bearish)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const sort = searchParams.get('sort') || 'volume';
    const limit = safeParseInt(searchParams.get('limit'), 50, 1, 100);
    const offset = safeParseInt(searchParams.get('offset'), 0, 0);
    const search = searchParams.get('search');
    const trendingOnly = searchParams.get('trending') === 'true';
    const ids = searchParams.get('ids');
    const withAiSignals = searchParams.get('withAiSignals') === 'true';
    const minConfidence = safeParseFloat(searchParams.get('minConfidence'), 0, 0, 100);
    const sentiment = searchParams.get('sentiment');

    let query = (supabaseAdmin as any)
      .from('market_catalog')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .eq('is_closed', false);

    // Filter for markets with AI signals (favourite_outcome OR ai_sentiment)
    if (withAiSignals) {
      query = query.or('favourite_outcome.not.is.null,ai_sentiment.not.is.null');
    }

    // IDs filter (for watchlist fetch)
    if (ids) {
      const idList = ids.split(',').filter(Boolean).slice(0, 50);
      if (idList.length > 0) {
        query = query.in('condition_id', idList);
      }
    }

    // Category filter
    if (category && category !== 'all') {
      query = query.contains('categories', [category]);
    }

    // Trending filter
    if (trendingOnly) {
      query = query.eq('is_trending', true);
    }

    // Full-text search
    if (search) {
      query = query.ilike('question', `%${search}%`);
    }

    // Minimum confidence filter (post-filter in code, but fetch enough data)
    if (minConfidence > 0) {
      query = query.gte('ai_confidence', minConfidence);
    }

    // Sorting
    switch (sort) {
      case 'trending':
        query = query.order('is_trending', { ascending: false }).order('volume_24h', { ascending: false });
        break;
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      case 'ending_soon':
        query = query.order('end_date', { ascending: true });
        break;
      case 'price_change':
        query = query.order('price_change_24h', { ascending: false });
        break;
      case 'volume':
      default:
        query = query.order('volume', { ascending: false });
        break;
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[/api/markets] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 });
    }

    return NextResponse.json({
      markets: data || [],
      total: count || 0,
      limit,
      offset,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
    });
  } catch (err) {
    console.error('[/api/markets] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
