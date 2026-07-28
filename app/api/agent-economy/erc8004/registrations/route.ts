import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { parsePagination } from '@/lib/agent-economy/utils/validation';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { limit, offset } = parsePagination(searchParams, 50);
    const owner = searchParams.get('owner');

    let query = supabaseAdmin
      .from('erc8004_identities')
      .select(
        '*, marketplace_agents!erc8004_identities_marketplace_agent_id_fkey(agent_name)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (owner) {
      query = query.eq('owner_address', owner);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[ERC8004 Registrations] Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch registrations' },
        { status: 500 }
      );
    }

    const registrations = (data || []).map((row) => {
      const { marketplace_agents, ...rest } = row as Record<string, unknown>;
      const agentData = marketplace_agents as { agent_name: string } | null;
      return {
        ...rest,
        agent_name: agentData?.agent_name || null,
      };
    });

    return NextResponse.json({
      success: true,
      registrations,
      total: count || 0,
    });
  } catch (error) {
    console.error('[ERC8004 Registrations] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
