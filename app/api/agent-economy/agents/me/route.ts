import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { getMarketplaceAgent } from '@/lib/agent-economy/marketplace';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'read');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult, authResult.context?.requestId);
    }

    const context = authResult.context!;

    // If the API key is linked to an agent, use getMarketplaceAgent directly
    if (context.agentId) {
      const agent = await getMarketplaceAgent(context.agentId);
      if (agent) {
        return NextResponse.json({
          success: true,
          agent: {
            id: agent.id,
            name: agent.name,
            status: agent.status,
            reputationScore: agent.reputationScore,
            totalTasksCompleted: agent.totalTasksCompleted,
            totalEarnings: agent.totalEarnings.toString(),
            capabilities: agent.capabilities,
            walletAddress: agent.walletAddress,
          },
        });
      }
    }

    // Fallback: look up by wallet address
    const { data, error } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name, is_available, rating, jobs_completed, total_earnings, capabilities, wallet_address, total_reviews')
      .eq('wallet_address', context.ownerAddress.toLowerCase())
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      agent: {
        id: data.id,
        name: data.agent_name,
        status: data.is_available ? 'active' : 'inactive',
        reputationScore: Math.round((data.rating || 0) * 20),
        totalTasksCompleted: data.jobs_completed || 0,
        totalEarnings: data.total_earnings || '0',
        capabilities: data.capabilities || [],
        walletAddress: data.wallet_address,
      },
    });
  } catch (error) {
    console.error('[Agents Me] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
