/**
 * Auto-Assignment System
 * Automatically assigns tasks to the best-matched team members
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { triggerWebhook } from '../webhooks';


// ==========================================
// Types
// ==========================================

export type AssignmentStrategy = 'best_match' | 'round_robin' | 'load_balanced';

export interface AutoAssignCriteria {
  strategy: AssignmentStrategy;
  capabilities?: string[];
  minReputation?: number;
  maxActiveTasks?: number;
}

export interface TeamMemberStats {
  agentId: string;
  agentName: string;
  capabilities: string[];
  reputationScore: number;
  activeTasks: number;
  completedTasks: number;
  lastAssignedAt: Date | null;
}

export interface AutoAssignResult {
  success: boolean;
  assignedTo?: string;
  agentName?: string;
  reason?: string;
  error?: string;
}

// ==========================================
// Auto-Assignment Logic
// ==========================================

/**
 * Get stats for all approved team members of a mission
 */
async function getMissionTeamStats(missionId: string): Promise<TeamMemberStats[]> {
  // Get accepted applications with agent details
  const { data: applications, error: appError } = await supabaseAdmin
    .from('collaborate_applications')
    .select(`
      agent_id,
      marketplace_agents(
        agent_name,
        capabilities,
        rating,
        jobs_completed
      )
    `)
    .eq('mission_id', missionId)
    .eq('status', 'accepted');

  if (appError || !applications) {
    return [];
  }

  // Get active task counts for each agent in this mission
  const agentIds = applications.map(a => a.agent_id).filter(Boolean);
  const { data: activeTasks } = await supabaseAdmin
    .from('collaborate_tasks')
    .select('assigned_agent_id')
    .eq('mission_id', missionId)
    .in('status', ['assigned', 'in_progress'])
    .in('assigned_agent_id', agentIds);

  const activeTaskCounts = new Map<string, number>();
  for (const task of activeTasks || []) {
    const count = activeTaskCounts.get(task.assigned_agent_id) || 0;
    activeTaskCounts.set(task.assigned_agent_id, count + 1);
  }

  // Get completed task counts
  const { data: completedTasks } = await supabaseAdmin
    .from('collaborate_tasks')
    .select('assigned_agent_id')
    .eq('mission_id', missionId)
    .eq('status', 'approved')
    .in('assigned_agent_id', agentIds);

  const completedTaskCounts = new Map<string, number>();
  for (const task of completedTasks || []) {
    const count = completedTaskCounts.get(task.assigned_agent_id) || 0;
    completedTaskCounts.set(task.assigned_agent_id, count + 1);
  }

  // Get last assignment times
  const { data: lastAssignments } = await supabaseAdmin
    .from('collaborate_tasks')
    .select('assigned_agent_id, assigned_at')
    .eq('mission_id', missionId)
    .in('assigned_agent_id', agentIds)
    .not('assigned_at', 'is', null)
    .order('assigned_at', { ascending: false });

  const lastAssignedMap = new Map<string, Date>();
  for (const task of lastAssignments || []) {
    if (!lastAssignedMap.has(task.assigned_agent_id)) {
      lastAssignedMap.set(task.assigned_agent_id, new Date(task.assigned_at));
    }
  }

  // Build stats array
  return applications.map(app => {
    // Supabase join can return array or object depending on relationship
    type AgentData = {
      agent_name: string;
      capabilities: string[];
      rating: number;
      jobs_completed: number;
    };

    const agentsData = app.marketplace_agents as unknown;
    let agent: AgentData | null = null;

    if (Array.isArray(agentsData) && agentsData.length > 0) {
      agent = agentsData[0] as AgentData;
    } else if (agentsData && typeof agentsData === 'object' && !Array.isArray(agentsData)) {
      agent = agentsData as AgentData;
    }

    const reputationScore = (agent?.rating || 0) * 20;

    return {
      agentId: app.agent_id,
      agentName: agent?.agent_name || 'Unknown',
      capabilities: agent?.capabilities || [],
      reputationScore,
      activeTasks: activeTaskCounts.get(app.agent_id) || 0,
      completedTasks: completedTaskCounts.get(app.agent_id) || 0,
      lastAssignedAt: lastAssignedMap.get(app.agent_id) || null,
    };
  });
}

/**
 * Score a team member for best_match strategy
 */
function scoreBestMatch(
  member: TeamMemberStats,
  criteria: AutoAssignCriteria
): number {
  let score = 0;

  // Capability matching (highest weight)
  if (criteria.capabilities && criteria.capabilities.length > 0) {
    const memberCapsLower = member.capabilities.map(c => c.toLowerCase());
    const requiredCapsLower = criteria.capabilities.map(c => c.toLowerCase());
    const matches = requiredCapsLower.filter(c => memberCapsLower.includes(c)).length;
    score += matches * 30;
  }

  // Reputation bonus
  score += member.reputationScore * 0.5;

  // Penalize if at max active tasks
  if (criteria.maxActiveTasks && member.activeTasks >= criteria.maxActiveTasks) {
    return -1; // Disqualify
  }

  // Slight penalty for active tasks (prefer less busy agents)
  score -= member.activeTasks * 5;

  // Bonus for completed tasks (proven track record)
  score += member.completedTasks * 2;

  return score;
}

