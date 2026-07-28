import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

interface TradeRow {
  id: string;
  condition_id: string;
  token_id: string;
  side: 'BUY' | 'SELL' | 'REDEEM';
  outcome: string;
  amount: number;
  price: number;
  shares: number;
  status: string;
  created_at: string;
  market_question: string;
  order_id: string;
  event_slug: string;
}

/**
 * Compute combined PnL (realized + unrealized) for a time window.
 */
function computePeriodPnl(
  allTrades: TradeRow[],
  sinceMs: number,
  currentPriceMap: Map<string, number>,
  activePositionKeys: Set<string>,
): number {
  // Build avg buy price per position from ALL trades (for realized PnL calc)
  const buyMap = new Map<string, { totalCost: number; totalShares: number }>();
  for (const t of allTrades) {
    if (t.side !== 'BUY') continue;
    const key = `${t.condition_id}:${t.outcome}`;
    const existing = buyMap.get(key) || { totalCost: 0, totalShares: 0 };
    existing.totalCost += t.amount;
    existing.totalShares += t.shares;
    buyMap.set(key, existing);
  }

  let pnl = 0;

  // 1. Realized PnL: from sells/redeems in the period
  for (const t of allTrades) {
    if (t.side === 'BUY') continue;
    const tradeTime = new Date(t.created_at).getTime();
    if (isNaN(tradeTime) || tradeTime < sinceMs) continue;

    const key = `${t.condition_id}:${t.outcome}`;
    const buyInfo = buyMap.get(key);
    if (!buyInfo || buyInfo.totalShares <= 0) continue;

    const avgBuyPrice = buyInfo.totalCost / buyInfo.totalShares;
    // For redeems: use actual recorded price/amount. Don't assume $1.00 for legacy redeems with price=0.
    const sellPrice = t.side === 'REDEEM'
      ? (t.price > 0 ? t.price : (t.amount > 0 && t.shares > 0 ? t.amount / t.shares : 0))
      : (t.shares > 0 ? t.amount / t.shares : 0);
    pnl += (sellPrice - avgBuyPrice) * t.shares;
  }

  // 2. Unrealized PnL: for ALL active positions (not just period buys)
  // Without a portfolio snapshot we can't know prices at period start,
  // so we use (currentPrice - avgBuyPrice) for every open position.
  // This is exact for all-time and a good approximation for shorter periods.
  const totalSellMap = new Map<string, number>();
  for (const t of allTrades) {
    if (t.side === 'BUY') continue;
    const key = `${t.condition_id}:${t.outcome}`;
    totalSellMap.set(key, (totalSellMap.get(key) || 0) + t.shares);
  }

  for (const [key, buy] of buyMap) {
    if (!activePositionKeys.has(key)) continue;
    const totalSold = totalSellMap.get(key) || 0;
    const openShares = Math.max(0, buy.totalShares - totalSold);
    if (openShares <= 0) continue;

    const avgBuyPrice = buy.totalCost / buy.totalShares;
    const curPrice = currentPriceMap.get(key) ?? avgBuyPrice;
    pnl += (curPrice - avgBuyPrice) * openShares;
  }

  return Math.round(pnl * 100) / 100;
}


/**
 * GET /api/trades/history — Single source of truth: Supabase trade_history only.
 */
