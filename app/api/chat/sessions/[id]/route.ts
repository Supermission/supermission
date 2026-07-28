/**
 * Chat Session by ID API
 * PATCH — rename a session's title
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/supabase/chat';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const walletAddresses = (request.headers.get('x-verified-wallet') || '').split(',').filter(Boolean);

    const body = await request.json();
    const rawTitle = body?.title;

    if (typeof rawTitle !== 'string') {
      return NextResponse.json({ error: 'Title must be a string' }, { status: 400 });
    }

    const title = rawTitle.trim();
    if (title.length === 0) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }
    if (title.length > 100) {
      return NextResponse.json({ error: 'Title exceeds 100 characters' }, { status: 400 });
    }

    const existing = await getSession(id);
    if (!existing || !walletAddresses.includes(existing.user_address?.toLowerCase() ?? '')) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await updateSession(id, { title });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Rename session error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
