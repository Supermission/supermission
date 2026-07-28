import { NextRequest, NextResponse } from 'next/server';
import { getHistoricalDaily, getHistoricalHourly } from '@/lib/uniswap/price-client';

type Period = '24h' | '7d' | '30d' | '90d';

const VALID_PERIODS: Period[] = ['24h', '7d', '30d', '90d'];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const period = (searchParams.get('period') || '7d') as Period;

    if (!symbol) {
      return NextResponse.json(
        { error: 'symbol parameter required' },
        { status: 400 }
      );
    }

    if (!VALID_PERIODS.includes(period)) {
      return NextResponse.json(
        { error: `Invalid period. Use: ${VALID_PERIODS.join(', ')}` },
        { status: 400 }
      );
    }

    let points;

    try {
      if (period === '24h') {
        points = await getHistoricalHourly(symbol.toUpperCase());
      } else {
        const limitMap: Record<string, number> = {
          '7d': 7,
          '30d': 30,
          '90d': 90,
        };
        points = await getHistoricalDaily(symbol.toUpperCase(), undefined, limitMap[period]);
      }
    } catch (priceErr: any) {
      // Graceful fallback for unsupported symbols (e.g. MATIC/POL — no subgraph data on Base)
      // Return empty points instead of 404 so the dashboard renders gracefully
      if (priceErr?.message?.includes('No address mapping')) {
        return NextResponse.json({
          success: true,
          data: {
            symbol: symbol.toUpperCase(),
            period,
            points: [],
          },
        }, {
          // Degraded fallback — don't cache the empty response at the edge
          // so a real fix (added mapping) propagates immediately.
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      throw priceErr;
    }

    return NextResponse.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        period,
        points,
      },
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  } catch (error: any) {
    console.error('[API:PriceHistory] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch price history', details: error.message },
      { status: 500 }
    );
  }
}
