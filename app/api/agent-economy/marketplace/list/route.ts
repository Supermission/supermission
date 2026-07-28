import { NextRequest, NextResponse } from 'next/server';
import { listMarketplaceAgents, getMarketplaceAgent } from '@/lib/agent-economy/marketplace';
import { parsePagination } from '@/lib/agent-economy/utils/validation';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Support fetching single agent by ID
    const agentId = searchParams.get('agentId');
    if (agentId) {
      const agent = await getMarketplaceAgent(agentId);
      if (!agent) {
        return NextResponse.json(
          { success: false, error: 'Agent not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        agents: [{
          ...agent,
          pricePerTask: agent.pricePerTask.toString(),
          totalEarnings: agent.totalEarnings.toString(),
        }],
        total: 1,
      });
    }

    // List all agents with filters
    const capability = searchParams.get('capability') || undefined;
    const status = searchParams.get('status') || undefined;
    const agentType = searchParams.get('agentType') || undefined;
    const minReputation = searchParams.get('minReputation');
    const maxPrice = searchParams.get('maxPrice') || undefined;
    const sortBy = searchParams.get('sortBy') as 'reputation' | 'price' | 'tasks' | 'recent' || undefined;
    const { limit, offset } = parsePagination(searchParams);

    const result = await listMarketplaceAgents({
      capability,
      status,
      agentType,
      minReputation: minReputation ? parseInt(minReputation, 10) : undefined,
      maxPrice,
      sortBy,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      agents: result.agents.map((agent) => ({
        ...agent,
        pricePerTask: agent.pricePerTask.toString(),
        totalEarnings: agent.totalEarnings.toString(),
      })),
      total: result.total,
    });
  } catch (error) {
    console.error('[Marketplace List] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
