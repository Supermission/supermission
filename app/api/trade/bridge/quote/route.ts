// app/api/trade/bridge/quote/route.ts
// Server-side proxy for Polymarket's Bridge QUOTE endpoint.
//
// Docs: https://docs.polymarket.com/api-reference/bridge/get-a-quote
// Returns fee breakdown + estimated output for a prospective bridge withdrawal
// so the UI can show the user what they'll receive before they commit.
//
// Proxied server-side to bypass CORS / ISP blocks (same as sibling routes).
import { NextRequest, NextResponse } from 'next/server';

const POLYMARKET_BRIDGE = 'https://bridge.polymarket.com';

/**
 * POST /api/trade/bridge/quote
 * Body: { fromAmountBaseUnit, fromChainId, fromTokenAddress, recipientAddress, toChainId, toTokenAddress }
 * Returns the Polymarket quote object (estOutputUsd, estFeeBreakdown, quoteId, …).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fromAmountBaseUnit,
      fromChainId,
      fromTokenAddress,
      recipientAddress,
      toChainId,
      toTokenAddress,
    } = body ?? {};

    if (!fromAmountBaseUnit || !fromChainId || !fromTokenAddress || !recipientAddress || !toChainId || !toTokenAddress) {
      return NextResponse.json({ error: 'Missing required quote fields' }, { status: 400 });
    }

    const payload = JSON.stringify({
      fromAmountBaseUnit: String(fromAmountBaseUnit),
      fromChainId: String(fromChainId),
      fromTokenAddress,
      recipientAddress,
      toChainId: String(toChainId),
      toTokenAddress,
    });

    // Verified live 2026-07-22: the real endpoint is `/quote` (the API-reference
    // `/api/quote` path 404s). We hit `/quote` directly; `/api/quote` is kept
    // only as a defensive fallback in case Polymarket ever moves it.
    const callQuote = (path: string) =>
      fetch(`${POLYMARKET_BRIDGE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(15_000),
      });

    let res = await callQuote('/quote');
    if (res.status === 404) {
      res = await callQuote('/api/quote');
    }

    const text = await res.text();
    if (!res.ok) {
      console.error(`[Bridge Quote] Polymarket quote failed (${res.status}):`, text.slice(0, 500));
      return NextResponse.json(
        { error: `Failed to get quote: ${text || res.statusText}` },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    return NextResponse.json(text ? JSON.parse(text) : {});
  } catch (err: any) {
    const reason =
      err?.name === 'TimeoutError' || err?.name === 'AbortError'
        ? 'timeout (15s)'
        : err?.cause?.code ?? err?.code ?? err?.message ?? 'unknown';
    console.error('[Bridge Quote] Error:', reason);
    return NextResponse.json({ error: `Bridge quote request failed: ${reason}` }, { status: 500 });
  }
}
