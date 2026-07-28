import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

const db = supabaseAdmin as any;

// GET /api/alerts — returns alerts for the authenticated user
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
      .from('price_alerts')
      .select('id, user_address, condition_id, token_id, outcome, direction, threshold, is_recurring, is_active, triggered_at, created_at')
      .eq('user_address', userAddress)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[API/alerts] GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alerts: data || [] });
  } catch (err: any) {
    console.error('[API/alerts] Unexpected GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message },
      { status: 500 },
    );
  }
}

// POST /api/alerts — create a new price alert for the authenticated user
export async function POST(request: NextRequest) {
  try {
    const userAddress = request.headers.get('x-verified-wallet')?.split(',')[0];
    if (!userAddress) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { conditionId, tokenId, outcome, direction, threshold, isRecurring } = body;

    if (!conditionId || !tokenId || !outcome || !direction || threshold == null) {
      return NextResponse.json(
        { error: 'Missing required fields: conditionId, tokenId, outcome, direction, threshold' },
        { status: 400 },
      );
    }

    if (!['above', 'below'].includes(direction)) {
      return NextResponse.json(
        { error: 'direction must be "above" or "below"' },
        { status: 400 },
      );
    }

    const thresholdNum = parseFloat(threshold);
    if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 100) {
      return NextResponse.json(
        { error: 'threshold must be a number between 0 and 100' },
        { status: 400 },
      );
    }

    const { data, error } = await db
      .from('price_alerts')
      .insert({
        user_address: userAddress,
        condition_id: conditionId,
        token_id: tokenId,
        outcome,
        direction,
        threshold: thresholdNum,
        is_recurring: isRecurring ?? false,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('[API/alerts] POST error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alert: data }, { status: 201 });
  } catch (err: any) {
    console.error('[API/alerts] Unexpected POST error:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message },
      { status: 500 },
    );
  }
}

// PATCH /api/alerts — toggle alert active status
export async function PATCH(request: NextRequest) {
  try {
    const walletAddresses = request.headers.get('x-verified-wallet')?.split(',').filter(Boolean) || [];
    if (walletAddresses.length === 0) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { alertId, isActive } = body;

    if (!alertId || typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: alertId (string), isActive (boolean)' },
        { status: 400 },
      );
    }

    // Scope update to the authenticated user's wallets
    const { data, error } = await db
      .from('price_alerts')
      .update({ is_active: isActive })
      .eq('id', alertId)
      .in('user_address', walletAddresses)
      .select()
      .single();

    if (error) {
      console.error('[API/alerts] PATCH error:', error);
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    return NextResponse.json({ alert: data });
  } catch (err: any) {
    console.error('[API/alerts] Unexpected PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// DELETE /api/alerts?alertId=...
export async function DELETE(request: NextRequest) {
  try {
    const walletAddresses = request.headers.get('x-verified-wallet')?.split(',').filter(Boolean) || [];
    if (walletAddresses.length === 0) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const alertId = searchParams.get('alertId');

    if (!alertId) {
      return NextResponse.json(
        { error: 'Missing required query parameter: alertId' },
        { status: 400 },
      );
    }

    // Scope delete to the authenticated user's wallets
    const { error } = await db
      .from('price_alerts')
      .delete()
      .eq('id', alertId)
      .in('user_address', walletAddresses);

    if (error) {
      console.error('[API/alerts] DELETE error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[API/alerts] Unexpected DELETE error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
