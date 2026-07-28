import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase/client';
import { fetchUserTrades, fetchProfile } from '@/lib/polymarket/api';
import { computeTraderPnl, parseMarketInfo, getResolvedWinner, type Trade, type MarketInfo } from '@/lib/admin/pnl';
import { fetchAllRows, backfillMissingMarkets } from '@/lib/admin/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { address } = await params;

  try {
    // Fetch internal trades from our DB (paginated past 1000-row limit)
    const internalTrades = await fetchAllRows(
      'trade_history',
      '*',
      (q) => q.eq('user_address', address).order('created_at', { ascending: false }),
    );

    // Fetch market details for enrichment
    const conditionIds = [
      ...new Set(internalTrades.map((t: any) => t.condition_id)),
    ];
    const { data: markets } = await supabaseAdmin
      .from('market_catalog')
      .select('condition_id, question, outcome_prices, outcomes, is_closed')
      .in('condition_id', conditionIds.length > 0 ? conditionIds : ['__none__']);

    // Build market map using shared parser
    const marketMap = new Map<string, MarketInfo>();
    const marketQuestionMap = new Map<string, string>();
    for (const m of markets || []) {
      const info = parseMarketInfo(m);
      marketMap.set(info.condition_id, info);
      marketQuestionMap.set(m.condition_id, m.question);
    }

    // Enrich internal trades with market question
    const enrichedInternal = (internalTrades || []).map((t: any) => ({
      ...t,
      marketQuestion: marketQuestionMap.get(t.condition_id) || null,
      source: 'internal' as const,
    }));

    // Fetch external trades from Polymarket API
    let externalTrades: any[] = [];
    let polyProfile: any = null;

    try {
      const [extTrades, profile] = await Promise.all([
        fetchUserTrades(address),
        fetchProfile(address),
      ]);
      externalTrades = extTrades.map((t) => ({
        id: t.id,
        condition_id: t.conditionId,
        side: t.side,
        outcome: t.outcome,
        amount: t.usdcSize,
        price: t.price,
        shares: t.size,
        created_at: t.timestamp,
        marketQuestion: t.title || null,
        transactionHash: t.transactionHash,
        source: 'polymarket' as const,
      }));
      polyProfile = profile;
    } catch {
      // Polymarket API may fail for some addresses — not critical
    }

    // Deduplicate: remove external trades that exist internally (by tx hash or matching fields)
    const internalTxHashes = new Set(
      enrichedInternal
        .map((t: any) => t.order_id)
        .filter(Boolean)
    );
    const dedupedExternal = externalTrades.filter(
      (t) => !internalTxHashes.has(t.transactionHash) && !internalTxHashes.has(t.id)
    );

    // Use shared P&L calculation — with ALL trades (internal + external) for best accuracy.
    // External Polymarket trades have proper price data that corrects the legacy sell bug.
    // The table route uses internal-only (can't fetch external for every trader),
    // so there may be minor differences when legacy sells are involved.
    const allTrades = [...enrichedInternal, ...dedupedExternal];

    // Backfill markets missing from catalog (including those only in external trades)
    const allConditionIds = [...new Set(allTrades.map((t: any) => t.condition_id))];
    await backfillMissingMarkets(allConditionIds, marketMap);

    const pnl = computeTraderPnl(allTrades as Trade[], marketMap);

    // Build enriched positions with questions for the detail view
    const positionsWithQuestions = pnl.positions.map((pos) => ({
      ...pos,
      question: marketQuestionMap.get(pos.conditionId) || pos.conditionId,
    }));

    return NextResponse.json({
      address,
      polyProfile,
      internalTrades: enrichedInternal,
      externalTrades: dedupedExternal,
      positions: positionsWithQuestions,
      totalTrades: allTrades.length,
      totalVolume: allTrades.reduce((s: number, t: any) => {
        const amount = Number(t.amount) || 0;
        const price = Number(t.price) || 0;
        if (t.side === 'BUY') return s + amount;
        if (t.side === 'SELL') return s + (price > 0 ? amount : 0);
        if (t.side === 'REDEEM') {
          if (amount > 0) return s + amount;
          // Legacy redeem: use market resolution data
          const shares = Number(t.shares) || 0;
          const market = marketMap.get(t.condition_id);
          if (market) {
            const winner = getResolvedWinner(market);
            if (winner && (t.outcome || '').toLowerCase() === winner.toLowerCase()) {
              return s + shares;
            }
          }
          return s;
        }
        return s;
      }, 0),
      analytics: {
        totalRealizedPnl: pnl.realizedPnl,
        totalUnrealizedPnl: pnl.unrealizedPnl,
        netPnl: pnl.netPnl,
        totalInvested: pnl.totalInvested,
        roi: pnl.roi,
        wins: pnl.wins,
        losses: pnl.losses,
        openPositions: pnl.positions.filter(p => !p.isClosed && p.openShares > 0).length,
        resolvedPositions: pnl.positions.filter(p => p.isResolved).length,
      },
    });
  } catch (err: any) {
    console.error('Admin trader detail error:', err);
    return NextResponse.json({ error: 'Failed to fetch trader details' }, { status: 500 });
  }
}
