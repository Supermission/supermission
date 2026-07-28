import { NextRequest, NextResponse } from 'next/server';

const DATA_API = 'https://data-api.polymarket.com';

interface ActivityRecord {
  timestamp: number;   // Unix epoch SECONDS
  type: string;        // TRADE, REDEEM, BUY, SELL, MERGE, SPLIT, REBATE
  usdcSize: number;
  side?: string;       // BUY | SELL
  conditionId?: string;
  title?: string;
}

/**
 * GET /api/polymarket/profile-stats
 *
 * Fetches portfolio stats directly from Polymarket's APIs:
 * - Positions value (from /value)
 * - Biggest win (computed per-market from /activity cash flows)
 * - Predictions count (unique conditionIds from /activity)
 * - P&L with period breakdowns 1D/1W/1M/ALL (computed from /activity + unrealized)
 *
 * Authenticated via x-verified-wallet header (middleware-injected).
 */
export async function GET(request: NextRequest) {
  try {
    const address = request.headers.get('x-verified-wallet')?.split(',')[0];
    if (!address) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Fetch value + activity in parallel
    // (positions only needed for unrealized value — /value gives total)
    const [valueRes, activityRecords] = await Promise.all([
      fetch(`${DATA_API}/value?user=${address}`, {
        signal: AbortSignal.timeout(10_000),
      }).then(r => r.ok ? r.json() : []).catch(() => []),

      fetchActivity(address, 5000),
    ]);

    // Positions value (= current unrealized portfolio value)
    const positionsValue = Array.isArray(valueRes) && valueRes.length > 0
      ? Number(valueRes[0]?.value) || 0
      : 0;

    // ── Process all activity records ──
    const now = Date.now();
    const periodCutoffs = {
      day: now - 24 * 60 * 60 * 1000,
      week: now - 7 * 24 * 60 * 60 * 1000,
      month: now - 30 * 24 * 60 * 60 * 1000,
    };

    const cashFlows = { all: 0, day: 0, week: 0, month: 0 };
    const CASH_IN_TYPES = new Set(['SELL', 'REDEEM', 'MERGE', 'REBATE']);
    const CASH_OUT_TYPES = new Set(['BUY', 'SPLIT']);

    // Per-market tracking for biggest win + predictions
    const marketPnl = new Map<string, number>();
    const marketTitle = new Map<string, string>();
    const uniqueConditions = new Set<string>();

    // Collect chronologically-ordered cash-flow events for time-series PnL chart
    const flowEvents: { t: number; flow: number }[] = [];

    for (const record of activityRecords) {
      const usdcSize = Number(record.usdcSize) || 0;
      const conditionId = record.conditionId || '';

      if (conditionId) {
        uniqueConditions.add(conditionId);
        if (record.title) marketTitle.set(conditionId, record.title);
      }

      if (usdcSize === 0) continue;

      const actType = (record.type || '').toUpperCase();
      const side = (record.side || '').toUpperCase();

      let flow = 0;
      if (CASH_IN_TYPES.has(actType) || (actType === 'TRADE' && side === 'SELL')) {
        flow = usdcSize;
      } else if (CASH_OUT_TYPES.has(actType) || (actType === 'TRADE' && side === 'BUY')) {
        flow = -usdcSize;
      } else {
        continue;
      }

      // Global cash flows
      cashFlows.all += flow;

      // Polymarket timestamps are Unix epoch in SECONDS
      const tsMs = (typeof record.timestamp === 'number' && record.timestamp < 1e12)
        ? record.timestamp * 1000
        : Number(record.timestamp) || 0;
      if (tsMs > 0) {
        if (tsMs >= periodCutoffs.day) cashFlows.day += flow;
        if (tsMs >= periodCutoffs.week) cashFlows.week += flow;
        if (tsMs >= periodCutoffs.month) cashFlows.month += flow;
        flowEvents.push({ t: tsMs, flow });
      }

      // Per-market P&L (for biggest win)
      if (conditionId) {
        marketPnl.set(conditionId, (marketPnl.get(conditionId) || 0) + flow);
      }
    }

    // Biggest win = market with highest cash flow P&L
    let biggestWin: { amount: number; title: string | null } | null = null;
    if (marketPnl.size > 0) {
      let bestCid = '';
      let bestPnl = -Infinity;
      for (const [cid, pnl] of marketPnl) {
        if (pnl > bestPnl) {
          bestPnl = pnl;
          bestCid = cid;
        }
      }
      if (bestPnl > 0) {
        biggestWin = {
          amount: Math.round(bestPnl * 100) / 100,
          title: marketTitle.get(bestCid) || null,
        };
      }
    }

    // Predictions count = unique markets traded
    const predictions = uniqueConditions.size;

    // P&L = cash flow + unrealized value (from /value endpoint)
    // ALL: total cash flow + current portfolio value
    // Periods: cash flow in that period only (we don't have historical portfolio snapshots)
    const pnl = {
      all: Math.round((cashFlows.all + positionsValue) * 100) / 100,
      day: Math.round(cashFlows.day * 100) / 100,
      week: Math.round(cashFlows.week * 100) / 100,
      month: Math.round(cashFlows.month * 100) / 100,
    };

    console.log('[profile-stats]', {
      address,
      activityCount: activityRecords.length,
      predictions,
      positionsValue,
      cashFlows,
      pnl,
      biggestWin,
    });

    // Build chronological cumulative-PnL series for the chart.
    // Walk earliest → latest, accumulate realized cash flow, then append a final
    // point at "now" that adds unrealized positionsValue so the curve ends at pnl.all.
    flowEvents.sort((a, b) => a.t - b.t);
    const pnlSeries: { t: number; v: number }[] = [];
    let running = 0;
    for (const e of flowEvents) {
      running += e.flow;
      pnlSeries.push({ t: e.t, v: Math.round(running * 100) / 100 });
    }
    pnlSeries.push({ t: now, v: Math.round((running + positionsValue) * 100) / 100 });

    return NextResponse.json({
      positionsValue: Math.round(positionsValue * 100) / 100,
      biggestWin,
      predictions,
      pnl,
      pnlSeries,
    }, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    });
  } catch (err) {
    console.error('[/api/polymarket/profile-stats] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch profile stats' }, { status: 500 });
  }
}

/**
 * Fetch activity records with cursor pagination.
 * Polymarket caps each page at ~100 records regardless of requested limit.
 * Uses `end` timestamp cursor for reliable deep pagination.
 */
async function fetchActivity(address: string, maxRecords: number): Promise<ActivityRecord[]> {
  const PAGE_SIZE = 100; // Polymarket's actual per-page cap
  const records: ActivityRecord[] = [];
  let cursor: string | undefined;

  while (records.length < maxRecords) {
    const url = new URL(`${DATA_API}/activity`);
    url.searchParams.set('user', address);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('end', cursor);

    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) break;

      const page: ActivityRecord[] = await res.json();
      if (!Array.isArray(page) || page.length === 0) break;

      records.push(...page);

      // Use the last record's timestamp as cursor for next page
      const lastTimestamp = page[page.length - 1]?.timestamp;
      if (!lastTimestamp || page.length < PAGE_SIZE) break;
      cursor = String(lastTimestamp);
    } catch {
      break;
    }
  }

  return records.slice(0, maxRecords);
}
