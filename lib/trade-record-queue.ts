/**
 * localStorage-based retry queue for trade records.
 *
 * When a trade completes on the CLOB, we record it to our DB via /api/trades/record.
 * If that request fails (network, server error, tab close), the payload is persisted
 * in localStorage and retried on next page load or periodically.
 *
 * Idempotency is guaranteed server-side via UNIQUE(order_id) — retries are safe.
 */

const STORAGE_KEY = 'supermission:trade-record-queue';
const MAX_RETRIES = 5;
const FLUSH_INTERVAL_MS = 30_000; // 30 seconds

export interface TradeRecordPayload {
  user_address: string;
  condition_id: string;
  token_id: string;
  side: 'BUY' | 'SELL' | 'REDEEM';
  outcome: string;
  amount: number;
  price: number;
  shares: number;
  order_id: string;
  market_question: string;
  status: string;
  executed_at: string;
}

interface QueuedRecord {
  payload: TradeRecordPayload;
  retries: number;
  queuedAt: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readQueue(): QueuedRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (queue.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    }
  } catch {}
}

async function sendRecord(payload: TradeRecordPayload): Promise<boolean> {
  try {
    const res = await fetch('/api/trades/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // 2xx or 409 (duplicate) = success
    if (!res.ok && res.status !== 409) {
      const text = await res.text().catch(() => '');
      console.error(`[TradeRecord] POST failed: ${res.status}`, text, `side=${payload.side} cid=${payload.condition_id} amount=${payload.amount} price=${payload.price} shares=${payload.shares} order_id=${payload.order_id}`);
    }
    return res.ok || res.status === 409;
  } catch (err) {
    console.error('[TradeRecord] POST network error:', err, payload.side, payload.condition_id);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a trade. Attempts to POST immediately; on failure, queues for retry.
 */
export async function queueTradeRecord(payload: TradeRecordPayload): Promise<void> {
  const ok = await sendRecord(payload);
  if (!ok) {
    const queue = readQueue();
    // Don't queue duplicates (same order_id)
    if (payload.order_id && queue.some(q => q.payload.order_id === payload.order_id)) {
      return;
    }
    queue.push({ payload, retries: 0, queuedAt: new Date().toISOString() });
    writeQueue(queue);
  }
}

/**
 * Update an existing trade record (e.g. payout after redemption verification).
 * Best-effort — failures are logged but not retried since the record already exists.
 */
export async function updateTradeRecord(
  order_id: string,
  updates: { amount?: number; price?: number; status?: string },
): Promise<boolean> {
  try {
    const res = await fetch('/api/trades/record', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id, ...updates }),
    });
    if (!res.ok) {
      console.error(`[TradeRecord] PATCH failed: ${res.status}`, await res.text().catch(() => ''));
    }
    return res.ok;
  } catch (err) {
    console.error('[TradeRecord] PATCH network error:', err);
    return false;
  }
}

/**
 * Resolve pending_payout REDEEM records by re-verifying payouts server-side.
 * Called alongside flushTradeQueue on page load and periodically.
 */
export async function resolvePendingPayouts(): Promise<void> {
  try {
    const res = await fetch('/api/trades/resolve-pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const json = await res.json();
      if (json.resolved > 0) {
        console.log(`[TradeRecord] Resolved ${json.resolved}/${json.total} pending payouts`);
      }
    }
  } catch {
    // Silent — best-effort background task
  }
}

/**
 * Retry all queued records. Called on page load and periodically.
 */
export async function flushTradeQueue(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;

  const remaining: QueuedRecord[] = [];

  for (const item of queue) {
    const ok = await sendRecord(item.payload);
    if (!ok) {
      item.retries += 1;
      if (item.retries < MAX_RETRIES) {
        remaining.push(item);
      }
      // else: drop after MAX_RETRIES — data is unrecoverable client-side
    }
  }

  writeQueue(remaining);
}

// ---------------------------------------------------------------------------
// Auto-flush: start a periodic flush when this module loads in the browser
// ---------------------------------------------------------------------------

let flushTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoFlush(): void {
  if (typeof window === 'undefined' || flushTimer) return;
  // Flush immediately on start
  flushTradeQueue();
  resolvePendingPayouts(); // one-shot on page load for any leftover pending_payout records
  flushTimer = setInterval(flushTradeQueue, FLUSH_INTERVAL_MS);
}

export function stopAutoFlush(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
