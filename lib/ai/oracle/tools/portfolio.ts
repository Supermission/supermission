/**
 * Portfolio executors: user's current positions (with live Polymarket P&L),
 * Supermission trade history, and user watchlist enrichment.
 */

import { getPolymarketPositionsResilient } from '@/lib/ai/oracle/positions-cache';
import { db } from './shared';

// ---------------------------------------------------------------------------
// get_my_positions
// ---------------------------------------------------------------------------

export async function getMyPositions(walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'No wallet connected. Connect your wallet to view positions.' };
  }

  try {
    let rawPositions: any[];
    let stale = false;
    let staleSince: number | undefined;
    let cacheHit = false;
    try {
      const result = await getPolymarketPositionsResilient(walletAddress);
      rawPositions = result.positions;
      stale = result.stale;
      staleSince = result.staleSince;
      cacheHit = result.cacheHit;
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError' || /abort/i.test(err?.message || '');
      const isCircuitOpen = /circuit open/i.test(err?.message || '');
      return {
        error: isCircuitOpen
          ? 'Live positions feed is temporarily down — retry in 30 seconds.'
          : isTimeout
          ? 'Positions lookup is slow right now — try again in a moment.'
          : 'Unable to fetch positions at the moment. Please try again later.',
        positions: [],
      };
    }
    if (!rawPositions?.length) {
      return {
        positions: [],
        count: 0,
        totalValue: 0,
        stale,
        staleSince,
        _telemetry: { positions_cache_hit: cacheHit, stale_positions: stale },
      };
    }

    // Collect condition IDs to enrich with market_catalog data
    const conditionIds = [...new Set(rawPositions.map((p: any) => p.asset?.condition_id || p.conditionId).filter(Boolean))];

    // Fetch market info from catalog
    let marketMap: Record<string, any> = {};
    if (conditionIds.length > 0) {
      const { data: markets } = await db
        .from('market_catalog')
        .select('condition_id, question, outcome_prices, clob_token_ids, slug, ai_sentiment, ai_confidence, favourite_outcome, outcomes')
        .in('condition_id', conditionIds);

      if (markets) {
        marketMap = Object.fromEntries(markets.map((m: any) => [m.condition_id, m]));
      }
    }

    const positions = rawPositions.map((p: any) => {
      const conditionId = p.asset?.condition_id || p.conditionId;
      const market = marketMap[conditionId];
      const tokenId = p.asset?.token_id || p.asset || '';
      const size = parseFloat(p.size || '0');
      const avgPrice = parseFloat(p.avgPrice || '0');
      let outcome = p.asset?.outcome || p.outcome || 'YES';
      // Resolve outcomeIndex from token_id position in clob_token_ids (reliable for IPL/non-YES-NO markets)
      const clobTokenIds: string[] = market?.clob_token_ids || [];
      let outcomeIndex = outcome.toLowerCase() === 'no' ? 1 : 0;
      if (clobTokenIds.length >= 2 && tokenId) {
        const tokenIdx = clobTokenIds.indexOf(tokenId);
        if (tokenIdx !== -1) outcomeIndex = tokenIdx;
      }
      // Resolve actual outcome name for multi-outcome markets
      const marketOutcomes: string[] = market?.outcomes || [];
      if (marketOutcomes.length > 0 && outcomeIndex < marketOutcomes.length) {
        const resolvedOutcome = marketOutcomes[outcomeIndex];
        if (resolvedOutcome && resolvedOutcome.toLowerCase() !== 'yes' && resolvedOutcome.toLowerCase() !== 'no') {
          outcome = resolvedOutcome;
        }
      }
      // Prefer live curPrice from Polymarket Data API; fall back to catalog prices
      const apiCurPrice = parseFloat(p.curPrice || '0');
      const posOp = typeof market?.outcome_prices === 'string' ? JSON.parse(market.outcome_prices) : market?.outcome_prices;
      const curPrice = apiCurPrice > 0 ? apiCurPrice : (posOp?.[outcomeIndex] ?? avgPrice);
      const currentValue = size * curPrice;
      const costBasis = size * avgPrice;
      const cashPnl = currentValue - costBasis;
      const percentPnl = costBasis > 0 ? (cashPnl / costBasis) * 100 : 0;

      return {
        condition_id: conditionId,
        question: market?.question || p.title || 'Unknown market',
        outcome,
        size,
        avgPrice,
        curPrice,
        currentValue,
        cashPnl,
        percentPnl,
        slug: market?.slug,
        ai_sentiment: market?.ai_sentiment,
        ai_confidence: market?.ai_confidence,
        favourite_outcome: market?.favourite_outcome,
      };
    });

    const totalValue = positions.reduce((sum: number, p: any) => sum + p.currentValue, 0);

    return {
      count: positions.length,
      totalValue,
      positions,
      stale,
      staleSince,
      _telemetry: { positions_cache_hit: cacheHit, stale_positions: stale },
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch positions', positions: [] };
  }
}

