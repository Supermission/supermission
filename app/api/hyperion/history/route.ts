/**
 * HYPERION History — fetch sessions + messages for a wallet.
 *
 * GET /api/hyperion/history?wallet=0x...
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');

  if (!wallet) {
    return NextResponse.json({ error: 'wallet query param required' }, { status: 400 });
  }

  try {
    // Fetch sessions for this wallet, newest first
    const { data: sessions, error: sessErr } = await supabaseAdmin
      .from('hyperion_sessions')
      .select('*')
      .eq('user_id', wallet)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (sessErr) throw sessErr;

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ sessions: [], messages: {} });
    }

    const sessionIds = sessions.map((s: { id: string }) => s.id);

    // Fetch messages for all sessions
    const { data: messages, error: msgErr } = await supabaseAdmin
      .from('hyperion_messages')
      .select('*')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: true });

    if (msgErr) throw msgErr;

    // Group messages by session
    const messagesBySession: Record<string, typeof messages> = {};
    for (const msg of messages || []) {
      const sid = msg.session_id as string;
      if (!messagesBySession[sid]) messagesBySession[sid] = [];
      messagesBySession[sid].push(msg);
    }

    return NextResponse.json({ sessions, messages: messagesBySession });
  } catch (err) {
    console.error('[HYPERION History] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
