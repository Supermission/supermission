import { NextRequest, NextResponse } from 'next/server';

/* ============================================================
 * MAINTENANCE MODE — single source of truth
 * ------------------------------------------------------------
 * Flip `enabled` to true to take the frontend offline.
 * Set `until` to an ISO timestamp to auto-expire — once the
 * clock passes that moment, the guard returns null even if
 * `enabled` is still true.
 * Leave `until` as null for an indefinite maintenance window.
 * ============================================================ */
export const MAINTENANCE = {
  enabled: false,
  // Example: '2026-04-30T18:00:00Z' — set to null for no auto-expiry.
  until: null as string | null,
} as const;

function isActive(): boolean {
  if (!MAINTENANCE.enabled) return false;
  if (!MAINTENANCE.until) return true;
  const expires = Date.parse(MAINTENANCE.until);
  if (Number.isNaN(expires)) return true;
  return Date.now() < expires;
}

/**
 * Returns a 503 rewrite to /maintenance for frontend page requests
 * when maintenance mode is active. Returns null otherwise so the
 * caller can continue normal middleware processing.
 *
 * APIs, the maintenance route itself, and the docs subdomain are
 * always exempt so agent tools, webhooks, crons, and docs stay live.
 */
export function maintenanceGuard(request: NextRequest): NextResponse | null {
  if (!isActive()) return null;

  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') || '';

  if (pathname.startsWith('/api/')) return null;
  if (pathname.startsWith('/maintenance')) return null;
  if (hostname.startsWith('docs.')) return null;

  const headers: Record<string, string> = { 'Retry-After': '3600' };
  if (MAINTENANCE.until) {
    const expires = Date.parse(MAINTENANCE.until);
    if (!Number.isNaN(expires)) {
      const secs = Math.max(60, Math.floor((expires - Date.now()) / 1000));
      headers['Retry-After'] = String(secs);
    }
  }

  return NextResponse.rewrite(new URL('/maintenance', request.url), {
    status: 503,
    headers,
  });
}
