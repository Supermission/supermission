/**
 * Agent Endorsements — Trust Layer
 *
 * Allows agents to endorse capabilities of agents they have
 * collaborated with (shared missions or hire contracts).
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { sanitizeInput } from '../utils/sanitize';


// ==========================================
// Types
// ==========================================

export interface Endorsement {
  id: string;
  endorserAgentId: string;
  endorserName: string;
  endorsedAgentId: string;
  capability: string;
  comment: string | null;
  proofType: string;
  proofId: string;
  createdAt: string;
}

// ==========================================
// Shared Work Validation
// ==========================================

/**
 * Checks whether two agents have collaborated via a shared mission
 * (both accepted on the same mission, or both assigned tasks on the same mission)
 * or via a hire contract.
 *
 * Returns { found: true, proofType, proofId } on first match.
 */
async function findSharedWork(
  endorserAgentId: string,
  endorsedAgentId: string,
  endorserOwnerAddress: string
): Promise<{ found: boolean; proofType?: 'mission' | 'contract'; proofId?: string }> {
  // 1. Shared mission via collaborate_applications (both accepted on the same mission)
  const { data: endorserApps } = await supabaseAdmin
    .from('collaborate_applications')
    .select('mission_id')
    .eq('agent_id', endorserAgentId)
    .eq('status', 'accepted');

  if (endorserApps && endorserApps.length > 0) {
    const missionIds = endorserApps.map(a => a.mission_id);
    const { data: endorsedApps } = await supabaseAdmin
      .from('collaborate_applications')
      .select('mission_id')
      .eq('agent_id', endorsedAgentId)
      .eq('status', 'accepted')
      .in('mission_id', missionIds);

    if (endorsedApps && endorsedApps.length > 0) {
      return { found: true, proofType: 'mission', proofId: endorsedApps[0].mission_id };
    }
  }

  // 2. Shared mission via collaborate_tasks (both assigned tasks on the same mission)
  const { data: endorserTasks } = await supabaseAdmin
    .from('collaborate_tasks')
    .select('mission_id')
    .eq('assigned_agent_id', endorserAgentId);

  if (endorserTasks && endorserTasks.length > 0) {
    const taskMissionIds = endorserTasks.map(t => t.mission_id);
    const { data: endorsedTasks } = await supabaseAdmin
      .from('collaborate_tasks')
      .select('mission_id')
      .eq('assigned_agent_id', endorsedAgentId)
      .in('mission_id', taskMissionIds);

    if (endorsedTasks && endorsedTasks.length > 0) {
      return { found: true, proofType: 'mission', proofId: endorsedTasks[0].mission_id };
    }
  }

  // 3. Hire contract: endorsed agent was hired by endorser's owner (or vice versa)
  //    Look up the endorsed agent's owner address to check both directions.
  const { data: endorsedAgent } = await supabaseAdmin
    .from('marketplace_agents')
    .select('wallet_address')
    .eq('id', endorsedAgentId)
    .single();

  const endorsedOwnerAddress = endorsedAgent?.wallet_address;

  // Contract where endorser's owner hired endorsed agent
  const { data: contractA } = await supabaseAdmin
    .from('marketplace_contracts')
    .select('id')
    .eq('agent_id', endorsedAgentId)
    .ilike('client_address', endorserOwnerAddress)
    .limit(1);

  if (contractA && contractA.length > 0) {
    return { found: true, proofType: 'contract', proofId: contractA[0].id };
  }

  // Contract where endorsed agent's owner hired endorser agent
  if (endorsedOwnerAddress) {
    const { data: contractB } = await supabaseAdmin
      .from('marketplace_contracts')
      .select('id')
      .eq('agent_id', endorserAgentId)
      .ilike('client_address', endorsedOwnerAddress)
      .limit(1);

    if (contractB && contractB.length > 0) {
      return { found: true, proofType: 'contract', proofId: contractB[0].id };
    }
  }

  return { found: false };
}

// ==========================================
// Create Endorsement
// ==========================================

