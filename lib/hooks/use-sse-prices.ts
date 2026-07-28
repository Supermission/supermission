'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LivePrices } from '@/lib/types/market';

const WORKER_URL = (process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:3001').replace(/\/+$/, '');
const WORKER_TOKEN = process.env.NEXT_PUBLIC_WORKER_TOKEN || '';
const FILTER_DEBOUNCE_MS = 80;

/**
 * Incremental SSE price subscription (singleton per browser tab).
 *
 * One persistent EventSource serves every `useSSEPrices` caller in the tab.
 * Each caller contributes its conditionIds to a ref-counted union. When the
 * union changes we POST `/prices/filter?clientId=UUID` to extend or shrink
 * the subscription without tearing down the SSE connection, so new cards
 * get prices without any flicker on scroll / pagination.
 *
 *   useSSEPrices()           → subscribes to nothing; returns global snapshot
 *   useSSEPrices([])         → explicitly idle (same as undefined)
 *   useSSEPrices(['c1','c2']) → adds c1,c2 to the union; shares one connection
 */

type PriceListener = (data: Record<string, LivePrices>) => void;

/** Payload of the worker's `ipl-insight` SSE event (mirrors broadcastSSE call
 *  in worker/src/iplMatchIntelligence.ts). */
export interface IPLInsightEvent {
  matchId: string;
  insight: {
    timestamp: number;
    text: string;
    type: 'milestone' | 'stat' | 'momentum' | 'commentary';
  };
}
type InsightListener = (event: IPLInsightEvent) => void;

/** Payload of the worker's `ipl-alert` SSE event (mirrors broadcastSSE call
 *  in worker/src/iplAlerts.ts). */
export interface IPLAlertEvent {
  matchId: string;
  alert: {
    id: string;
    matchId: string;
    timestamp: number;
    type: 'wicket' | 'milestone' | 'toss' | 'rain' | 'innings' | 'info';
    text: string;
    marketContext?: string;
  };
}
type AlertListener = (event: IPLAlertEvent) => void;

// Ref-counted id → # of subscribers currently interested
const idRefCounts = new Map<string, number>();
// Local clock ms when each id transitioned 0→1 in idRefCounts. Used by
// useStaleMarketIds to apply a grace window before flagging "no SSE entry yet"
// as dead — mirrors worker's `trackedSinceMs` / isStalePriceMarket grace logic.
const firstSubscribedAtMs = new Map<string, number>();
const listeners = new Set<PriceListener>();
const insightListeners = new Set<InsightListener>();
const alertListeners = new Set<AlertListener>();
let connectionListeners = new Set<(connected: boolean) => void>();

/** Sentinel anchor ids added to idRefCounts whenever a subscriber registers
 *  for a non-price SSE channel. The worker's price filter strips them to
 *  nothing (no market matches), so prices stay quiet, but the named events
 *  still broadcast to the connection. Lets these channels piggyback on the
 *  singleton EventSource without opening a second one or flooding with
 *  full-snapshot price data. */
const INSIGHT_ANCHOR_ID = '__ipl_insights_anchor__';
const ALERT_ANCHOR_ID = '__ipl_alerts_anchor__';

/**
 * Local clock timestamp of the last `feed` SSE heartbeat received from the
 * worker. Emitted ~every 2s while upstream WS is healthy. Consumed by
 * useStaleMarketIds to avoid flash-hiding markets during a network blip.
 * Stored as local receipt time (not the worker's clock value) to stay
 * immune to worker/client skew.
 */
let feedHealthyAt = 0;

// Background tabs throttle the SSE listener so `feed` events stop refreshing
// feedHealthyAt even though the worker is still broadcasting. On tab revisit,
// extend the grace window so useStaleMarketIds doesn't transiently return
// the full stale set. Only extend when the EventSource is actually OPEN —
// otherwise we'd mask a dead connection.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && feedHealthyAt > 0 && es?.readyState === EventSource.OPEN) {
      feedHealthyAt = Date.now();
    }
  });
}

let es: EventSource | null = null;
let clientId: string | null = null;
let connected = false;
let pendingFilterPush: ReturnType<typeof setTimeout> | null = null;
let lastFilterKey = '';

// Connection resilience
let retryCount = 0;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let manualClose = false;

function setConnected(next: boolean) {
  if (connected === next) return;
  connected = next;
  for (const cb of connectionListeners) cb(next);
}

function ensureClientId(): string {
  if (clientId) return clientId;
  clientId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return clientId;
}

function buildStreamUrl(): string {
  const cid = ensureClientId();
  const params: string[] = [`clientId=${encodeURIComponent(cid)}`];
  if (WORKER_TOKEN) params.push(`token=${encodeURIComponent(WORKER_TOKEN)}`);
  const ids = currentUnionIds();
  if (ids.length > 0) params.push(`ids=${ids.join(',')}`);
  return `${WORKER_URL}/prices/stream?${params.join('&')}`;
}

function currentUnionIds(): string[] {
  return Array.from(idRefCounts.keys()).sort();
}

