import { Ratelimit } from '@upstash/ratelimit';
import { NextRequest, NextResponse } from 'next/server';
import { redis } from './redis/client';

/**
 * Endpoints that skip Redis rate limiting entirely.
 * These are internal polling/read endpoints called by our own frontend
 * on fixed intervals — rate limiting them wastes Redis commands.
 */
const SKIP_RATE_LIMIT_PATTERNS: string[] = [
  '/api/wallet/balances',        // useUsdcBalances — 30s poll
  '/api/signals/feed',           // signal feed — 30s poll
  '/api/markets',                // market listing — read-only
  '/api/polymarket',             // market data proxy — read-only
  '/api/proxy/polymarket',       // market data proxy — read-only
  '/api/trades/history',         // trade history — read-only
  '/api/dashboard/overview',     // dashboard data — 60s poll
  '/api/dashboard/market',       // market overview — 60s poll
  '/api/dashboard/wallet/overview', // wallet overview — read-only
  '/api/dashboard/tokens/list',  // token list — read-only
  '/api/dashboard/yields/list',  // yields list — read-only
  '/api/dashboard/prices',       // price data — read-only
  '/api/agents/leaderboard',     // leaderboard — read-only
  '/api/og/',                    // OG image generation
];

function shouldSkipRateLimit(pathname: string): boolean {
  return SKIP_RATE_LIMIT_PATTERNS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

/**
 * Rate limit tiers — keyed by severity of the endpoint cost.
 * Uses fixed window algorithm to minimise Redis commands.
 */
const limiters = {
  /** LLM streaming + tool calling loops (delphi, securo, oracle) */
  critical: new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(10, '1 m'),
    prefix: 'rl:critical',
  }),
  /** AI agents: image-gen, wallet-intelligence, contract-audit, etc. */
  high: new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(5, '1 m'),
    prefix: 'rl:high',
  }),
  /** Waitlist join, auth session, claims */
  medium: new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(10, '1 m'),
    prefix: 'rl:medium',
  }),
};

type Tier = keyof typeof limiters;

/**
 * Map of path patterns to their rate limit tier.
 * Order matters — first match wins.
 * Only expensive/abusable endpoints are listed here.
 */
const RATE_LIMIT_RULES: { pattern: string; tier: Tier; methods?: string[] }[] = [
  // Critical: LLM + tool calling endpoints
  { pattern: '/api/dashboard/delphi', tier: 'critical', methods: ['POST'] },
  { pattern: '/api/security/securo', tier: 'critical', methods: ['POST'] },
  { pattern: '/api/markets/oracle', tier: 'critical', methods: ['POST'] },
  { pattern: '/api/hyperion/chat', tier: 'critical', methods: ['POST'] },

  // High: AI agent endpoints
  { pattern: '/api/new-agents/wallet-intelligence', tier: 'high', methods: ['POST'] },
  { pattern: '/api/new-agents/image-generation', tier: 'high', methods: ['POST'] },
  { pattern: '/api/new-agents/contract-audit', tier: 'high', methods: ['POST'] },
  { pattern: '/api/new-agents/token-due-diligence', tier: 'high', methods: ['POST'] },
  { pattern: '/api/new-agents/defi-agent', tier: 'high', methods: ['POST'] },
  { pattern: '/api/new-agents/defi-yield', tier: 'high', methods: ['POST'] },
  { pattern: '/api/new-agents/morpho-lend', tier: 'high', methods: ['POST'] },
  { pattern: '/api/new-agents/prediction-market', tier: 'high', methods: ['POST'] },
  { pattern: '/api/dashboard/tokens/analysis', tier: 'high', methods: ['POST'] },

  // High: expensive external API calls
  { pattern: '/api/dashboard/wallet/analysis', tier: 'high', methods: ['POST'] },
  { pattern: '/api/dashboard/sentiment', tier: 'high', methods: ['POST'] },
  { pattern: '/api/dashboard/yields/strategy', tier: 'high', methods: ['POST'] },

  // Critical: LLM chat endpoint
  { pattern: '/api/chat', tier: 'critical', methods: ['POST'] },

  // High: swap quote endpoints (0x/LI.FI quota)
  { pattern: '/api/trade/swap/quote', tier: 'high' },
  { pattern: '/api/defi/swap/quote', tier: 'high' },

  // High: reputation auth (signs with deployer key)
  { pattern: '/api/reputation/generate-auth', tier: 'high', methods: ['POST'] },

  // Medium: auth, claims, writes, maintenance
  { pattern: '/api/auth/session', tier: 'medium', methods: ['POST'] },
  { pattern: '/api/agents/claim', tier: 'medium', methods: ['POST'] },
  { pattern: '/api/agents/onboard', tier: 'medium', methods: ['POST'] },
  { pattern: '/api/agents/check-health', tier: 'medium', methods: ['GET'] },
  { pattern: '/api/agents/cleanup-inactive', tier: 'medium', methods: ['GET'] },
  { pattern: '/api/agents/register-onchain', tier: 'medium', methods: ['GET'] },
  { pattern: '/api/agent-economy/heartbeat', tier: 'medium', methods: ['POST'] },
  { pattern: '/api/agent-economy/wallet/list', tier: 'medium', methods: ['GET'] },
  { pattern: '/api/agent-economy/wallet/balance', tier: 'medium', methods: ['GET'] },
  { pattern: '/api/agent-economy/wallet/policy', tier: 'medium', methods: ['GET', 'PUT'] },
  { pattern: '/api/agent-economy/pricing', tier: 'medium', methods: ['GET'] },
  { pattern: '/api/trade/bridge', tier: 'medium' },
  { pattern: '/api/track', tier: 'medium', methods: ['POST'] },

];

