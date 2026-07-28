/**
 * Prediction Market AI Agent Service (Serverless)
 * Finds profitable opportunities in prediction markets (Polymarket)
 * Filter-rich: category, end time, volume, confidence, margin, trending, liquidity, sort
 */

import { supabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from '@/lib/auth/require-auth';
import { createSingleAgentJob, completeSingleAgentJob } from '@/lib/agent-economy/collaborate';
import { enrichMarketsWithSpotPrices, type SpotPriceContext } from '@/lib/coindesk/spot-enrichment';
import { CATEGORY_GROUPS } from '@/lib/config/categories';
import { fetchUserContext } from '@/lib/ai/user-context';

// ── In-memory cache for categories (10-min TTL) ──
const CATEGORIES_CACHE_TTL_MS = 10 * 60 * 1000;
const categoriesCache = { data: null as any, ts: 0 };

// ============================================
// AGENT CONFIGURATION
// ============================================
const AGENT_ID = 'prediction-market';
const AGENT_NAME = 'Prediction Market';
const ERC8004_AGENT_ID = '1592';
const CDP_WALLET = '0xE7138DF3CcB480718Dc2C37fAf7Aee70B08157e7';

const PAYMENT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const TOKEN_DECIMALS = 6;
const SERVICE_PRICE = '0.01';

// ============================================
// RESULT LIMIT — only return top N markets
// ============================================
const MAX_RESULTS = 3;

type RiskAppetite = 'low' | 'medium' | 'high';
type SortBy = 'confidence' | 'volume' | 'margin' | 'end_date' | 'liquidity' | 'trending' | 'newest';

interface RecommendationSnapshot {
  opportunity: string;
  yes_price: number;
  no_price: number;
  sentiment: string;
  confidence_score: number
}

/**
 * Prediction Market Request Interface — filter-rich
 */
interface PredictionMarketRequest {
  // ── Category filter ──
  category?: string;             // Hard filter: "Sports", "Crypto", "Politics", etc.
  interest?: string;             // Legacy alias for category (soft-sort if category not set)

  // ── Confidence / Risk ──
  minConfidence?: number;        // 0-100, minimum AI confidence score
  riskAppetite?: RiskAppetite;   // Shorthand: low=50, medium=65, high=75 confidence

  // ── Time filters ──
  endsBefore?: string;           // ISO date — market must end before this
  endsAfter?: string;            // ISO date — market must end after this
  endsWithinDays?: number;       // Shorthand: market ends within N days from now

  // ── Volume / Liquidity ──
  minVolume?: number;            // Minimum total volume (USD)
  minVolume24h?: number;         // Minimum 24h volume (USD)
  minLiquidity?: number;         // Minimum liquidity (USD)

  // ── Margin / Profitability ──
  minMargin?: number;            // Minimum price margin % (distance from 50/50 = higher edge)

  // ── Sentiment ──
  sentiment?: 'bullish' | 'bearish'; // Only show markets with this AI sentiment

  // ── Trending / Hot ──
  trendingOnly?: boolean;        // Only show trending markets
  hotOnly?: boolean;             // Only show hot markets

  // ── Sort ──
  sortBy?: SortBy;               // How to rank results (default: confidence)

  // ── Pagination ──
  offset?: number;
  limit?: number;                // Override MAX_RESULTS (capped at 10)

  // ── Legacy ──
  minimumGapPercent?: number;
  maximumTimePeriod?: string;
  payment?: number;
}

/**
 * Compute the profit margin for a market.
 * Margin = how far the favoured outcome price is from 0.50 (the break-even).
 * A market priced at YES=0.30 has a 20% margin for buying YES (if AI says bullish).
 * A market priced at YES=0.80 has a 30% margin for buying NO (if AI says bearish).
 * Higher margin = higher potential profit if the AI signal is correct.
 */
function computeMargin(market: any): number {
  const prices = market.outcome_prices;
  if (!prices || prices.length < 2) return 0;

  const sentiment = market.ai_sentiment?.toLowerCase();
  if (sentiment === 'bullish') {
    // Buying YES — profit margin is (1 - yes_price), i.e. how cheap YES is
    return Math.round((1 - Number(prices[0])) * 100);
  } else if (sentiment === 'bearish') {
    // Buying NO — profit margin is (1 - no_price)
    return Math.round((1 - Number(prices[1])) * 100);
  }
  return 0;
}

/**
 * Execute task endpoint with rich filtering
 */
export async function POST(req: NextRequest) {
  const authError = await requireAuth(req);
  if (authError) return authError;

  console.log('[PredictionMarket API] POST handler called');
  try {
    const body: PredictionMarketRequest = await req.json();
    const user_address = req.headers.get('x-wallet-address');

    // ── Resolve filters with sensible defaults ──
    const category = body.category || null;
    const interest = body.interest || null;
    const riskAppetite = (body.riskAppetite as RiskAppetite) || null;
    const sortBy = (body.sortBy as SortBy) || 'confidence';
    const resultLimit = Math.min(body.limit || MAX_RESULTS, 10);
    const offset = body.offset || 0;

    // Confidence: explicit minConfidence > riskAppetite shorthand > default 50
    const confidenceThresholds: Record<RiskAppetite, number> = { low: 50, medium: 65, high: 75 };
    const minConfidence = body.minConfidence
      ?? (riskAppetite ? confidenceThresholds[riskAppetite] : 50);

    // Volume thresholds
    const minVolume = body.minVolume ?? 0;
    const minVolume24h = body.minVolume24h ?? 0;
    const minLiquidity = body.minLiquidity ?? 0;

    // Margin threshold
    const minMargin = body.minMargin ?? 0;

    // Sentiment filter
    const sentimentFilter = body.sentiment || null;

    // Trending / Hot
    const trendingOnly = body.trendingOnly ?? false;
    const hotOnly = body.hotOnly ?? false;

    // End date window
    const now = new Date();
    const nowISO = now.toISOString();
    let endDateMin = nowISO; // must be in the future
    let endDateMax: string | null = null;

    if (body.endsAfter) {
      const parsed = new Date(body.endsAfter);
      if (!isNaN(parsed.getTime()) && parsed > now) endDateMin = parsed.toISOString();
    }
    if (body.endsBefore) {
      const parsed = new Date(body.endsBefore);
      if (!isNaN(parsed.getTime())) endDateMax = parsed.toISOString();
    }
    if (body.endsWithinDays && !body.endsBefore) {
      const limit = new Date();
      limit.setDate(limit.getDate() + body.endsWithinDays);
      endDateMax = limit.toISOString();
    }
    // Legacy maximumTimePeriod fallback
    if (!endDateMax && body.maximumTimePeriod) {
      const daysMap: Record<string, number> = { short: 7, medium: 30, long: 90 };
      const days = daysMap[body.maximumTimePeriod] || 30;
      const limit = new Date();
      limit.setDate(limit.getDate() + days);
      endDateMax = limit.toISOString();
    }

    console.log(`[${AGENT_NAME}] Filters:`, {
      category, interest, minConfidence, minVolume, minVolume24h, minLiquidity,
      minMargin, sentimentFilter, trendingOnly, hotOnly, sortBy,
      endDateMin, endDateMax, resultLimit, offset,
    });

    // ========================================
    // STEP 0: Pre-check market availability
    // ========================================
    const { count: signalCount } = await supabase
      .from("market_signals")
      .select('condition_id', { count: 'exact', head: true })
      .gte('expires_at', nowISO)
      .gte('confidence', minConfidence);

    if ((signalCount ?? 0) === 0) {
      return NextResponse.json({
        success: true,
        agentId: AGENT_ID,
        agentName: AGENT_NAME,
        data: {
          deals: null,
          all_deals: [],
          total_opportunities: 0,
          filters_applied: buildFiltersApplied(body, minConfidence),
          offer_created_at: nowISO,
        },
        message: 'No prediction markets with signals found. Try again later when new signals are available.',
        noPaymentRequired: true,
      });
    }

    // Payment gating disabled
    console.log(`[${AGENT_NAME}] Payment gating disabled - proceeding without payment`);

    // Track job in collaborate_missions
    const jobResult = await createSingleAgentJob({
      agentName: AGENT_NAME,
      agentWallet: CDP_WALLET,
      title: `Prediction Market Analysis`,
      description: `Market analysis with filters: ${JSON.stringify({ category: body.category, interest: body.interest, riskAppetite: body.riskAppetite }).slice(0, 200)}`,
      budget: SERVICE_PRICE,
      category: 'prediction-market',
      creatorAddress: user_address || 'anonymous',
    });
    const missionId = jobResult.missionId || null;

    // Fetch user context for personalization
    const userContext = await fetchUserContext(user_address).catch(() => ({
      watchlist_condition_ids: [] as string[],
      recent_trades: [] as any[],
      preferences: {} as any,
      has_context: false,
    }));

    const effectiveCategory = category || interest || (userContext.preferences.favorite_categories?.[0] ?? null);

    // ========================================
    // STEP 1: Fetch signals
    // ========================================
    const { data: signals, error: signalsError } = await supabase
      .from("market_signals")
      .select('condition_id, signal_type, signal_value, confidence, expires_at')
      .gte('expires_at', nowISO)
      .gte('confidence', minConfidence)
      .order('confidence', { ascending: false })
      .limit(200);

    if (signalsError) throw signalsError;

    if (!signals || signals.length === 0) {
      return NextResponse.json({
        success: true,
        agentId: AGENT_ID,
        agentName: AGENT_NAME,
        data: {
          deals: null,
          all_deals: [],
          total_opportunities: 0,
          filters_applied: buildFiltersApplied(body, minConfidence),
          offer_created_at: nowISO,
        },
      });
    }

    // ========================================
    // STEP 2: Fetch catalog data with HARD filters
    // ========================================
    const signalConditionIds = [...new Set(signals.map((s: any) => s.condition_id))] as string[];

    let catalogQuery = supabase
      .from("market_catalog")
      .select(`
        market_id, condition_id, slug, question, outcome_prices, outcomes,
        volume, categories, event_id, end_date, ai_confidence,
        favourite_outcome, ai_sentiment, ai_summary, clob_token_ids,
        event_slug, description, source_article_urls,
        volume_24h, liquidity, spread, price_change_24h,
        is_trending, is_hot, volume_1wk, start_date
      `)
      .in('condition_id', signalConditionIds)
      .eq("is_active", true)
      .gte("end_date", endDateMin);

    // Hard end date max filter
    if (endDateMax) {
      catalogQuery = catalogQuery.lte("end_date", endDateMax);
    }

    // Hard volume filter
    if (minVolume > 0) {
      catalogQuery = catalogQuery.gte("volume", minVolume);
    }

    // Hard 24h volume filter
    if (minVolume24h > 0) {
      catalogQuery = catalogQuery.gte("volume_24h", minVolume24h);
    }

    // Hard liquidity filter
    if (minLiquidity > 0) {
      catalogQuery = catalogQuery.gte("liquidity", minLiquidity);
    }

    // Hard trending filter
    if (trendingOnly) {
      catalogQuery = catalogQuery.eq("is_trending", true);
    }

    // Hard hot filter
    if (hotOnly) {
      catalogQuery = catalogQuery.eq("is_hot", true);
    }

    // Hard category filter (uses Postgres array overlap)
    if (category) {
      // Resolve category group to get all matching tags
      const categoryTags = resolveCategoryTags(category);
      catalogQuery = catalogQuery.overlaps("categories", categoryTags);
    }

    // Hard sentiment filter on catalog
    if (sentimentFilter) {
      catalogQuery = catalogQuery.eq("ai_sentiment", sentimentFilter);
    }

    const { data: catalogRows, error: catalogError } = await catalogQuery;
    if (catalogError) throw catalogError;

    console.log(`[${AGENT_NAME}] Catalog rows after hard filters: ${catalogRows?.length || 0}`);

    // Build catalog lookup
    const catalogMap = new Map<string, any>();
    for (const row of catalogRows || []) {
      catalogMap.set(row.condition_id, row);
    }

    // ========================================
    // STEP 3: Merge signals with catalog, compute margin, apply margin filter
    // ========================================
    const bestSignalPerMarket = new Map<string, any>();
    for (const signal of signals) {
      const catalog = catalogMap.get(signal.condition_id);
      if (!catalog) continue;

      const existing = bestSignalPerMarket.get(signal.condition_id);
      if (!existing || signal.confidence > existing.signal_confidence) {
        const sentiment = catalog.ai_sentiment?.toLowerCase();
        const opportunity = sentiment === 'bullish' ? 'BUY YES' : (sentiment === 'bearish' ? 'BUY NO' : null);

        const merged = {
          ...catalog,
          signal_type: signal.signal_type,
          signal_value: signal.signal_value,
          signal_confidence: signal.confidence,
          signal_expires_at: signal.expires_at,
          opportunity,
          risk_level: getRiskLevel(catalog),
          ai_confidence: signal.confidence,
        };

        // Compute profit margin
        merged.potential_margin = computeMargin(merged);

        bestSignalPerMarket.set(signal.condition_id, merged);
      }
    }

    // Filter: must have clear sentiment + meet margin threshold
    let markets = Array.from(bestSignalPerMarket.values())
      .filter(m => m.opportunity !== null)
      .filter(m => m.potential_margin >= minMargin);

    console.log(`[${AGENT_NAME}] Markets after sentiment + margin filter: ${markets.length}`);

    // ========================================
    // STEP 4: Sort based on sortBy parameter
    // ========================================
    // Resolve soft interest tags for tie-breaking (only if no hard category filter)
    const softInterest = !category ? (interest || (userContext.preferences.favorite_categories?.[0] ?? null)) : null;
    let interestTags: string[] = [];
    if (softInterest) {
      interestTags = resolveCategoryTags(softInterest).map(t => t.toLowerCase());
    }

    const watchlistSet = new Set(userContext.watchlist_condition_ids);
    const largePositionIds = new Set(
      userContext.recent_trades
        .filter(t => t.side === 'BUY' && t.amount >= 20)
        .map(t => t.condition_id)
    );

    markets.sort((a, b) => {
      // Always boost watchlisted markets
      const aWatched = watchlistSet.has(a.condition_id) ? 1 : 0;
      const bWatched = watchlistSet.has(b.condition_id) ? 1 : 0;
      if (aWatched !== bWatched) return bWatched - aWatched;

      // Deprioritize large existing positions
      const aLargePos = largePositionIds.has(a.condition_id) ? 1 : 0;
      const bLargePos = largePositionIds.has(b.condition_id) ? 1 : 0;
      if (aLargePos !== bLargePos) return aLargePos - bLargePos;

      // Primary sort by requested sortBy
      switch (sortBy) {
        case 'margin':
          return b.potential_margin - a.potential_margin;
        case 'volume':
          return Number(b.volume || 0) - Number(a.volume || 0);
        case 'end_date':
          return new Date(a.end_date).getTime() - new Date(b.end_date).getTime(); // soonest first
        case 'liquidity':
          return Number(b.liquidity || 0) - Number(a.liquidity || 0);
        case 'trending':
          // Trending + hot first, then by volume
          const aTrend = (a.is_trending ? 2 : 0) + (a.is_hot ? 1 : 0);
          const bTrend = (b.is_trending ? 2 : 0) + (b.is_hot ? 1 : 0);
          if (aTrend !== bTrend) return bTrend - aTrend;
          return Number(b.volume_24h || 0) - Number(a.volume_24h || 0);
        case 'newest':
          return new Date(b.start_date || b.created_at || 0).getTime() - new Date(a.start_date || a.created_at || 0).getTime();
        case 'confidence':
        default:
          // Soft category interest tie-breaking, then confidence
          if (interestTags.length > 0) {
            const aCats = (a.categories || []).map((c: string) => c.toLowerCase());
            const bCats = (b.categories || []).map((c: string) => c.toLowerCase());
            const aMatch = interestTags.some(t => aCats.includes(t));
            const bMatch = interestTags.some(t => bCats.includes(t));
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
          }
          return b.signal_confidence - a.signal_confidence;
      }
    });

    const totalQualifying = markets.length;

    // ========================================
    // STEP 5: Seen-opportunity filtering (prefer unseen)
    // ========================================
    const seenMap = new Map<string, RecommendationSnapshot>();
    if (user_address) {
      const { data: seenOpportunities, error: seenError } = await supabase
        .from("user_seen_opportunities")
        .select("market_id, recommendation_snapshot")
        .eq("user_address", user_address);

      if (seenError) {
        console.error("Error fetching seen opportunities:", seenError);
      }

      seenOpportunities?.forEach(seen => {
        seenMap.set(seen.market_id, seen.recommendation_snapshot as unknown as RecommendationSnapshot);
      });
    }

    // Partition into unseen and seen (unchanged)
    const unseen: any[] = [];
    const seenUnchanged: any[] = [];
    for (const market of markets) {
      const prev = seenMap.get(market.market_id);
      if (!prev) {
        unseen.push(market);
      } else {
        const current: RecommendationSnapshot = {
          opportunity: market.opportunity,
          yes_price: market.outcome_prices?.[0],
          no_price: market.outcome_prices?.[1],
          sentiment: market.ai_sentiment,
          confidence_score: Number(market.signal_confidence) / 100,
        };
        if (hasRecommendationChanged(prev, current)) {
          unseen.push(market); // Changed enough to show again
        } else {
          seenUnchanged.push(market);
        }
      }
    }

    // Prefer unseen, then fill with seen if needed
    const ranked = [...unseen, ...seenUnchanged];
    const paged = ranked.slice(offset, offset + resultLimit);

    console.log(`[${AGENT_NAME}] Returning ${paged.length} of ${totalQualifying} qualifying (${unseen.length} unseen)`);

    // Mark top result as seen
    const topResult = paged[0] || null;
    if (topResult && user_address) {
      const snapshot: RecommendationSnapshot = {
        opportunity: topResult.opportunity,
        yes_price: topResult.outcome_prices?.[0],
        no_price: topResult.outcome_prices?.[1],
        sentiment: topResult.ai_sentiment,
        confidence_score: Number(topResult.signal_confidence) / 100,
      };
      supabase
        .from("user_seen_opportunities")
        .upsert({
          user_address,
          market_id: topResult.market_id,
          recommendation_snapshot: snapshot as unknown as Json,
          seen_at: nowISO,
          updated_at: nowISO,
        }, { onConflict: 'user_address,market_id' })
        .then(({ error }) => {
          if (error) console.error("Error marking opportunity as seen:", error);
        });
    }

    // ========================================
    // STEP 6: Enrich with spot prices
    // ========================================
    let spotPriceMap = new Map<string, SpotPriceContext[]>();
    try {
      const marketsToEnrich = paged.map(m => ({ id: m.market_id, question: m.question }));
      spotPriceMap = await enrichMarketsWithSpotPrices(marketsToEnrich);
    } catch (err) {
      console.warn(`[${AGENT_NAME}] Spot price enrichment failed (non-fatal):`, err);
    }

    const enrichedDeals = paged.map(market => ({
      ...market,
      spot_price_context: spotPriceMap.get(market.market_id) || null,
    }));

    const enrichedSingle = enrichedDeals[0] || null;

    // ========================================
    // STEP 7: Return response
    // ========================================
    const analysisResult = {
      deals: enrichedSingle,
      all_deals: enrichedDeals,
      total_opportunities: totalQualifying,
      returned: enrichedDeals.length,
      filters_applied: buildFiltersApplied(body, minConfidence),
      offer_created_at: nowISO,
    };

    const responseMessage = totalQualifying === 0
      ? `No prediction markets match your filters. Try broadening: lower confidence, wider time window, or a different category.`
      : undefined;

    console.log(`[${AGENT_NAME}] Analysis completed — ${enrichedDeals.length} markets returned`);

    // Complete the job
    if (missionId && jobResult.taskId) {
      completeSingleAgentJob({ missionId, taskId: jobResult.taskId, submissionData: { totalOpportunities: totalQualifying, returned: enrichedDeals.length } }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      agentId: AGENT_ID,
      agentName: AGENT_NAME,
      missionId,
      data: analysisResult,
      ...(responseMessage ? { message: responseMessage } : {}),
    });

  } catch (error) {
    console.error(`[${AGENT_NAME}] Request error:`, error);
    return NextResponse.json(
      {
        error: 'Internal error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Health check and categories endpoint
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const fetchCategories = url.searchParams.get('categories') === 'true';

  if (fetchCategories) {
    if (categoriesCache.data && Date.now() - categoriesCache.ts < CATEGORIES_CACHE_TTL_MS) {
      return NextResponse.json({ ...categoriesCache.data, cached: true });
    }

    try {
      const now = new Date().toISOString();
      const { data: markets, error } = await supabase
        .from("market_catalog")
        .select("categories, ai_confidence, outcome_prices, ai_sentiment, favourite_outcome")
        .eq("is_active", true)
        .not("ai_confidence", "is", null)
        .gte("end_date", now);

      if (error) throw error;

      if (!markets || markets.length === 0) {
        return NextResponse.json({ categories: [], total_count: 0 });
      }

      const categoriesSet = new Set<string>();
      markets.forEach(market => {
        const hasOpp = checkIfOpportunityExists(market);
        if (hasOpp && market.categories && Array.isArray(market.categories)) {
          market.categories.forEach(cat => {
            if (cat && typeof cat === 'string') categoriesSet.add(cat);
          });
        }
      });

      const categories = Array.from(categoriesSet).sort();
      const responseData = { categories, total_count: categories.length };
      categoriesCache.data = responseData;
      categoriesCache.ts = Date.now();
      return NextResponse.json(responseData);
    } catch (error) {
      console.error("[Categories API] error", error);
      const defaultCategories = ['Sports', 'Trump', 'Stocks', 'Politics', 'Crypto', 'Business', 'Creators', 'AI'];
      const responseData = { categories: defaultCategories, total_count: defaultCategories.length, fallback: true };
      categoriesCache.data = responseData;
      categoriesCache.ts = Date.now();
      return NextResponse.json(responseData);
    }
  }

  return NextResponse.json({
    status: 'ok',
    agent: AGENT_NAME,
    agentId: AGENT_ID,
    erc8004AgentId: ERC8004_AGENT_ID,
    cdpWallet: CDP_WALLET,
    pricing: { perAnalysis: SERVICE_PRICE, currency: 'USDC', chainId: CHAIN_ID, token: PAYMENT_TOKEN },
    capabilities: [
      'prediction-market-analysis',
      'opportunity-detection',
      'risk-assessment',
      'sentiment-analysis',
      'price-gap-detection',
      'filter-rich-search',
    ],
    supportedPlatforms: ['Polymarket'],
    supportedFilters: [
      'category', 'minConfidence', 'riskAppetite', 'endsBefore', 'endsAfter', 'endsWithinDays',
      'minVolume', 'minVolume24h', 'minLiquidity', 'minMargin', 'sentiment',
      'trendingOnly', 'hotOnly', 'sortBy',
    ],
    sortOptions: ['confidence', 'volume', 'margin', 'end_date', 'liquidity', 'trending', 'newest'],
    officialRegistry: '0x8004AA63c570c570eBF15376c0dB199918BFe9Fb',
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// HELPERS
// ============================================

/** Resolve a category name to all matching tags (primary + children) */
function resolveCategoryTags(input: string): string[] {
  const lower = input.toLowerCase();
  const matched = CATEGORY_GROUPS.find(g =>
    g.key === lower ||
    g.label.toLowerCase() === lower ||
    g.primaryTag.toLowerCase() === lower
  );
  if (matched) {
    return [matched.primaryTag, ...matched.childTags];
  }
  // Check if input matches any child tag
  for (const group of CATEGORY_GROUPS) {
    if (group.childTags.some(t => t.toLowerCase() === lower)) {
      return [input]; // Use exact tag
    }
  }
  return [input];
}

function getRiskLevel(market: any): 'low' | 'medium' | 'high' {
  const confidence = Number(market.ai_confidence) / 100;
  const volume = market.volume;
  if (confidence > 0.75 && volume > 10000) return 'low';
  if (confidence > 0.6 && volume > 5000) return 'medium';
  return 'high';
}

function checkIfOpportunityExists(market: any, minConfidence: number = 0.5): boolean {
  const confidence = Number(market.ai_confidence) / 100;
  if (!market.ai_confidence || confidence < minConfidence) return false;
  if (!market.favourite_outcome) return false;
  return true;
}

function hasRecommendationChanged(
  previous: RecommendationSnapshot,
  current: RecommendationSnapshot
): boolean {
  if (previous.opportunity !== current.opportunity) return true;
  if (previous.sentiment !== current.sentiment) return true;
  if (Math.abs(previous.confidence_score - current.confidence_score) >= 0.15) return true;
  return false;
}

/** Build a summary of all filters applied for the response */
function buildFiltersApplied(body: PredictionMarketRequest, resolvedMinConfidence: number) {
  return {
    category: body.category || body.interest || 'all',
    minConfidence: resolvedMinConfidence,
    riskAppetite: body.riskAppetite || null,
    endsBefore: body.endsBefore || null,
    endsAfter: body.endsAfter || null,
    endsWithinDays: body.endsWithinDays || null,
    minVolume: body.minVolume || 0,
    minVolume24h: body.minVolume24h || 0,
    minLiquidity: body.minLiquidity || 0,
    minMargin: body.minMargin || 0,
    sentiment: body.sentiment || null,
    trendingOnly: body.trendingOnly || false,
    hotOnly: body.hotOnly || false,
    sortBy: body.sortBy || 'confidence',
    limit: Math.min(body.limit || MAX_RESULTS, 10),
    offset: body.offset || 0,
  };
}
