/**
 * Nansen API Client
 * Provides access to Nansen's on-chain analytics: trending tokens, smart money flows,
 * token intelligence, and DEX trades.
 *
 * All functions are exported individually (no class) for tree-shaking and
 * consistency with the DELPHI agent tool pattern.
 */

import { redis } from '../redis/client';

const BASE_URL = 'https://api.nansen.ai/api/v1';

// ============================================================================
// TYPES
// ============================================================================

export interface TrendingTokensParams {
  chains?: string[];
  /** Options: 5m, 10m, 1h, 6h, 24h, 7d, 30d */
  timeframe?: string;
  /** Options: volume, buy_volume, price_change, netflow, nof_traders */
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
  /** Options: all, sm (smart money), whale, public_figure */
  traderType?: string;
  limit?: number;
  filters?: {
    market_cap_usd?: { min?: number; max?: number };
    token_age_days?: { min?: number; max?: number };
    volume?: { min?: number; max?: number };
  };
}

export interface TrendingToken {
  chain: string;
  token_address: string;
  token_symbol: string;
  market_cap_usd: number;
  liquidity: number;
  price_usd: number;
  price_change: number;
  volume: number;
  buy_volume: number;
  sell_volume: number;
  netflow: number;
  nof_traders: number;
  nof_buyers: number;
  nof_sellers: number;
  fdv: number;
  token_age_days: number;
}

export interface SmartMoneyNetflowsParams {
  chains?: string[];
  /** Default: net_flow_24h_usd */
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
  limit?: number;
  /** e.g. ['Fund', 'Smart Trader'] */
  includeLabels?: string[];
  filters?: {
    market_cap_usd?: { min?: number; max?: number };
    token_age_days?: { min?: number; max?: number };
  };
}

export interface SmartMoneyNetflow {
  token_address: string;
  token_symbol: string;
  chain: string;
  net_flow_1h_usd: number;
  net_flow_24h_usd: number;
  net_flow_7d_usd: number;
  net_flow_30d_usd: number;
  trader_count: number;
  token_age_days: number;
  market_cap_usd: number;
  token_sectors: string[];
}

export interface SmartMoneyHoldingsParams {
  chains?: string[];
  /** Default: balance_24h_percent_change */
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
  limit?: number;
  filters?: {
    balance_24h_percent_change?: { min?: number };
    value_usd?: { min?: number };
    holders_count?: { min?: number };
  };
}

export interface SmartMoneyHolding {
  chain: string;
  token_address: string;
  token_symbol: string;
  value_usd: number;
  balance_24h_percent_change: number;
  holders_count: number;
  share_of_holdings_percent: number;
  token_age_days: number;
  market_cap_usd: number;
  token_sectors: string[];
}

export interface TokenInfo {
  name: string;
  symbol: string;
  contract_address: string;
  logo: string;
  market_cap_usd: number;
  fdv_usd: number;
  circulating_supply: number;
  total_supply: number;
  volume_total_usd: number;
  buy_volume_usd: number;
  sell_volume_usd: number;
  total_buys: number;
  total_sells: number;
  unique_buyers: number;
  unique_sellers: number;
  liquidity_usd: number;
  total_holders: number;
  token_deployment_date: string;
  website: string;
  x: string;
  telegram: string;
}

export interface NansenIndicator {
  indicator_type: string;
  score: number;
  signal: string;
  signal_percentile: number;
  last_trigger_on: string;
}

export interface NansenIndicatorsResponse {
  token_address: string;
  chain: string;
  token_info: {
    market_cap_usd: number;
    market_cap_group: string;
    is_stablecoin: boolean;
  };
  risk_indicators: NansenIndicator[];
  reward_indicators: NansenIndicator[];
}

export interface FlowIntelligenceResponse {
  public_figure_net_flow_usd: number;
  public_figure_avg_flow_usd: number;
  public_figure_wallet_count: number;
  whale_net_flow_usd: number;
  whale_avg_flow_usd: number;
  whale_wallet_count: number;
  smart_trader_net_flow_usd: number;
  smart_trader_avg_flow_usd: number;
  smart_trader_wallet_count: number;
  exchange_net_flow_usd: number;
  exchange_avg_flow_usd: number;
  exchange_wallet_count: number;
  fresh_wallets_net_flow_usd: number;
  fresh_wallets_avg_flow_usd: number;
  fresh_wallets_wallet_count: number;
}

export interface SearchTokenResult {
  name: string;
  symbol: string;
  chain: string;
  address: string;
  price: number;
  volume_24h: number;
  market_cap: number;
}

export interface SmartMoneyDexTradesParams {
  chains?: string[];
  limit?: number;
  filters?: {
    token_bought_symbol?: string | string[];
    trade_value_usd?: { min?: number };
  };
}

export interface SmartMoneyDexTrade {
  chain: string;
  block_timestamp: string;
  transaction_hash: string;
  trader_address: string;
  trader_address_label: string;
  token_bought_symbol: string;
  token_sold_symbol: string;
  token_bought_amount: number;
  token_sold_amount: number;
  trade_value_usd: number;
  token_bought_market_cap: number;
  token_sold_market_cap: number;
}

