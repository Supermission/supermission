/**
 * Agent Details API
 * Fetches a single agent profile by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAgent, getAgentByErc8004Id } from '@/lib/supabase/agents';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    // Try to get by UUID first
    let agent = await getAgent(agentId);

    // If not found, try to get by ERC8004 ID (on-chain NFT ID)
    if (!agent) {
      agent = await getAgentByErc8004Id(agentId);
    }

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(agent, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('Get agent details error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
