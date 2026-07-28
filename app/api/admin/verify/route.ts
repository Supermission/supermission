import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

/** Lightweight endpoint to verify admin status */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(
    { admin: true, email: auth.email },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
