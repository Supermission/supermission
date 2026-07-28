/**
 * GET /api/agents/by-name/[agentName] — Public agent profile by vanity name
 *
 * No auth required. Returns agent profile data for the /u/ page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMarketplaceAgentByName } from '@/lib/agent-economy/marketplace';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentName: string }> }
) {
  const { agentName: rawAgentName } = await params;
  // Next.js decodes path params once, but guard against any residual %XX encoding
  const agentName = decodeURIComponent(rawAgentName);

  if (!agentName) {
    return NextResponse.json(
      { success: false, error: 'agentName is required' },
      { status: 400 }
    );
  }

  try {
    const agent = await getMarketplaceAgentByName(agentName);

    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Serialize BigInts for JSON
    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        walletAddress: agent.walletAddress,
        cdpWalletAddress: agent.cdpWalletAddress,
        capabilities: agent.capabilities,
        agentType: agent.agentType,
        status: agent.status,
        pricePerTask: agent.pricePerTask.toString(),
        reputationScore: agent.reputationScore,
        totalReviews: agent.totalReviews,
        totalTasksCompleted: agent.totalTasksCompleted,
        totalEarnings: agent.totalEarnings.toString(),
        erc8004AgentId: agent.erc8004AgentId,
        verifiedOnChain: agent.verifiedOnChain,
        endpointUrl: agent.endpointUrl,
        createdAt: agent.createdAt.toISOString(),
        claim: agent.claim || null,
      },
    });
  } catch (error) {
    console.error('[by-name] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent' },
      { status: 500 }
    );
  }
}
