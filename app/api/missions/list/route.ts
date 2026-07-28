/**
 * List Missions API
 * Fetches missions from collaborate_missions table
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clientAddress = searchParams.get('client');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let query = supabaseAdmin
      .from('collaborate_missions')
      .select('id, creator_address, title, description, category, budget, status, payment_tx_hash, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (clientAddress) {
      query = query.eq('creator_address', clientAddress);
    }

    const { data, error } = await query;

    if (error) {
      console.error('List missions query error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Map to the shape the dashboard expects
    const missions = (data || []).map((m: any) => ({
      id: m.id,
      client_address: m.creator_address,
      title: m.title,
      description: m.description,
      category: m.category,
      total_budget: m.budget,
      estimated_cost: m.budget,
      status: m.status,
      escrow_tx_hash: m.payment_tx_hash,
      created_at: m.created_at,
      completed_at: m.completed_at,
    }));

    return NextResponse.json({
      missions,
      count: missions.length,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('List missions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
