import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { safeParseInt } from '@/lib/validation';

// ── In-memory count cache (5-min TTL, keyed by filter combo) ──
const COUNT_TTL_MS = 5 * 60 * 1000;
const countCache = new Map<string, { value: number; ts: number }>();

// ── In-memory signal feed cache (2-min TTL, keyed by query params) ──
const FEED_TTL_MS = 2 * 60 * 1000;
const feedCache = new Map<string, { value: any; ts: number }>();

async function getCachedTotalCount(
  signalType: string | null,
  category: string | null,
  minConfidence: number,
): Promise<number> {
  const key = `${signalType || ''}|${(category || '').toLowerCase()}|${minConfidence}`;
  const cached = countCache.get(key);
  if (cached && Date.now() - cached.ts < COUNT_TTL_MS) return cached.value;

  const now = new Date().toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let total: number;

  if (!category) {
    let cq = (supabaseAdmin as any)
      .from('market_signals')
      .select('id', { count: 'exact', head: true })
      .gte('expires_at', now)
      .gte('created_at', sevenDaysAgo)
      .gte('confidence', minConfidence);
    if (signalType) cq = cq.eq('signal_type', signalType);
    const { count } = await cq;
    total = count ?? 0;
  } else {
    // Category requires catalog join — fetch matching condition_ids first
    const { data: catRows } = await (supabaseAdmin as any)
      .from('market_catalog')
      .select('condition_id, categories')
      .eq('is_active', true);
    const matchingIds = (catRows || [])
      .filter((r: any) => {
        const cats: string[] = Array.isArray(r.categories) ? r.categories : [];
        return cats.some((c: string) => c.toLowerCase() === category.toLowerCase());
      })
      .map((r: any) => r.condition_id);
    if (matchingIds.length === 0) { countCache.set(key, { value: 0, ts: Date.now() }); return 0; }
    let cq = (supabaseAdmin as any)
      .from('market_signals')
      .select('id', { count: 'exact', head: true })
      .in('condition_id', matchingIds)
      .gte('expires_at', now)
      .gte('created_at', sevenDaysAgo)
      .gte('confidence', minConfidence);
    if (signalType) cq = cq.eq('signal_type', signalType);
    const { count } = await cq;
    total = count ?? 0;
  }

  countCache.set(key, { value: total, ts: Date.now() });
  return total;
}

