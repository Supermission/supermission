import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { fetchAllRows, backfillMissingMarkets } from '@/lib/admin/db';
import { computeTraderPnl, parseMarketInfo, getResolvedWinner, type Trade, type MarketInfo } from '@/lib/admin/pnl';

export interface TraderSummary {
  address: string;
  email: string | null;
  totalTrades: number;
  totalVolume: number;
  tradingVolume: number;
  buys: number;
  sells: number;
  redeems: number;
  totalRedeemed: number;
  marketsTraded: number;
  realizedPnl: number;
  unrealizedPnl: number;
  netPnl: number;
  roi: number;
  wins: number;
  losses: number;
  firstTrade: string;
  lastTrade: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '0', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const sortBy = searchParams.get('sort') || 'tradingVolume';
  const sortDir = searchParams.get('dir') || 'desc';
  const search = searchParams.get('search') || '';

  try {
    // Fetch all rows with pagination past Supabase's 1000-row default limit
    const [trades, markets, walletRows] = await Promise.all([
      fetchAllRows(
        'trade_history',
        'user_address, condition_id, side, outcome, amount, price, shares, created_at',
      ),
      fetchAllRows(
        'market_catalog',
        'condition_id, outcome_prices, outcomes, is_closed',
      ),
      fetchAllRows('user_wallets', 'email, wallet_address'),
    ]);

    // Build email lookup
    const emailMap = new Map<string, string>();
    for (const w of walletRows || []) {
      if (w.wallet_address && w.email) {
        emailMap.set(w.wallet_address.toLowerCase(), w.email);
      }
    }

    // Build market map using shared parser
    const marketMap = new Map<string, MarketInfo>();
    for (const m of markets) {
      const info = parseMarketInfo(m);
      marketMap.set(info.condition_id, info);
    }

    // Backfill markets missing from catalog via Polymarket API
    const tradedConditionIds = [...new Set(trades.map((t: any) => t.condition_id))];
    await backfillMissingMarkets(tradedConditionIds, marketMap);

    // Group trades by user
    const traderMap = new Map<string, any[]>();
    for (const t of trades) {
      const addr = t.user_address;
      if (!traderMap.has(addr)) traderMap.set(addr, []);
      traderMap.get(addr)!.push(t);
    }

    // Compute per-trader stats using shared P&L function
    const traders: TraderSummary[] = [];

    for (const [address, userTrades] of traderMap) {
      // Search by address OR email
      if (search) {
        const q = search.toLowerCase();
        const email = emailMap.get(address.toLowerCase()) || '';
        if (!address.toLowerCase().includes(q) && !email.toLowerCase().includes(q)) continue;
      }

      const buyTrades = userTrades.filter((t: any) => t.side === 'BUY');
      const sellTrades = userTrades.filter((t: any) => t.side === 'SELL');
      const redeemTrades = userTrades.filter((t: any) => t.side === 'REDEEM');

      // Trading volume = BUY + SELL only.
      // Internal sells have price=0 and amount=share count (not USDC) — skip those.
      const buyVol = buyTrades.reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
      const sellVol = sellTrades.reduce((s: number, t: any) => {
        const price = Number(t.price) || 0;
        if (price > 0) return s + (Number(t.amount) || 0);
        return s;
      }, 0);
      const tradingVolume = buyVol + sellVol;
      // Legacy redeems (amount=0, shares>0): use market resolution to determine value
      const totalRedeemed = redeemTrades.reduce((s: number, t: any) => {
        const amount = Number(t.amount) || 0;
        if (amount > 0) return s + amount;
        // Legacy redeem: check if winning outcome
        const shares = Number(t.shares) || 0;
        const market = marketMap.get(t.condition_id);
        if (market) {
          const winner = getResolvedWinner(market);
          if (winner && (t.outcome || '').toLowerCase() === winner.toLowerCase()) {
            return s + shares; // winning redeem: $1/share
          }
        }
        return s; // losing/unknown: $0
      }, 0);
      const totalVolume = tradingVolume + totalRedeemed;

      const marketsSet = new Set(userTrades.map((t: any) => t.condition_id));

      const dates = userTrades
        .map((t: any) => t.created_at)
        .filter(Boolean)
        .sort();

      // Use shared P&L calculation
      const pnl = computeTraderPnl(userTrades as Trade[], marketMap);

      traders.push({
        address,
        email: emailMap.get(address.toLowerCase()) || null,
        totalTrades: userTrades.length,
        totalVolume,
        tradingVolume,
        buys: buyTrades.length,
        sells: sellTrades.length,
        redeems: redeemTrades.length,
        totalRedeemed,
        marketsTraded: marketsSet.size,
        realizedPnl: pnl.realizedPnl,
        unrealizedPnl: pnl.unrealizedPnl,
        netPnl: pnl.netPnl,
        roi: pnl.roi,
        wins: pnl.wins,
        losses: pnl.losses,
        firstTrade: dates[0] || '',
        lastTrade: dates[dates.length - 1] || '',
      });
    }

    // Sort — handle legacy 'totalVolume' sort key
    const effectiveSortBy = sortBy === 'totalVolume' ? 'tradingVolume' : sortBy;
    traders.sort((a, b) => {
      const aVal = (a as any)[effectiveSortBy] ?? 0;
      const bVal = (b as any)[effectiveSortBy] ?? 0;
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    const total = traders.length;
    const paginated = traders.slice(page * limit, (page + 1) * limit);

    return NextResponse.json({ traders: paginated, total, page, limit });
  } catch (err: any) {
    console.error('Admin traders error:', err);
    return NextResponse.json({ error: 'Failed to fetch traders' }, { status: 500 });
  }
}
