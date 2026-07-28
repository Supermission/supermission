import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { verifyPrivyToken } from '@/lib/privy/server';
import { maintenanceGuard } from '@/lib/maintenance';

/** Build the admin email set (called per-request to ensure env is available) */
function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * API Route Method Configuration
 * Maps route patterns to their allowed HTTP methods
 */
const API_ROUTE_METHODS: Record<string, string[]> = {
  // Auth
  '/api/agent-economy/auth/keys': ['GET', 'PUT', 'DELETE'],

  // Wallet
  '/api/agent-economy/wallet/list': ['GET'],
  '/api/agent-economy/wallet/policy': ['GET', 'PUT'],

  // Marketplace
  '/api/agent-economy/marketplace/list': ['GET'],
  '/api/agent-economy/marketplace/hire': ['POST'],
  '/api/agent-economy/marketplace/review': ['GET', 'POST'],

  // Collaborate
  '/api/agent-economy/collaborate/missions': ['GET', 'POST'],
  '/api/agent-economy/collaborate/missions/[missionId]': ['GET'],
  '/api/agent-economy/collaborate/missions/[missionId]/messages': ['GET', 'POST'],
  '/api/agent-economy/collaborate/join': ['POST'],
  '/api/agent-economy/collaborate/tasks': ['GET', 'POST'],
  '/api/agent-economy/collaborate/activate': ['POST'],
  '/api/agent-economy/collaborate/applications': ['GET', 'POST'],
  '/api/agent-economy/collaborate/applications/[applicationId]/approve': ['GET', 'POST'],
  '/api/agent-economy/collaborate/applications/[applicationId]/messages': ['GET', 'POST'],
  '/api/agent-economy/collaborate/payments': ['GET'],

  // Compete
  '/api/agent-economy/compete/competitions': ['GET', 'POST'],
  '/api/agent-economy/compete/competitions/[competitionId]': ['GET'],
  '/api/agent-economy/compete/enter': ['POST'],
  '/api/agent-economy/compete/submit': ['POST'],
  '/api/agent-economy/compete/score': ['POST'],
  '/api/agent-economy/compete/leaderboard': ['GET'],

  // x402
  '/api/agent-economy/x402/requirements': ['POST'],
  '/api/agent-economy/x402/verify': ['POST'],

  // ERC-8004
  '/api/agent-economy/erc8004/migrate': ['POST'],
  '/api/agent-economy/erc8004/registrations': ['GET'],

  // AP2 Mandates
  '/api/agent-economy/mandate/intent': ['POST'],
  '/api/agent-economy/mandate/verify': ['POST'],

  // Webhooks
  '/api/agent-economy/webhooks': ['GET', 'POST', 'PUT', 'DELETE'],

  // Disputes
  '/api/agent-economy/disputes': ['GET', 'POST'],

  // Automation
  '/api/agent-economy/automation/rules': ['GET', 'POST', 'PUT', 'DELETE'],

  // Compute
  '/api/agent-economy/compute/providers': ['GET', 'POST', 'PUT'],
  '/api/agent-economy/compute/inference': ['POST'],
  '/api/agent-economy/compute/usage': ['GET'],

  // Compute Sessions
  '/api/agent-economy/compute/sessions': ['GET', 'POST'],
  '/api/agent-economy/compute/sessions/cleanup': ['POST'],
  '/api/agent-economy/compute/sessions/[sessionId]': ['GET'],
  '/api/agent-economy/compute/sessions/[sessionId]/execute': ['POST'],
  '/api/agent-economy/compute/sessions/[sessionId]/close': ['POST'],

  // Compute Escrow
  '/api/agent-economy/compute/escrow': ['GET', 'POST'],
  '/api/agent-economy/compute/escrow/[escrowId]': ['GET'],
  '/api/agent-economy/compute/escrow/[escrowId]/release': ['POST'],
  '/api/agent-economy/compute/escrow/[escrowId]/refund': ['POST'],

  // Monitoring
  '/api/agent-economy/health': ['GET'],
  '/api/agent-economy/heartbeat': ['GET', 'POST'],
  '/api/agent-economy/stats': ['GET'],
  '/api/agent-economy/transactions': ['GET'],
  '/api/agent-economy/match': ['GET'],
  '/api/agent-economy/pricing': ['GET'],
};

/* ─── Public routes that don't require authentication ─── */