/**
 * GET /api/signals/feed — Enriched AI signal feed
 *
 * Query params:
 *   type          - Filter by signal type: sentiment, momentum, risk
 *   tags          - Comma-separated Polymarket tags to filter by (OR match, e.g. "Cricket,NFL")
 *   category      - Filter by market category (legacy, single tag)
 *   minConfidence - Minimum confidence threshold (0-100, default 0)
 *   search        - Keyword search in market question (case-insensitive)
 *   maxEndDate    - Only include markets ending before this date (ISO/YYYY-MM-DD)
 *   minVolume     - Minimum market volume in USD
 *   sentiment     - Filter by AI sentiment: bullish, bearish
 *   trending      - If "true", only include trending/hot markets
 *   sortBy        - Sort: confidence (default), volume, ending_soon, price_change
 *   pageSize      - Results per page (default 50, no cap)
 *   cursor        - Pagination cursor (format: confidence:condition_id)
 *
 * Returns enriched signals joined with market_catalog data and live prices.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const signalType = searchParams.get('type');
    const tagsParam = searchParams.get('tags'); // comma-separated Polymarket tags
    const category = searchParams.get('category'); // legacy single category
    const search = searchParams.get('search');
    // Parse tags: prefer `tags` param, fall back to `category` as single tag
    const filterTags: string[] = tagsParam
      ? tagsParam.split(',').map(t => t.trim()).filter(Boolean)
      : category ? [category] : [];
    const maxEndDate = searchParams.get('maxEndDate');
    const minVolumeParam = searchParams.get('minVolume');
    const sentiment = searchParams.get('sentiment');
    const trending = searchParams.get('trending') === 'true';
    const sortBy = searchParams.get('sortBy') || 'confidence';
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0');
    const pageSize = safeParseInt(searchParams.get('pageSize'), 50, 1, 100);
    const cursor = searchParams.get('cursor');
    const minVolume = minVolumeParam ? parseFloat(minVolumeParam) : 0;

    // Build cache key from all filter params (except cursor for simplicity)
    const cacheKey = `${signalType || ''}|${filterTags.join(',')}|${category || ''}|${search || ''}|${maxEndDate || ''}|${minVolume}|${sentiment || ''}|${trending}|${sortBy}|${minConfidence}|${pageSize}`;

    // Check feed cache first (2-min TTL) - skip if cursor provided (pagination)
    if (!cursor) {
      const cachedFeed = feedCache.get(cacheKey);
      if (cachedFeed && Date.now() - cachedFeed.ts < FEED_TTL_MS) {
        return NextResponse.json({
          ...cachedFeed.value,
          cached: true
        });
      }
    }

    // Post-query filtering needed when any catalog-level filter is active
    const needsPostFilter = !!(filterTags.length > 0 || search || maxEndDate || minVolume > 0 || sentiment || trending);

    // When post-query filtering is active, fetch extra rows since filtering
    // happens after the DB query.
    const fetchLimit = needsPostFilter ? pageSize * 2 : pageSize + 1;
    const now = new Date().toISOString();

    // Cached count query — runs in parallel, returns instantly if cache is fresh
    const totalCountPromise = getCachedTotalCount(signalType, filterTags.length > 0 ? filterTags[0] : null, minConfidence);

    // Fetch non-expired signals ordered by confidence desc, condition_id asc (tiebreaker)
    const sevenDaysAgoFeed = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    let signalsQuery = (supabaseAdmin as any)
      .from('market_signals')
      .select('condition_id, signal_type, signal_value, confidence, expires_at')
      .gte('expires_at', now)
      .gte('created_at', sevenDaysAgoFeed)
      .gte('confidence', minConfidence)
      .order('confidence', { ascending: false })
      .order('condition_id', { ascending: true })
      .limit(fetchLimit);

    if (signalType) {
      signalsQuery = signalsQuery.eq('signal_type', signalType);
    }

    // Apply cursor-based pagination filter
    if (cursor) {
      const sepIdx = cursor.indexOf(':');
      if (sepIdx !== -1) {
        const cursorConf = parseFloat(cursor.substring(0, sepIdx));
        const cursorCid = cursor.substring(sepIdx + 1);
        if (!isNaN(cursorConf)) {
          signalsQuery = signalsQuery.or(
            `confidence.lt.${cursorConf},and(confidence.eq.${cursorConf},condition_id.gt.${cursorCid})`,
          );
        }
      }
    }

    const { data: signals, error: signalsError } = await signalsQuery;

    if (signalsError) {
      console.error('[/api/signals/feed] Signals query error:', signalsError);
      return NextResponse.json({ error: 'Failed to fetch signals' }, { status: 500 });
    }

    if (!signals || signals.length === 0) {
      const totalCount = await totalCountPromise;
      return NextResponse.json({ signals: [], count: 0, totalCount, hasMore: false, nextCursor: null });
    }

    // Get unique condition_ids and fetch corresponding market catalog entries
    const conditionIds = [...new Set(signals.map((s: any) => s.condition_id))] as string[];

    // Fetch catalog with all fields needed for rich filtering
    const { data: catalogRows, error: catalogError } = await (supabaseAdmin as any)
      .from('market_catalog')
      .select('condition_id, question, categories, outcome_prices, clob_token_ids, end_date, volume, volume_24h, ai_sentiment, is_trending, is_hot, price_change_24h, liquidity')
      .in('condition_id', conditionIds);

    if (catalogError) {
      console.error('[/api/signals/feed] Catalog query error:', catalogError);
      return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
    }

    // Build a lookup map from condition_id to catalog data
    const catalogMap = new Map<string, any>();
    for (const row of catalogRows || []) {
      catalogMap.set(row.condition_id, row);
    }

    // Apply post-query filters
    let filteredSignals = signals;
    let hasMore: boolean;
    let nextCursorValue: string | null = null;

    const searchLower = search?.toLowerCase();

    if (needsPostFilter) {
      filteredSignals = signals.filter((s: any) => {
        const catalog = catalogMap.get(s.condition_id);
        if (!catalog) return false;

        // Tags filter (OR match — market must have at least one of the requested tags)
        if (filterTags.length > 0) {
          const cats: string[] = Array.isArray(catalog.categories) ? catalog.categories : [];
          const catsLower = cats.map((c: string) => c.toLowerCase());
          const hasMatch = filterTags.some(tag => catsLower.includes(tag.toLowerCase()));
          if (!hasMatch) return false;
        }

        // Keyword search in question
        if (searchLower) {
          const question = (catalog.question || '').toLowerCase();
          if (!question.includes(searchLower)) return false;
        }

        // End date filter
        if (maxEndDate && catalog.end_date) {
          if (new Date(catalog.end_date) > new Date(maxEndDate)) return false;
        }

        // Minimum volume filter
        if (minVolume > 0) {
          const vol = parseFloat(catalog.volume) || 0;
          if (vol < minVolume) return false;
        }

        // Sentiment filter
        if (sentiment) {
          if ((catalog.ai_sentiment || '').toLowerCase() !== sentiment.toLowerCase()) return false;
        }

        // Trending filter
        if (trending) {
          if (!catalog.is_trending && !catalog.is_hot) return false;
        }

        return true;
      });

      hasMore = filteredSignals.length >= pageSize;
      if (filteredSignals.length > pageSize) {
        filteredSignals = filteredSignals.slice(0, pageSize);
      }
      const lastFilteredRow = filteredSignals[filteredSignals.length - 1];
      if (hasMore && lastFilteredRow) {
        nextCursorValue = `${lastFilteredRow.confidence}:${lastFilteredRow.condition_id}`;
      }
    } else {
      hasMore = signals.length > pageSize;
      filteredSignals = hasMore ? signals.slice(0, pageSize) : signals;
      if (hasMore) {
        const lastRow = filteredSignals[filteredSignals.length - 1];
        nextCursorValue = `${lastRow.confidence}:${lastRow.condition_id}`;
      }
    }

    // Enrich signals with market data
    const enrichedSignals = filteredSignals.map((signal: any) => {
      const catalog = catalogMap.get(signal.condition_id);
      const question = catalog?.question || 'Unknown Market';
      const categories: string[] = Array.isArray(catalog?.categories) ? catalog.categories : [];
      const primaryCategory = categories[0] || 'Uncategorized';

      const outcomePrices: number[] = Array.isArray(catalog?.outcome_prices)
        ? catalog.outcome_prices.map(Number)
        : [];
      const livePrice = outcomePrices[0] || 0.5;

      return {
        condition_id: signal.condition_id,
        signal_type: signal.signal_type,
        signal_value: signal.signal_value,
        confidence: signal.confidence,
        expires_at: signal.expires_at,
        question,
        category: primaryCategory,
        livePrice,
        // Extra fields for sorting
        _volume: parseFloat(catalog?.volume) || 0,
        _endDate: catalog?.end_date || null,
        _priceChange: parseFloat(catalog?.price_change_24h) || 0,
      };
    });

    // Sort based on sortBy param
    if (sortBy === 'volume') {
      enrichedSignals.sort((a: any, b: any) => b._volume - a._volume);
    } else if (sortBy === 'ending_soon') {
      enrichedSignals.sort((a: any, b: any) => {
        if (!a._endDate) return 1;
        if (!b._endDate) return -1;
        return new Date(a._endDate).getTime() - new Date(b._endDate).getTime();
      });
    } else if (sortBy === 'price_change') {
      enrichedSignals.sort((a: any, b: any) => Math.abs(b._priceChange) - Math.abs(a._priceChange));
    } else {
      // Default: confidence descending
      enrichedSignals.sort((a: any, b: any) => b.confidence - a.confidence);
    }

    // Strip internal sort fields before response
    const cleanSignals = enrichedSignals.map(({ _volume, _endDate, _priceChange, ...rest }: any) => rest);

    const totalCount = await totalCountPromise;

    const responseData = {
      signals: cleanSignals,
      count: cleanSignals.length,
      totalCount,
      hasMore,
      nextCursor: nextCursorValue,
    };

    // Cache the feed response (2-min TTL) - only if no cursor (first page)
    if (!cursor) {
      feedCache.set(cacheKey, { value: responseData, ts: Date.now() });
      // Prune cache if too large (keep last 20 queries)
      if (feedCache.size > 20) {
        const entries = Array.from(feedCache.entries());
        entries.sort((a, b) => a[1].ts - b[1].ts);
        const oldestKey = entries[0][0];
        feedCache.delete(oldestKey);
      }
    }

    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (err) {
    console.error('[/api/signals/feed] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
