// lib/rpc/endpoints.ts
//
// SINGLE SOURCE OF TRUTH for RPC endpoints across the app.
//
// - Server (Node / API routes / cron): uses the paid QuickNode HTTPS endpoints
//   from SERVER-ONLY env vars (QUICKNODE_<CHAIN>_HTTP). The auth key never ships
//   to the browser.
// - Browser: uses the same-origin proxy `/api/rpc/<chain>` (app/api/rpc/[chain]),
//   which forwards to QuickNode server-side — so the key stays off the client.
//
// Consumers just call httpRpcUrl(chain) / httpRpcUrlByChainId(id) and get the
// correct URL for whatever runtime they execute in. They MUST NOT branch on
// client/server themselves — that logic lives here, once.
//
// Public endpoints are NOT used when the paid QuickNode vars are configured;
// the per-chain PUBLIC_FALLBACK below is a single, centralized last resort so a
// missing env var degrades gracefully instead of crashing (no scattered public
// URLs anywhere else in the codebase).

export type RpcChain = 'base' | 'polygon' | 'arbitrum' | 'robinhood' | 'ethereum';

export const RPC_CHAIN_BY_ID: Record<number, RpcChain> = {
  8453: 'base',
  137: 'polygon',
  42161: 'arbitrum',
  4663: 'robinhood',
  1: 'ethereum',
};

// Paid QuickNode HTTPS endpoints — server-only (NO NEXT_PUBLIC_ ⇒ never inlined
// into the client bundle). Ethereum is intentionally unset (no paid endpoint
// provisioned) and falls back to public below.
const SERVER_HTTP: Record<RpcChain, string | undefined> = {
  base: process.env.QUICKNODE_BASE_HTTP,
  polygon: process.env.QUICKNODE_POLYGON_HTTP,
  arbitrum: process.env.QUICKNODE_ARBITRUM_HTTP,
  robinhood: process.env.QUICKNODE_ROBINHOOD_HTTP,
  ethereum: process.env.QUICKNODE_ETHEREUM_HTTP,
};

// Server-only WSS endpoints (subscriptions). Never expose in the browser —
// WebSocket auth uses Origin and cannot be domain-protected (QuickNode guidance).
const SERVER_WSS: Record<RpcChain, string | undefined> = {
  base: process.env.QUICKNODE_BASE_WSS,
  polygon: process.env.QUICKNODE_POLYGON_WSS,
  arbitrum: process.env.QUICKNODE_ARBITRUM_WSS,
  robinhood: process.env.QUICKNODE_ROBINHOOD_WSS,
  ethereum: process.env.QUICKNODE_ETHEREUM_WSS,
};

// Centralized last-resort public endpoints. Only used server-side when the paid
// QuickNode var for that chain is unset (misconfig / Ethereum). This is the ONLY
// place a public RPC URL may appear in the codebase.
export const PUBLIC_FALLBACK: Record<RpcChain, string> = {
  base: 'https://mainnet.base.org',
  polygon: 'https://polygon-rpc.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  robinhood: 'https://rpc.mainnet.chain.robinhood.com',
  ethereum: 'https://eth.llamarpc.com',
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * HTTP RPC URL for the CURRENT runtime.
 * - Browser → same-origin proxy `/api/rpc/<chain>` (key stays server-side).
 * - Server → paid QuickNode endpoint, or the centralized public fallback if the
 *   QuickNode var for that chain isn't configured.
 */
export function httpRpcUrl(chain: RpcChain): string {
  if (isBrowser()) return `/api/rpc/${chain}`;
  return SERVER_HTTP[chain] || PUBLIC_FALLBACK[chain];
}

/** Same as httpRpcUrl but keyed by numeric chain id. */
export function httpRpcUrlByChainId(chainId: number): string {
  const chain = RPC_CHAIN_BY_ID[chainId];
  if (!chain) throw new Error(`[rpc] unsupported chainId ${chainId}`);
  return httpRpcUrl(chain);
}

/** The raw server-side QuickNode HTTPS URL (or public fallback). SERVER ONLY. */
export function serverHttpRpcUrl(chain: RpcChain): string {
  return SERVER_HTTP[chain] || PUBLIC_FALLBACK[chain];
}

/**
 * Server-only WSS URL for subscriptions. Returns undefined in the browser and
 * when no WSS endpoint is configured — callers should fall back to HTTP polling.
 */
export function serverWssUrl(chain: RpcChain): string | undefined {
  if (isBrowser()) return undefined;
  return SERVER_WSS[chain];
}
