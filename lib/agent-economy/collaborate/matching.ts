/**
 * Smart Matching - Agent-Mission Matching Algorithm
 * Matches agents to missions based on capabilities, reputation, and availability
 */

import { supabaseAdmin } from '@/lib/supabase/client';


// ==========================================
// Types
// ==========================================

export interface MissionMatch {
  missionId: string;
  title: string;
  description: string;
  category: string;
  budget: string;
  deadline: string | null;
  creatorAddress: string;
  status: string;
  // Matching details
  score: number;
  matchedRequired: string[];
  matchedNiceToHave: string[];
  missingRequired: string[];
  hasExcluded: boolean;
  meetsReputation: boolean;
}

export interface AgentMatch {
  agentId: string;
  agentName: string;
  capabilities: string[];
  reputationScore: number;
  hourlyRate: string;
  jobsCompleted: number;
  // Matching details
  score: number;
  matchedRequired: string[];
  matchedNiceToHave: string[];
  hasExcluded: boolean;
  meetsReputation: boolean;
}

interface MatchingCriteria {
  requiredCapabilities: string[];
  niceToHaveCapabilities: string[];
  excludedCapabilities: string[];
  minReputation: number;
}

// ==========================================
// Scoring Algorithm
// ==========================================

const WEIGHTS = {
  REQUIRED_MATCH: 3,      // Each required capability match
  NICE_TO_HAVE_MATCH: 1,  // Each nice-to-have capability match
  EXCLUDED_PENALTY: -10,  // Penalty for having excluded capability
  REPUTATION_BONUS: 0.5,  // Bonus per reputation point above minimum
  COMPLETION_BONUS: 0.2,  // Bonus per completed job
};

/**
 * Calculate match score for an agent against criteria
 */
function calculateAgentScore(
  agentCapabilities: string[],
  agentReputation: number,
  agentJobsCompleted: number,
  criteria: MatchingCriteria
): {
  score: number;
  matchedRequired: string[];
  matchedNiceToHave: string[];
  missingRequired: string[];
  hasExcluded: boolean;
  meetsReputation: boolean;
} {
  const agentCapsLower = agentCapabilities.map(c => c.toLowerCase());
  const requiredLower = criteria.requiredCapabilities.map(c => c.toLowerCase());
  const niceToHaveLower = criteria.niceToHaveCapabilities.map(c => c.toLowerCase());
  const excludedLower = criteria.excludedCapabilities.map(c => c.toLowerCase());

  const matchedRequired = requiredLower.filter(c => agentCapsLower.includes(c));
  const missingRequired = requiredLower.filter(c => !agentCapsLower.includes(c));
  const matchedNiceToHave = niceToHaveLower.filter(c => agentCapsLower.includes(c));
  const hasExcluded = excludedLower.some(c => agentCapsLower.includes(c));
  const meetsReputation = agentReputation >= criteria.minReputation;

  // Calculate score
  let score = 0;
  score += matchedRequired.length * WEIGHTS.REQUIRED_MATCH;
  score += matchedNiceToHave.length * WEIGHTS.NICE_TO_HAVE_MATCH;
  if (hasExcluded) score += WEIGHTS.EXCLUDED_PENALTY;
  if (meetsReputation && agentReputation > criteria.minReputation) {
    score += (agentReputation - criteria.minReputation) * WEIGHTS.REPUTATION_BONUS;
  }
  score += agentJobsCompleted * WEIGHTS.COMPLETION_BONUS;

  // Normalize to 0-100 range (roughly)
  score = Math.max(0, Math.min(100, score * 10));

  return {
    score: Math.round(score * 100) / 100,
    matchedRequired,
    matchedNiceToHave,
    missingRequired,
    hasExcluded,
    meetsReputation,
  };
}

// ==========================================
// Mission Matching (for Agents)
// ==========================================

/**
 * Find missions that match an agent's capabilities
 */
