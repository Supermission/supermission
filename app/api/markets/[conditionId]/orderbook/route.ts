import { NextRequest, NextResponse } from 'next/server';

const CLOB_API = 'https://clob.polymarket.com';

/**
 * GET /api/markets/[conditionId]/orderbook — Order book from Polymarket CLOB
 *
 * Query params:
 *   tokenId - CLOB token ID (required)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conditionId: string }> }
) {
  try {
    await params; // await for Next.js 15

    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');

    if (!tokenId) {
      return NextResponse.json({ error: 'tokenId is required' }, { status: 400 });
    }

    const res = await fetch(`${CLOB_API}/book?token_id=${tokenId}`);
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch order book' }, { status: 502 });
    }

    const raw = await res.json();

    // CLOB returns { bids: [{price, size}], asks: [{price, size}] }
    const bids: { price: number; size: number }[] = (raw?.bids || [])
      .map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }))
      .sort((a: { price: number }, b: { price: number }) => b.price - a.price)
      .slice(0, 10);

    const asks: { price: number; size: number }[] = (raw?.asks || [])
      .map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
      .sort((a: { price: number }, b: { price: number }) => a.price - b.price)
      .slice(0, 10);

    return NextResponse.json({ bids, asks }, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('[/api/markets/orderbook] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
