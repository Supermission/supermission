import { NextRequest, NextResponse } from 'next/server';
import { getMultiPrice } from '@/lib/uniswap/price-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');

    // Always fetch BTC + ETH, plus any user-held tokens
    const baseSymbols = ['BTC', 'ETH'];
    const userSymbols = symbolsParam
      ? symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : [];
    const allSymbols = Array.from(new Set([...baseSymbols, ...userSymbols]));

    // Batch-fetch all prices
    const prices = await getMultiPrice(allSymbols);

    const btcData = prices.get('BTC');
    const ethData = prices.get('ETH');

    // Build token changes for user-held tokens
    const tokenChanges: Record<string, {
      price: number;
      change24h: number;
      change24hPct: number;
    }> = {};

    for (const sym of userSymbols) {
      const data = prices.get(sym);
      if (data) {
        tokenChanges[sym] = {
          price: data.price,
          change24h: data.change24h,
          change24hPct: data.changePct24h,
        };
      }
    }

    // Sort user tokens by absolute change to find gainers/losers
    const sorted = Object.entries(tokenChanges).sort(
      (a, b) => b[1].change24hPct - a[1].change24hPct
    );
    const topGainers = sorted.filter(([, v]) => v.change24hPct > 0).slice(0, 3);
    const topLosers = sorted.filter(([, v]) => v.change24hPct < 0).slice(-3).reverse();

    return NextResponse.json({
      success: true,
      data: {
        btc: btcData
          ? { price: btcData.price, change24h: btcData.change24h, change24hPct: btcData.changePct24h }
          : null,
        eth: ethData
          ? { price: ethData.price, change24h: ethData.change24h, change24hPct: ethData.changePct24h }
          : null,
        tokenChanges,
        topGainers: topGainers.map(([symbol, data]) => ({ symbol, ...data })),
        topLosers: topLosers.map(([symbol, data]) => ({ symbol, ...data })),
        timestamp: Date.now(),
      },
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error: any) {
    console.error('[API:MarketOverview] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market overview', details: error.message },
      { status: 500 }
    );
  }
}