const PUBLIC_API_PATTERNS: { pattern: string; methods?: string[] }[] = [
  // Ops endpoints — protected by their own shared-secret tokens, not Privy.
  // Letting them through here so status pages / uptime probes can poll without
  // a user session cookie.
  { pattern: '/api/health/**', methods: ['GET'] },

  // Robinhood OAuth callback — secured by the single-use state token + PKCE,
  // not the session cookie (the browser redirect may arrive without it).
  { pattern: '/api/robinhood/callback', methods: ['GET'] },

  { pattern: '/api/agents/claim' },
  { pattern: '/api/agents/leaderboard' },
  { pattern: '/api/new-agents/**' },
  { pattern: '/api/x402/**' },
  { pattern: '/api/auth/session', methods: ['POST'] },
  { pattern: '/api/agent-economy/health', methods: ['GET'] },
  { pattern: '/api/agent-economy/heartbeat', methods: ['GET'] },
  { pattern: '/api/agent-economy/collaborate/missions', methods: ['GET'] },
  { pattern: '/api/agent-economy/compete/competitions', methods: ['GET'] },
  { pattern: '/api/agent-economy/compete/leaderboard', methods: ['GET'] },
  { pattern: '/api/circle/webhooks', methods: ['POST'] },
  { pattern: '/api/agent-economy/stats', methods: ['GET'] },
  { pattern: '/api/agent-economy/marketplace/list', methods: ['GET'] },
  // DeFi read-only APIs (activity POST requires auth — excluded)
  { pattern: '/api/defi/pools/**' },
  { pattern: '/api/defi/swap/**' },
  { pattern: '/api/defi/tokens/**' },
  { pattern: '/api/defi/activity', methods: ['GET'] },
  // Internal APIs called by agent tools (server-to-server, no cookies)
  { pattern: '/api/dashboard/delphi', methods: ['POST'] },
  { pattern: '/api/security/securo', methods: ['POST'] },
  { pattern: '/api/markets/oracle', methods: ['POST'] },
  { pattern: '/api/markets/public', methods: ['GET'] },
  { pattern: '/api/dashboard/prices/**' },
  { pattern: '/api/dashboard/tokens/**' },
  // OG image generation — must be public for Twitter/social crawlers
  { pattern: '/api/og/**' },
  // HYPERION agent chat
  { pattern: '/api/hyperion/**' },
  { pattern: '/api/perps/**' },
  // Wallet balance checks (read-only, address in query param)
  { pattern: '/api/wallet/balances', methods: ['GET'] },
  // Vercel Cron endpoints — auth is enforced in-handler via Bearer CRON_SECRET.
  // Vercel Cron sends no cookies, so Privy JWT middleware must not gate these.
  { pattern: '/api/cron/**', methods: ['GET'] },
];

/**
 * Check if a path matches a route pattern (handles dynamic segments)
 */
function matchRoute(path: string, pattern: string): boolean {
  // Exact match
  if (path === pattern) return true;

  // Handle dynamic segments like /missions/[missionId]
  const pathParts = path.split('/');
  const patternParts = pattern.split('/');

  if (pathParts.length !== patternParts.length) return false;

  return patternParts.every((part, i) => {
    if (part.startsWith('[') && part.endsWith(']')) return true;
    return part === pathParts[i];
  });
}

/**
 * Check if a path matches a glob-style pattern (supports ** wildcard)
 */
function matchGlob(path: string, pattern: string): boolean {
  if (path === pattern) return true;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(prefix + '/');
  }
  return false;
}

function isPublicApi(pathname: string, method: string): boolean {
  return PUBLIC_API_PATTERNS.some(({ pattern, methods }) => {
    if (!matchGlob(pathname, pattern)) return false;
    if (methods && !methods.includes(method)) return false;
    return true;
  });
}

/**
 * Check if a path matches a public pattern but with a disallowed method.
 * Used to return 405 instead of 401 for wrong-method requests on public routes.
 */
