import { NextResponse } from 'next/server';

/**
 * GET /api/markets/builder-volume
 *
 * Returns OUR (Supermission) Polymarket builder volume — today (UTC) and all-time.
 *
 * IMPORTANT — why this is NOT the old data-api /trades?builder_code endpoint:
 * The public `https://data-api.polymarket.com/trades?builder_code=<x>` endpoint
 * does NOT filter by builder — a bogus code returns the same platform-wide trades.
 * It is useless for measuring OUR volume.
 *
 * The correct, builder-filtered source is the CLOB endpoint documented at
 * https://docs.polymarket.com/api-reference/trade/get-builder-trades :
 *   GET https://clob.polymarket.com/builder/trades?builder_code=<0x…64hex>
 * `builder_code` is REQUIRED and the response only contains trades attributed to
 * that builder code. Each trade carries `sizeUsdc` (dollar notional) and
 * `matchTime` (unix seconds), so we can sum all-time and today's USDC volume.
 *
 * AUTH: This endpoint is PUBLIC (OpenAPI `security: []` — verified live: it
 * returns 200 with no POLY-* headers). The POLY_BUILDER_* creds are for placing
 * / attributing orders, not for reading volume, so no L2 HMAC auth is required
 * here. (Aggregated cross-check numbers come from the equally-public
 * https://docs.polymarket.com/api-reference/builders/get-daily-builder-volume-time-series
 * at https://data-api.polymarket.com/v1/builders/volume — filtered by builderCode.)
 */

const CLOB_HOST = 'https://clob.polymarket.com';
const DATA_API = 'https://data-api.polymarket.com';

interface BuilderVolumeResponse {
  builderCode: string | null;
  today: { volume: number; tradeCount: number };
  allTime: { volume: number; tradeCount: number };
  // Aggregated figure from Polymarket's own builder leaderboard (may lag; often
  // reported in shares rather than USDC notional). Provided for cross-checking.
  aggregated: { volume: number | null };
  asOf: string;
  source: string;
  reason?: string;
}

function startOfTodayUtcSeconds(): number {
  const now = new Date();
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000,
  );
}

export async function GET() {
  const builderCode = process.env.NEXT_PUBLIC_POLY_BUILDER_CODE || null;
  const asOf = new Date().toISOString();

  const empty = (reason: string): BuilderVolumeResponse => ({
    builderCode,
    today: { volume: 0, tradeCount: 0 },
    allTime: { volume: 0, tradeCount: 0 },
    aggregated: { volume: null },
    asOf,
    source: 'clob:/builder/trades',
    reason,
  });

  if (!builderCode) {
    // No attribution possible without the bytes32 builder code.
    return NextResponse.json(
      empty('NEXT_PUBLIC_POLY_BUILDER_CODE is not set'),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(builderCode)) {
    return NextResponse.json(
      empty(`NEXT_PUBLIC_POLY_BUILDER_CODE is not a valid bytes32 (0x + 64 hex): ${builderCode}`),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    // ── Real-time, builder-filtered trades (authoritative USDC notional) ──
    const startToday = startOfTodayUtcSeconds();
    let allVolume = 0;
    let allCount = 0;
    let todayVolume = 0;
    let todayCount = 0;
    let cursor: string | undefined;
    let guard = 0; // hard cap on pagination loops

    do {
      const params = new URLSearchParams({ builder_code: builderCode });
      if (cursor) params.set('next_cursor', cursor);
      const res = await fetch(`${CLOB_HOST}/builder/trades?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) {
        console.error(`[builder-volume] CLOB /builder/trades returned ${res.status}`);
        break;
      }
      const page = await res.json();
      const data: any[] = Array.isArray(page?.data) ? page.data : [];
      for (const t of data) {
        const usdc = Number(t.sizeUsdc);
        const v = Number.isFinite(usdc)
          ? usdc
          : parseFloat(t.size || '0') * parseFloat(t.price || '0');
        allVolume += v;
        allCount += 1;
        if (Number(t.matchTime || 0) >= startToday) {
          todayVolume += v;
          todayCount += 1;
        }
      }
      // Polymarket returns next_cursor 'LTE='/'' when exhausted.
      const next = typeof page?.next_cursor === 'string' ? page.next_cursor : '';
      cursor = next && next !== 'LTE=' && data.length > 0 ? next : undefined;
    } while (cursor && ++guard < 50);

    // ── Aggregated cross-check from Polymarket's builder volume series ──
    let aggregated: number | null = null;
    try {
      const aggRes = await fetch(`${DATA_API}/v1/builders/volume?timePeriod=ALL`, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
      });
      if (aggRes.ok) {
        const rows: any[] = await aggRes.json();
        const ours = (Array.isArray(rows) ? rows : []).filter(
          (r) => String(r.builderCode || '').toLowerCase() === builderCode.toLowerCase(),
        );
        if (ours.length > 0) {
          aggregated = ours.reduce((s, r) => s + (Number(r.volume) || 0), 0);
        }
      }
    } catch {
      // Non-fatal — aggregated cross-check is best-effort.
    }

    const body: BuilderVolumeResponse = {
      builderCode,
      today: { volume: Math.round(todayVolume * 1e6) / 1e6, tradeCount: todayCount },
      allTime: { volume: Math.round(allVolume * 1e6) / 1e6, tradeCount: allCount },
      aggregated: { volume: aggregated },
      asOf,
      source: 'clob:/builder/trades',
    };

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (err: any) {
    console.error('[/api/markets/builder-volume] Error:', err?.message);
    return NextResponse.json(empty(err?.message || 'fetch failed'), {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