export async function GET(request: NextRequest) {
  try {
    const address = request.headers.get('x-verified-wallet')?.split(',')[0];
    if (!address) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const sideFilter = searchParams.get('side')?.toUpperCase() as 'BUY' | 'SELL' | 'REDEEM' | null;

    // 1. Fetch all trades from Supabase + live positions for PnL in parallel
    const [allTradesResult, positionsRes] = await Promise.all([
      supabaseAdmin
        .from('trade_history')
        .select('id, condition_id, token_id, side, outcome, amount, price, shares, order_id, created_at, status, market_question')
        .eq('user_address', address.toLowerCase())
        .order('created_at', { ascending: false }),
      fetch(`https://data-api.polymarket.com/positions?user=${address}`, {
        signal: AbortSignal.timeout(10_000),
      }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);

    if (allTradesResult.error) {
      console.error('[/api/trades/history] Supabase error:', allTradesResult.error);
      return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
    }

    // 2. Normalize trades
    const allTrades: TradeRow[] = (allTradesResult.data || []).map((t: any) => ({
      id: t.id,
      condition_id: t.condition_id,
      token_id: t.token_id || '',
      side: t.side as 'BUY' | 'SELL' | 'REDEEM',
      outcome: t.outcome || '',
      amount: Number(t.amount) || 0,
      price: Number(t.price) || 0,
      shares: Number(t.shares) || 0,
      status: t.status || 'completed',
      created_at: t.created_at,
      market_question: t.market_question || '',
      order_id: t.order_id || '',
      event_slug: '',
    }));

    // 3. Enrich trades missing market_question AND resolve actual outcome names
    // For multi-outcome markets (e.g. IPL), outcomes are team names not "Yes"/"No",
    // but trades may be recorded with "Yes"/"No" from Polymarket position data.
    // Resolve actual names via token_id → clob_token_ids index → outcomes[index].
    const allConditionIds = [...new Set(allTrades.map(t => t.condition_id))];

    if (allConditionIds.length > 0) {
      const { data: markets } = await supabaseAdmin
        .from('market_catalog')
        .select('condition_id, question, outcomes, clob_token_ids, event_slug')
        .in('condition_id', allConditionIds);

      if (markets?.length) {
        const marketMap = new Map(markets.map((m: any) => [m.condition_id, m]));
        for (const t of allTrades) {
          const market = marketMap.get(t.condition_id);
          if (!market) continue;

          // Enrich missing market_question and event_slug
          if (!t.market_question || t.market_question === 'Prediction Market') {
            t.market_question = market.question || '';
          }
          t.event_slug = market.event_slug || '';

          // Resolve actual outcome name for multi-outcome markets
          // If market outcomes are not just ["Yes","No"], resolve via token_id
          const outcomes: string[] = market.outcomes || [];
          const clobTokenIds: string[] = market.clob_token_ids || [];
          const isMultiOutcome = outcomes.length > 0 && !outcomes.every(
            (o: string) => o.toLowerCase() === 'yes' || o.toLowerCase() === 'no'
          );

          if (isMultiOutcome && t.token_id && clobTokenIds.length > 0) {
            const tokenIdx = clobTokenIds.indexOf(t.token_id);
            if (tokenIdx !== -1 && outcomes[tokenIdx]) {
              t.outcome = outcomes[tokenIdx];
            }
          }
        }
      }
    }

    // 4. Build active position keys from Polymarket positions
    const activePositionKeys = new Set<string>();
    for (const p of positionsRes || []) {
      const condId = p.asset?.condition_id || p.conditionId || '';
      const outcome = p.asset?.outcome || p.outcome || 'Yes';
      const size = typeof p.size === 'string' ? parseFloat(p.size) : (p.size || 0);
      if (condId && size > 0) {
        activePositionKeys.add(`${condId}:${outcome}`);
      }
    }

    // 5. Compute stats from ALL trades
    const totalVolume = allTrades.reduce((sum, t) => sum + t.amount, 0);
    const buys = allTrades.filter(t => t.side === 'BUY').length;
    const sells = allTrades.filter(t => t.side === 'SELL').length;
    const redeems = allTrades.filter(t => t.side === 'REDEEM').length;

    const totalBuyCost = allTrades
      .filter(t => t.side === 'BUY')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalSellRedeemRevenue = allTrades
      .filter(t => t.side === 'SELL' || t.side === 'REDEEM')
      .reduce((sum, t) => sum + t.amount, 0);

    // 6. Apply side filter
    let filteredTrades = allTrades;
    if (sideFilter) {
      filteredTrades = allTrades.filter(t => t.side === sideFilter);
    }
    const total = filteredTrades.length;

    // 7. Win rate from fully-closed positions
    const positionMap = new Map<string, { buyCost: number; buyShares: number; sellRevenue: number; sellShares: number }>();
    for (const t of allTrades) {
      const key = `${t.condition_id}:${t.outcome}`;
      const pos = positionMap.get(key) || { buyCost: 0, buyShares: 0, sellRevenue: 0, sellShares: 0 };
      if (t.side === 'BUY') {
        pos.buyCost += t.amount;
        pos.buyShares += t.shares;
      } else {
        pos.sellRevenue += t.amount;
        pos.sellShares += t.shares;
      }
      positionMap.set(key, pos);
    }

    let totalWins = 0;
    let totalLosses = 0;
    for (const [key, pos] of positionMap) {
      if (pos.buyShares <= 0) continue;
      if (activePositionKeys.has(key)) continue;

      if (pos.sellShares > 0) {
        const avgBuy = pos.buyCost / pos.buyShares;
        const avgSell = pos.sellRevenue / pos.sellShares;
        if (avgSell > avgBuy) totalWins++;
        else totalLosses++;
      } else {
        totalLosses++;
      }
    }

    const winRate = (totalWins + totalLosses) > 0
      ? Math.round((totalWins / (totalWins + totalLosses)) * 100)
      : 0;

    // 8. All-time P&L
    let currentPortfolioValue = 0;
    for (const p of positionsRes || []) {
      const size = typeof p.size === 'string' ? parseFloat(p.size) : (p.size || 0);
      const curPrice = typeof p.curPrice === 'string' ? parseFloat(p.curPrice) : (p.curPrice || 0);
      if (size > 0) {
        currentPortfolioValue += size * curPrice;
      }
    }
    const allTimePnl = Math.round((currentPortfolioValue + totalSellRedeemRevenue - totalBuyCost) * 100) / 100;

    // 9. Period PnL — use portfolio snapshots when available, fallback to trade-activity method
    const now = Date.now();
    const earliestTradeMs = allTrades.length > 0
      ? allTrades.reduce((min, t) => {
          const ms = new Date(t.created_at).getTime();
          return Math.min(min, isNaN(ms) ? now : ms);
        }, Infinity)
      : now;

    const currentPriceMap = new Map<string, number>();
    for (const p of positionsRes || []) {
      const condId = p.asset?.condition_id || p.conditionId || '';
      const outcome = p.asset?.outcome || p.outcome || 'Yes';
      const curPrice = typeof p.curPrice === 'string' ? parseFloat(p.curPrice) : (p.curPrice || 0);
      if (condId && curPrice > 0) {
        currentPriceMap.set(`${condId}:${outcome}`, curPrice);
      }
    }
    for (const t of allTrades) {
      const key = `${t.condition_id}:${t.outcome}`;
      if (!currentPriceMap.has(key)) {
        currentPriceMap.set(key, t.price > 0 ? t.price : (t.shares > 0 ? t.amount / t.shares : 0));
      }
    }

    const periods = {
      day: now - 24 * 60 * 60 * 1000,
      week: now - 7 * 24 * 60 * 60 * 1000,
      month: now - 30 * 24 * 60 * 60 * 1000,
      year: now - 365 * 24 * 60 * 60 * 1000,
    };

    // Fetch portfolio snapshots for snapshot-based period PnL
    const snapshotDates = {
      day: new Date(periods.day).toISOString().slice(0, 10),
      week: new Date(periods.week).toISOString().slice(0, 10),
      month: new Date(periods.month).toISOString().slice(0, 10),
      year: new Date(periods.year).toISOString().slice(0, 10),
    };
    const { data: snapshots } = await supabaseAdmin
      .from('portfolio_snapshots')
      .select('snapshot_date, total_value')
      .eq('user_address', address.toLowerCase())
      .in('snapshot_date', Object.values(snapshotDates))
      .order('snapshot_date', { ascending: false });

    const snapshotMap = new Map<string, number>();
    for (const s of snapshots || []) {
      snapshotMap.set(s.snapshot_date, Number(s.total_value) || 0);
    }

    /**
     * Snapshot-based period PnL:
     *   periodPnl = (currentPortfolioValue - snapshotValue) + (sellRedeemRevenue - buyCost)
     *
     * Trades are filtered since the snapshot's midnight UTC (not sinceMs),
     * because the snapshot captures portfolio state at that exact time.
     */
    function computeSnapshotPnl(snapshotValue: number, snapshotDate: string): number {
      const snapshotMs = new Date(snapshotDate + 'T00:00:00Z').getTime();
      let buyCostSinceSnapshot = 0;
      let sellRedeemSinceSnapshot = 0;
      for (const t of allTrades) {
        const tradeTime = new Date(t.created_at).getTime();
        if (isNaN(tradeTime) || tradeTime < snapshotMs) continue;
        if (t.side === 'BUY') {
          buyCostSinceSnapshot += t.amount;
        } else {
          sellRedeemSinceSnapshot += t.amount;
        }
      }
      return Math.round(((currentPortfolioValue - snapshotValue) + (sellRedeemSinceSnapshot - buyCostSinceSnapshot)) * 100) / 100;
    }

    const periodPnl: Record<string, number> = {};
    for (const [period, sinceMs] of Object.entries(periods)) {
      if (earliestTradeMs >= sinceMs) {
        // All trades are within this period — period PnL equals all-time PnL
        periodPnl[period] = allTimePnl;
      } else {
        const snapshotDate = snapshotDates[period as keyof typeof snapshotDates];
        const snapshotValue = snapshotMap.get(snapshotDate);
        if (snapshotValue !== undefined) {
          // Use snapshot-based calculation (accurate: captures unrealized value changes)
          periodPnl[period] = computeSnapshotPnl(snapshotValue, snapshotDate);
        } else {
          // Fallback to trade-activity method (no snapshot available yet)
          periodPnl[period] = computePeriodPnl(allTrades, sinceMs, currentPriceMap, activePositionKeys);
        }
      }
    };

    const stats = {
      totalTrades: allTrades.length,
      totalVolume: Math.round(totalVolume * 100) / 100,
      buys,
      sells,
      redeems,
      winRate,
      periodPnl,
      totalBuyCost: Math.round(totalBuyCost * 100) / 100,
      totalSellRedeemRevenue: Math.round(totalSellRedeemRevenue * 100) / 100,
      allTimePnl,
      currentPortfolioValue: Math.round(currentPortfolioValue * 100) / 100,
    };

    // 10. Paginate
    const paginatedTrades = filteredTrades.slice(offset, offset + limit);

    // Map to response format (market_question → marketQuestion for frontend compat)
    const responseTrades = paginatedTrades.map(t => ({
      id: t.id,
      condition_id: t.condition_id,
      token_id: t.token_id,
      side: t.side,
      outcome: t.outcome,
      amount: t.amount,
      price: t.price,
      shares: t.shares,
      status: t.status,
      created_at: t.created_at,
      marketQuestion: t.market_question,
      transactionHash: t.order_id,
      event_slug: t.event_slug,
    }));

    return NextResponse.json({ trades: responseTrades, total, stats });
  } catch (err) {
    console.error('[/api/trades/history] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
