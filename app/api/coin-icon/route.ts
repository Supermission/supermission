import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/redis/cache';

const CMC_API_KEY = process.env.CMC_API_KEY || '';

/**
 * GET /api/coin-icon
 *
 * Returns a full symbol→CMC-CDN-URL map for all top coins.
 * Cached in Redis for 24 h — one API call per day.
 * Client fetches this once and caches in memory.
 */

type CmcMapEntry = { id: number; symbol: string };

async function getSymbolToUrlMap(): Promise<Record<string, string>> {
  return cachedFetch<Record<string, string>>(
    'cmc:symbol-url-map',
    86_400, // 24 h
    async () => {
      const res = await fetch(
        'https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?listing_status=active,untracked&limit=5000&sort=cmc_rank',
        { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY, Accept: 'application/json' } },
      );
      if (!res.ok) {
        console.error(`[CMC] map fetch failed: ${res.status}`);
        return {};
      }
      const json = await res.json();
      const entries: CmcMapEntry[] = json.data ?? [];
      const map: Record<string, string> = {};
      for (const e of entries) {
        const sym = e.symbol.toUpperCase();
        // First match wins (highest cmc_rank)
        if (!map[sym]) {
          map[sym] = `https://s2.coinmarketcap.com/static/img/coins/128x128/${e.id}.png`;
        }
      }
      return map;
    },
  );
}

export async function GET() {
  const map = await getSymbolToUrlMap();
  return NextResponse.json(map, {
    headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
  });
}