export async function findMatchingMissions(
  agentId: string,
  options: {
    limit?: number;
    status?: string;
    category?: string;
    minBudget?: string;
  } = {}
): Promise<{ success: boolean; matches: MissionMatch[]; error?: string }> {
  try {
    // Get agent's capabilities and reputation
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('marketplace_agents')
      .select('capabilities, rating, jobs_completed')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return { success: false, matches: [], error: 'Agent not found' };
    }

    const agentCaps = agent.capabilities || [];
    const agentRep = (agent.rating || 0) * 20; // Convert 0-5 to 0-100

    // Query missions
    let query = supabaseAdmin
      .from('collaborate_missions')
      .select('*')
      .eq('status', options.status || 'active')
      .order('created_at', { ascending: false });

    if (options.category) {
      query = query.eq('category', options.category);
    }
    if (options.minBudget) {
      query = query.gte('budget', options.minBudget);
    }

    const { data: missions, error: missionsError } = await query.limit(options.limit || 50);

    if (missionsError) {
      return { success: false, matches: [], error: missionsError.message };
    }

    // Score and filter missions
    const matches: MissionMatch[] = [];

    for (const mission of missions || []) {
      const criteria: MatchingCriteria = {
        requiredCapabilities: mission.required_capabilities || [],
        niceToHaveCapabilities: mission.nice_to_have_capabilities || [],
        excludedCapabilities: mission.excluded_capabilities || [],
        minReputation: mission.min_reputation || 0,
      };

      const scoring = calculateAgentScore(
        agentCaps,
        agentRep,
        agent.jobs_completed || 0,
        criteria
      );

      // Skip if has excluded capability or doesn't meet reputation
      if (scoring.hasExcluded || !scoring.meetsReputation) {
        continue;
      }

      // Skip if missing required capabilities (unless none specified)
      if (criteria.requiredCapabilities.length > 0 && scoring.missingRequired.length > 0) {
        continue;
      }

      matches.push({
        missionId: mission.id,
        title: mission.title,
        description: mission.description,
        category: mission.category,
        budget: mission.budget,
        deadline: mission.deadline,
        creatorAddress: mission.creator_address,
        status: mission.status,
        score: scoring.score,
        matchedRequired: scoring.matchedRequired,
        matchedNiceToHave: scoring.matchedNiceToHave,
        missingRequired: scoring.missingRequired,
        hasExcluded: scoring.hasExcluded,
        meetsReputation: scoring.meetsReputation,
      });
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    return {
      success: true,
      matches: matches.slice(0, options.limit || 10),
    };
  } catch (error) {
    console.error('[Matching] Error finding matching missions:', error);
    return {
      success: false,
      matches: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ==========================================
// Agent Matching (for Missions)
// ==========================================

/**
 * Find agents that match a mission's requirements
 */
export async function findMatchingAgents(
  missionId: string,
  options: {
    limit?: number;
    excludeApplied?: boolean;
  } = {}
): Promise<{ success: boolean; matches: AgentMatch[]; error?: string }> {
  try {
    // Get mission requirements
    const { data: mission, error: missionError } = await supabaseAdmin
      .from('collaborate_missions')
      .select('required_capabilities, nice_to_have_capabilities, excluded_capabilities, min_reputation')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return { success: false, matches: [], error: 'Mission not found' };
    }

    const criteria: MatchingCriteria = {
      requiredCapabilities: mission.required_capabilities || [],
      niceToHaveCapabilities: mission.nice_to_have_capabilities || [],
      excludedCapabilities: mission.excluded_capabilities || [],
      minReputation: mission.min_reputation || 0,
    };

    // Query available agents
    let query = supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name, capabilities, rating, jobs_completed, hourly_rate')
      .eq('is_available', true);

    // If mission has required capabilities, filter to agents with at least one
    if (criteria.requiredCapabilities.length > 0) {
      query = query.overlaps('capabilities', criteria.requiredCapabilities);
    }

    const { data: agents, error: agentsError } = await query.limit(100);

    if (agentsError) {
      return { success: false, matches: [], error: agentsError.message };
    }

    // Get already-applied agents to exclude
    let appliedAgentIds: Set<string> = new Set();
    if (options.excludeApplied) {
      const { data: applications } = await supabaseAdmin
        .from('collaborate_applications')
        .select('agent_id')
        .eq('mission_id', missionId);

      appliedAgentIds = new Set((applications || []).map(a => a.agent_id));
    }

    // Score and filter agents
    const matches: AgentMatch[] = [];

    for (const agent of agents || []) {
      if (options.excludeApplied && appliedAgentIds.has(agent.id)) {
        continue;
      }

      const agentRep = (agent.rating || 0) * 20;
      const scoring = calculateAgentScore(
        agent.capabilities || [],
        agentRep,
        agent.jobs_completed || 0,
        criteria
      );

      // Skip if has excluded capability or doesn't meet reputation
      if (scoring.hasExcluded || !scoring.meetsReputation) {
        continue;
      }

      // Skip if missing required capabilities (unless none specified)
      if (criteria.requiredCapabilities.length > 0 && scoring.missingRequired.length > 0) {
        continue;
      }

      matches.push({
        agentId: agent.id,
        agentName: agent.agent_name,
        capabilities: agent.capabilities || [],
        reputationScore: Math.round(agentRep),
        hourlyRate: agent.hourly_rate,
        jobsCompleted: agent.jobs_completed || 0,
        score: scoring.score,
        matchedRequired: scoring.matchedRequired,
        matchedNiceToHave: scoring.matchedNiceToHave,
        hasExcluded: scoring.hasExcluded,
        meetsReputation: scoring.meetsReputation,
      });
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    return {
      success: true,
      matches: matches.slice(0, options.limit || 10),
    };
  } catch (error) {
    console.error('[Matching] Error finding matching agents:', error);
    return {
      success: false,
      matches: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
