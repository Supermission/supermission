/**
 * Chat Sessions API (FREE - No Payment Required)
 * Manage free chat sessions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSession, getSession, updateSession, getSessionsByWallet, deleteSessionWithMessages } from '@/lib/supabase/chat';
import { isAddress } from 'viem';

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    const wallet = request.nextUrl.searchParams.get('wallet');

    // If sessionId provided, fetch specific session
    if (sessionId) {
      const session = await getSession(sessionId);

      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      // Return in client-friendly format (free chat - no expiration)
      return NextResponse.json({
        session: {
          id: session.session_id,
          title: session.title || 'New Chat',
          walletAddress: session.user_address,
          agentId: session.agent_id,
          createdAt: new Date(session.created_at || Date.now()).getTime(),
          lastMessageAt: new Date(session.updated_at || session.created_at || Date.now()).getTime(),
        },
      });
    }

    // If wallet provided, fetch all sessions for that wallet
    if (wallet) {
      // Validate wallet address
      if (!isAddress(wallet)) {
        return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
      }

      const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
      const sessions = await getSessionsByWallet(wallet, limit);

      // Convert to client-friendly format
      const clientSessions = sessions.map((session) => ({
        id: session.session_id,
        title: session.title || 'New Chat',
        walletAddress: session.user_address,
        agentId: session.agent_id,
        createdAt: new Date(session.created_at || Date.now()).getTime(),
        lastMessageAt: new Date(session.updated_at || session.created_at || Date.now()).getTime(),
      }));

      return NextResponse.json({
        sessions: clientSessions,
        count: clientSessions.length,
      });
    }

    // Neither sessionId nor wallet provided
    return NextResponse.json({ error: 'Session ID or wallet address required' }, { status: 400 });
  } catch (error) {
    console.error('Get session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth is handled by middleware — read verified wallets from header
    const walletAddresses = (request.headers.get('x-verified-wallet') || '').split(',').filter(Boolean);

    const body = await request.json();
    const { session_id, user_address, agent_id } = body;

    if (!session_id || !user_address) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the caller owns the wallet
    if (!walletAddresses.includes(user_address.toLowerCase())) {
      return NextResponse.json({ error: 'Wallet not owned by authenticated user' }, { status: 403 });
    }

    const session = await createSession({
      session_id,
      user_address,
      agent_id: agent_id || 'supermission-agent',
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error('Create session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Auth is handled by middleware — read verified wallets from header
    const walletAddresses = (request.headers.get('x-verified-wallet') || '').split(',').filter(Boolean);

    const body = await request.json();
    const { session_id, title } = body;

    if (!session_id) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    // Verify ownership
    const existing = await getSession(session_id);
    if (!existing || !walletAddresses.includes(existing.user_address?.toLowerCase())) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Whitelist allowed fields
    const safeUpdates: Record<string, unknown> = {};
    if (typeof title === 'string') safeUpdates.title = title;

    const session = await updateSession(session_id, safeUpdates);

    return NextResponse.json(session);
  } catch (error) {
    console.error('Update session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Auth is handled by middleware — read verified wallets from header
    const walletAddresses = (request.headers.get('x-verified-wallet') || '').split(',').filter(Boolean);

    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    // Verify ownership before deleting
    const existing = await getSession(sessionId);
    if (!existing || !walletAddresses.includes(existing.user_address?.toLowerCase())) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await deleteSessionWithMessages(sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