/** Global rate limit: caps total API requests per IP regardless of endpoint.
 *  Only applied to non-skipped routes (expensive/abusable endpoints). */
const globalLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(60, '1 m'),
  prefix: 'rl:global',
});

/**
 * Per-wallet rate limit for chat agents.
 * IP-only limiting doesn't protect against wallet abuse behind shared proxies
 * (corporate NAT, mobile carriers, VPNs), and doesn't distinguish "a power user"
 * from "a script hammering one wallet". This bucket is wallet-scoped and applies
 * on top of the IP tier — both must pass.
 *
 * 20/min is generous for a human: average chat turn is ~5-10s with tool calls,
 * so a real user tops out around 6-10 turns/min. 20 gives headroom for retries
 * and tool-chained follow-ups without making abuse trivially cheap.
 */
const walletLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(20, '1 m'),
  prefix: 'rl:wallet',
});

function getClientIp(request: NextRequest): string {
  // Prefer x-real-ip on Vercel — set by their edge network, can't be spoofed
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function matchRule(pathname: string, method: string): Tier | null {
  for (const rule of RATE_LIMIT_RULES) {
    if (rule.methods && !rule.methods.includes(method)) continue;
    if (pathname === rule.pattern || pathname.startsWith(rule.pattern + '/')) {
      return rule.tier;
    }
  }
  return null;
}

/**
 * Check rate limit for the given request.
 * Returns a 429 response if rate limited, or null if allowed.
 */
export async function checkRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Skip Redis entirely for internal polling / read-only endpoints
  if (shouldSkipRateLimit(pathname)) return null;

  const ip = getClientIp(request);
  const tier = matchRule(pathname, method);

  try {
    // Global limit — caps total API requests from one IP (expensive routes only)
    const globalResult = await globalLimiter.limit(ip);
    if (!globalResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': globalResult.limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': globalResult.reset.toString(),
            'Retry-After': Math.ceil((globalResult.reset - Date.now()) / 1000).toString(),
          },
        },
      );
    }

    // Per-endpoint limit — stricter limits for expensive routes (only if a tier matched)
    if (tier) {
      // Combine IP with any wallet hint from trusted headers so two users behind
      // the same proxy don't share a bucket. Clients set `x-supermission-wallet`
      // from their signed Privy session; middleware can't parse the body, so the
      // body is still per-wallet limited by checkWalletRateLimit inside the route.
      const walletHint = (request.headers.get('x-supermission-wallet') || '').toLowerCase().slice(0, 42);
      const key = walletHint
        ? `${ip}:${walletHint}:${pathname}`
        : `${ip}:${pathname}`;
      const { success, limit, remaining, reset } = await limiters[tier].limit(key);

      if (!success) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': reset.toString(),
              'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
            },
          },
        );
      }

      request.headers.set('x-ratelimit-limit', limit.toString());
      request.headers.set('x-ratelimit-remaining', remaining.toString());
    }
  } catch (err) {
    // If Redis is down, allow the request through (fail open)
    // rather than blocking all traffic — but log so we know
    console.warn('[rate-limit] Redis error, failing open:', (err as Error).message ?? err);
  }

  return null;
}

/**
 * Per-wallet check, called from inside a route handler after the body has been
 * parsed (middleware can't see the body). Returns a 429 NextResponse if the
 * wallet has exceeded its budget, or null to proceed. Safe to call with
 * null/empty wallet — those are treated as anonymous and skip the check
 * (middleware's IP tier already covers anonymous traffic).
 */
export async function checkWalletRateLimit(
  walletAddress: string | null | undefined,
  endpoint: string,
): Promise<NextResponse | null> {
  if (!walletAddress || typeof walletAddress !== 'string') return null;
  const wallet = walletAddress.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return null;

  try {
    const { success, limit, reset } = await walletLimiter.limit(`${wallet}:${endpoint}`);
    if (!success) {
      return NextResponse.json(
        { error: 'You are sending requests too quickly. Give it a second and try again.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': reset.toString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        },
      );
    }
  } catch (err) {
    // Fail open — same policy as middleware's IP limiter.
    console.warn('[rate-limit] wallet limiter error, failing open:', (err as Error).message ?? err);
  }
  return null;
}
