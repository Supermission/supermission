/**
 * Retry helper with exponential backoff + jitter.
 *
 * Only retries when the caller-supplied predicate says the error is transient
 * (typically 429 and 5xx). Retries are capped at maxAttempts (default 3). First
 * retry fires after baseMs, doubling each time, with ±30% jitter to avoid
 * thundering herds on a single upstream coming back up.
 *
 * Not for streaming calls — once a stream has started we must not retry, since
 * partial tokens have already been emitted. Use this only for atomic calls
 * (HTTP GET/POST with full response) or the stream-creation step before first
 * chunk.
 */

export interface RetryOptions<T> {
  /** Max total attempts. Default 3. */
  maxAttempts?: number;
  /** Base backoff delay in ms. Default 500. */
  baseMs?: number;
  /** Max backoff delay in ms. Default 4000. */
  maxMs?: number;
  /** Predicate: should this error trigger a retry? */
  isRetryable: (err: unknown) => boolean;
  /** Optional hook — called before each retry with (attempt, err, delayMs). */
  onRetry?: (info: { attempt: number; err: unknown; delayMs: number }) => void;
  /** Optional hook — called on final failure. */
  onFailure?: (err: unknown) => void;
  /** Optional hook — called on success (attempt = 1 means first-try). */
  onSuccess?: (info: { attempt: number; value: T }) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms: number): number {
  // ±30% — avoids lock-step retry from many clients hitting the same upstream.
  const delta = ms * 0.3;
  return Math.round(ms + (Math.random() * 2 - 1) * delta);
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions<T>,
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseMs = opts.baseMs ?? 500;
  const maxMs = opts.maxMs ?? 4000;

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fn();
      opts.onSuccess?.({ attempt, value });
      return value;
    } catch (err) {
      lastErr = err;
      const canRetry = attempt < maxAttempts && opts.isRetryable(err);
      if (!canRetry) break;
      const delay = jitter(Math.min(baseMs * 2 ** (attempt - 1), maxMs));
      opts.onRetry?.({ attempt, err, delayMs: delay });
      await sleep(delay);
    }
  }
  opts.onFailure?.(lastErr);
  throw lastErr;
}

/**
 * Common predicate for transient HTTP failures. Treats:
 *   - 429 (rate limited),
 *   - 5xx (server-side),
 *   - fetch/network errors without a status (ECONNRESET, timeout, etc.)
 * as retryable. Adjust by wrapping if you need different semantics.
 */
export function isTransientHttpError(err: unknown): boolean {
  if (!err) return false;

  // Node / fetch abort
  if ((err as any).name === 'AbortError') return true;

  // Our positions-cache error string: "Polymarket 503: ..."
  const msg = (err as any).message || '';
  if (/^[A-Za-z]+ 5\d{2}/.test(msg)) return true;
  if (/^[A-Za-z]+ 429/.test(msg)) return true;

  // OpenAI SDK-shaped error
  const status = (err as any).status ?? (err as any).response?.status;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false;
  }

  // Generic network failures — node-fetch / undici
  const code = (err as any).code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'EAI_AGAIN') {
    return true;
  }
  // Fallback: generic "fetch failed" with no status — usually network.
  if (/fetch failed|network|socket hang up/i.test(msg)) return true;

  return false;
}
