/**
 * Shared authentication helper for API routes.
 *
 * Supports two auth methods:
 * 1. privy-token cookie (browser requests)
 * 2. x-internal-secret header (server-to-server calls within the app)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy/server';

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * Require authentication via Privy cookie or internal service header.
 * Returns null on success, or a 401 NextResponse on failure.
 */
export async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
  // Allow internal server-to-server calls with shared secret
  if (INTERNAL_SECRET) {
    const internalHeader = req.headers.get('x-internal-secret');
    if (internalHeader === INTERNAL_SECRET) {
      return null;
    }
  }

  // Otherwise require a valid Privy token
  const token = req.cookies.get('privy-token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    await verifyPrivyToken(token);
    return null;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }
}
