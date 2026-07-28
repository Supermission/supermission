/**
 * Polymarket API Client — typed wrappers for all Polymarket endpoints
 * Used across advanced trader features.
 */

import { cachedFetch } from '../redis/cache';

const CLOB_API = 'https://clob.polymarket.com';
const DATA_API = 'https://data-api.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

// Server-side proxy base — used for read-only calls from the browser
// to bypass ISP-level DNS blocks on Polymarket domains.
// On the server (API routes), calls go directly to Polymarket (no ISP block there).
const DIRECT_BASE: Record<string, string> = { clob: CLOB_API, data: DATA_API, gamma: GAMMA_API };

/**
 * Parse a Gamma API value that may be a JSON string, an array already, or
 * malformed. Never throws — returns `[]` on parse failure so one bad market
 * can't take down an entire event fetch.
 */
function safeParseArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function proxyUrl(api: 'clob' | 'data' | 'gamma', path: string, params?: Record<string, string>): string {
  const isServer = typeof window === 'undefined';

  if (isServer) {
    // Server-side: call Polymarket directly
    const url = new URL(`${DIRECT_BASE[api]}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  // Client-side: go through our Vercel proxy to bypass ISP blocks
  const url = new URL('/api/proxy/polymarket', window.location.origin);
  url.searchParams.set('api', api);
  url.searchParams.set('path', path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

const DEFAULT_TIMEOUT = 5000;
const MAX_RETRIES = 2;

// ── Types ──────────────────────────────────────────────────────────

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookSummary {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface SpreadData {
  spread: number;
  bidPrice: number;
  askPrice: number;
}

export interface VolumeData {
  volume: number;
  volume24h: number;
  openInterest: number;
}

export interface Holder {
  address: string;
  position: number;
  outcome: string;
  proxyWallet?: string;
  username?: string;
  profileImage?: string;
}

export interface Comment {
  id: string;
  author: string;
  content: string;
  createdAt: string;
  likes: number;
  parentId?: string;
}

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  markets: EventMarket[];
  startDate: string;
  endDate: string;
  volume: number;
  liquidity: number;
}

export interface EventMarket {
  conditionId: string;
  question: string;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
}

export interface Series {
  id: string;
  slug: string;
  title: string;
  events: PolymarketEvent[];
}

export interface Profile {
  address: string;
  username?: string;
  profileImage?: string;
  bio?: string;
  positions: number;
  volume: number;
}

export interface Activity {
  type: string;
  market: string;
  side: string;
  size: number;
  price: number;
  timestamp: string;
  outcomeIndex: number;
}

export interface TradeItem {
  id: string;
  conditionId: string;
  asset: string;
  side: string;
  size: number;
  price: number;
  usdcSize: number;
  outcome: string;
  outcomeIndex: number;
  title: string;
  slug: string;
  timestamp: string;
  transactionHash: string;
  type: string;
}

export interface BuilderTrade {
  id: string;
  market: string;
  side: string;
  size: string;
  price: string;
  timestamp: string;
}

export interface PriceHistoryPoint {
  t: number;
  p: number;
}

// ── Fetch helper with timeout + retry ──────────────────────────────

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES,
  timeout = DEFAULT_TIMEOUT,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;

      // Don't retry any 4xx — retrying 429 makes rate limiting worse
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      if (attempt === retries) {
        throw new Error(`HTTP ${res.status} after ${retries + 1} attempts`);
      }
    } catch (err: any) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      // Exponential backoff
      await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
    }
  }

  throw new Error('Unreachable');
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url);
  return res.json();
}

/**
 * Server-side only: fetch JSON with Redis caching.
 * On the client, falls through to a plain fetchJson (client calls go through
 * the /api/proxy/polymarket route which has its own HTTP cache headers).
 */
async function cachedFetchJson<T>(key: string, ttl: number, url: string): Promise<T> {
  if (typeof window !== 'undefined') return fetchJson<T>(url);
  return cachedFetch<T>(key, ttl, () => fetchJson<T>(url));
}

// ── CLOB API ───────────────────────────────────────────────────────

export async function fetchOrderBook(tokenId: string): Promise<OrderBookSummary> {
  const raw = await cachedFetchJson<any>(`poly:book:${tokenId}`, 5, proxyUrl('clob', '/book', { token_id: tokenId }));
  return {
    bids: (raw.bids || []).map((b: any) => ({
      price: parseFloat(b.price),
      size: parseFloat(b.size),
    })).sort((a: OrderBookLevel, b: OrderBookLevel) => b.price - a.price),
    asks: (raw.asks || []).map((a: any) => ({
      price: parseFloat(a.price),
      size: parseFloat(a.size),
    })).sort((a: OrderBookLevel, b: OrderBookLevel) => a.price - b.price),
    timestamp: Date.now(),
  };
}

export async function fetchSpread(tokenId: string): Promise<SpreadData> {
  const raw = await cachedFetchJson<any>(`poly:spread:${tokenId}`, 5, proxyUrl('clob', '/spread', { token_id: tokenId }));
  const bid = parseFloat(raw.bid || '0');
  const ask = parseFloat(raw.ask || '1');
  return {
    spread: ask - bid,
    bidPrice: bid,
    askPrice: ask,
  };
}

export async function fetchMidpoint(tokenId: string): Promise<number> {
  const raw = await cachedFetchJson<any>(`poly:mid:${tokenId}`, 5, proxyUrl('clob', '/midpoint', { token_id: tokenId }));
  return parseFloat(raw.mid || '0.5');
}

export async function fetchTickSize(tokenId: string): Promise<string> {
  const raw = await cachedFetchJson<any>(`poly:tick:${tokenId}`, 3600, proxyUrl('clob', '/tick-size', { token_id: tokenId }));
  return raw.minimum_tick_size || '0.01';
}

export async function fetchPrice(tokenId: string): Promise<number> {
  const raw = await cachedFetchJson<any>(`poly:price:${tokenId}`, 5, proxyUrl('clob', '/price', { token_id: tokenId }));
  return parseFloat(raw.price || '0.5');
}

// ── Data API ───────────────────────────────────────────────────────

export async function fetchOpenInterest(conditionId: string): Promise<number> {
  const raw = await cachedFetchJson<any>(`poly:oi:${conditionId}`, 60, proxyUrl('data', '/open-interest', { market: conditionId }));
  return parseFloat(raw.open_interest || '0');
}

export async function fetchLiveVolume(eventId: string): Promise<VolumeData> {
  const raw = await cachedFetchJson<any>(`poly:vol:${eventId}`, 60, proxyUrl('data', '/volume', { event_id: eventId }));
  return {
    volume: parseFloat(raw.volume || '0'),
    volume24h: parseFloat(raw.volume_24h || '0'),
    openInterest: parseFloat(raw.open_interest || '0'),
  };
}

export async function fetchTopHolders(conditionId: string): Promise<Holder[]> {
  // Response is grouped by token: [{ token, holders: [...] }, { token, holders: [...] }]
  const raw = await cachedFetchJson<any[]>(`poly:holders:${conditionId}`, 300, proxyUrl('data', '/holders', { market: conditionId, limit: '100', minBalance: '1' }));
  const all: Holder[] = [];
  for (const group of raw || []) {
    for (const h of group.holders || []) {
      all.push({
        address: h.proxyWallet || h.address || '',
        position: parseFloat(String(h.amount || h.size || '0')),
        outcome: h.outcomeIndex === 0 ? 'Yes' : h.outcomeIndex === 1 ? 'No' : 'unknown',
        proxyWallet: h.proxyWallet,
        username: h.displayUsernamePublic ? (h.name || h.pseudonym) : h.pseudonym,
        profileImage: h.profileImage || h.profileImageOptimized || undefined,
      });
    }
  }
  // Sort by position descending across all outcomes
  return all.sort((a, b) => b.position - a.position);
}

export async function fetchUserTrades(address: string): Promise<TradeItem[]> {
  const PAGE_SIZE = 500; // max allowed by Polymarket Data API
  const all: TradeItem[] = [];
  let offset = 0;

  while (true) {
    const raw = await fetchJson<any[]>(
      proxyUrl('data', '/trades', { user: address, limit: String(PAGE_SIZE), offset: String(offset) })
    );
    const batch = (raw || []).map((t: any) => ({
      id: t.id || t.transactionHash || '',
      conditionId: t.conditionId || t.market || '',
      asset: t.asset || t.asset_id || '',
      side: t.side || '',
      size: parseFloat(t.size || '0'),
      price: parseFloat(t.price || '0'),
      usdcSize: parseFloat(t.usdcSize || '0'),
      outcome: t.outcome || '',
      outcomeIndex: t.outcomeIndex ?? 0,
      title: t.title || '',
      slug: t.slug || '',
      timestamp: t.timestamp || t.created_at || '',
      transactionHash: t.transactionHash || '',
      type: t.type || 'TRADE',
    }));
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

export async function fetchUserActivity(address: string): Promise<Activity[]> {
  const raw = await fetchJson<any[]>(proxyUrl('data', '/get-user-activity', { address }));
  return (raw || []).map((a: any) => ({
    type: a.type,
    market: a.market,
    side: a.side,
    size: parseFloat(a.size || '0'),
    price: parseFloat(a.price || '0'),
    timestamp: a.timestamp || a.created_at,
    outcomeIndex: a.outcome_index || 0,
  }));
}

// ── Gamma API ──────────────────────────────────────────────────────

export async function fetchComments(conditionId: string, cursor?: string): Promise<{ comments: Comment[]; nextCursor?: string }> {
  const params: Record<string, string> = { market: conditionId };
  if (cursor) params.cursor = cursor;

  const cacheKey = `poly:comments:${conditionId}:${cursor || '0'}`;
  const raw = await cachedFetchJson<any>(cacheKey, 120, proxyUrl('gamma', '/comments', params));
  return {
    comments: (raw.comments || raw.data || []).map((c: any) => ({
      id: c.id,
      author: c.author || c.user,
      content: c.content || c.body,
      createdAt: c.created_at || c.createdAt,
      likes: c.likes || 0,
      parentId: c.parent_id || c.parentId,
    })),
    nextCursor: raw.next_cursor || raw.nextCursor,
  };
}

export async function fetchEvent(eventId: string): Promise<PolymarketEvent> {
  const raw = await cachedFetchJson<any>(`poly:event:${eventId}`, 300, proxyUrl('gamma', `/events/${eventId}`));
  return {
    id: raw.id,
    slug: raw.slug || '',
    title: raw.title || raw.name || '',
    description: raw.description || '',
    markets: (raw.markets || []).map((m: any) => ({
      conditionId: m.condition_id || m.conditionId,
      question: m.question,
      outcomes: safeParseArray(m.outcomes),
      outcomePrices: safeParseArray(m.outcome_prices).map(Number),
      volume: parseFloat(m.volume || '0'),
      liquidity: parseFloat(m.liquidity || '0'),
      active: m.active ?? m.is_active ?? true,
      closed: m.closed ?? m.is_closed ?? false,
    })),
    startDate: raw.start_date || raw.startDate || '',
    endDate: raw.end_date || raw.endDate || '',
    volume: parseFloat(raw.volume || '0'),
    liquidity: parseFloat(raw.liquidity || '0'),
  };
}

export async function fetchSeries(seriesId: string): Promise<Series> {
  const raw = await cachedFetchJson<any>(`poly:series:${seriesId}`, 600, proxyUrl('gamma', `/series/${seriesId}`));
  return {
    id: raw.id,
    slug: raw.slug || '',
    title: raw.title || raw.name || '',
    events: (raw.events || []).map((e: any) => ({
      id: e.id,
      slug: e.slug || '',
      title: e.title || e.name || '',
      description: e.description || '',
      markets: [],
      startDate: e.start_date || '',
      endDate: e.end_date || '',
      volume: parseFloat(e.volume || '0'),
      liquidity: parseFloat(e.liquidity || '0'),
    })),
  };
}

export async function fetchProfile(address: string): Promise<Profile> {
  const raw = await cachedFetchJson<any>(`poly:profile:${address}`, 300, proxyUrl('gamma', `/profiles/${address}`));
  return {
    address: raw.address || address,
    username: raw.username || raw.name,
    profileImage: raw.profile_image || raw.avatar,
    bio: raw.bio,
    positions: raw.positions || 0,
    volume: parseFloat(raw.volume || '0'),
  };
}

export async function fetchPriceHistory(
  tokenId: string,
  interval: string = 'max',
  fidelity: number = 60,
): Promise<PriceHistoryPoint[]> {
  const raw = await cachedFetchJson<any>(
    `poly:history:${tokenId}:${interval}:${fidelity}`, 300,
    proxyUrl('clob', '/prices-history', { market: tokenId, interval, fidelity: String(fidelity) })
  );
  return (raw.history || []).map((p: any) => ({
    t: p.t,
    p: parseFloat(p.p),
  }));
}

export async function fetchBuilderTrades(builderId: string, limit = 50): Promise<BuilderTrade[]> {
  const url = proxyUrl('clob', '/builder-trades', { builder: builderId, limit: String(limit) });
  const raw = await fetchJson<any[]>(url);
  return (raw || []).map((t: any) => ({
    id: t.id,
    market: t.market,
    side: t.side,
    size: t.size,
    price: t.price,
    timestamp: t.timestamp || t.created_at,
  }));
}