/** Union type returned by all client functions — data on success, error object on failure */
type NansenResult<T> = T | { error: string };

// ============================================================================
// RATE LIMITER (Redis-backed, shared across all Vercel function instances)
// ============================================================================

const NANSEN_RATE_LIMIT_PER_SEC = 18;   // back off at 18 (limit is 20)
const NANSEN_RATE_LIMIT_PER_MIN = 290;  // back off at 290 (limit is 300)

/**
 * Rate-limited fetch wrapper using Redis sliding-window counters.
 * Shared across all Vercel function instances so the real Nansen API
 * rate limit is respected globally.
 */
async function rateLimitedFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    const secKey = 'nansen:rps';
    const minKey = 'nansen:rpm';

    // Check per-minute counter
    const minCount = await redis.get<number>(minKey);
    if (minCount !== null && minCount >= NANSEN_RATE_LIMIT_PER_MIN) {
      const ttl = await redis.ttl(minKey);
      const waitMs = Math.max((ttl > 0 ? ttl : 1) * 1000, 1000);
      console.log(`[Nansen] Rate limit: waiting ${waitMs}ms (per-minute limit, count=${minCount})`);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    // Check per-second counter
    const secCount = await redis.get<number>(secKey);
    if (secCount !== null && secCount >= NANSEN_RATE_LIMIT_PER_SEC) {
      console.log('[Nansen] Rate limit: waiting 200ms (per-second limit)');
      await new Promise((r) => setTimeout(r, 200));
    }

    // Increment counters (fire-and-forget for speed)
    const pipeline = redis.pipeline();
    pipeline.incr(secKey);
    pipeline.expire(secKey, 1);
    pipeline.incr(minKey);
    pipeline.expire(minKey, 60);
    pipeline.exec().catch((err) => {
      console.warn('[Nansen] Rate limit counter update failed:', (err as Error).message);
    });
  } catch (err) {
    // Fail open — if Redis is down, proceed without rate limiting
    console.warn('[Nansen] Rate limit check failed, proceeding:', (err as Error).message);
  }

  return fetch(url, options);
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Shared POST helper — handles auth, rate limiting, credit logging, and errors.
 */
