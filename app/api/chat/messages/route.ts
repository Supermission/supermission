/**
 * Chat Messages API
 * Save and load chat messages
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveMessage, getMessages, toAppMessage, toDbMessage, ensureSessionExists, getSession, deleteMessagesFromTimestamp } from '@/lib/supabase/chat';
import type { Message } from '@/lib/store/chat';

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    const messages = await getMessages(sessionId, limit);
    const appMessages = messages.map(toAppMessage);

    return NextResponse.json({ messages: appMessages });
  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    const fromTimestamp = request.nextUrl.searchParams.get('fromTimestamp');

    if (!sessionId || !fromTimestamp) {
      return NextResponse.json({ error: 'sessionId and fromTimestamp required' }, { status: 400 });
    }

    const walletAddresses = (request.headers.get('x-verified-wallet') || '').split(',').filter(Boolean);
    const existing = await getSession(sessionId);
    if (!existing || !walletAddresses.includes(existing.user_address?.toLowerCase() ?? '')) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const ms = Number(fromTimestamp);
    if (!Number.isFinite(ms)) {
      return NextResponse.json({ error: 'Invalid fromTimestamp' }, { status: 400 });
    }

    await deleteMessagesFromTimestamp(sessionId, new Date(ms).toISOString());
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message, walletAddress, title, agentId } = body;

    if (!sessionId || !message) {
      return NextResponse.json({ error: 'Session ID and message required' }, { status: 400 });
    }

    const dbMessage = toDbMessage(message, sessionId);
    await ensureSessionExists(sessionId, walletAddress, title, agentId);

    const savedMessage = await saveMessage(dbMessage);
    const appMessage = toAppMessage(savedMessage);

    return NextResponse.json({ message: appMessage });
  } catch (error) {
    console.error('Save message error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
