/**
 * Shared viem public client singletons.
 *
 * Import from here instead of calling createPublicClient inline.
 * A single instance per process means undici reuses its TCP connection
 * pool across all RPC calls rather than opening new connections each time.
 *
 * All on-chain write operations go through Privy server wallets
 * (see lib/server-wallets/relayer.ts).
 */

import { createPublicClient, http } from 'viem';
import { base, polygon, mainnet } from 'viem/chains';
import { robinhoodChain } from '@/lib/chains/robinhood';
import { serverHttpRpcUrl } from '@/lib/rpc/endpoints';

// RPC URLs come from the single source of truth (lib/rpc/endpoints.ts): paid
// QuickNode server endpoints, or the centralized public fallback if unset.
// `batch: { multicall: true }` aggregates eth_call fan-out (balance reads) into
// single Multicall3 requests — Multicall3 is deployed on all four chains
// (verified on Robinhood at 0xcA11…CA11).
const CLIENT_OPTS = { batch: { multicall: true } } as const;
// NOTE: intentionally NO transport-level `batch: true`. QuickNode advises against
// JSON-RPC batch requests (they split the batch back into individual calls + add
// routing overhead, which can slow responses). Multicall3 aggregation (CLIENT_OPTS)
// is their recommended way to coalesce eth_call fan-out.
const HTTP_OPTS = { timeout: 10_000 } as const;

// ─── Public clients (eager) ──────────────────────────────────────────────────

export const baseClient = createPublicClient({
  chain: base,
  transport: http(serverHttpRpcUrl('base'), HTTP_OPTS),
  ...CLIENT_OPTS,
});

export const polygonClient = createPublicClient({
  chain: polygon,
  transport: http(serverHttpRpcUrl('polygon'), HTTP_OPTS),
  ...CLIENT_OPTS,
});

export const ethereumClient = createPublicClient({
  chain: mainnet,
  transport: http(serverHttpRpcUrl('ethereum'), HTTP_OPTS),
  ...CLIENT_OPTS,
});

export const robinhoodClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(serverHttpRpcUrl('robinhood'), HTTP_OPTS),
  ...CLIENT_OPTS,
});