function openConnection() {
  if (manualClose) return;
  if (idRefCounts.size === 0) return; // nothing to listen for

  const url = buildStreamUrl();
  const source = new EventSource(url);
  es = source;

  source.onopen = () => {
    retryCount = 0;
    lastFilterKey = currentUnionIds().join(',');
    setConnected(true);
  };

  source.addEventListener('prices', (event) => {
    try {
      const data: Record<string, LivePrices> = JSON.parse((event as MessageEvent).data);
      for (const cb of listeners) cb(data);
    } catch {
      // malformed payload — ignore
    }
  });

  source.addEventListener('feed', () => {
    // Stamp local receipt time — ignore the worker's healthyAt payload to
    // stay immune to clock skew. Consumed by useStaleMarketIds.
    feedHealthyAt = Date.now();
  });

  source.addEventListener('ipl-insight', (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data) as IPLInsightEvent;
      for (const cb of insightListeners) cb(data);
    } catch {
      // malformed payload — ignore
    }
  });

  source.addEventListener('ipl-alert', (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data) as IPLAlertEvent;
      for (const cb of alertListeners) cb(data);
    } catch {
      // malformed payload — ignore
    }
  });

  source.onerror = () => {
    source.close();
    if (es === source) es = null;
    setConnected(false);
    if (manualClose || idRefCounts.size === 0) return;

    retryCount += 1;
    const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, retryCount - 1), MAX_BACKOFF_MS);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      openConnection();
    }, delay);
  };
}

function closeConnection() {
  manualClose = true;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (es) { es.close(); es = null; }
  setConnected(false);
  lastFilterKey = '';
  manualClose = false;
}

