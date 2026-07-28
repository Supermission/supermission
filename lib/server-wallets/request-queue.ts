/**
 * Server Wallet Request Queue — Token-Bucket Rate Limiter
 *
 * Privy SDK limit: 500 writes per 10 seconds.
 * This uses a token-bucket algorithm: 500 tokens max, refill 50 tokens/sec.
 */

const MAX_TOKENS = 500;
const REFILL_RATE = 50; // tokens per second
const REFILL_INTERVAL_MS = 1000;
const MAX_QUEUE_SIZE = 1000;
const QUEUE_TIMEOUT_MS = 30_000; // 30s max wait for queued requests

let tokens = MAX_TOKENS;
let lastRefill = Date.now();
const waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }> = [];

function refill(): void {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed >= REFILL_INTERVAL_MS) {
    const tokensToAdd = Math.floor((elapsed / REFILL_INTERVAL_MS) * REFILL_RATE);
    tokens = Math.min(MAX_TOKENS, tokens + tokensToAdd);
    lastRefill = now;
  }
}

function tryDrain(): void {
  refill();
  while (waitQueue.length > 0 && tokens > 0) {
    tokens--;
    const entry = waitQueue.shift()!;
    clearTimeout(entry.timer);
    entry.resolve();
  }
}

async function acquireToken(): Promise<void> {
  refill();
  if (tokens > 0) {
    tokens--;
    return;
  }

  // Reject if queue is full — backpressure to prevent OOM
  if (waitQueue.length >= MAX_QUEUE_SIZE) {
    throw new Error('Server wallet rate limit queue full — too many concurrent requests, try again later');
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Remove this entry from the queue on timeout
      const idx = waitQueue.findIndex((e) => e.resolve === resolve);
      if (idx !== -1) waitQueue.splice(idx, 1);
      reject(new Error('Server wallet rate limit queue timeout — waited 30s for a token'));
    }, QUEUE_TIMEOUT_MS);

    waitQueue.push({ resolve, reject, timer });
    // Schedule a drain attempt
    setTimeout(tryDrain, REFILL_INTERVAL_MS);
  });
}

/**
 * Wrap a Server Wallet SDK call with rate limiting.
 * Waits for a token before executing the function.
 */
export async function withServerWalletRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  await acquireToken();
  return fn();
}

// Legacy alias
export const withCdpRateLimit = withServerWalletRateLimit;