// ---------------------------------------------------------------------------
// get_trade_history
// ---------------------------------------------------------------------------

export async function getTradeHistory(walletAddress: string | null, args: Record<string, unknown>) {
  if (!walletAddress) {
    return { error: 'No wallet connected.' };
  }

  const limit = Math.min((args.limit as number) || 10, 50);

  // Fetch from our trade_history table (records trades made through our platform)
  const { data, error } = await db
    .from('trade_history')
    .select('condition_id, side, outcome, amount, price, shares, created_at, status')
    // Rows are stored lowercased (see user-context.ts); Privy sends checksummed
    // addresses, so match lowercase or history always comes back empty.
    .eq('user_address', walletAddress.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { error: error.message, trades: [] };
  if (!data?.length) return { trades: [], count: 0 };

  // Enrich with market questions
  const conditionIds = [...new Set((data as any[]).map((t: any) => t.condition_id).filter(Boolean))];
  let marketMap: Record<string, any> = {};
  if (conditionIds.length > 0) {
    const { data: markets } = await db
      .from('market_catalog')
      .select('condition_id, question')
      .in('condition_id', conditionIds);
    if (markets) {
      marketMap = Object.fromEntries(markets.map((m: any) => [m.condition_id, m]));
    }
  }

  const trades = (data as any[]).map((t: any) => ({
    question: marketMap[t.condition_id]?.question || 'Unknown market',
    side: t.side,
    outcome: t.outcome,
    amount: t.amount,
    price: t.price,
    shares: t.shares,
    timestamp: t.created_at,
    status: t.status,
  }));

  return { count: trades.length, trades };
}

// ---------------------------------------------------------------------------
// get_watchlist
// ---------------------------------------------------------------------------

export async function getWatchlist(walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'No wallet connected.' };
  }

  const { data: watchlistRows, error } = await db
    .from('user_watchlists')
    .select('condition_id')
    .eq('user_address', walletAddress.toLowerCase())
    .limit(50);

  if (error) return { error: error.message, markets: [] };
  if (!watchlistRows?.length) return { markets: [], count: 0 };

  const conditionIds = watchlistRows.map((w: any) => w.condition_id);

  const { data: markets } = await db
    .from('market_catalog')
    .select(
      'condition_id, question, outcome_prices, volume, volume_24h, liquidity, categories, end_date, slug, is_trending'
    )
    .in('condition_id', conditionIds);

  return {
    count: (markets || []).length,
    markets: (markets || []).map((m: any) => {
      const wop = typeof m.outcome_prices === 'string' ? JSON.parse(m.outcome_prices) : m.outcome_prices;
      return {
      condition_id: m.condition_id,
      question: m.question,
      yes_price: wop?.[0],
      no_price: wop?.[1],
      volume: m.volume,
      volume_24h: m.volume_24h,
      liquidity: m.liquidity,
      categories: m.categories,
      end_date: m.end_date,
      slug: m.slug,
      is_trending: m.is_trending,
    };
    }),
  };
}
