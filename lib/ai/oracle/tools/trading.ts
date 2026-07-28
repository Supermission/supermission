/**
 * Trading executors: prepare a single trade (resolve market + price +
 * outcome index), prepare a batch of trades (fans out to prepareTrade),
 * and prepare a sell of one/all open positions.
 */

import { getPolymarketPositionsResilient } from '@/lib/ai/oracle/positions-cache';
import { db } from './shared';

// ---------------------------------------------------------------------------
// prepare_trade
// ---------------------------------------------------------------------------

export async function prepareTrade(args: Record<string, unknown>) {
  const marketQuery = args.market_query as string;
  const side = args.side as 'YES' | 'NO';
  const amount = args.amount as number;

  if (!marketQuery || !side || !amount) {
    return { error: 'Missing required parameters: market_query, side, amount' };
  }

  // Try to resolve market — first as condition_id, then keyword search
  let market: any = null;

  // Try direct condition_id lookup
  const { data: directMatch } = await db
    .from('market_catalog')
    .select(
      'condition_id, question, outcome_prices, outcomes, clob_token_ids, slug, end_date, volume, liquidity'
    )
    .eq('condition_id', marketQuery)
    .single();

  if (directMatch) {
    market = directMatch;
  } else {
    // Fuzzy keyword search
    const { data: searchResults } = await db
      .from('market_catalog')
      .select(
        'condition_id, question, outcome_prices, outcomes, clob_token_ids, slug, end_date, volume, liquidity'
      )
      .ilike('question', `%${marketQuery}%`)
      .eq('is_active', true)
      .order('volume', { ascending: false })
      .limit(1);

    market = searchResults?.[0];
  }

  if (!market) {
    return { error: `No market found matching "${marketQuery}"` };
  }

  // Resolve outcomeIndex from outcomes array when available (reliable for non-YES/NO markets)
  const outcomes: string[] = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : (market.outcomes || []);
  let outcomeIndex = side === 'YES' ? 0 : 1;
  if (outcomes.length >= 2) {
    const idx = outcomes.findIndex((o: string) => o.toLowerCase() === side.toLowerCase());
    if (idx !== -1) outcomeIndex = idx;
  }
  const prices = typeof market.outcome_prices === 'string'
    ? JSON.parse(market.outcome_prices)
    : market.outcome_prices;
  const tokenIds = typeof market.clob_token_ids === 'string'
    ? JSON.parse(market.clob_token_ids)
    : market.clob_token_ids;
  const price = prices?.[outcomeIndex];
  const tokenId = tokenIds?.[outcomeIndex];

  if (!price || !tokenId) {
    return { error: 'Market data incomplete: missing price or token ID' };
  }

  const expectedShares = amount / price;

  return {
    market: {
      condition_id: market.condition_id,
      question: market.question,
      slug: market.slug,
      end_date: market.end_date,
      volume: market.volume,
      liquidity: market.liquidity,
    },
    trade: {
      side: outcomes[outcomeIndex] || side,
      outcome: outcomes[outcomeIndex] || side,
      amount,
      price,
      tokenId,
      expectedShares,
    },
  };
}

// ---------------------------------------------------------------------------
// prepare_batch_trade
// ---------------------------------------------------------------------------

export async function prepareBatchTrade(args: Record<string, unknown>) {
  const trades = args.trades as Array<{ market_query: string; side: 'YES' | 'NO'; amount: number }>;

  if (!trades || !Array.isArray(trades) || trades.length === 0) {
    return { error: 'Missing required parameter: trades (array of {market_query, side, amount})' };
  }

  if (trades.length > 10) {
    return { error: 'Maximum 10 trades per batch' };
  }

  // Resolve all trades in parallel — each prepareTrade does an independent DB
  // lookup, so sequential execution wastes ~90% of the latency on a 10-trade batch.
  const settled = await Promise.all(
    trades.map((t) =>
      prepareTrade({ market_query: t.market_query, side: t.side, amount: t.amount })
        .then((result) => ({ query: t.market_query, result }))
        .catch((err: any) => ({ query: t.market_query, result: { error: err?.message || 'Prepare failed' } })),
    ),
  );

  const results: any[] = [];
  const errors: string[] = [];
  for (const { query, result } of settled) {
    if (result && typeof result === 'object' && 'error' in result) {
      errors.push(`${query}: ${(result as any).error}`);
    } else {
      results.push(result);
    }
  }

  if (results.length === 0) {
    return { error: `All trades failed to prepare: ${errors.join('; ')}` };
  }

  return {
    trades: results,
    totalAmount: results.reduce((sum, r) => sum + r.trade.amount, 0),
    count: results.length,
    ...(errors.length > 0 ? { warnings: errors } : {}),
  };
}

// ---------------------------------------------------------------------------
// prepare_sell
// ---------------------------------------------------------------------------

