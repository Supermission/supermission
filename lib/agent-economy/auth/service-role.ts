import { NextRequest, NextResponse } from 'next/server';

/**
 * Require SUPABASE_SERVICE_ROLE_KEY via Authorization: Bearer <token>
 */
export function requireServiceRole(request: NextRequest): NextResponse | null {
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: 'Service role key not configured' },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';

  if (!token || token !== expected) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return null;
}