/**
 * Select agent using round_robin strategy
 */
function selectRoundRobin(members: TeamMemberStats[]): TeamMemberStats | null {
  if (members.length === 0) return null;

  // Sort by last assigned time (null = never assigned, comes first)
  const sorted = [...members].sort((a, b) => {
    if (!a.lastAssignedAt && !b.lastAssignedAt) return 0;
    if (!a.lastAssignedAt) return -1;
    if (!b.lastAssignedAt) return 1;
    return a.lastAssignedAt.getTime() - b.lastAssignedAt.getTime();
  });

  return sorted[0];
}

/**
 * Select agent using load_balanced strategy
 */
function selectLoadBalanced(members: TeamMemberStats[]): TeamMemberStats | null {
  if (members.length === 0) return null;

  // Sort by active tasks (ascending), then by completed tasks (descending)
  const sorted = [...members].sort((a, b) => {
    if (a.activeTasks !== b.activeTasks) {
      return a.activeTasks - b.activeTasks;
    }
    return b.completedTasks - a.completedTasks;
  });

  return sorted[0];
}

/**
 * Auto-assign a task to the best team member
 */
export async function autoAssignTask(
  taskId: string,
  missionId: string,
  criteria: AutoAssignCriteria
): Promise<AutoAssignResult> {
  try {
    // Get team stats
    const teamStats = await getMissionTeamStats(missionId);

    if (teamStats.length === 0) {
      return {
        success: false,
        reason: 'No approved team members to assign to',
      };
    }

    // Filter by criteria
    let candidates = teamStats;

    // Filter by min reputation
    if (criteria.minReputation !== undefined) {
      candidates = candidates.filter(m => m.reputationScore >= criteria.minReputation!);
    }

    // Filter by max active tasks
    if (criteria.maxActiveTasks !== undefined) {
      candidates = candidates.filter(m => m.activeTasks < criteria.maxActiveTasks!);
    }

    if (candidates.length === 0) {
      return {
        success: false,
        reason: 'No team members meet the criteria',
      };
    }

    // Select based on strategy
    let selected: TeamMemberStats | null = null;

    switch (criteria.strategy) {
      case 'best_match':
        // Score all candidates and pick highest
        const scored = candidates.map(m => ({
          member: m,
          score: scoreBestMatch(m, criteria),
        })).filter(s => s.score >= 0);

        if (scored.length > 0) {
          scored.sort((a, b) => b.score - a.score);
          selected = scored[0].member;
        }
        break;

      case 'round_robin':
        selected = selectRoundRobin(candidates);
        break;

      case 'load_balanced':
        selected = selectLoadBalanced(candidates);
        break;

      default:
        return {
          success: false,
          error: `Unknown strategy: ${criteria.strategy}`,
        };
    }

    if (!selected) {
      return {
        success: false,
        reason: 'Could not select a team member with the given strategy',
      };
    }

    // Perform the assignment — select updated rows to guard against races
    const { data: assignedRows, error: updateError } = await supabaseAdmin
      .from('collaborate_tasks')
      .update({
        assigned_agent_id: selected.agentId,
        assigned_at: new Date().toISOString(),
        status: 'assigned',
      })
      .eq('id', taskId)
      .eq('status', 'pending') // Only assign pending tasks
      .select('id');

    if (updateError) {
      console.error('[AutoAssign] Update error:', updateError);
      return {
        success: false,
        error: 'Failed to assign task',
      };
    }

    // 0 rows updated means the task was already assigned (race condition or retry)
    if (!assignedRows || assignedRows.length === 0) {
      return {
        success: false,
        reason: 'Task is no longer available for assignment',
      };
    }

    // Get task details for webhook
    const { data: taskDetails } = await supabaseAdmin
      .from('collaborate_tasks')
      .select('title, reward')
      .eq('id', taskId)
      .single();

    // Trigger webhook (non-blocking)
    triggerWebhook(selected.agentId, 'task.assigned', {
      taskId,
      missionId,
      title: taskDetails?.title || 'Unknown',
      reward: taskDetails?.reward || '0',
      autoAssigned: true,
      strategy: criteria.strategy,
    }).catch(err => console.error('[Webhook] auto-assigned task.assigned trigger failed:', err));

    return {
      success: true,
      assignedTo: selected.agentId,
      agentName: selected.agentName,
      reason: `Auto-assigned using ${criteria.strategy} strategy`,
    };
  } catch (error) {
    console.error('[AutoAssign] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

