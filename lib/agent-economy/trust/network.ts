/**
 * Agent Network Graph - Collaboration network analysis
 * Maps agent relationships through shared missions and competitions
 */

import { supabaseAdmin } from '@/lib/supabase/client';


// ==========================================
// Types
// ==========================================

export interface ConnectionInfo {
  agentId: string;
  agentName: string;
  sharedMissions: number;
  sharedCompetitions: number;
  lastCollaboration: string | null;
  relationship: 'frequent_collaborator' | 'collaborator' | 'acquaintance';
}

export interface NetworkStats {
  totalCollaborators: number;
  frequentPartners: number;
  networkStrength: 'strong' | 'growing' | 'emerging' | 'new';
}

export interface NetworkData {
  agentId: string;
  connections: ConnectionInfo[];
  stats: NetworkStats;
}

// ==========================================
// Network Graph
// ==========================================

/**
 * Build the collaboration network graph for an agent.
 *
 * 1. Find missions the agent participated in (via tasks + accepted applications)
 * 2. Find other agents on those same missions
 * 3. Find shared competitions
 * 4. Classify relationships and compute stats
 */
export async function getAgentNetwork(
  agentId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ success: boolean; network?: NetworkData & { pagination?: { total: number; limit: number; offset: number } }; error?: string }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  try {
    // Verify the agent exists
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return { success: false, error: 'Agent not found' };
    }

    // Step 1: Gather mission IDs this agent is involved in
    const [tasksResult, applicationsResult] = await Promise.all([
      supabaseAdmin
        .from('collaborate_tasks')
        .select('mission_id')
        .eq('assigned_agent_id', agentId),
      supabaseAdmin
        .from('collaborate_applications')
        .select('mission_id')
        .eq('agent_id', agentId)
        .eq('status', 'accepted'),
    ]);

    const missionIds = new Set<string>();
    for (const row of tasksResult.data || []) {
      if (row.mission_id) missionIds.add(row.mission_id);
    }
    for (const row of applicationsResult.data || []) {
      if (row.mission_id) missionIds.add(row.mission_id);
    }

    // Step 2: Find other agents on the same missions
    // Track per-agent: shared mission count and latest collaboration timestamp
    const collaboratorMap = new Map<
      string,
      { sharedMissions: Set<string>; lastTimestamp: string | null }
    >();

    if (missionIds.size > 0) {
      const missionArray = Array.from(missionIds);

      const [peerTasks, peerApps] = await Promise.all([
        supabaseAdmin
          .from('collaborate_tasks')
          .select('assigned_agent_id, mission_id, created_at')
          .in('mission_id', missionArray)
          .neq('assigned_agent_id', agentId),
        supabaseAdmin
          .from('collaborate_applications')
          .select('agent_id, mission_id, applied_at')
          .in('mission_id', missionArray)
          .neq('agent_id', agentId)
          .eq('status', 'accepted'),
      ]);

      for (const row of peerTasks.data || []) {
        const peerId = row.assigned_agent_id;
        if (!peerId) continue;
        if (!collaboratorMap.has(peerId)) {
          collaboratorMap.set(peerId, { sharedMissions: new Set(), lastTimestamp: null });
        }
        const entry = collaboratorMap.get(peerId)!;
        entry.sharedMissions.add(row.mission_id);
        if (row.created_at && (!entry.lastTimestamp || row.created_at > entry.lastTimestamp)) {
          entry.lastTimestamp = row.created_at;
        }
      }

      for (const row of peerApps.data || []) {
        const peerId = row.agent_id;
        if (!peerId) continue;
        if (!collaboratorMap.has(peerId)) {
          collaboratorMap.set(peerId, { sharedMissions: new Set(), lastTimestamp: null });
        }
        const entry = collaboratorMap.get(peerId)!;
        entry.sharedMissions.add(row.mission_id);
        if (row.applied_at && (!entry.lastTimestamp || row.applied_at > entry.lastTimestamp)) {
          entry.lastTimestamp = row.applied_at;
        }
      }
    }

    // Step 3: Find shared competitions
    const { data: myCompEntries } = await supabaseAdmin
      .from('competition_entries')
      .select('competition_id')
      .eq('agent_id', agentId);

    const competitionIds = new Set<string>();
    for (const row of myCompEntries || []) {
      if (row.competition_id) competitionIds.add(row.competition_id);
    }

    // Map of peerId -> set of shared competition IDs
    const competitionMap = new Map<string, Set<string>>();

    if (competitionIds.size > 0) {
      const compArray = Array.from(competitionIds);

      const { data: peerCompEntries } = await supabaseAdmin
        .from('competition_entries')
        .select('agent_id, competition_id')
        .in('competition_id', compArray)
        .neq('agent_id', agentId);

      for (const row of peerCompEntries || []) {
        const peerId = row.agent_id;
        if (!peerId) continue;
        if (!competitionMap.has(peerId)) {
          competitionMap.set(peerId, new Set());
        }
        competitionMap.get(peerId)!.add(row.competition_id);
      }
    }

    // Step 4: Merge all peer agent IDs
    const allPeerIds = new Set<string>([
      ...collaboratorMap.keys(),
      ...competitionMap.keys(),
    ]);

    if (allPeerIds.size === 0) {
      return {
        success: true,
        network: {
          agentId,
          connections: [],
          stats: {
            totalCollaborators: 0,
            frequentPartners: 0,
            networkStrength: 'new',
          },
        },
      };
    }

    // Step 5: Fetch agent names
    const { data: agentNames } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name')
      .in('id', Array.from(allPeerIds));

    const nameMap = new Map<string, string>();
    for (const a of agentNames || []) {
      nameMap.set(a.id, a.agent_name || 'Unknown');
    }

    // Step 6: Build connections
    const connections: ConnectionInfo[] = [];

    for (const peerId of allPeerIds) {
      const missionData = collaboratorMap.get(peerId);
      const compData = competitionMap.get(peerId);

      const sharedMissions = missionData?.sharedMissions.size ?? 0;
      const sharedCompetitions = compData?.size ?? 0;
      const lastCollaboration = missionData?.lastTimestamp ?? null;

      let relationship: ConnectionInfo['relationship'];
      if (sharedMissions >= 3) {
        relationship = 'frequent_collaborator';
      } else if (sharedMissions >= 2) {
        relationship = 'collaborator';
      } else {
        relationship = 'acquaintance';
      }

      connections.push({
        agentId: peerId,
        agentName: nameMap.get(peerId) || 'Unknown',
        sharedMissions,
        sharedCompetitions,
        lastCollaboration,
        relationship,
      });
    }

    // Sort by strongest relationship first, then by shared missions count
    connections.sort((a, b) => {
      const order = { frequent_collaborator: 0, collaborator: 1, acquaintance: 2 };
      const diff = order[a.relationship] - order[b.relationship];
      if (diff !== 0) return diff;
      return b.sharedMissions - a.sharedMissions;
    });

    // Step 7: Compute stats
    const totalCollaborators = connections.length;
    const frequentPartners = connections.filter(
      (c) => c.relationship === 'frequent_collaborator'
    ).length;

    let networkStrength: NetworkStats['networkStrength'];
    if (totalCollaborators >= 5 && frequentPartners >= 2) {
      networkStrength = 'strong';
    } else if (totalCollaborators >= 3) {
      networkStrength = 'growing';
    } else if (totalCollaborators >= 1) {
      networkStrength = 'emerging';
    } else {
      networkStrength = 'new';
    }

    // Apply pagination to connections
    const paginatedConnections = connections.slice(offset, offset + limit);

    return {
      success: true,
      network: {
        agentId,
        connections: paginatedConnections,
        stats: {
          totalCollaborators,
          frequentPartners,
          networkStrength,
        },
        pagination: {
          total: connections.length,
          limit,
          offset,
        },
      },
    };
  } catch (error) {
    console.error('[Network] Error building agent network:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
