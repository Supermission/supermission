import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase/client';
import { fetchAllRows, backfillMissingMarkets } from '@/lib/admin/db';
import { computeTraderPnl, parseMarketInfo, getResolvedWinner, type Trade, type MarketInfo } from '@/lib/admin/pnl';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // Parallel fetch trades, market catalog, and user wallets.
    // fetchAllRows paginates past Supabase's 1000-row default limit.
    // Recent trades are derived from the full trade set (no separate query needed).
    const [
      rows,
      catalog,
      walletRows,
    ] = await Promise.all([
      fetchAllRows(
        'trade_history',
        'user_address, side, outcome, amount, price, shares, condition_id, order_id, created_at',
      ),
      fetchAllRows(
        'market_catalog',
        'condition_id, question, outcomes, outcome_prices, is_active, is_closed, volume, end_date',
      ),
      fetchAllRows('user_wallets', 'email, wallet_address'),
    ]);

    // Derive recent trades from the full set (sorted descending, take 100)
    const recentTrades = [...rows]
      .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 100);
    // Build email lookup: wallet_address → email
    const emailMap = new Map<string, string>();
    for (const w of walletRows) {
      if (w.wallet_address && w.email) {
        emailMap.set(w.wallet_address.toLowerCase(), w.email);
      }
    }

    // --- Trade aggregation (split by side) ---
    const uniqueTraders = new Set(rows.map((r: any) => r.user_address));
    const uniqueMarkets = new Set(rows.map((r: any) => r.condition_id));

    const buyRows = rows.filter((r: any) => r.side === 'BUY');
    const sellRows = rows.filter((r: any) => r.side === 'SELL');
    const redeemRows = rows.filter((r: any) => r.side === 'REDEEM');

    const buys = buyRows.length;
    const sells = sellRows.length;
    const redeems = redeemRows.length;

    // Trading volume = BUY + SELL only (excludes REDEEM payouts).
    // IMPORTANT: Internal sell trades store the share count in `amount`, NOT USDC.
    // Only sells with price > 0 (external/Polymarket) have real USDC amounts.
    const buyVolume = buyRows.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    const sellVolume = sellRows.reduce((s: number, r: any) => {
      const price = Number(r.price) || 0;
      if (price > 0) return s + (Number(r.amount) || 0); // real USDC
      return s; // internal sell — amount is share count, skip
    }, 0);
    const tradingVolume = buyVolume + sellVolume;
    // Redeem volume: normal redeems have real amount; legacy redeems (amount=0)
    // need market resolution data to determine if they were winners ($1/share) or losers ($0/share).
    // We compute this AFTER building the marketMap below; use a placeholder here.
    let redeemVolume = 0;
    // totalVolume is computed after redeemVolume is set (post-marketMap build)

    // Trades in last 24h and 7d
    const now = Date.now();
    const oneDayAgo = new Date(now - 86400000).toISOString();
    const oneWeekAgo = new Date(now - 7 * 86400000).toISOString();
    const trades24h = rows.filter((r: any) => r.created_at && r.created_at > oneDayAgo);
    const trades7d = rows.filter((r: any) => r.created_at && r.created_at > oneWeekAgo);
    // 24h/7d volumes — trading only (BUY+SELL), skipping internal sells (price=0)
    const tradingVolume24h = trades24h
      .filter((r: any) => r.side === 'BUY' || (r.side === 'SELL' && (Number(r.price) || 0) > 0))
      .reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    const tradingVolume7d = trades7d
      .filter((r: any) => r.side === 'BUY' || (r.side === 'SELL' && (Number(r.price) || 0) > 0))
      .reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    const traders24h = new Set(trades24h.map((r: any) => r.user_address)).size;

    // --- Platform-wide P&L ---
    const marketMap = new Map<string, MarketInfo>();
    for (const m of catalog) {
      const info = parseMarketInfo(m);
      marketMap.set(info.condition_id, info);
    }

    // Backfill markets missing from catalog by looking them up from Polymarket API.
    // Some traded condition_ids may not be in market_catalog (e.g. delisted or not yet synced).
    const tradedConditionIds = [...new Set(rows.map((r: any) => r.condition_id))];
    await backfillMissingMarkets(tradedConditionIds, marketMap);

    // Now compute redeem volume using market resolution data for legacy redeems
    redeemVolume = redeemRows.reduce((s: number, r: any) => {
      const amount = Number(r.amount) || 0;
      if (amount > 0) return s + amount;
      // Legacy redeem (amount=0): check market resolution to determine value
      const shares = Number(r.shares) || 0;
      const market = marketMap.get(r.condition_id);
      if (market) {
        const winner = getResolvedWinner(market);
        if (winner && (r.outcome || '').toLowerCase() === winner.toLowerCase()) {
          return s + shares; // winning redeem: $1/share
        }
        // Losing redeem or unresolved: $0 value
        return s;
      }
      // No market data: conservatively count as $0
      return s;
    }, 0);

    // Total volume includes everything for backwards compat
    const totalVolume = tradingVolume + redeemVolume;

    // Group all trades by user and compute platform-wide P&L
    const traderGrouped = new Map<string, any[]>();
    for (const t of rows) {
      const addr = t.user_address;
      if (!traderGrouped.has(addr)) traderGrouped.set(addr, []);
      traderGrouped.get(addr)!.push(t);
    }

    let platformRealizedPnl = 0;
    let platformUnrealizedPnl = 0;
    let platformTotalInvested = 0;
    for (const [, userTrades] of traderGrouped) {
      const pnl = computeTraderPnl(userTrades as Trade[], marketMap);
      platformRealizedPnl += pnl.realizedPnl;
      platformUnrealizedPnl += pnl.unrealizedPnl;
      platformTotalInvested += pnl.totalInvested;
    }
    const platformNetPnl = platformRealizedPnl + platformUnrealizedPnl;

    // --- Market catalog stats ---
    let activeMarkets = 0;
    let closedMarkets = 0;
    let resolvedMarkets = 0;
    const totalCatalogMarkets = catalog.length;

    // Trades per market (for top markets) — BUY+SELL volume only
    const tradesPerMarket = new Map<string, { count: number; volume: number; traders: Set<string> }>();
    for (const t of rows) {
      const cid = t.condition_id;
      if (!tradesPerMarket.has(cid)) {
        tradesPerMarket.set(cid, { count: 0, volume: 0, traders: new Set() });
      }
      const m = tradesPerMarket.get(cid)!;
      m.count++;
      if (t.side === 'BUY') {
        m.volume += Number(t.amount) || 0;
      } else if (t.side === 'SELL' && (Number(t.price) || 0) > 0) {
        m.volume += Number(t.amount) || 0; // only real USDC sells
      }
      m.traders.add(t.user_address);
    }

    // Build market list with enriched data
    const marketList = catalog.map((m: any) => {
      const outcomes: string[] = m.outcomes
        ? (typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes)
        : [];
      const prices: number[] = m.outcome_prices
        ? (typeof m.outcome_prices === 'string' ? JSON.parse(m.outcome_prices) : m.outcome_prices).map(Number)
        : [];

      const isActive = m.is_active && !m.is_closed;
      const isClosed = m.is_closed || false;
      let isResolved = false;

      if (isClosed && prices.length > 0) {
        const maxPrice = Math.max(...prices);
        if (maxPrice >= 0.95) isResolved = true;
      }

      if (isActive) activeMarkets++;
      if (isClosed) closedMarkets++;
      if (isResolved) resolvedMarkets++;

      const tradeData = tradesPerMarket.get(m.condition_id);

      return {
        conditionId: m.condition_id,
        question: m.question,
        outcomes,
        outcomePrices: prices,
        isActive,
        isClosed,
        isResolved,
        catalogVolume: Number(m.volume) || 0,
        platformVolume: tradeData?.volume || 0,
        platformTrades: tradeData?.count || 0,
        platformTraders: tradeData?.traders?.size || 0,
        endDate: m.end_date,
      };
    });

    // Top markets by platform volume
    const topMarkets = [...marketList]
      .filter((m: any) => m.platformTrades > 0)
      .sort((a: any, b: any) => b.platformVolume - a.platformVolume)
      .slice(0, 10);

    // Daily volume chart (last 30 days) — BUY+SELL only, skipping internal sells
    const volumeByDay = new Map<string, { volume: number; trades: number; buys: number; sells: number; redeems: number }>();
    for (const t of rows) {
      if (!t.created_at) continue;
      const day = new Date(t.created_at).toISOString().slice(0, 10);
      if (!volumeByDay.has(day)) volumeByDay.set(day, { volume: 0, trades: 0, buys: 0, sells: 0, redeems: 0 });
      const d = volumeByDay.get(day)!;
      d.trades++;
      if (t.side === 'BUY') {
        d.volume += Number(t.amount) || 0;
        d.buys++;
      } else if (t.side === 'SELL') {
        const price = Number(t.price) || 0;
        if (price > 0) d.volume += Number(t.amount) || 0; // only real USDC
        d.sells++;
      } else if (t.side === 'REDEEM') {
        d.redeems++;
      }
    }
    const dailyVolume = Array.from(volumeByDay.entries())
      .map(([date, d]) => ({ date, volume: Math.round(d.volume * 100) / 100, trades: d.trades, buys: d.buys, sells: d.sells, redeems: d.redeems }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    // Enrich recent trades with market questions and emails
    const catalogMap = new Map(catalog.map((m: any) => [m.condition_id, m.question]));
    const enrichedRecentTrades = recentTrades.map((t: any) => ({
      userAddress: t.user_address,
      email: emailMap.get(t.user_address?.toLowerCase()) || null,
      conditionId: t.condition_id,
      question: catalogMap.get(t.condition_id) || null,
      side: t.side,
      outcome: t.outcome,
      amount: Number(t.amount) || 0,
      price: Number(t.price) || 0,
      shares: Number(t.shares) || 0,
      orderId: t.order_id || null,
      createdAt: t.created_at,
    }));

    return NextResponse.json({
      totalTraders: uniqueTraders.size,
      totalTrades: rows.length,
      totalVolume,
      tradingVolume,
      buyVolume,
      sellVolume,
      redeemVolume,
      marketsTraded: uniqueMarkets.size,
      buys,
      sells,
      redeems,
      tradingVolume24h,
      tradingVolume7d,
      trades24h: trades24h.length,
      traders24h,
      // Platform-wide P&L
      platformPnl: {
        realizedPnl: Math.round(platformRealizedPnl * 100) / 100,
        unrealizedPnl: Math.round(platformUnrealizedPnl * 100) / 100,
        netPnl: Math.round(platformNetPnl * 100) / 100,
        totalInvested: Math.round(platformTotalInvested * 100) / 100,
      },
      // Market catalog stats
      marketStatus: {
        total: totalCatalogMarkets,
        active: activeMarkets,
        closed: closedMarkets,
        resolved: resolvedMarkets,
      },
      // Top markets by platform volume
      topMarkets,
      // Daily volume chart
      dailyVolume,
      // Recent trades feed
      recentTrades: enrichedRecentTrades,
      // Full market catalog for browsing
      marketCatalog: marketList,
    });
  } catch (err: any) {
    console.error('Admin overview error:', err);
    return NextResponse.json({ error: 'Failed to fetch overview' }, { status: 500 });
  }
}
