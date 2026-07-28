import { Redis } from '@upstash/redis';

// Lazy singleton — the Redis client only instantiates on first method access.
// Without this, the `new Redis(...)` call executes at module load, which means
// if any client-side bundle transitively imports this file the Upstash library
// warns that `url` / `token` are undefined (since only NEXT_PUBLIC_* env vars
// reach the browser). Server-side routes/jobs that actually use redis are
// unaffected — the first `.get`/`.set` call triggers construction.

let _client: Redis | null = null;

function getClient(): Redis {
  if (_client) return _client;
  _client = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return _client;
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const c = getClient();
    const value = (c as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? value.bind(c) : value;
  },
}) as Redis;
