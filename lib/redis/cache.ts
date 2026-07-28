import { redis } from './client';

/**
 * Fetch data with Redis caching. On cache hit, returns cached value.
 * On cache miss, calls fetcher, stores result in Redis with the given TTL.
 *
 * Fails open: if Redis is unavailable, falls through to the fetcher.
 */
export async function cachedFetch<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const { value } = await cachedFetchWithHit(key, ttlSeconds, fetcher);
  return value;
}

/**
 * Same as cachedFetch but also returns whether the value was served from cache
 * (hit=true) or produced by the fetcher (hit=false). Useful for instrumenting
 * cache hit-rate in telemetry without probing Redis twice.
 */
export async function cachedFetchWithHit<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  try {
    const cached = await redis.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return { value: cached, hit: true };
    }
  } catch (err) {
    console.warn('[redis-cache] GET failed, falling through to fetcher:', (err as Error).message);
  }

  const fresh = await fetcher();

  // Store in background — don't block the response
  redis.set(key, JSON.stringify(fresh), { ex: ttlSeconds }).catch((err) => {
    console.warn('[redis-cache] SET failed:', (err as Error).message);
  });

  return { value: fresh, hit: false };
}

/**
 * Invalidate a cached key (e.g. after a write/mutation).
 */
export async function invalidateCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    console.warn('[redis-cache] DEL failed:', (err as Error).message);
  }
}
