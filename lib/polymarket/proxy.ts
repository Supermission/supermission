/**
 * Polymarket proxy-wallet derivation and funded-maker detection.
 *
 * Background: Polymarket's CLOB accepts three signature_type values:
 *   0 (EOA)             — maker == signer == EOA
 *   1 (POLY_PROXY)      — Magic/email-style proxy: maker = CREATE2 proxy, signer = EOA
 *   2 (POLY_GNOSIS_SAFE)— Safe-wallet flow: maker = Safe address, signer = EOA
 *
 * Users who funded their Polymarket balance via the Polymarket frontend (Magic
 * email login or a Safe-style wallet) have their pUSD / USDC.e sitting in the
 * proxy/Safe — NOT in the EOA. Submitting orders with signatureType=0 and
 * maker=EOA against a proxy-funded account is rejected by the CLOB with
 * "maker address not allowed", which our error translator was mis-framing as a
 * regional restriction.
 *
 * This module handles the Magic-style (type 1) proxy: derives the proxy
 * address deterministically from the EOA and detects which address actually
 * holds the funds. Safe-style (type 2) derivation requires Polymarket's
 * relayer SDK — left for a follow-up if/when we see users hitting it.
 *
 * Reference: https://github.com/Polymarket/magic-proxy-builder-example
 */

import {
  encodePacked,
  getCreate2Address,
  keccak256,
  type Address,
  type Hex,
} from 'viem';
import { POLYGON_PUSD, POLYGON_USDC, POLYGON_RPC } from './trade-utils';

// Canonical Polymarket Polygon proxy-wallet constants. Values copied verbatim
// from Polymarket/magic-proxy-builder-example/constants/proxyWallet.ts.
export const POLY_PROXY_FACTORY = '0xaB45c5A4B0c941a2F231C04C3f49182e1A254052' as Address;
export const POLY_RELAY_HUB = '0xD216153c06E857cD7f72665E0aF1d7D82172F494' as Address;
export const PROXY_INIT_CODE_HASH = '0xd21df8dc65880a8606f09fe0ce3df9b8869287ab0b058be05aa9e8af6330a00b' as Hex;

/**
 * Derive the Polymarket Magic-style proxy address for a given EOA.
 *
 * Deterministic CREATE2 derivation — no network call needed. The proxy may or
 * may not actually be deployed; check on-chain code or balance to find out.
 */
export function deriveMagicProxyAddress(eoa: string): Address {
  const eoaTyped = eoa as Address;
  return getCreate2Address({
    bytecodeHash: PROXY_INIT_CODE_HASH,
    from: POLY_PROXY_FACTORY,
    salt: keccak256(encodePacked(['address'], [eoaTyped])),
  });
}

export interface MakerConfig {
  /** Address used as `maker` and `funderAddress` in the CLOB order. */
  maker: Address;
  /** CLOB signatureType: 0 = EOA, 1 = POLY_PROXY (Magic). */
  signatureType: 0 | 1;
  /** Where we found the funds — useful for UX hints and the withdraw flow. */
  source: 'eoa' | 'proxy';
  /** Derived proxy address (always returned, even when funds are on EOA). */
  proxy: Address;
  /** Combined pUSD + USDC.e dollar balance at the chosen maker, for logging. */
  detectedBalance: number;
}

interface BalancePair {
  pusd: number;
  usdcE: number;
}

async function readPusdAndUsdcE(address: string, rpcUrl: string): Promise<BalancePair> {
  const data = '0x70a08231000000000000000000000000' + address.slice(2).toLowerCase();
  const call = (to: string) =>
    fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
      signal: AbortSignal.timeout(3_000),
    });
  try {
    const [pusdRes, usdcERes] = await Promise.all([call(POLYGON_PUSD), call(POLYGON_USDC)]);
    const [pusdJson, usdcEJson] = await Promise.all([pusdRes.json(), usdcERes.json()]);
    return {
      pusd: pusdJson.result ? Number(BigInt(pusdJson.result)) / 1e6 : 0,
      usdcE: usdcEJson.result ? Number(BigInt(usdcEJson.result)) / 1e6 : 0,
    };
  } catch {
    return { pusd: 0, usdcE: 0 };
  }
}

const cache = new Map<string, { ts: number; cfg: MakerConfig }>();
const TTL_MS = 5 * 60 * 1000;

/**
 * Detect which address actually holds the user's Polymarket-relevant funds —
 * the EOA itself, or the user's derived Magic proxy. Returns the maker config
 * that should be used for CLOB order submission and balance reads.
 *
 * Caching: result is keyed by EOA and held for 5 minutes. Pass `force: true`
 * to bypass the cache (e.g. right after a deposit lands).
 *
 * Strategy: prefer the proxy when it holds materially more funds than the
 * EOA, since that signals the user funded via Polymarket's frontend. We use
 * a $0.50 threshold so dust doesn't flip the decision.
 */
export async function detectFundedMaker(
  eoa: string,
  opts: { rpcUrl?: string; force?: boolean } = {},
): Promise<MakerConfig> {
  const key = eoa.toLowerCase();
  const cached = cache.get(key);
  if (!opts.force && cached && Date.now() - cached.ts < TTL_MS) {
    return cached.cfg;
  }

  const proxy = deriveMagicProxyAddress(eoa);
  const rpcUrl = opts.rpcUrl ?? POLYGON_RPC;
  const [eoaBal, proxyBal] = await Promise.all([
    readPusdAndUsdcE(eoa, rpcUrl),
    readPusdAndUsdcE(proxy, rpcUrl),
  ]);
  const eoaTotal = eoaBal.pusd + eoaBal.usdcE;
  const proxyTotal = proxyBal.pusd + proxyBal.usdcE;

  // Prefer proxy when it holds materially more — Polymarket-frontend deposits
  // land in the proxy, and that's the only address whose maker the CLOB will
  // accept for type-1 accounts.
  const preferProxy = proxyTotal > eoaTotal + 0.5;
  const cfg: MakerConfig = preferProxy
    ? { maker: proxy, signatureType: 1, source: 'proxy', proxy, detectedBalance: proxyTotal }
    : { maker: eoa as Address, signatureType: 0, source: 'eoa', proxy, detectedBalance: eoaTotal };

  cache.set(key, { ts: Date.now(), cfg });
  return cfg;
}

/** Invalidate the detection cache for an address (e.g. after a deposit/withdraw). */
export function invalidateMakerCache(eoa: string): void {
  cache.delete(eoa.toLowerCase());
}