export async function prepareSell(args: Record<string, unknown>, walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'No wallet connected. Connect your wallet to sell positions.' };
  }

  const marketQuery = args.market_query as string | undefined;
  const sellAll = args.sell_all as boolean | undefined;

  if (!marketQuery && !sellAll) return { error: 'Provide market_query or set sell_all=true' };

  try {
    // Fetch user positions from Polymarket (cached 10s + shared with get_my_positions).
    // Uses the resilient path — if Polymarket is down, serves last-known-good up
    // to 5min old. We refuse to prepare a sell from stale data because prices
    // may have moved materially; the UI will surface a friendlier retry prompt.
    let positions: any[];
    try {
      const result = await getPolymarketPositionsResilient(walletAddress);
      if (result.stale) {
        const ageSec = result.staleSince ? Math.round((Date.now() - result.staleSince) / 1000) : null;
        return {
          error: ageSec
            ? `Live position data is unavailable right now (last update ${ageSec}s ago). Try again in a moment before selling — prices may have moved.`
            : 'Live position data is unavailable right now. Try again in a moment before selling.',
        };
      }
      positions = result.positions;
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError' || /abort/i.test(err?.message || '');
      const isCircuitOpen = /circuit open/i.test(err?.message || '');
      return {
        error: isCircuitOpen
          ? 'Live positions feed is temporarily down — retry in 30 seconds.'
          : isTimeout
          ? 'Positions lookup is slow right now — try again in a moment.'
          : 'Failed to fetch positions',
      };
    }
    if (!positions?.length) return { error: 'You have no open positions' };

    // Filter to positions with actual shares
    const activePositions = positions.filter((p: any) => parseFloat(p.size || '0') > 0);
    if (!activePositions.length) return { error: 'No active positions with shares to sell' };

    // Collect condition IDs and fetch market catalog for enrichment
    const conditionIds = [...new Set(activePositions.map((p: any) => p.asset?.condition_id || p.conditionId).filter(Boolean))];
    let marketMap: Record<string, any> = {};
    if (conditionIds.length > 0) {
      const { data: markets } = await db
        .from('market_catalog')
        .select('condition_id, question, outcome_prices, slug, clob_token_ids, end_date, outcomes')
        .in('condition_id', conditionIds);
      if (markets) {
        marketMap = Object.fromEntries(markets.map((m: any) => [m.condition_id, m]));
      }
    }

    // Helper to build sell data for a position
    const buildSellData = (pos: any) => {
      const condId = pos.asset?.condition_id || pos.conditionId;
      const market = marketMap[condId];
      const size = parseFloat(pos.size || '0');
      let outcome = pos.asset?.outcome || pos.outcome || 'YES';
      const tokenId = pos.asset?.token_id || '';
      const sellTokenIds = typeof market?.clob_token_ids === 'string'
        ? JSON.parse(market.clob_token_ids)
        : market?.clob_token_ids;
      const sellPrices = typeof market?.outcome_prices === 'string'
        ? JSON.parse(market.outcome_prices)
        : market?.outcome_prices;
      // Resolve outcomeIndex from token_id position in clob_token_ids (reliable for non-YES/NO markets)
      let outcomeIndex = outcome.toLowerCase() === 'no' ? 1 : 0;
      if (Array.isArray(sellTokenIds) && sellTokenIds.length >= 2 && tokenId) {
        const tokenIdx = sellTokenIds.indexOf(tokenId);
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
      const finalTokenId = tokenId || sellTokenIds?.[outcomeIndex];
      const curPrice = sellPrices?.[outcomeIndex] ?? parseFloat(pos.avgPrice || '0');
      const avgPrice = parseFloat(pos.avgPrice || '0');
      const currentValue = size * curPrice;
      const costBasis = size * avgPrice;
      const pnl = currentValue - costBasis;

      return {
        market: {
          condition_id: condId,
          question: market?.question || pos.title || 'Unknown market',
          slug: market?.slug,
          end_date: market?.end_date,
        },
        sell: {
          outcome,
          size,
          tokenId: finalTokenId,
          currentPrice: curPrice,
          avgPrice,
          currentValue,
          costBasis,
          pnl,
          negativeRisk: pos.asset?.neg_risk ?? pos.negativeRisk ?? false,
        },
      };
    };

    // sell_all: return all positions
    if (sellAll) {
      const sells = activePositions.map(buildSellData);
      return { sells, count: sells.length };
    }

    // Single position: find by condition_id or keyword
    const query = (marketQuery || '').toLowerCase();
    let matchPos: any = null;

    for (const pos of activePositions) {
      const condId = pos.asset?.condition_id || pos.conditionId;
      const market = marketMap[condId];
      if (condId === marketQuery) {
        matchPos = pos;
        break;
      }
      if (market?.question?.toLowerCase().includes(query)) {
        matchPos = pos;
        break;
      }
    }

    if (!matchPos) return { error: `No position found matching "${marketQuery}"` };

    return buildSellData(matchPos);
  } catch (err: any) {
    return { error: err.message || 'Failed to prepare sell' };
  }
}
