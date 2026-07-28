/**
 * Short-TTL Redis cache for Polymarket positions with reliability guardrails.
 *
 * Layers (in order on each getPolymarketPositions call):
 *   1. Fresh cache (10s TTL) — absorbs same-turn duplicate fetches.
 *   2. Circuit breaker — if Polymarket has been failing, short-circuit to
 *      last-known-good without even attempting the upstream call.
 *   3. Retry with exponential backoff on 429/5xx/network errors.
 *   4. On success, populate fresh cache AND a separate 5-minute
 *      "last-known-good" cache for use when upstream is down.
 *   5. On failure, serve last-known-good if available and mark it stale.
 *
 * Callers get `{ positions, stale, staleSince }`. The `stale` flag lets the
 * UI tell the user when data isn't current. The SSE route can also relay this
 * to the LLM so it doesn't claim authoritative P&L from stale data.
 */

import { redis } from '@/lib/redis/client';
import { cachedFetchWithHit, invalidateCache } from '@/lib/redis/cache';
import { checkCircuit, recordCircuitResult } from '@/lib/ai/shared/circuit-breaker';
import { retryWithBackoff, isTransientHttpError } from '@/lib/ai/shared/retry';

const FRESH_TTL_SECONDS = 10;
const LAST_KNOWN_GOOD_TTL_SECONDS = 5 * 60; // 5 minutes
const POLYMARKET_TIMEOUT_MS = 8000;
const SERVICE = 'polymarket-positions';

export interface PositionsResult {
  positions: any[];
  stale: boolean;
  /** When the returned data was fetched (ms since epoch). undefined for fresh. */
  staleSince?: number;
  /** True when the value was served from the fresh (10s) cache. */
  cacheHit: boolean;
}

function freshKey(wallet: string): string {
  return `chat:polymarket-positions:${wallet.toLowerCase()}`;
}

function lkgKey(wallet: string): string {
  return `chat:polymarket-positions-lkg:${wallet.toLowerCase()}`;
}

interface LastKnownGoodEntry {
  positions: any[];
  fetchedAt: number;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, next: { revalidate: 0 } });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromPolymarket(wallet: string): Promise<any[]> {
  const res = await fetchWithTimeout(
    `https://data-api.polymarket.com/positions?user=${wallet}`,
    POLYMARKET_TIMEOUT_MS,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Polymarket ${res.status}: ${text.slice(0, 120)}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

async function readLastKnownGood(wallet: string): Promise<LastKnownGoodEntry | null> {
  try {
    const raw = await redis.get<LastKnownGoodEntry | string>(lkgKey(wallet));
    if (!raw) return null;
    return typeof raw === 'string' ? (JSON.parse(raw) as LastKnownGoodEntry) : raw;
  } catch {
    return null;
  }
}

async function writeLastKnownGood(wallet: string, positions: any[]): Promise<void> {
  const entry: LastKnownGoodEntry = { positions, fetchedAt: Date.now() };
  try {
    await redis.set(lkgKey(wallet), JSON.stringify(entry), { ex: LAST_KNOWN_GOOD_TTL_SECONDS });
  } catch {
    // non-fatal
  }
}

/**
 * Returns positions for a wallet with reliability fallback. Throws only when
 * there is neither a fresh fetch nor any last-known-good cached data — in
 * practice this happens on a brand-new wallet during a Polymarket outage.
 */
export async function getPolymarketPositionsResilient(wallet: string): Promise<PositionsResult> {
  if (!wallet) throw new Error('wallet required');
  const normalized = wallet.toLowerCase();

  // 1. Fresh cache path
  const circuit = await checkCircuit(SERVICE, { failureThreshold: 5, cooldownMs: 30_000 });

  // If circuit is OPEN, don't even attempt upstream — return last-known-good.
  if (!circuit.allowed) {
    const lkg = await readLastKnownGood(normalized);
    if (lkg) {
      return { positions: lkg.positions, stale: true, staleSince: lkg.fetchedAt, cacheHit: false };
    }
    throw new Error(`Polymarket unavailable (circuit open, retry in ${Math.ceil(circuit.retryAfterMs / 1000)}s)`);
  }

  // 2. + 3. Try fresh fetch with cache + retry. cachedFetchWithHit tells us
  //    whether we served from cache so we can attribute latency correctly.
  try {
    const { value: positions, hit } = await cachedFetchWithHit<any[]>(
      freshKey(normalized),
      FRESH_TTL_SECONDS,
      () =>
        retryWithBackoff(() => fetchFromPolymarket(normalized), {
          maxAttempts: 3,
          baseMs: 500,
          maxMs: 3000,
          isRetryable: isTransientHttpError,
        }),
    );
    // Fire-and-forget: keep last-known-good fresh. Also reset breaker on miss
    // (meaning a real fetch succeeded). Cache hit skips this — nothing new to learn.
    if (!hit) {
      writeLastKnownGood(normalized, positions);
      recordCircuitResult(SERVICE, true).catch(() => {});
    }
    return { positions, stale: false, cacheHit: hit };
  } catch (err) {
    // Record failure to the breaker so repeat calls short-circuit.
    recordCircuitResult(SERVICE, false).catch(() => {});

    // 5. Serve last-known-good on failure.
    const lkg = await readLastKnownGood(normalized);
    if (lkg) {
      return { positions: lkg.positions, stale: true, staleSince: lkg.fetchedAt, cacheHit: false };
    }
    throw err;
  }
}

/**
 * Back-compat alias: older call sites use getPolymarketPositions and handle
 * errors themselves. Returns the positions array directly (throws on outage
 * with no fallback available). Prefer getPolymarketPositionsResilient for new
 * callers that want the staleness metadata.
 */
export async function getPolymarketPositions(wallet: string): Promise<any[]> {
  const result = await getPolymarketPositionsResilient(wallet);
  return result.positions;
}

/**
 * Drop the cached positions for a wallet. Call after a trade/sell is recorded
 * so the next chat turn sees fresh data. Also drops the last-known-good cache
 * so stale-fallback doesn't serve pre-trade data.
 */
export async function invalidatePositionsCache(wallet: string | null | undefined): Promise<void> {
  if (!wallet) return;
  const normalized = wallet.toLowerCase();
  await Promise.all([
    invalidateCache(freshKey(normalized)),
    invalidateCache(lkgKey(normalized)),
  ]);
}
