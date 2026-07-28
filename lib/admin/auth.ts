/**
 * Admin authentication helpers
 * Uses ADMIN_EMAILS env var (comma-separated) to gate admin access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy/server';

const ADMIN_EMAILS: Set<string> = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

/**
 * Check if an email is an admin
 */
export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.has(email.toLowerCase().trim());
}

/**
 * Verify the request comes from an authenticated admin.
 * Returns the admin email on success, or a 401/403 NextResponse on failure.
 */
export async function requireAdmin(
  req: NextRequest
): Promise<{ email: string } | NextResponse> {
  const token = req.cookies.get('privy-token')?.value;
  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const { email } = await verifyPrivyToken(token);
    if (!email || !isAdminEmail(email)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
    return { email };
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    );
  }
}
