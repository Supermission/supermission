/**
 * Rate Limiting for AI Agent
 * Prevents abuse by limiting requests per wallet address
 * Falls back to in-memory if Redis not configured
 */

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number; // Timestamp when limit resets
  limit: number;
}

export interface RateLimitConfig {
  maxRequests: number; // Max requests per window
  windowMs: number; // Time window in milliseconds
}

// Default configuration: 10 requests per minute
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
};

/**
 * In-memory rate limiter (fallback if Redis not configured)
 */
class InMemoryRateLimiter {
  private requests: Map<string, { count: number; resetAt: number }> = new Map();

  async checkLimit(
    identifier: string,
    config: RateLimitConfig = DEFAULT_RATE_LIMIT
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.requests.get(identifier);

    // Clean up expired entries periodically
    if (this.requests.size > 1000) {
      this.cleanup();
    }

    // No existing record or expired
    if (!existing || existing.resetAt < now) {
      const resetAt = now + config.windowMs;
      this.requests.set(identifier, { count: 1, resetAt });

      return {
        success: true,
        remaining: config.maxRequests - 1,
        reset: resetAt,
        limit: config.maxRequests,
      };
    }

    // Within window, check if limit exceeded
    if (existing.count >= config.maxRequests) {
      return {
        success: false,
        remaining: 0,
        reset: existing.resetAt,
        limit: config.maxRequests,
      };
    }

    // Increment count
    existing.count++;
    this.requests.set(identifier, existing);

    return {
      success: true,
      remaining: config.maxRequests - existing.count,
      reset: existing.resetAt,
      limit: config.maxRequests,
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, value] of this.requests.entries()) {
      if (value.resetAt < now) {
        this.requests.delete(key);
      }
    }
  }
}

/**
 * Redis-based rate limiter (if REDIS_URL configured)
 */
class RedisRateLimiter {
  private redis: any = null; // Type from @upstash/redis if installed

  constructor() {
    // Lazy initialization - only if Redis URL is configured
    if (process.env.UPSTASH_REDIS_REST_URL) {
      try {
        // Dynamic import to avoid requiring @upstash/redis if not needed
        // This will only work if @upstash/redis is installed
        const Redis = eval("require('@upstash/redis')").Redis;
        this.redis = Redis.fromEnv();
      } catch (error) {
        console.warn('[RateLimit] Redis not available, falling back to in-memory');
        this.redis = null;
      }
    }
  }

  async checkLimit(
    identifier: string,
    config: RateLimitConfig = DEFAULT_RATE_LIMIT
  ): Promise<RateLimitResult> {
    if (!this.redis) {
      // Fall back to in-memory if Redis not configured
      return inMemoryLimiter.checkLimit(identifier, config);
    }

    try {
      const key = `ratelimit:agent:${identifier}`;
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Use sorted set to track requests in time window
      // Remove old requests
      await this.redis.zremrangebyscore(key, 0, windowStart);

      // Count current requests
      const count = await this.redis.zcard(key);

      if (count >= config.maxRequests) {
        // Get oldest request to calculate reset time
        const oldest = await this.redis.zrange(key, 0, 0, { withScores: true });
        const resetAt = oldest[0]?.score
          ? Number(oldest[0].score) + config.windowMs
          : now + config.windowMs;

        return {
          success: false,
          remaining: 0,
          reset: resetAt,
          limit: config.maxRequests,
        };
      }

      // Add current request
      await this.redis.zadd(key, { score: now, member: `${now}:${Math.random()}` });

      // Set expiry on key (cleanup)
      await this.redis.expire(key, Math.ceil(config.windowMs / 1000));

      return {
        success: true,
        remaining: config.maxRequests - count - 1,
        reset: now + config.windowMs,
        limit: config.maxRequests,
      };
    } catch (error) {
      console.error('[RateLimit] Redis error, falling back to in-memory:', error);
      return inMemoryLimiter.checkLimit(identifier, config);
    }
  }
}

// Singleton instances
const inMemoryLimiter = new InMemoryRateLimiter();
const redisLimiter = new RedisRateLimiter();

/**
 * Check rate limit for a wallet address
 *
 * @param walletAddress - Wallet address to check
 * @param config - Optional rate limit configuration
 * @returns Rate limit result
 */
export async function checkRateLimit(
  walletAddress: string,
  config?: RateLimitConfig
): Promise<RateLimitResult> {
  // Normalize address to lowercase
  const identifier = walletAddress.toLowerCase();

  // Use Redis if configured, otherwise in-memory
  if (process.env.REDIS_URL) {
    return redisLimiter.checkLimit(identifier, config);
  }

  return inMemoryLimiter.checkLimit(identifier, config);
}

/**
 * Format rate limit error message
 *
 * @param result - Rate limit result
 * @returns User-friendly error message
 */
export function formatRateLimitError(result: RateLimitResult): string {
  const resetIn = Math.ceil((result.reset - Date.now()) / 1000);
  return `Rate limit exceeded. ${result.limit} requests per minute allowed. Try again in ${resetIn} seconds.`;
}

/**
 * Get rate limit headers for HTTP response
 *
 * @param result - Rate limit result
 * @returns Headers object
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
  };
}
