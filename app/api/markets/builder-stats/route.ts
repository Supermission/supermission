import { NextResponse } from 'next/server';

// CLOB builder-trades endpoint — the ONLY source that actually filters by our
// builder. Docs: https://docs.polymarket.com/api-reference/trade/get-builder-trades
// (public: OpenAPI `security: []`, verified live returns 200 with no auth headers).
//
// The previous implementation used `data-api.polymarket.com/trades?builder_code=`
// which does NOT filter — a bogus code returns the same platform-wide trades, so
// it reported ALL of Polymarket's volume as if it were ours. This route now hits
// the CLOB `/builder/trades` endpoint, whose `builder_code` param is required and
// whose response contains only trades attributed to that builder code.
const CLOB_HOST = 'https://clob.polymarket.com';

interface BuilderTrade {
  id: string;
  market: string;
  side: string;
  size: string;
  price: string;
  timestamp: string;
}

interface BuilderStatsResponse {
  trades: BuilderTrade[];
  totalVolume: number;
  tradeCount: number;
}

/**
 * GET /api/markets/builder-stats
 *
 * Fetches OUR (Supermission) builder trade stats from Polymarket's CLOB
 * builder-trades endpoint, correctly filtered by our bytes32 builder code.
 * Requires NEXT_PUBLIC_POLY_BUILDER_CODE to be set (0x + 64 hex).
 */
export async function GET() {
  const empty: BuilderStatsResponse = { trades: [], totalVolume: 0, tradeCount: 0 };

  try {
    const builderCode = process.env.NEXT_PUBLIC_POLY_BUILDER_CODE;
    if (!builderCode || !/^0x[a-fA-F0-9]{64}$/.test(builderCode)) {
      // Unset or malformed code → no attribution possible. Return empty (the
      // consumer treats tradeCount === 0 && no trades as "unavailable").
      return NextResponse.json<BuilderStatsResponse>(empty);
    }

    const url = `${CLOB_HOST}/builder/trades?builder_code=${encodeURIComponent(builderCode)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      console.error(`[builder-stats] CLOB /builder/trades returned ${res.status}`);
      return NextResponse.json<BuilderStatsResponse>(empty);
    }

    const page = await res.json();
    const raw: any[] = Array.isArray(page?.data) ? page.data : [];

    const mapped: BuilderTrade[] = raw.map((t: any) => ({
      id: t.id || t.transactionHash || '',
      market: t.market || t.conditionId || '',
      side: t.side || '',
      size: String(t.size ?? '0'),
      price: String(t.price ?? '0'),
      timestamp: t.matchTime
        ? new Date(Number(t.matchTime) * 1000).toISOString()
        : t.createdAt || '',
    }));

    // Volume in USDC notional. Prefer the API's sizeUsdc; fall back to size*price.
    const totalVolume = raw.reduce((sum: number, t: any) => {
      const usdc = Number(t.sizeUsdc);
      return (
        sum +
        (Number.isFinite(usdc)
          ? usdc
          : parseFloat(t.size || '0') * parseFloat(t.price || '0'))
      );
    }, 0);

    // Use the API's total count when present (covers unpaginated totals).
    const tradeCount = Number.isFinite(Number(page?.count))
      ? Number(page.count)
      : raw.length;

    return NextResponse.json<BuilderStatsResponse>(
      {
        trades: mapped,
        totalVolume: Math.round(totalVolume * 100) / 100,
        tradeCount,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      },
    );
  } catch (err: any) {
    console.error('[/api/markets/builder-stats] Error:', err?.message);
    return NextResponse.json<BuilderStatsResponse>(empty);
  }
}