export async function createEndorsement(request: {
  endorserAgentId: string;
  endorsedAgentId: string;
  capability: string;
  comment?: string;
}): Promise<{ success: boolean; endorsementId?: string; error?: string }> {
  try {
    const { endorserAgentId, endorsedAgentId } = request;
    const capability = sanitizeInput(request.capability).trim();
    const comment = request.comment ? sanitizeInput(request.comment).trim() : null;

    // 1. Cannot endorse yourself
    if (endorserAgentId === endorsedAgentId) {
      return { success: false, error: 'Cannot endorse yourself' };
    }

    // 2. Capability validation
    if (!capability || capability.length === 0) {
      return { success: false, error: 'Capability is required' };
    }
    if (capability.length > 50) {
      return { success: false, error: 'Capability must be 50 characters or fewer' };
    }

    // 3. Comment length validation
    if (comment && comment.length > 500) {
      return { success: false, error: 'Comment must be 500 characters or fewer' };
    }

    // 4. Both agents must exist
    const { data: agents, error: agentsError } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, wallet_address')
      .in('id', [endorserAgentId, endorsedAgentId]);

    if (agentsError || !agents || agents.length < 2) {
      return { success: false, error: 'One or both agents not found' };
    }

    const endorserAgent = agents.find(a => a.id === endorserAgentId);
    const endorserOwnerAddress = endorserAgent?.wallet_address || '';

    // 5. Shared work validation
    const sharedWork = await findSharedWork(endorserAgentId, endorsedAgentId, endorserOwnerAddress);
    if (!sharedWork.found) {
      return { success: false, error: 'Agents must have shared work history (mission or contract) to endorse' };
    }

    // 6. Insert endorsement
    const { data: endorsement, error: insertError } = await supabaseAdmin
      .from('agent_endorsements')
      .insert({
        endorser_agent_id: endorserAgentId,
        endorsed_agent_id: endorsedAgentId,
        capability,
        comment,
        proof_type: sharedWork.proofType,
        proof_id: sharedWork.proofId,
      })
      .select('id')
      .single();

    if (insertError) {
      // Unique constraint violation = duplicate endorsement
      if (insertError.code === '23505') {
        return { success: false, error: 'You have already endorsed this agent for this capability' };
      }
      console.error('[Endorsements] Insert error:', insertError);
      return { success: false, error: 'Failed to create endorsement' };
    }

    return { success: true, endorsementId: endorsement.id };
  } catch (error) {
    console.error('[Endorsements] Error creating endorsement:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create endorsement',
    };
  }
}

// ==========================================
// Get Endorsements
// ==========================================

export async function getEndorsements(
  agentId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ success: boolean; endorsements?: Endorsement[]; total?: number; limit?: number; offset?: number; error?: string }> {
  try {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    // Get total count
    const { count, error: countError } = await supabaseAdmin
      .from('agent_endorsements')
      .select('id', { count: 'exact', head: true })
      .eq('endorsed_agent_id', agentId);

    if (countError) {
      console.error('[Endorsements] Count error:', countError);
      return { success: false, error: 'Failed to fetch endorsements' };
    }

    const { data, error } = await supabaseAdmin
      .from('agent_endorsements')
      .select('id, endorser_agent_id, endorsed_agent_id, capability, comment, proof_type, proof_id, created_at')
      .eq('endorsed_agent_id', agentId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Endorsements] Query error:', error);
      return { success: false, error: 'Failed to fetch endorsements' };
    }

    // Fetch endorser names
    const endorserIds = [...new Set((data || []).map(r => r.endorser_agent_id))];
    const nameMap = new Map<string, string>();

    if (endorserIds.length > 0) {
      const { data: agents } = await supabaseAdmin
        .from('marketplace_agents')
        .select('id, agent_name')
        .in('id', endorserIds);

      for (const a of agents || []) {
        nameMap.set(a.id, a.agent_name || 'Unknown');
      }
    }

    const endorsements: Endorsement[] = (data || []).map(row => ({
      id: row.id,
      endorserAgentId: row.endorser_agent_id,
      endorserName: nameMap.get(row.endorser_agent_id) || 'Unknown',
      endorsedAgentId: row.endorsed_agent_id,
      capability: row.capability,
      comment: row.comment,
      proofType: row.proof_type,
      proofId: row.proof_id,
      createdAt: row.created_at,
    }));

    return { success: true, endorsements, total: count ?? 0, limit, offset };
  } catch (error) {
    console.error('[Endorsements] Error fetching endorsements:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch endorsements',
    };
  }
}
