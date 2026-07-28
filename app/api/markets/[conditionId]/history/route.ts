import { NextRequest, NextResponse } from 'next/server';

const CLOB_API = 'https://clob.polymarket.com';

/**
 * GET /api/markets/[conditionId]/history — Price history from Polymarket CLOB
 *
 * Query params:
 *   tokenId   - CLOB token ID (required)
 *   timeframe - 1H, 6H, 1D, 1W, 1M, ALL (default 1D)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conditionId: string }> }
) {
  try {
    await params; // await for Next.js 15

    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');
    const timeframe = searchParams.get('timeframe') || '1D';

    if (!tokenId) {
      return NextResponse.json({ error: 'tokenId is required' }, { status: 400 });
    }

    // Map our timeframes to Polymarket CLOB API interval + fidelity
    const configMap: Record<string, { interval: string; fidelity: number }> = {
      '6H':  { interval: '1d',  fidelity: 5 },
      '1D':  { interval: '1d',  fidelity: 15 },
      '1W':  { interval: '1w',  fidelity: 60 },
      '1M':  { interval: '1m',  fidelity: 360 },
      'ALL': { interval: 'max', fidelity: 1440 },
    };

    const config = configMap[timeframe] || configMap['1D'];

    // Duration in seconds for client-side filtering (6H shares the 1d interval)
    const durationMap: Record<string, number> = {
      '6H': 6 * 3600,
    };
    const filterDuration = durationMap[timeframe];

    const url = `${CLOB_API}/prices-history?market=${tokenId}&interval=${config.interval}&fidelity=${config.fidelity}`;

    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch price history' }, { status: 502 });
    }

    const raw = await res.json();
    let history = raw?.history || [];

    // For 6H, the CLOB API returns 1d of data — trim to requested window
    if (filterDuration && history.length > 0) {
      const now = Math.floor(Date.now() / 1000);
      const cutoff = now - filterDuration;
      history = history.filter((point: { t: number }) => point.t >= cutoff);
    }

    return NextResponse.json({ history });
  } catch (err) {
    console.error('[/api/markets/history] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
