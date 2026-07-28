/**
 * ERC-8004 Migration Endpoint
 * POST: Retroactively register existing marketplace agents on-chain
 * Protected by admin auth check (requires ADMIN_SECRET header)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { registerAgentOnChain, cacheRegistration } from '@/lib/agent-economy/erc8004/register';
import { Address } from 'viem';


export async function POST(req: NextRequest) {
  // Admin auth check
  const adminSecret = req.headers.get('x-admin-secret');
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = body.limit || 10; // Process in batches

  // Fetch agents that are not yet verified on-chain
  const { data: agents, error } = await supabaseAdmin
    .from('marketplace_agents')
    .select('id, agent_name, description, capabilities, wallet_address, metadata')
    .eq('verified_on_chain', false)
    .limit(limit);

  if (error || !agents) {
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch agents',
      details: error?.message,
    });
  }

  if (agents.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No agents need migration',
      migrated: 0,
    });
  }

  const results: Array<{
    agentId: string;
    name: string;
    success: boolean;
    erc8004AgentId?: string;
    error?: string;
  }> = [];

  for (const agent of agents) {
    try {
      const result = await registerAgentOnChain({
        name: agent.agent_name,
        description: agent.description || '',
        capabilities: agent.capabilities || [],
        walletAddress: agent.wallet_address as Address,
      });

      if (result.success && result.agentId && result.txHash) {
        // Cache in erc8004_identities
        await cacheRegistration({
          marketplaceAgentId: agent.id,
          erc8004AgentId: result.agentId,
          globalAgentId: result.globalAgentId || '',
          agentURI: '',
          registrationTxHash: result.txHash,
          ownerAddress: agent.wallet_address,
        });

        // Update marketplace_agents
        const currentMetadata = (agent.metadata || {}) as Record<string, unknown>;
        await supabaseAdmin
          .from('marketplace_agents')
          .update({
            metadata: {
              ...currentMetadata,
              erc8004_agent_id: result.agentId,
              erc8004_global_id: result.globalAgentId,
              erc8004_tx_hash: result.txHash,
            },
            verified_on_chain: true,
          })
          .eq('id', agent.id);

        results.push({
          agentId: agent.id,
          name: agent.agent_name,
          success: true,
          erc8004AgentId: result.agentId,
        });
      } else {
        results.push({
          agentId: agent.id,
          name: agent.agent_name,
          success: false,
          error: result.error,
        });
      }
    } catch (err) {
      results.push({
        agentId: agent.id,
        name: agent.agent_name,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  const migrated = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return NextResponse.json({
    success: true,
    message: `Migrated ${migrated} agents, ${failed} failed`,
    migrated,
    failed,
    results,
  });
}
