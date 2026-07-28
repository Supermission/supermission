// app/api/rpc/[chain]/route.ts
//
// Same-origin JSON-RPC proxy for the browser (wagmi/viem). The paid QuickNode
// auth key lives ONLY in server-side env vars and never ships to the client —
// the browser talks to /api/rpc/<chain>, this route forwards to QuickNode.
//
// QuickNode's own front-end security guidance recommends a backend proxy over
// exposing the key in a NEXT_PUBLIC_ var (domain allowlisting is bypassable and
// can't protect WSS). Server-side code (lib/viem/clients.ts, server-wallets,
// cron) uses the QuickNode URLs directly and does NOT go through this route.
import { NextRequest, NextResponse } from 'next/server';
import { serverHttpRpcUrl, RPC_CHAIN_BY_ID, type RpcChain } from '@/lib/rpc/endpoints';

export const runtime = 'nodejs';
// Never cache RPC responses.
export const dynamic = 'force-dynamic';

// Allowlist of proxiable chains (prevents this from becoming an open relay).
const ALLOWED: ReadonlySet<RpcChain> = new Set(Object.values(RPC_CHAIN_BY_ID));

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ chain: string }> },
) {
  const { chain } = await ctx.params;
  if (!ALLOWED.has(chain as RpcChain)) {
    return NextResponse.json(
      { error: `Unsupported chain: ${chain}` },
      { status: 400 },
    );
  }
  // Resolve to the paid QuickNode endpoint (or centralized public fallback).
  const upstream = serverHttpRpcUrl(chain as RpcChain);

  // Pass the raw JSON-RPC body through untouched so single AND batch requests
  // both work. We do not inspect or rewrite the payload.
  const body = await req.text();

  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const reason =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
        ? 'upstream timeout (20s)'
        : err instanceof Error
          ? err.message
          : 'unknown error';
    console.error(`[rpc-proxy:${chain}]`, reason);
    // JSON-RPC-shaped error so viem surfaces it cleanly.
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: `RPC proxy error: ${reason}` } },
      { status: 502 },
    );
  }
}
