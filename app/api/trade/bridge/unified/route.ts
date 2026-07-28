import { NextRequest, NextResponse } from 'next/server';
import { shouldUseCircleBridge, isCCTPSupported } from '@/lib/circle/bridge';

/**
 * Unified bridge API — tries Circle CCTP first, falls back to Polymarket bridge.
 * Existing /api/trade/bridge endpoint is UNTOUCHED.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourceChainId, destChainId, amount, fromAddress } = body;

    // Try Circle CCTP if enabled and supported
    if (shouldUseCircleBridge() && isCCTPSupported(sourceChainId, destChainId)) {
      return NextResponse.json({
        ok: true,
        provider: 'circle_cctp',
        sourceChainId,
        destChainId,
        amount,
        message: 'Use client-side Circle Bridge Kit for signing',
      });
    }

    // Fallback: proxy to existing Polymarket bridge
    const existingRes = await fetch(
      `${req.nextUrl.origin}/api/trade/bridge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    const existingData = await existingRes.json();
    return NextResponse.json({ ...existingData, provider: 'polymarket' });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Bridge failed' },
      { status: 500 }
    );
  }
}
