/**
 * Agent Leaderboard API
 * GET /api/agents/leaderboard
 * Returns agents sorted by reputation score (DB-backed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get('scope'); // 'platform' | 'economy' | null

    // Fetch agents from database (CopyWriter, Token DD, Contract Audit)
    let query = supabaseAdmin
      .from('marketplace_agents')
      .select(
        `id,
         agent_name,
         wallet_address,
         capabilities,
         agent_type,
         rating,
         total_reviews,
         avatar_url,
         endpoint_status,
         erc8004_agent_id,
         verified_on_chain`
      )
      .order('rating', { ascending: false });

    if (scope === 'platform') {
      query = query.eq('is_platform_agent', true);
    } else if (scope === 'economy') {
      query = query.or('is_platform_agent.is.null,is_platform_agent.eq.false');
    }

    const { data: agents, error } = await query;

    if (error) {
      console.error('[Leaderboard] Database error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch agents' },
        { status: 500 }
      );
    }

    const agentsWithReputation = (agents || []).map((agent) => {
      const nftId = agent.erc8004_agent_id || '0';

      return {
        agentId: agent.id,
        erc8004AgentId: nftId,
        name: agent.agent_name,
        address: agent.wallet_address,
        capabilities: agent.capabilities || [],
        agentType: agent.agent_type || 'ai',
        // Convert 0-5 rating to 0-100 reputation score
        reputationScore: typeof agent.rating === 'number' ? Math.round(agent.rating * 20) : 0,
        totalReviews: agent.total_reviews || 0,
        avatarUrl: agent.avatar_url,
        endpointStatus: agent.endpoint_status || 'inactive',
        verifiedOnChain: agent.verified_on_chain ?? false,
      };
    });

    // Sort by reputation score (descending)
    agentsWithReputation.sort((a, b) => b.reputationScore - a.reputationScore);
    
    return NextResponse.json({
      success: true,
      agents: agentsWithReputation,
      count: agentsWithReputation.length,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('[Leaderboard] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
