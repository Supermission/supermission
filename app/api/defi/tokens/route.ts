import { NextRequest, NextResponse } from 'next/server';
import { getAllTokens } from '@/lib/goat/plugins';
import type { TokenInfo } from '@/lib/uniswap/types';

const LIFI_TOKENS_URL = 'https://li.quest/v1/tokens';

/**
 * GET /api/defi/tokens?chainId=8453
 * Returns merged token list from LI.FI + local config.
 */
export async function GET(req: NextRequest) {
  const chainIdParam = req.nextUrl.searchParams.get('chainId');
  const chainId = Number(chainIdParam || 8453);

  if (!chainId || chainId <= 0) {
    return NextResponse.json(
      { ok: false, error: 'chainId must be a positive number' },
      { status: 400 }
    );
  }

  try {
    // Fetch from LI.FI tokens API
    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = process.env.LIFI_API_KEY;
    if (apiKey) {
      headers['x-lifi-api-key'] = apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let lifiTokens: TokenInfo[] = [];
    try {
      const url = `${LIFI_TOKENS_URL}?chains=${chainId}`;
      const res = await fetch(url, { headers, signal: controller.signal });
      if (res.ok) {
        const json = await res.json();
        const chainTokens = json.tokens?.[String(chainId)] || [];
        lifiTokens = chainTokens.map((t: {
          address: string;
          chainId: number;
          decimals: number;
          symbol: string;
          name: string;
          logoURI?: string;
        }) => ({
          address: t.address,
          chainId: t.chainId,
          decimals: t.decimals,
          symbol: t.symbol,
          name: t.name,
          logoURI: t.logoURI,
        }));
      } else {
        console.warn('[Token List] LI.FI fetch failed:', res.status);
      }
    } catch (err) {
      console.warn('[Token List] LI.FI fetch error:', err);
    } finally {
      clearTimeout(timeout);
    }

    // Merge with local tokens
    const allLocal = getAllTokens();
    const localTokens = getLocalTokensForChain(allLocal, chainId);

    // Deduplicate by address AND symbol (local tokens take priority).
    // Symbol-based dedup prevents duplicate WETHs when LI.FI returns a
    // different wrapper address than our local config.
    const seenAddresses = new Set<string>();
    const seenSymbols = new Set<string>();
    const merged: TokenInfo[] = [];

    for (const token of localTokens) {
      const addrKey = token.address.toLowerCase();
      const symKey = token.symbol.toUpperCase();
      if (!seenAddresses.has(addrKey)) {
        seenAddresses.add(addrKey);
        seenSymbols.add(symKey);
        merged.push(token);
      }
    }

    for (const token of lifiTokens) {
      const addrKey = token.address.toLowerCase();
      const symKey = token.symbol.toUpperCase();
      if (!seenAddresses.has(addrKey) && !seenSymbols.has(symKey)) {
        seenAddresses.add(addrKey);
        seenSymbols.add(symKey);
        merged.push(token);
      }
    }

    return NextResponse.json({
      ok: true,
      chainId,
      tokens: merged,
      count: merged.length,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (e) {
    console.error('[Token List] Error:', e);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch token list' },
      { status: 500 }
    );
  }
}

function getLocalTokensForChain(
  all: ReturnType<typeof getAllTokens>,
  chainId: number
): TokenInfo[] {
  const chainKey =
    chainId === 8453
      ? 'base'
      : chainId === 137
        ? 'polygon'
        : chainId === 1
          ? 'ethereum'
          : null;

  if (!chainKey) return [];

  return (all[chainKey] || []).map((t) => ({
    address: Object.values(t.chains)[0]?.contractAddress || '',
    chainId,
    decimals: t.decimals,
    symbol: t.symbol,
    name: t.name,
  }));
}
