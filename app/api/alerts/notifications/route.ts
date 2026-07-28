import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

const db = supabaseAdmin as any;

// GET /api/alerts/notifications — returns notifications for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const userAddress = request.headers.get('x-verified-wallet')?.split(',')[0];
    if (!userAddress) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    const { data, error } = await db
      .from('alert_notifications')
      .select('*')
      .eq('user_address', userAddress)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[API/alerts/notifications] GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const notifications = data || [];
    const unreadCount = notifications.filter((n: any) => !n.is_read).length;

    return NextResponse.json({ notifications, unreadCount });
  } catch (err: any) {
    console.error('[API/alerts/notifications] Unexpected GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message },
      { status: 500 },
    );
  }
}

// PATCH /api/alerts/notifications — mark notification(s) as read
export async function PATCH(request: NextRequest) {
  try {
    const verifiedAddress = request.headers.get('x-verified-wallet')?.split(',')[0];
    if (!verifiedAddress) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { notificationId, markAllRead } = body;

    // Mark all notifications read for the authenticated user
    if (markAllRead) {
      const { error } = await db
        .from('alert_notifications')
        .update({ is_read: true })
        .eq('user_address', verifiedAddress)
        .eq('is_read', false);

      if (error) {
        console.error('[API/alerts/notifications] PATCH markAllRead error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Mark a single notification as read (scoped to authenticated user)
    if (notificationId) {
      const { error } = await db
        .from('alert_notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_address', verifiedAddress);

      if (error) {
        console.error('[API/alerts/notifications] PATCH single error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Provide notificationId or { markAllRead: true }' },
      { status: 400 },
    );
  } catch (err: any) {
    console.error('[API/alerts/notifications] Unexpected PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message },
      { status: 500 },
    );
  }
}
