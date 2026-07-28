import { ContractAuditRequest, ContractAuditResponse } from "./types";
import { fetchContractAudit } from "./fetchContractAudit";
import { createHash } from "crypto";

// ============================================
// CACHING CONFIGURATION
// ============================================
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 100; // Maximum number of cached entries

// In-memory cache
interface CacheEntry {
  response: ContractAuditResponse;
  fetchedAt: number;
}

const AUDIT_CACHE = new Map<string, CacheEntry>();

/**
 * Generate a unique cache key based on the source code and options
 */
function generateCacheKey(request: ContractAuditRequest): string {
  const { sourceCode, contractName, compilerVersion, deepAudit } = request;

  // Create a hash of the source code for efficient key storage
  const sourceHash = createHash('sha256')
    .update(sourceCode || '')
    .digest('hex')
    .substring(0, 16);

  return `${sourceHash}:${contractName || 'unnamed'}:${compilerVersion || 'default'}:${deepAudit ? 'deep' : 'standard'}`;
}

/**
 * Clean up expired cache entries
 */
function cleanupCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, entry] of AUDIT_CACHE.entries()) {
    if (now - entry.fetchedAt > CACHE_TTL_MS) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    AUDIT_CACHE.delete(key);
  }

  // If still over max size, remove oldest entries
  if (AUDIT_CACHE.size > MAX_CACHE_SIZE) {
    const entries = Array.from(AUDIT_CACHE.entries())
      .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);

    const toRemove = entries.slice(0, AUDIT_CACHE.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      AUDIT_CACHE.delete(key);
    }
  }
}

/**
 * Get cached audit data or fetch fresh data
 */
export async function getCachedAuditData(
  request: ContractAuditRequest
): Promise<ContractAuditResponse> {
  const cacheKey = generateCacheKey(request);
  const now = Date.now();

  // Check cache first
  const cached = AUDIT_CACHE.get(cacheKey);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    console.log(`[CacheDataHelper] Cache HIT for key: ${cacheKey.substring(0, 20)}...`);
    return cached.response;
  }

  console.log(`[CacheDataHelper] Cache MISS for key: ${cacheKey.substring(0, 20)}... - fetching fresh data`);

  // Fetch fresh data
  const response = await fetchContractAudit(request);

  // Store in cache
  AUDIT_CACHE.set(cacheKey, {
    response,
    fetchedAt: now,
  });

  // Cleanup old entries periodically
  if (Math.random() < 0.1) { // 10% chance to cleanup on each request
    cleanupCache();
  }

  return response;
}

/**
 * Invalidate cache for a specific request
 */
export function invalidateCache(request: ContractAuditRequest): void {
  const cacheKey = generateCacheKey(request);
  AUDIT_CACHE.delete(cacheKey);
}

/**
 * Clear all cached audit data
 */
export function clearAuditCache(): void {
  AUDIT_CACHE.clear();
  console.log('[CacheDataHelper] Cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  ttlMs: number;
} {
  return {
    size: AUDIT_CACHE.size,
    maxSize: MAX_CACHE_SIZE,
    ttlMs: CACHE_TTL_MS,
  };
}
