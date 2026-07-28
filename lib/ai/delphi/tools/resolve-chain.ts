/**
 * resolveChainFromAddress — given a bare EVM contract address, figure out which
 * supported chain it lives on (and its symbol) so DELPHI never has to ask the
 * user "which chain?" — the same instant lookup Dexscreener does.
 *
 * Primary source: Dexscreener token API (no key, cross-chain). Fallback: the
 * existing Nansen token search by symbol, only useful once a symbol is known.
 * Results are cached per-process; every upstream call is time-boxed and never
 * throws — on failure we return { found: false } and the caller asks the user.
 */

import { searchToken } from '@/lib/nansen/client';

// Dexscreener chain slugs → our supported numeric chain IDs.
const DEXSCREENER_CHAIN_MAP: Record<string, { id: number; name: string }> = {
  ethereum: { id: 1, name: 'Ethereum' },
  base: { id: 8453, name: 'Base' },
  polygon: { id: 137, name: 'Polygon' },
  arbitrum: { id: 42161, name: 'Arbitrum' },
};

export interface ResolvedChain {
  found: boolean;
  chainId?: number;
  chainName?: string;
  symbol?: string;
  source?: 'dexscreener' | 'nansen';
}

export function isEvmAddress(s: unknown): s is string {
  return typeof s === 'string' && /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}

const cache = new Map<string, ResolvedChain>();

async function tryDexscreener(address: string): Promise<ResolvedChain> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3_000);
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Supermission/1.0' },
    });
    if (!res.ok) return { found: false };
    const data = await res.json();
    const pairs: any[] = Array.isArray(data?.pairs) ? data.pairs : [];
    const key = address.toLowerCase();

    // Aggregate USD liquidity per supported chain; remember the token symbol.
    const byChain = new Map<string, { liq: number; symbol?: string }>();
    for (const p of pairs) {
      const slug = String(p?.chainId || '').toLowerCase();
      if (!DEXSCREENER_CHAIN_MAP[slug]) continue;
      const liq = Number(p?.liquidity?.usd) || 0;
      const prev = byChain.get(slug) || { liq: 0, symbol: undefined as string | undefined };
      const sym =
        p?.baseToken?.address?.toLowerCase() === key ? p?.baseToken?.symbol :
        p?.quoteToken?.address?.toLowerCase() === key ? p?.quoteToken?.symbol :
        prev.symbol;
      byChain.set(slug, { liq: prev.liq + liq, symbol: sym ?? prev.symbol });
    }

    let bestSlug: string | null = null;
    let bestLiq = -1;
    for (const [slug, v] of byChain) {
      if (v.liq > bestLiq) { bestLiq = v.liq; bestSlug = slug; }
    }
    if (!bestSlug) return { found: false };
    const m = DEXSCREENER_CHAIN_MAP[bestSlug];
    return { found: true, chainId: m.id, chainName: m.name, symbol: byChain.get(bestSlug)?.symbol, source: 'dexscreener' };
  } catch {
    return { found: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveChainFromAddress(address: string): Promise<ResolvedChain> {
  if (!isEvmAddress(address)) return { found: false };
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  let result = await tryDexscreener(address);

  // Fallback: if Dexscreener gave us a symbol but no usable chain (rare), or
  // nothing at all, try Nansen's search by that symbol — it returns the chain.
  if (!result.found && result.symbol) {
    try {
      const search = await searchToken(result.symbol);
      const tokens = Array.isArray(search) ? search : [];
      const match = tokens.find((t: any) => (t.address || '').toLowerCase() === key) || tokens[0];
      if (match) {
        const slug = String(match.chain || '').toLowerCase();
        const m = DEXSCREENER_CHAIN_MAP[slug];
        if (m) result = { found: true, chainId: m.id, chainName: m.name, symbol: match.symbol, source: 'nansen' };
      }
    } catch { /* ignore */ }
  }

  cache.set(key, result);
  return result;
}

/** Map a supported numeric chain id → its Dexscreener-style lowercase slug. */
export const SUPPORTED_CHAIN_SLUG: Record<number, string> = {
  1: 'ethereum', 8453: 'base', 137: 'polygon', 42161: 'arbitrum',
};
