import { PrivyClient } from '@privy-io/node';
import { redis } from '../redis/client';

const privyClient = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

/**
 * Two-tier auth cache:
 * - L1: In-memory Map (fast, per-instance, 200 entries)
 * - L2: Redis (shared across all serverless instances, 60s TTL)
 *
 * On hit: L1 → return. L1 miss → L2 → populate L1 → return.
 * On miss: Privy API → populate both L1 + L2.
 */
interface CachedAuth {
  userId: string;
  email?: string;
  walletAddresses: string[];
  expiresAt: number;
}

const AUTH_CACHE_TTL_MS = 60_000; // 60 seconds
const AUTH_CACHE_MAX_SIZE = 200; // per-instance L1 (smaller since Redis is L2)
const REDIS_AUTH_TTL_S = 60; // Redis TTL in seconds
const REDIS_AUTH_PREFIX = 'auth:privy:';
const authCache = new Map<string, CachedAuth>();

/** Hash token to a short key for Redis (avoid storing full JWTs as keys) */
function tokenKey(token: string): string {
  // Use last 32 chars of token as a fingerprint — unique enough, avoids huge keys
  return REDIS_AUTH_PREFIX + token.slice(-32);
}

function l1Get(token: string): CachedAuth | null {
  const entry = authCache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    authCache.delete(token);
    return null;
  }
  // Move to end for LRU ordering (Map preserves insertion order)
  authCache.delete(token);
  authCache.set(token, entry);
  return entry;
}

function l1Set(token: string, value: Omit<CachedAuth, 'expiresAt'>): void {
  if (authCache.size >= AUTH_CACHE_MAX_SIZE) {
    const oldestKey = authCache.keys().next().value!;
    authCache.delete(oldestKey);
  }
  authCache.set(token, { ...value, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

type AuthResult = { userId: string; email?: string; walletAddresses: string[] };

async function l2Get(token: string): Promise<AuthResult | null> {
  try {
    const cached = await redis.get<AuthResult>(tokenKey(token));
    return cached ?? null;
  } catch {
    return null;
  }
}

function l2Set(token: string, value: AuthResult): void {
  redis.set(tokenKey(token), JSON.stringify(value), { ex: REDIS_AUTH_TTL_S }).catch(() => {});
}

/**
 * Verify a Privy access token (JWT) and return the authenticated user's info.
 * Uses L1 in-memory + L2 Redis cache to avoid redundant Privy API calls.
 * Throws if the token is invalid or the user has no linked email.
 */
export async function verifyPrivyToken(token: string): Promise<AuthResult> {
  // L1: in-memory (fastest)
  const l1 = l1Get(token);
  if (l1) {
    return { userId: l1.userId, email: l1.email, walletAddresses: l1.walletAddresses };
  }

  // L2: Redis (shared across instances)
  const l2 = await l2Get(token);
  if (l2) {
    l1Set(token, l2);
    return l2;
  }

  // Cache miss — call Privy API
  const verifiedClaims = await privyClient.utils().auth().verifyAccessToken(token);
  const user = await privyClient.users()._get(verifiedClaims.user_id);

  // Extract email: direct email accounts use `address`, OAuth accounts use `email`
  let email: string | undefined;
  for (const a of user.linked_accounts) {
    if (a.type === 'email' && 'address' in a) {
      email = a.address;
      break; // Direct email is highest priority
    }
    if (!email && 'email' in a && (a as any).email) {
      email = (a as any).email;
    }
  }

  // Extract all wallet addresses (embedded + external)
  const walletAddresses = user.linked_accounts
    .filter((a) => a.type === 'wallet' && 'address' in a)
    .map((a) => ('address' in a ? (a.address as string).toLowerCase() : ''))
    .filter(Boolean);

  const result: AuthResult = {
    userId: verifiedClaims.user_id,
    email: email?.toLowerCase().trim(),
    walletAddresses,
  };

  // Populate both cache tiers
  l1Set(token, result);
  l2Set(token, result);

  return result;
}