async function nansenPost<T>(endpoint: string, body: Record<string, unknown>): Promise<NansenResult<T>> {
  const apiKey = process.env.NANSEN_API_KEY;
  if (!apiKey) return { error: 'Data provider is not configured. Please try again later.' };

  try {
    const res = await rateLimitedFetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apiKey },
      body: JSON.stringify(body),
    });

    // Log credits
    const creditsUsed = res.headers.get('X-Nansen-Credits-Used');
    const creditsRemaining = res.headers.get('X-Nansen-Credits-Remaining');
    if (creditsUsed) {
      console.log(`[Nansen] Credits used: ${creditsUsed}, remaining: ${creditsRemaining}`);
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const internalMessage =
        (err as Record<string, string>).message ||
        (err as Record<string, string>).detail ||
        `Nansen API error: ${res.status}`;
      console.error(`[Nansen] ${endpoint} failed: ${internalMessage}`);
      return { error: 'Unable to fetch on-chain data at the moment. Please try again later.' };
    }

    const json = await res.json();
    // Most Nansen endpoints wrap results in { data: ... }. Unwrap automatically.
    if (json && typeof json === 'object' && 'data' in json && !('error' in json)) {
      return json.data as T;
    }
    return json as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Nansen] ${endpoint} exception: ${message}`);
    return { error: 'Unable to fetch on-chain data at the moment. Please try again later.' };
  }
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Fetch trending tokens from the Nansen Token Screener.
 *
 * @param params - Filter / sort options (all optional, sensible defaults applied)
 * @returns Array of trending tokens or an error object
 */
export async function getTrendingTokens(
  params: TrendingTokensParams = {}
): Promise<NansenResult<TrendingToken[]>> {
  const {
    chains = ['base', 'ethereum', 'polygon'],
    timeframe = '24h',
    sortBy = 'buy_volume',
    sortDirection = 'DESC',
    traderType = 'all',
    limit = 15,
    filters = {},
  } = params;

  const body: Record<string, unknown> = {
    chains,
    timeframe,
    filters: {
      trader_type: traderType,
      ...filters,
    },
    order_by: [{ field: sortBy, direction: sortDirection }],
    pagination: { page: 1, per_page: limit },
  };

  return nansenPost<TrendingToken[]>('/token-screener', body);
}

/**
 * Fetch smart money net-flow data aggregated by token.
 *
 * @param params - Filter / sort options
 * @returns Array of net-flow entries or an error object
 */
export async function getSmartMoneyNetflows(
  params: SmartMoneyNetflowsParams = {}
): Promise<NansenResult<SmartMoneyNetflow[]>> {
  const {
    chains = ['base', 'ethereum', 'polygon'],
    sortBy = 'net_flow_24h_usd',
    sortDirection = 'DESC',
    limit = 15,
    includeLabels,
    filters = {},
  } = params;

  const body: Record<string, unknown> = {
    chains,
    filters,
    order_by: [{ field: sortBy, direction: sortDirection }],
    pagination: { page: 1, per_page: limit },
  };

  if (includeLabels && includeLabels.length > 0) {
    body.include_labels = includeLabels;
  }

  return nansenPost<SmartMoneyNetflow[]>('/smart-money/netflow', body);
}

/**
 * Fetch smart money holdings — tokens accumulated by smart wallets.
 *
 * @param params - Filter / sort options
 * @returns Array of holding entries or an error object
 */
export async function getSmartMoneyHoldings(
  params: SmartMoneyHoldingsParams = {}
): Promise<NansenResult<SmartMoneyHolding[]>> {
  const {
    chains = ['base', 'ethereum', 'polygon'],
    sortBy = 'balance_24h_percent_change',
    sortDirection = 'DESC',
    limit = 15,
    filters = {},
  } = params;

  const body: Record<string, unknown> = {
    chains,
    filters,
    order_by: [{ field: sortBy, direction: sortDirection }],
    pagination: { page: 1, per_page: limit },
  };

  return nansenPost<SmartMoneyHolding[]>('/smart-money/holdings', body);
}

/**
 * Get detailed information about a specific token.
 *
 * @param chain - Blockchain identifier (e.g. 'ethereum', 'base', 'solana')
 * @param tokenAddress - On-chain contract address of the token
 * @param timeframe - Time window for volume / trading stats (default: '1d')
 * @returns Token information or an error object
 */
export async function getTokenInfo(
  chain: string,
  tokenAddress: string,
  timeframe?: string
): Promise<NansenResult<TokenInfo>> {
  return nansenPost<TokenInfo>('/tgm/token-information', {
    chain,
    token_address: tokenAddress,
    timeframe: timeframe || '1d',
  });
}

/**
 * Get Nansen risk & reward indicators for a token.
 *
 * @param chain - Blockchain identifier
 * @param tokenAddress - On-chain contract address
 * @returns Indicator data or an error object
 */
export async function getNansenIndicators(
  chain: string,
  tokenAddress: string
): Promise<NansenResult<NansenIndicatorsResponse>> {
  return nansenPost<NansenIndicatorsResponse>('/tgm/indicators', {
    chain,
    token_address: tokenAddress,
  });
}

/**
 * Get flow intelligence (net flows by trader category) for a token.
 *
 * @param chain - Blockchain identifier
 * @param tokenAddress - On-chain contract address
 * @param timeframe - Time window (default: '1d')
 * @returns Flow intelligence breakdown or an error object
 */
export async function getFlowIntelligence(
  chain: string,
  tokenAddress: string,
  timeframe?: string
): Promise<NansenResult<FlowIntelligenceResponse>> {
  return nansenPost<FlowIntelligenceResponse>('/tgm/flow-intelligence', {
    chain,
    token_address: tokenAddress,
    timeframe: timeframe || '1d',
  });
}

/**
 * Search for a token by name, symbol, or address.
 *
 * @param query - Free-text search query
 * @param chain - Optional chain filter
 * @returns Array of matching tokens or an error object
 */
export async function searchToken(
  query: string,
  chain?: string
): Promise<NansenResult<SearchTokenResult[]>> {
  const body: Record<string, unknown> = {
    search_query: query,
    result_type: 'token',
    limit: 10,
  };

  if (chain) {
    body.chain = chain;
  }

  // Search endpoint returns { tokens: [...] } not { data: [...] }
  const apiKey = process.env.NANSEN_API_KEY;
  if (!apiKey) return { error: 'Data provider is not configured. Please try again later.' };

  try {
    const res = await rateLimitedFetch(`${BASE_URL}/search/general`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[Nansen] search failed: ${(err as any).message || res.status}`);
      return { error: 'Unable to search token data at the moment. Please try again later.' };
    }
    const json = await res.json();
    return (json.tokens || []) as SearchTokenResult[];
  } catch (err) {
    console.error(`[Nansen] search exception: ${err instanceof Error ? err.message : err}`);
    return { error: 'Unable to search token data at the moment. Please try again later.' };
  }
}

/**
 * Fetch recent DEX trades made by smart money wallets.
 *
 * @param params - Filter options (chains, token symbols, minimum trade value)
 * @returns Array of DEX trades or an error object
 */
export async function getSmartMoneyDexTrades(
  params: SmartMoneyDexTradesParams = {}
): Promise<NansenResult<SmartMoneyDexTrade[]>> {
  const {
    chains = ['base', 'ethereum', 'polygon'],
    limit = 15,
    filters = {},
  } = params;

  const body: Record<string, unknown> = {
    chains,
    filters,
    pagination: { page: 1, per_page: limit },
  };

  return nansenPost<SmartMoneyDexTrade[]>('/smart-money/dex-trades', body);
}
