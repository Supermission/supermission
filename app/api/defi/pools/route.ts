import { NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_CHAIN_IDS, type SupportedChainId } from '@/lib/uniswap/types';
import { cachedFetch } from '@/lib/redis/cache';

const CHAIN_NAME_MAP: Record<number, string> = {
  8453: 'Base',
  1: 'Ethereum',
  137: 'Polygon',
};

/**
 * GET /api/defi/pools?chainId=8453&first=20&search=WETH
 * Fetches Uniswap V3 pools via DeFiLlama yields API (reliable, free, no rate limits).
 */
export async function GET(req: NextRequest) {
  const chainId = Number(req.nextUrl.searchParams.get('chainId') || 8453);
  if (!SUPPORTED_CHAIN_IDS.includes(chainId as SupportedChainId)) {
    return NextResponse.json({ ok: false, error: 'Unsupported chainId' }, { status: 400 });
  }

  const first = Math.min(50, Number(req.nextUrl.searchParams.get('first') || 20));
  const search = (req.nextUrl.searchParams.get('search') || '').toLowerCase();
  const chainName = CHAIN_NAME_MAP[chainId];

  if (!chainName) {
    return NextResponse.json({ ok: false, error: 'Unsupported chain' }, { status: 400 });
  }

  try {
    // Fetch from DeFiLlama (Redis-cached, shared across all function instances)
    const allPools = await cachedFetch<any[]>(
      'defillama:pools',
      300, // 5 min TTL
      async () => {
        const res = await fetch('https://yields.llama.fi/pools', {
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`DeFiLlama returned ${res.status}`);
        const json = await res.json();
        return json.data || [];
      },
    );

    // Filter: chain + uniswap-v3 + optional search
    let filtered = allPools!.filter((p: any) =>
      p.chain === chainName &&
      p.project === 'uniswap-v3' &&
      (p.tvlUsd || 0) > 1000
    );

    if (search) {
      filtered = filtered.filter((p: any) =>
        (p.symbol || '').toLowerCase().includes(search)
      );
    }

    // Sort by TVL descending
    filtered.sort((a: any, b: any) => (b.tvlUsd || 0) - (a.tvlUsd || 0));

    // Map to the shape the UI expects
    const pools = filtered.slice(0, first).map((p: any) => {
      const symbols = (p.symbol || '').split('-');
      const token0Symbol = symbols[0] || 'TOKEN0';
      const token1Symbol = symbols[1] || 'TOKEN1';

      // Extract fee tier from pool metadata if available
      const feeTier = p.poolMeta
        ? parseFeeFromMeta(p.poolMeta)
        : 3000; // default 0.30%

      return {
        id: p.pool, // DeFiLlama pool ID (unique)
        token0: { id: '', symbol: token0Symbol, name: token0Symbol, decimals: 18 },
        token1: { id: '', symbol: token1Symbol, name: token1Symbol, decimals: 18 },
        feeTier: String(feeTier),
        tvlUSD: p.tvlUsd || 0,
        volumeUSD: p.volumeUsd1d || p.volumeUsd7d
          ? (p.volumeUsd1d || (p.volumeUsd7d || 0) / 7)
          : 0,
        txCount: '0',
        token0Price: '1',
        token1Price: '1',
        estimatedAPR: p.apyBase || p.apy || 0,
      };
    });

    return NextResponse.json({
      ok: true,
      chainId,
      pools,
      count: pools.length,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (e) {
    console.error('[Pools API] Error:', e);
    return NextResponse.json({ ok: false, error: 'Failed to fetch pools' }, { status: 500 });
  }
}

/** Parse fee tier from DeFiLlama poolMeta string (e.g. "0.3%", "1%", "0.05%") */
function parseFeeFromMeta(meta: string): number {
  const match = meta.match(/([\d.]+)%/);
  if (!match) return 3000;
  const pct = parseFloat(match[1]);
  return Math.round(pct * 10000); // 0.3% → 3000, 1% → 10000, 0.05% → 500
}