async function pushFilterToWorker() {
  if (!clientId) return;
  const ids = currentUnionIds();
  const key = ids.join(',');
  if (key === lastFilterKey) return;
  lastFilterKey = key;

  const url = `${WORKER_URL}/prices/filter?clientId=${encodeURIComponent(clientId)}${WORKER_TOKEN ? `&token=${encodeURIComponent(WORKER_TOKEN)}` : ''}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
      keepalive: true,
    });
    if (res.status === 404) {
      // Client dropped on the server (restart, idle reap). Reconnect with
      // the current union so we pick up where we left off.
      if (es) { es.close(); es = null; }
      setConnected(false);
      lastFilterKey = '';
      openConnection();
    }
  } catch {
    // Network hiccup — next schedule will retry; not fatal.
  }
}

function scheduleFilterPush() {
  if (pendingFilterPush) clearTimeout(pendingFilterPush);
  pendingFilterPush = setTimeout(() => {
    pendingFilterPush = null;
    pushFilterToWorker();
  }, FILTER_DEBOUNCE_MS);
}

function addIds(ids: readonly string[]) {
  let unionChanged = false;
  const now = Date.now();
  for (const id of ids) {
    const prev = idRefCounts.get(id) ?? 0;
    idRefCounts.set(id, prev + 1);
    if (prev === 0) {
      unionChanged = true;
      firstSubscribedAtMs.set(id, now);
    }
  }
  if (!es && !retryTimer && idRefCounts.size > 0) {
    manualClose = false;
    openConnection();
    return;
  }
  if (unionChanged) scheduleFilterPush();
}

function removeIds(ids: readonly string[]) {
  let unionChanged = false;
  for (const id of ids) {
    const prev = idRefCounts.get(id);
    if (prev === undefined) continue;
    if (prev <= 1) {
      idRefCounts.delete(id);
      firstSubscribedAtMs.delete(id);
      unionChanged = true;
    } else {
      idRefCounts.set(id, prev - 1);
    }
  }
  if (idRefCounts.size === 0) {
    closeConnection();
    return;
  }
  if (unionChanged) scheduleFilterPush();
}

/**
 * Subscribe to worker `ipl-insight` SSE events. Returns an unsubscribe fn.
 *
 * Internally this anchors the singleton EventSource open via a sentinel id
 * (so the connection survives even when no prices are subscribed) and
 * registers `cb` against the shared insight-listener set.
 *
 * Callers should filter by `event.matchId` themselves — every insight from
 * every active IPL match flows to every subscriber.
 */
export function addInsightListener(cb: InsightListener): () => void {
  insightListeners.add(cb);
  addIds([INSIGHT_ANCHOR_ID]);
  return () => {
    if (insightListeners.delete(cb)) {
      removeIds([INSIGHT_ANCHOR_ID]);
    }
  };
}

/**
 * Subscribe to worker `ipl-alert` SSE events. Returns an unsubscribe fn.
 *
 * Same anchor pattern as addInsightListener: the singleton EventSource stays
 * open even when no prices are subscribed, and alerts piggyback on it
 * without opening a second connection. Callers filter by `event.matchId`.
 */
export function addAlertListener(cb: AlertListener): () => void {
  alertListeners.add(cb);
  addIds([ALERT_ANCHOR_ID]);
  return () => {
    if (alertListeners.delete(cb)) {
      removeIds([ALERT_ANCHOR_ID]);
    }
  };
}

/**
 * SSE-based live price hook with incremental filter subscriptions.
 *
 * Pass the condition IDs you want live prices for. The hook merges your IDs
 * into a tab-wide union and shares one EventSource across every caller — no
 * reconnect when your list grows or shrinks.
 */
export function useSSEPrices(conditionIds?: string[]) {
  const [prices, setPrices] = useState<Record<string, LivePrices>>({});
  const [isConnected, setIsConnected] = useState(connected);

  // Stable sorted key of what THIS caller wants — lets us detect changes
  const wantedKey = conditionIds ? [...conditionIds].sort().join(',') : '';
  const lastOwnedRef = useRef<string[]>([]);

  useEffect(() => {
    const wanted = wantedKey ? wantedKey.split(',') : [];
    // Remove previously-owned IDs no longer in our list
    if (lastOwnedRef.current.length > 0) removeIds(lastOwnedRef.current);
    lastOwnedRef.current = wanted;
    if (wanted.length > 0) addIds(wanted);

    return () => {
      if (lastOwnedRef.current.length > 0) {
        removeIds(lastOwnedRef.current);
        lastOwnedRef.current = [];
      }
    };
  }, [wantedKey]);

  useEffect(() => {
    if (!conditionIds || conditionIds.length === 0) {
      setIsConnected(false);
      return;
    }
    const subscribed = new Set(conditionIds);
    const listener: PriceListener = (data) => {
      setIsConnected(true);
      setPrices(prev => {
        let next: Record<string, LivePrices> | null = null;
        for (const [cid, p] of Object.entries(data)) {
          if (!subscribed.has(cid)) continue;
          if (!next) next = { ...prev };
          next[cid] = p;
        }
        return next ?? prev;
      });
    };
    listeners.add(listener);

    const connListener = (c: boolean) => setIsConnected(c);
    connectionListeners.add(connListener);

    return () => {
      listeners.delete(listener);
      connectionListeners.delete(connListener);
    };
  }, [wantedKey]);

  return { prices, isConnected };
}

// Mirror of worker's isStalePriceMarket thresholds (worker/src/routes/markets.ts).
// Keep in sync if the worker thresholds change.
const STALE_PRICE_THRESHOLD_MS = 10 * 60 * 1000; // 10 min: SSE entry exists but hasn't ticked
const STALE_PRICE_GRACE_MS = 3 * 60 * 1000;      // 3 min grace before flagging "no entry yet" as dead
const FEED_HEALTH_WINDOW_MS = 30 * 1000;         // only hide cards when SSE itself is healthy
const STALE_TICK_MS = 30 * 1000;                 // re-evaluate staleness every 30s

/**
 * Returns the subset of `conditionIds` whose live-price feed is dead — same
 * signal the worker uses to drop markets from /v1/markets, applied client-side
 * so cards that go dead mid-session disappear without waiting for the next
 * 60s catalog refetch.
 *
 * Stale criteria (mirror worker's isStalePriceMarket):
 *   - Entry in `prices` exists → stale if updatedAt is older than 10 min
 *   - No entry → stale only if we've been subscribed for longer than the
 *     3-min grace window (so newly-loaded cards aren't hidden during the
 *     1–3s window before the first SSE tick arrives)
 *
 * Gated on global feed health: if the SSE connection itself is dropped or
 * stale (>30s since last `feed` heartbeat), returns an empty set so a network
 * blip doesn't flash-hide every card on screen.
 *
 * Caller should pass the same `conditionIds` and `prices` from useSSEPrices.
 * Use only in grid-browse contexts — never in watchlist/portfolio/detail
 * views, where bookmarks and open positions must never be silently hidden.
 */
export function useStaleMarketIds(
  conditionIds: string[] | undefined,
  prices: Record<string, LivePrices>,
): Set<string> {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), STALE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const stale = new Set<string>();
    if (!conditionIds || conditionIds.length === 0) return stale;

    // If the SSE feed itself isn't healthy, don't hide anything — this is a
    // transient connection issue, not a per-market dead-book signal.
    const healthyAt = feedHealthyAt;
    if (healthyAt === 0 || Date.now() - healthyAt > FEED_HEALTH_WINDOW_MS) {
      return stale;
    }

    const now = Date.now();
    for (const cid of conditionIds) {
      const entry = prices[cid];
      if (entry?.updatedAt) {
        if (now - entry.updatedAt >= STALE_PRICE_THRESHOLD_MS) stale.add(cid);
        continue;
      }
      // No price entry (or worker without updatedAt). Only flag as stale once
      // we've been subscribed long enough that a price *should* have arrived.
      const subAt = firstSubscribedAtMs.get(cid);
      if (subAt && now - subAt > STALE_PRICE_GRACE_MS) stale.add(cid);
    }
    return stale;
    // tick intentionally in deps — drives the time-based re-evaluation.
  }, [conditionIds, prices, tick]);
}
