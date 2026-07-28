// app/api/trade/bridge/withdraw/route.ts
// Server-side proxy for Polymarket's Bridge WITHDRAW address endpoint.
//
// Docs: https://docs.polymarket.com/trading/bridge/withdraw
// Flow: POST { address, toChainId, toTokenAddress, recipientAddr } →
//   Polymarket returns a per-chain bridge address. The user then sends pUSD
//   from their Polymarket wallet to that address; Polymarket's Collateral
//   Offramp unwraps pUSD → USDC (Uniswap v3) and delivers on the destination.
//
// Proxied server-side (not called from the browser directly) to bypass CORS /
// ISP blocks — same rationale as /api/clob and /api/trade/bridge.
import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';

const POLYMARKET_BRIDGE = 'https://bridge.polymarket.com';

/**
 * POST /api/trade/bridge/withdraw
 * Body: { address, toChainId, toTokenAddress, recipientAddr, builderCode? }
 * Returns: { address: { evm, svm?, btc? }, note? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, toChainId, toTokenAddress, recipientAddr, builderCode } = body ?? {};

    if (!address || !isAddress(address)) {
      return NextResponse.json({ error: 'Invalid or missing address (Polymarket wallet)' }, { status: 400 });
    }
    if (!recipientAddr || !isAddress(recipientAddr)) {
      return NextResponse.json({ error: 'Invalid or missing recipientAddr' }, { status: 400 });
    }
    if (!toChainId) {
      return NextResponse.json({ error: 'Missing toChainId' }, { status: 400 });
    }
    if (!toTokenAddress) {
      return NextResponse.json({ error: 'Missing toTokenAddress' }, { status: 400 });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Optional builder attribution — bytes32 hex.
    if (typeof builderCode === 'string' && /^0x[a-fA-F0-9]{64}$/.test(builderCode)) {
      headers['X-Builder-Code'] = builderCode;
    }

    const res = await fetch(`${POLYMARKET_BRIDGE}/withdraw`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        address,
        // The bridge API expects string chain ids.
        toChainId: String(toChainId),
        toTokenAddress,
        recipientAddr,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(`[Bridge Withdraw] Polymarket withdraw failed (${res.status}):`, text.slice(0, 500));
      return NextResponse.json(
        { error: `Failed to create withdrawal address: ${text || res.statusText}` },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const data = text ? JSON.parse(text) : {};
    const evm = data?.address?.evm;
    if (!evm || !isAddress(evm)) {
      console.error('[Bridge Withdraw] No EVM bridge address in response:', JSON.stringify(data).slice(0, 500));
      return NextResponse.json({ error: 'No EVM bridge address returned from Polymarket' }, { status: 502 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    const reason =
      err?.name === 'TimeoutError' || err?.name === 'AbortError'
        ? 'timeout (15s)'
        : err?.cause?.code ?? err?.code ?? err?.message ?? 'unknown';
    console.error('[Bridge Withdraw] Error:', reason);
    return NextResponse.json({ error: `Bridge withdraw request failed: ${reason}` }, { status: 500 });
  }
}
