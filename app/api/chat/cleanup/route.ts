/**
 * Chat Cleanup API
 * DELETE /api/chat/cleanup - Clear all old test chat data
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { requireAdmin } from '@/lib/admin/auth';

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    console.log('[Cleanup] Starting chat data cleanup...');

    // Delete all messages first (foreign key constraint)
    const { error: messagesError } = await supabaseAdmin
      .from('chat_messages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (messagesError) {
      throw new Error(`Failed to delete messages: ${messagesError.message}`);
    }

    // Delete all sessions
    const { error: sessionsError } = await supabaseAdmin
      .from('chat_sessions')
      .delete()
      .neq('session_id', 'none'); // Delete all

    if (sessionsError) {
      throw new Error(`Failed to delete sessions: ${sessionsError.message}`);
    }

    console.log('[Cleanup] [OK] Successfully cleared all chat data');

    return NextResponse.json({
      success: true,
      message: 'All chat sessions and messages have been cleared',
    });
  } catch (error) {
    console.error('[Cleanup] [ERROR] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to cleanup chat data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/chat/cleanup',
    methods: {
      DELETE: 'Clear all chat sessions and messages',
    },
    warning: 'This will permanently delete ALL chat data!',
  });
}
