/**
 * Register Platform Agents On-Chain (Mainnet ERC-8004)
 * POST /api/agents/register-onchain
 *
 * Registers the 10 platform agents on the mainnet Identity Registry
 * and updates their erc8004_agent_id in marketplace_agents.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { registerAgentOnChain } from '@/lib/agent-economy/erc8004/register';
import { ERC8004_CONTRACTS } from '@/lib/agent-economy/erc8004/contracts';
import { requireAdmin } from '@/lib/admin/auth';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // Fetch platform agents from marketplace_agents
    const { data: agents, error: fetchError } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name, capabilities, endpoint_url, description, wallet_address')
      .eq('is_platform_agent', true);

    if (fetchError) {
      return NextResponse.json(
        { error: 'Failed to fetch platform agents', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json(
        { error: 'No platform agents found.' },
        { status: 404 }
      );
    }

    const results = [];

    for (const agent of agents) {
      try {
        console.log(`[Register On-Chain] Registering ${agent.agent_name}...`);

        // Use the proven registerAgentOnChain which uses the relayer key
        const registration = await registerAgentOnChain({
          name: agent.agent_name,
          description: agent.description || '',
          capabilities: agent.capabilities || [],
          walletAddress: agent.wallet_address as `0x${string}`,
        });

        if (!registration.success || !registration.agentId) {
          results.push({
            success: false,
            agentId: agent.id,
            name: agent.agent_name,
            error: registration.error || 'Registration returned no agentId',
          });
          continue;
        }

        console.log(`[Register On-Chain] ${agent.agent_name} registered with ID: ${registration.agentId}, tx: ${registration.txHash}`);

        // Update marketplace_agents with new mainnet ERC-8004 ID
        const { error: updateError } = await supabaseAdmin
          .from('marketplace_agents')
          .update({ erc8004_agent_id: registration.agentId })
          .eq('id', agent.id);

        if (updateError) {
          console.error(`[Register On-Chain] Failed to update DB for ${agent.agent_name}:`, updateError);
        }

        results.push({
          success: true,
          agentId: agent.id,
          name: agent.agent_name,
          erc8004AgentId: registration.agentId,
          globalAgentId: registration.globalAgentId,
          txHash: registration.txHash,
          explorer: `https://basescan.org/tx/${registration.txHash}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Register On-Chain] Failed to register ${agent.agent_name}:`, message);
        results.push({
          success: false,
          agentId: agent.id,
          name: agent.agent_name,
          error: message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: successCount > 0,
      message: `Registered ${successCount}/${agents.length} platform agents on mainnet ERC-8004`,
      registry: ERC8004_CONTRACTS.identityRegistry,
      results,
    });
  } catch (error) {
    console.error('[Register On-Chain] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to register platform agents',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/agents/register-onchain',
    methods: {
      POST: 'Register all 10 platform agents on mainnet ERC-8004 Identity Registry',
    },
    agents: 'Platform agents matched by endpoint_url pattern /api/new-agents/*',
    registry: ERC8004_CONTRACTS.identityRegistry,
    warning: 'This will mint ERC-721 NFTs on Base mainnet (costs gas). Requires PRIVY_APP_SECRET env var.',
  });
}
