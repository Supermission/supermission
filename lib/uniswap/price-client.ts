/**
 * Uniswap V3 Subgraph Price Client
 * Replaces CoinDesk for all pricing — uses free public subgraph endpoints.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type { OHLCVPoint } from '@/lib/types/market';
import type { OHLCVPoint } from '@/lib/types/market';

export interface LatestPrice {
  price: number;
  open24h: number;
  high24h: number;
  low24h: number;
  change24h: number;
  changePct24h: number;
  volume24h: number;
  lastUpdate: number;
}

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

// ── Subgraph Endpoints ────────────────────────────────────────────────────
// Prefer The Graph's decentralized gateway (higher rate limits, more reliable)
// Set GRAPH_API_KEY in .env to use it; falls back to free studio endpoint

const GRAPH_API_KEY = process.env.GRAPH_API_KEY || '';

// Decentralized network subgraph IDs (from The Graph Explorer)
const SUBGRAPH_IDS: Record<number, string> = {
  8453: '43Hwfi3dJSoGpyas9VwNoDAv55yjgGrPpNSmbQZArzMG', // Uniswap V3 Base
};

const SUBGRAPH_URLS: Record<number, string> = GRAPH_API_KEY
  ? {
      8453: `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/${SUBGRAPH_IDS[8453]}`,
    }
  : {
      8453: 'https://api.studio.thegraph.com/query/48211/uniswap-v3-base/version/latest',
    };

const DEFAULT_CHAIN = 8453; // Base

// ── Token Address Maps (per chain) ────────────────────────────────────────
// Uniswap subgraph indexes by token address. We use WETH/WBTC for ETH/BTC prices.

export const SYMBOL_TO_ADDRESS: Record<number, Record<string, string>> = {
  8453: {
    ETH: '0x4200000000000000000000000000000000000006', // WETH on Base
    WETH: '0x4200000000000000000000000000000000000006',
    BTC: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', // WBTC on Base
    WBTC: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
    USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    DAI: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
    LINK: '0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196',
    UNI: '0xc3de830ea07524a0761646a6a4e4be0e114a3c83',
  },
  // Chain 1 and 137 removed — hosted subgraph endpoints were sunset by The Graph
};

const STABLECOINS = new Set(['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX']);

// ── Cache ──────────────────────────────────────────────────────────────────

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) return entry.data as T;
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

const CACHE_TTL_HISTORY = 60 * 60_000; // 60 min
const CACHE_TTL_CURRENT = 5 * 60_000;  // 5 min

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveAddress(symbol: string, chainId: number): string | null {
  const sym = symbol.toUpperCase();
  const chainMap = SYMBOL_TO_ADDRESS[chainId];
  return chainMap?.[sym] ?? null;
}

function getSubgraphUrl(chainId: number): string {
  return SUBGRAPH_URLS[chainId] || SUBGRAPH_URLS[DEFAULT_CHAIN];
}

export async function subgraphQuery<T>(chainId: number, query: string, retries = 3): Promise<T> {
  const url = getSubgraphUrl(chainId);

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(10_000),
      });

      // Don't retry any 4xx — retrying 429 makes rate limiting worse
      if (res.status >= 400 && res.status < 500) {
        if (res.status === 429) {
          console.warn(`[UniswapPrice] Rate limited (429) on chain ${chainId}, returning empty`);
          return {} as T;
        }
        throw new Error(`Subgraph HTTP ${res.status}`);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`[UniswapPrice] Subgraph HTTP ${res.status}: ${text}`);
      }

      const json = await res.json();
      if (json.errors?.length) {
        throw new Error(`[UniswapPrice] Subgraph error: ${json.errors[0].message}`);
      }
      return json.data as T;
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
        console.warn(`[UniswapPrice] Subgraph timeout on chain ${chainId} (attempt ${attempt + 1}/${retries})`);
        if (attempt < retries - 1) continue;
        return {} as T;
      }
      throw err;
    }
  }

  return {} as T;
}

// ── Stablecoin Helpers ─────────────────────────────────────────────────────

function stablecoinHistory(limit: number, intervalSec: number): OHLCVPoint[] {
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: limit }, (_, i) => ({
    time: now - (limit - 1 - i) * intervalSec,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 0,
  }));
}

function stablecoinPrice(): LatestPrice {
  return {
    price: 1,
    open24h: 1,
    high24h: 1,
    low24h: 1,
    change24h: 0,
    changePct24h: 0,
    volume24h: 0,
    lastUpdate: Math.floor(Date.now() / 1000),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Historical daily OHLCV from tokenDayDatas.
 */
export async function getHistoricalDaily(
  symbol: string,
  chainId: number = DEFAULT_CHAIN,
  limit: number = 30
): Promise<OHLCVPoint[]> {
  const sym = symbol.toUpperCase();
  if (STABLECOINS.has(sym)) return stablecoinHistory(limit, 86400);

  const cacheKey = `uni:daily:${sym}:${chainId}:${limit}`;
  const cached = getCached<OHLCVPoint[]>(cacheKey);
  if (cached) return cached;

  const queryChain = chainId;
  const addr = resolveAddress(sym, queryChain);
  if (!addr) throw new Error(`[UniswapPrice] No address mapping for ${sym} on chain ${queryChain}`);

  const data = await subgraphQuery<{
    tokenDayDatas: Array<{
      date: number;
      open: string;
      high: string;
      low: string;
      close: string;
      totalValueLockedUSD: string;
      volumeUSD: string;
    }>;
  }>(
    queryChain,
    `{
      tokenDayDatas(
        first: ${limit}
        orderBy: date
        orderDirection: desc
        where: { token: "${addr.toLowerCase()}" }
      ) {
        date
        open
        high
        low
        close
        totalValueLockedUSD
        volumeUSD
      }
    }`
  );

  const points: OHLCVPoint[] = (data.tokenDayDatas || [])
    .map((d) => ({
      time: d.date,
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close),
      volume: parseFloat(d.volumeUSD),
    }))
    .reverse(); // oldest first

  setCache(cacheKey, points, CACHE_TTL_HISTORY);
  return points;
}

