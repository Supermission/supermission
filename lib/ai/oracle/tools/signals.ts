/**
 * Signal and user-pref executors: filtered signal feed (live + expired
 * fallback), research lookup, preference persistence.
 */

import { persistUserPreferences } from '@/lib/ai/user-context';
import { researchTopic } from '@/lib/ai/oracle/research';
import { db } from './shared';

// ---------------------------------------------------------------------------
// get_signals
// ---------------------------------------------------------------------------

export async function getSignals(args: Record<string, unknown>) {
  const keyword = args.keyword as string | undefined;
  const signalType = args.signal_type as string | undefined;
  const sentiment = args.sentiment as string | undefined;
  const category = args.category as string | undefined;
  const minConfidence = args.min_confidence as number | undefined;
  const minEdge = args.min_edge as number | undefined;
  const minVolume = args.min_volume as number | undefined;
  const minLiquidity = args.min_liquidity as number | undefined;
  const maxSpread = args.max_spread as number | undefined;
  const endingWithinDays = args.ending_within_days as number | undefined;
  const maxEndDate = args.max_end_date as string | undefined;
  const trending = args.trending as boolean | undefined;
  const sort = (args.sort as string) || 'edge';
  const limit = Math.min((args.limit as number) || 10, 20);

  // ------------------------------------------------------------------
  // Step 1: Fetch all signals — live first, then expired as fallback
  // ------------------------------------------------------------------
  const now = new Date().toISOString();

  // Live (non-expired) signals
  let liveQuery = db
    .from('market_signals')
    .select('condition_id, signal_type, signal_value, confidence, source, created_at, expires_at')
    .gt('expires_at', now)
    .order('confidence', { ascending: false })
    .limit(100);

  if (signalType) liveQuery = liveQuery.eq('signal_type', signalType);
  if (minConfidence) liveQuery = liveQuery.gte('confidence', minConfidence);

  // Expired signals as fallback — still valuable if market is active
  let expiredQuery = db
    .from('market_signals')
    .select('condition_id, signal_type, signal_value, confidence, source, created_at, expires_at')
    .lte('expires_at', now)
    .order('confidence', { ascending: false })
    .limit(100);

  if (signalType) expiredQuery = expiredQuery.eq('signal_type', signalType);
  if (minConfidence) expiredQuery = expiredQuery.gte('confidence', minConfidence);

  const [liveRes, expiredRes] = await Promise.all([liveQuery, expiredQuery]);
  const liveSignals = (liveRes.data || []) as any[];
  const expiredSignals = (expiredRes.data || []) as any[];

  // ------------------------------------------------------------------
  // Step 2: Enrich all signals with market_catalog data
  // ------------------------------------------------------------------
  const allSignalConditionIds = [
    ...new Set([
      ...liveSignals.map((s: any) => s.condition_id),
      ...expiredSignals.map((s: any) => s.condition_id),
    ].filter(Boolean)),
  ];

  const marketMap: Record<string, any> = {};
  if (allSignalConditionIds.length > 0) {
    // Fetch in batches if needed
    const BATCH = 100;
    for (let i = 0; i < allSignalConditionIds.length; i += BATCH) {
      const batch = allSignalConditionIds.slice(i, i + BATCH);
      let mQuery = db
        .from('market_catalog')
        .select(
          'condition_id, question, outcome_prices, outcomes, volume, volume_24h, liquidity, spread, categories, end_date, slug, is_trending, is_hot, price_change_24h, ai_sentiment, ai_confidence, ai_summary, favourite_outcome'
        )
        .eq('is_active', true)
        .in('condition_id', batch);

      const { data: markets } = await mQuery;
      for (const m of (markets || []) as any[]) {
        marketMap[m.condition_id] = m;
      }
    }
  }

  // ------------------------------------------------------------------
  // Step 3: Build unified result set — live signals first, expired as fallback
  // ------------------------------------------------------------------
  const seenConditionIds = new Set<string>();

  const buildEntry = (market: any, signal: any) => {
    const prices = typeof market.outcome_prices === 'string'
      ? JSON.parse(market.outcome_prices)
      : market.outcome_prices;
    const yesPrice = prices?.[0] ?? 0;
    const noPrice = prices?.[1] ?? 0;
    const confidence = signal.confidence ?? 0;
    const favOutcome = signal.signal_value?.favourite_outcome ?? market.favourite_outcome;
    const isExpired = new Date(signal.expires_at) <= new Date();

    // Edge = AI confidence minus market implied probability for the favoured outcome
    const favLower = (favOutcome || '').toLowerCase();
    const impliedProb = (favLower === 'no' ? noPrice : yesPrice) * 100;
    const edge = confidence - impliedProb;

    return {
      condition_id: market.condition_id,
      question: market.question,
      // Signal info
      signal_type: signal.signal_type,
      signal_freshness: isExpired ? 'expired' : 'live',
      confidence,
      edge: Math.round(edge * 10) / 10,
      ai_sentiment: signal.signal_value?.sentiment ?? market.ai_sentiment,
      favourite_outcome: favOutcome,
      ai_summary: signal.signal_value?.reasoning ?? market.ai_summary,
      // Market data
      yes_price: yesPrice,
      no_price: noPrice,
      outcomes: market.outcomes,
      volume: market.volume,
      volume_24h: market.volume_24h,
      liquidity: market.liquidity,
      spread: market.spread,
      categories: market.categories,
      end_date: market.end_date,
      slug: market.slug,
      is_trending: market.is_trending,
      price_change_24h: market.price_change_24h,
      signal_created_at: signal.created_at,
      // Momentum/spot extras if present
      ...(signal.signal_type === 'momentum' ? {
        price_direction: signal.signal_value?.direction,
        momentum_volume_24h: signal.signal_value?.volume_24h,
      } : {}),
      ...(signal.signal_type === 'spot_price' ? {
        spot_price: signal.signal_value?.spot_price,
        spot_symbol: signal.signal_value?.symbol,
        distance_from_threshold_pct: signal.signal_value?.distance_pct,
      } : {}),
    };
  };

  let results: any[] = [];

  // Live signals first (freshest data)
  for (const s of liveSignals) {
    const market = marketMap[s.condition_id];
    if (!market) continue;
    if (seenConditionIds.has(s.condition_id)) continue;
    seenConditionIds.add(s.condition_id);
    results.push(buildEntry(market, s));
  }

  // Expired signals as fallback — only for markets not already covered by live signals
  for (const s of expiredSignals) {
    const market = marketMap[s.condition_id];
    if (!market) continue;
    if (seenConditionIds.has(s.condition_id)) continue;
    seenConditionIds.add(s.condition_id);
    results.push(buildEntry(market, s));
  }

  // ------------------------------------------------------------------
  // Step 4: Apply post-query filters (on enriched market data)
  // ------------------------------------------------------------------
  if (keyword) {
    // Split into words — match markets where ALL words appear in question OR description
    const words = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
    results = results.filter((r) => {
      const text = `${r.question || ''} ${r.ai_summary || ''}`.toLowerCase();
      return words.every((w: string) => text.includes(w));
    });
    // If AND matched nothing, fallback to OR ranked by match count
    if (results.length === 0) {
      const allResults = [...(liveRes.data || []), ...(expiredRes.data || [])]
        .filter((s: any) => marketMap[s.condition_id])
        .map((s: any) => {
          const market = marketMap[s.condition_id];
          const text = `${market.question || ''} ${market.ai_summary || ''}`.toLowerCase();
          const matchCount = words.filter((w) => text.includes(w)).length;
          return matchCount > 0 ? { signal: s, market, matchCount } : null;
        })
        .filter(Boolean) as any[];

      // De-duplicate by condition_id, keep best match
      const seen = new Set<string>();
      const ranked: any[] = [];
      allResults.sort((a, b) => b.matchCount - a.matchCount);
      for (const r of allResults) {
        if (seen.has(r.market.condition_id)) continue;
        seen.add(r.market.condition_id);
        ranked.push(buildEntry(r.market, r.signal));
      }
      results = ranked;
    }
  }
  if (sentiment) {
    results = results.filter((r) => r.ai_sentiment === sentiment);
  }
  if (category) {
    const cat = category.toLowerCase();
    results = results.filter((r) => r.categories?.some((c: string) => c.toLowerCase().includes(cat)));
  }
  if (minEdge != null) {
    results = results.filter((r) => r.edge >= minEdge);
  }
  if (minVolume) {
    results = results.filter((r) => r.volume >= minVolume);
  }
  if (minLiquidity) {
    results = results.filter((r) => r.liquidity >= minLiquidity);
  }
  if (maxSpread != null) {
    results = results.filter((r) => r.spread != null && r.spread <= maxSpread);
  }
  if (trending) {
    results = results.filter((r) => r.is_trending);
  }
  // End date filters (applied post-enrichment since end_date is on market_catalog)
  if (endingWithinDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + endingWithinDays);
    results = results.filter((r) => {
      if (!r.end_date) return false;
      const end = new Date(r.end_date);
      return end > new Date() && end <= cutoff;
    });
  } else if (maxEndDate) {
    results = results.filter((r) => {
      if (!r.end_date) return false;
      const end = new Date(r.end_date);
      return end > new Date() && end <= new Date(maxEndDate);
    });
  }

  // ------------------------------------------------------------------
  // Step 5: Sort
  // ------------------------------------------------------------------
  const sortFn: Record<string, (a: any, b: any) => number> = {
    edge: (a, b) => b.edge - a.edge,
    confidence: (a, b) => b.confidence - a.confidence,
    volume: (a, b) => (b.volume || 0) - (a.volume || 0),
    volume_24h: (a, b) => (b.volume_24h || 0) - (a.volume_24h || 0),
    liquidity: (a, b) => (b.liquidity || 0) - (a.liquidity || 0),
    end_date: (a, b) => new Date(a.end_date || '2099-01-01').getTime() - new Date(b.end_date || '2099-01-01').getTime(),
    price_change: (a, b) => Math.abs(b.price_change_24h || 0) - Math.abs(a.price_change_24h || 0),
  };
  results.sort(sortFn[sort] || sortFn.edge);

  // Trim to limit
  results = results.slice(0, limit);

  const liveCount = results.filter((r) => r.signal_freshness === 'live').length;
  const expiredCount = results.filter((r) => r.signal_freshness === 'expired').length;

  return {
    count: results.length,
    live_count: liveCount,
    expired_count: expiredCount,
    signals: results,
  };
}

