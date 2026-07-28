import { NextRequest, NextResponse } from 'next/server';

const CLOB_API = 'https://clob.polymarket.com';
const DATA_API = 'https://data-api.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

const API_MAP: Record<string, string> = {
  clob: CLOB_API,
  data: DATA_API,
  gamma: GAMMA_API,
};

// Allowed path prefixes per API to prevent open-proxy abuse
const ALLOWED_PATHS: Record<string, string[]> = {
  clob: ['/book', '/spread', '/midpoint', '/prices-history', '/tick-size', '/price', '/builder-trades'],
  data: ['/positions', '/holders', '/open-interest', '/volume', '/trades', '/get-user-activity'],
  gamma: ['/comments', '/events/', '/series/', '/profiles/'],
};

// Edge-cache TTL (seconds) per endpoint path.
// Endpoints not listed here get no cache (pass-through).
const CACHE_TTL: Record<string, number> = {
  // Orderbook data — already polled every 30s on the client,
  // short cache just deduplicates concurrent users on the same market.
  '/book': 3,
  '/spread': 3,
  '/midpoint': 3,
  '/tick-size': 60,

  // Trade execution — must be fresh, no cache.
  '/price': 0,
  '/builder-trades': 0,

  // Data API — changes infrequently.
  '/holders': 60,
  '/open-interest': 30,
  '/volume': 30,
  '/trades': 10,
  '/positions': 5,
  '/get-user-activity': 10,

  // Historical / static-ish data.
  '/prices-history': 30,

  // Gamma API
  '/comments': 30,
  '/events/': 30,
  '/series/': 60,
  '/profiles/': 60,
};

function getCacheTtl(path: string): number {
  // Exact match first, then prefix match
  if (path in CACHE_TTL) return CACHE_TTL[path];
  for (const [prefix, ttl] of Object.entries(CACHE_TTL)) {
    if (path.startsWith(prefix)) return ttl;
  }
  return 0;
}

/**
 * GET /api/proxy/polymarket?api=clob&path=/book&token_id=xxx
 *
 * Generic server-side proxy for Polymarket APIs.
 * Forwards the request from Vercel to Polymarket, bypassing ISP-level blocks.
 * Adds Cache-Control headers to let Vercel's edge cache deduplicate requests.
 *
 * Query params:
 *   api  — "clob" | "data" | "gamma" (required)
 *   path — the endpoint path, e.g. "/book" (required)
 *   ...  — all other query params are forwarded as-is
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const api = searchParams.get('api');
  const path = searchParams.get('path');

  if (!api || !path) {
    return NextResponse.json(
      { error: 'api and path query params are required' },
      { status: 400 },
    );
  }

  const baseUrl = API_MAP[api];
  if (!baseUrl) {
    return NextResponse.json(
      { error: `Unknown api: ${api}. Must be one of: ${Object.keys(API_MAP).join(', ')}` },
      { status: 400 },
    );
  }

  // Validate path against allowlist
  const allowed = ALLOWED_PATHS[api] || [];
  if (!allowed.some((prefix) => path.startsWith(prefix))) {
    return NextResponse.json(
      { error: `Path ${path} is not allowed for api ${api}` },
      { status: 403 },
    );
  }

  // Build upstream URL: forward all query params except "api" and "path"
  const upstream = new URL(`${baseUrl}${path}`);
  searchParams.forEach((value, key) => {
    if (key !== 'api' && key !== 'path') {
      upstream.searchParams.set(key, value);
    }
  });

  const ttl = getCacheTtl(path);

  try {
    // ttl > 0 → opt into Next.js data cache so concurrent requests to the
    // same upstream URL are deduplicated per-instance (on top of the edge
    // Cache-Control header below, which dedupes across instances).
    // ttl === 0 → force-fresh for trade-execution endpoints.
    const fetchInit: RequestInit & { next?: { revalidate: number } } = {
      signal: AbortSignal.timeout(10_000),
    };
    if (ttl > 0) {
      fetchInit.next = { revalidate: ttl };
    } else {
      fetchInit.cache = 'no-store';
    }

    const res = await fetch(upstream.toString(), fetchInit);

    if (!res.ok) {
      // 404 / 410 from CLOB means the token belongs to a retired market
      // (resolved, archived). Forward the real status so the client can stop
      // polling instead of seeing a generic 502 and retrying forever.
      const passthrough = res.status === 404 || res.status === 410 ? res.status : 502;
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: passthrough },
      );
    }

    const data = await res.json();

    const headers: Record<string, string> = {};
    if (ttl > 0) {
      // s-maxage: edge cache TTL, stale-while-revalidate: serve stale for 2× TTL while refreshing
      headers['Cache-Control'] = `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`;
    } else {
      headers['Cache-Control'] = 'no-store';
    }

    return NextResponse.json(data, { headers });
  } catch (err: any) {
    console.error(`[/api/proxy/polymarket] ${api}${path} error:`, err?.message);
    return NextResponse.json(
      { error: 'Failed to fetch from upstream' },
      { status: 502 },
    );
  }
}