function isPublicPathWrongMethod(pathname: string, method: string): string[] | null {
  for (const { pattern, methods } of PUBLIC_API_PATTERNS) {
    if (!matchGlob(pathname, pattern)) continue;
    if (methods && !methods.includes(method)) return methods;
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const { pathname } = request.nextUrl;
  const method = request.method;

  // ─── Maintenance mode (config + logic in lib/maintenance.ts) ───
  const maintenanceResponse = maintenanceGuard(request);
  if (maintenanceResponse) return maintenanceResponse;

  // Rate limiting — check before any processing
  if (pathname.startsWith('/api/')) {
    const rateLimitResponse = await checkRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;
  }

  // Proxy docs.supermission.fun → Mintlify
  if (hostname.startsWith('docs.')) {
    const mintlifyUrl = new URL(request.url);
    mintlifyUrl.hostname = 'supermission-e97e4c8f.mintlify.app';
    mintlifyUrl.port = '';

    const res = await fetch(mintlifyUrl.toString(), {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers),
        'host': 'supermission-e97e4c8f.mintlify.app',
        'x-forwarded-host': hostname,
        'x-forwarded-proto': 'https',
      },
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    const responseHeaders = new Headers(res.headers);
    responseHeaders.delete('content-encoding');

    return new NextResponse(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  }

  // Always allow OPTIONS for CORS preflight
  if (method === 'OPTIONS') {
    return NextResponse.next();
  }

  // Block agent-economy page routes (keep APIs alive for agents)
  if (pathname.startsWith('/agent-economy') && !pathname.startsWith('/api/')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  /* ─── 405 for public routes hit with wrong method ─── */
  if (pathname.startsWith('/api/')) {
    const allowedMethods = isPublicPathWrongMethod(pathname, method);
    if (allowedMethods) {
      return NextResponse.json(
        { error: `Method ${method} not allowed. Allowed: ${allowedMethods.join(', ')}` },
        { status: 405, headers: { Allow: allowedMethods.join(', ') } },
      );
    }
  }

  /* ─── API auth gate: verify JWT and attach verified identity ─── */
  const requestHeaders = new Headers(request.headers);

  if (pathname.startsWith('/api/') && !isPublicApi(pathname, method)) {
    const token = request.cookies.get('privy-token')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    try {
      const { email, walletAddresses } = await verifyPrivyToken(token);
      if (walletAddresses.length > 0) {
        requestHeaders.set('x-verified-wallet', walletAddresses.join(','));
      }
      if (email) {
        requestHeaders.set('x-verified-email', email);
      }
    } catch (err) {
      console.warn('[Middleware] JWT verification failed:', (err as Error).message ?? err);
      return NextResponse.json(
        { success: false, error: 'Invalid or expired authentication token' },
        { status: 401 }
      );
    }
  }

  /* ─── Admin page/API gate: require auth + admin email from verified JWT ─── */
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin/')) {
    const adminEmails = getAdminEmails();

    if (pathname.startsWith('/api/admin/')) {
      // For API routes: JWT was already verified above, use verified email
      const verifiedEmail = requestHeaders.get('x-verified-email');
      if (!verifiedEmail || !adminEmails.has(verifiedEmail)) {
        return NextResponse.json(
          { success: false, error: 'Admin access required' },
          { status: 403 }
        );
      }
    } else {
      // For admin pages: verify JWT directly (page routes skip the API auth gate)
      const token = request.cookies.get('privy-token')?.value;
      if (!token) {
        return NextResponse.redirect(new URL('/', request.url));
      }
      try {
        const { email } = await verifyPrivyToken(token);
        if (!email || !adminEmails.has(email)) {
          return NextResponse.redirect(new URL('/', request.url));
        }
      } catch (err) {
        console.warn('[Middleware] Admin JWT verification failed:', (err as Error).message ?? err);
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
  }

  /* ─── HTTP method validation for agent-economy API routes ─── */
  if (pathname.startsWith('/api/agent-economy/')) {
    const matchingPattern = Object.keys(API_ROUTE_METHODS).find(
      (pattern) => matchRoute(pathname, pattern)
    );

    if (matchingPattern) {
      const allowedMethods = API_ROUTE_METHODS[matchingPattern];
      if (!allowedMethods.includes(method)) {
        return NextResponse.json(
          {
            success: false,
            error: `Method ${method} not allowed. Allowed methods: ${allowedMethods.join(', ')}`,
          },
          {
            status: 405,
            headers: {
              Allow: allowedMethods.join(', '),
            },
          }
        );
      }
    }
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next (static files, chunks)
     * - favicon.ico, robots.txt, sitemap.xml
     * - public assets (images, fonts, etc.)
     */
    '/((?!_next|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)).*)',
  ],
};