// ---------------------------------------------------------------------------
// research_topic
// ---------------------------------------------------------------------------

export async function executeResearch(args: Record<string, unknown>) {
  const query = args.query as string;
  if (!query) return { error: 'Missing required parameter: query' };

  const result = await researchTopic(query);
  return {
    query: result.query,
    one_liner: result.oneLiner,
    sources: result.snippets.map((s) => ({
      title: s.title,
      url: s.url,
      excerpt: s.excerpt,
    })),
    cached: result.cached,
    _telemetry: { research_cache_hit: result.cached },
  };
}

// ---------------------------------------------------------------------------
// save_preference
// ---------------------------------------------------------------------------

export async function savePreference(walletAddress: string | null, args: Record<string, unknown>) {
  if (!walletAddress) {
    return { error: 'No wallet connected. Cannot save preferences.' };
  }

  const key = args.key as string;
  const value = args.value as string;

  const updates: Record<string, unknown> = {};

  switch (key) {
    case 'category': {
      // Fetch existing categories and append
      const { data: existing } = await db
        .from('pm_agent_memory')
        .select('preferences')
        // Rows are keyed lowercase; the write below lowercases too. Reading with a
        // checksummed address misses the row and clobbers saved categories.
        .eq('user_address', walletAddress.toLowerCase())
        .single();

      const existingCategories: string[] =
        (existing?.preferences as any)?.favorite_categories || [];
      const newCategories = [...new Set([...existingCategories, value])];
      updates.favorite_categories = newCategories;
      break;
    }
    case 'risk':
      updates.risk_appetite = value;
      break;
    case 'budget':
      updates.typical_budget = parseFloat(value) || 0;
      break;
    default:
      return { error: `Unknown preference key: ${key}` };
  }

  await persistUserPreferences(walletAddress, updates as any);
  return { saved: true, key, value };
}