/**
 * Historical hourly OHLCV from tokenHourDatas.
 */
export async function getHistoricalHourly(
  symbol: string,
  chainId: number = DEFAULT_CHAIN,
  limit: number = 24
): Promise<OHLCVPoint[]> {
  const sym = symbol.toUpperCase();
  if (STABLECOINS.has(sym)) return stablecoinHistory(limit, 3600);

  const cacheKey = `uni:hourly:${sym}:${chainId}:${limit}`;
  const cached = getCached<OHLCVPoint[]>(cacheKey);
  if (cached) return cached;

  const queryChain = chainId;
  const addr = resolveAddress(sym, queryChain);
  if (!addr) throw new Error(`[UniswapPrice] No address mapping for ${sym} on chain ${queryChain}`);

  const data = await subgraphQuery<{
    tokenHourDatas: Array<{
      periodStartUnix: number;
      open: string;
      high: string;
      low: string;
      close: string;
      volumeUSD: string;
    }>;
  }>(
    queryChain,
    `{
      tokenHourDatas(
        first: ${limit}
        orderBy: periodStartUnix
        orderDirection: desc
        where: { token: "${addr.toLowerCase()}" }
      ) {
        periodStartUnix
        open
        high
        low
        close
        volumeUSD
      }
    }`
  );

  const points: OHLCVPoint[] = (data.tokenHourDatas || [])
    .map((d) => ({
      time: d.periodStartUnix,
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close),
      volume: parseFloat(d.volumeUSD),
    }))
    .reverse();

  setCache(cacheKey, points, CACHE_TTL_HISTORY);
  return points;
}

/**
 * Current prices + 24h change for multiple symbols.
 * Queries latest 2 tokenDayDatas to compute 24h delta.
 */
export async function getMultiPrice(
  symbols: string[],
  chainId: number = DEFAULT_CHAIN
): Promise<Map<string, LatestPrice>> {
  const result = new Map<string, LatestPrice>();

  // Separate stablecoins from tokens needing subgraph queries
  const toQuery: Array<{ sym: string; addr: string; queryChain: number }> = [];
  for (const raw of symbols) {
    const sym = raw.toUpperCase();
    if (STABLECOINS.has(sym)) {
      result.set(sym, stablecoinPrice());
      continue;
    }

    const cacheKey = `uni:latest:${sym}:${chainId}`;
    const cached = getCached<LatestPrice>(cacheKey);
    if (cached) {
      result.set(sym, cached);
      continue;
    }

    const queryChain = chainId;
    const addr = resolveAddress(sym, queryChain);
    if (addr) {
      toQuery.push({ sym, addr, queryChain });
    }
  }

  // Batch by chain to minimize subgraph calls
  const byChain = new Map<number, Array<{ sym: string; addr: string }>>();
  for (const item of toQuery) {
    const list = byChain.get(item.queryChain) || [];
    list.push(item);
    byChain.set(item.queryChain, list);
  }

  // Query each chain — batch all tokens into a single GraphQL request using aliases
  const promises = Array.from(byChain.entries()).map(async ([chain, items]) => {
    // Build a single batched query with aliases for each token
    const fragments = items.map(({ sym, addr }, i) =>
      `t${i}: tokenDayDatas(
        first: 2
        orderBy: date
        orderDirection: desc
        where: { token: "${addr.toLowerCase()}" }
      ) {
        date
        open
        high
        low
        close
        volumeUSD
      }`
    );

    try {
      const data = await subgraphQuery<Record<string, Array<{
        date: number;
        open: string;
        high: string;
        low: string;
        close: string;
        volumeUSD: string;
      }>>>(chain, `{ ${fragments.join('\n')} }`);

      items.forEach(({ sym }, i) => {
        const days = data[`t${i}`] || [];
        if (days.length === 0) return;

        const today = days[0];
        const yesterday = days[1];

        const price = parseFloat(today.close);
        const prevClose = yesterday ? parseFloat(yesterday.close) : parseFloat(today.open);
        const change24h = price - prevClose;
        const changePct = prevClose > 0 ? (change24h / prevClose) * 100 : 0;

        const latest: LatestPrice = {
          price,
          open24h: parseFloat(today.open),
          high24h: parseFloat(today.high),
          low24h: parseFloat(today.low),
          change24h,
          changePct24h: changePct,
          volume24h: parseFloat(today.volumeUSD),
          lastUpdate: today.date,
        };

        result.set(sym, latest);
        setCache(`uni:latest:${sym}:${chainId}`, latest, CACHE_TTL_CURRENT);
      });
    } catch (err) {
      console.warn(`[UniswapPrice] Failed to batch-fetch on chain ${chain}:`, err);
    }
  });

  await Promise.all(promises);
  return result;
}
