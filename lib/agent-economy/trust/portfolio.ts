/**
 * Portfolio / Work History — aggregates an agent's missions, competitions,
 * contracts, and reviews into a single portfolio view.
 */

import { supabaseAdmin } from '@/lib/supabase/client';


// ==========================================
// Types
// ==========================================

export interface PortfolioMission {
  missionId: string;
  title: string;
  role: 'contributor';
  status: string;
  tasksCompleted: number;
  reward: string;
  completedAt: string | null;
}

export interface PortfolioCompetition {
  competitionId: string;
  title: string;
  rank: number | null;
  score: number | null;
  prizeAmount: string;
  submissionUrl: string | null;
}

export interface PortfolioContract {
  contractId: string;
  taskDescription: string;
  status: string;
  amount: string;
  review: { rating: number; text: string } | null;
}

export interface PortfolioStats {
  totalMissions: number;
  totalCompetitions: number;
  totalContracts: number;
  totalEarned: string;
  topCapabilities: string[];
  activeSince: string;
}

export interface PortfolioData {
  missions: PortfolioMission[];
  competitions: PortfolioCompetition[];
  contracts: PortfolioContract[];
  stats: PortfolioStats;
}

// ==========================================
// Main function
// ==========================================

export async function getAgentPortfolio(
  agentId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ success: boolean; portfolio?: PortfolioData & { pagination?: { totalMissions: number; totalCompetitions: number; totalContracts: number; limit: number; offset: number } }; error?: string }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  try {
    // 1. Verify agent exists
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, capabilities, registered_at, total_earnings')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return { success: false, error: 'Agent not found' };
    }

    // 2. Fetch counts and paginated data in parallel
    const [
      applicationsResult,
      competitionEntriesResult,
      contractsResult,
      missionsCountResult,
      competitionsCountResult,
      contractsCountResult,
    ] = await Promise.all([
      // Missions: find accepted applications for this agent
      supabaseAdmin
        .from('collaborate_applications')
        .select('mission_id, status')
        .eq('agent_id', agentId)
        .eq('status', 'accepted')
        .range(offset, offset + limit - 1),

      // Competitions: entries by this agent
      supabaseAdmin
        .from('competition_entries')
        .select('competition_id, submission_url, submission_data, score, rank, prize_amount')
        .eq('agent_id', agentId)
        .order('registered_at', { ascending: false })
        .range(offset, offset + limit - 1),

      // Contracts: marketplace contracts for this agent with reviews
      supabaseAdmin
        .from('marketplace_contracts')
        .select('id, task_description, agreed_rate, contract_status, started_at')
        .eq('agent_id', agentId)
        .order('started_at', { ascending: false })
        .range(offset, offset + limit - 1),

      // Total counts for pagination
      supabaseAdmin
        .from('collaborate_applications')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId)
        .eq('status', 'accepted'),

      supabaseAdmin
        .from('competition_entries')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId),

      supabaseAdmin
        .from('marketplace_contracts')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId),
    ]);

    // 3. Build missions list
    const missions: PortfolioMission[] = [];
    const acceptedApps = applicationsResult.data || [];

    if (acceptedApps.length > 0) {
      const missionIds = acceptedApps.map((a) => a.mission_id);

      // Fetch mission details and task counts in parallel
      const [missionsResult, tasksResult] = await Promise.all([
        supabaseAdmin
          .from('collaborate_missions')
          .select('id, title, status, completed_at, created_at')
          .in('id', missionIds)
          .order('created_at', { ascending: false }),
        supabaseAdmin
          .from('collaborate_tasks')
          .select('mission_id, status, reward')
          .in('mission_id', missionIds)
          .eq('assigned_agent_id', agentId),
      ]);

      const missionData = missionsResult.data || [];
      const taskData = tasksResult.data || [];

      // Aggregate task info per mission
      const tasksByMission = new Map<string, { completed: number; totalReward: bigint }>();
      for (const task of taskData) {
        const entry = tasksByMission.get(task.mission_id) || { completed: 0, totalReward: 0n };
        if (task.status === 'approved') {
          entry.completed += 1;
          entry.totalReward += safeParseBigInt(task.reward);
        }
        tasksByMission.set(task.mission_id, entry);
      }

      for (const m of missionData) {
        const taskInfo = tasksByMission.get(m.id) || { completed: 0, totalReward: 0n };
        missions.push({
          missionId: m.id,
          title: m.title,
          role: 'contributor',
          status: m.status,
          tasksCompleted: taskInfo.completed,
          reward: taskInfo.totalReward.toString(),
          completedAt: m.completed_at || null,
        });
      }
    }

    // 4. Build competitions list
    const competitions: PortfolioCompetition[] = [];
    const entries = competitionEntriesResult.data || [];

    if (entries.length > 0) {
      const competitionIds = [...new Set(entries.map((e) => e.competition_id))];

      const { data: compData } = await supabaseAdmin
        .from('competitions')
        .select('id, title')
        .in('id', competitionIds);

      const compTitleMap = new Map<string, string>();
      for (const c of compData || []) {
        compTitleMap.set(c.id, c.title);
      }

      for (const entry of entries) {
        competitions.push({
          competitionId: entry.competition_id,
          title: compTitleMap.get(entry.competition_id) || 'Unknown',
          rank: entry.rank ?? null,
          score: entry.score ?? null,
          prizeAmount: (entry.prize_amount || '0').toString(),
          submissionUrl: entry.submission_url || null,
        });
      }
    }

    // 5. Build contracts list (with reviews)
    const contracts: PortfolioContract[] = [];
    const contractRows = contractsResult.data || [];

    if (contractRows.length > 0) {
      const contractIds = contractRows.map((c) => c.id);

      const { data: reviewData } = await supabaseAdmin
        .from('marketplace_reviews')
        .select('contract_id, rating, review_text')
        .in('contract_id', contractIds);

      const reviewMap = new Map<string, { rating: number; text: string }>();
      for (const r of reviewData || []) {
        reviewMap.set(r.contract_id, {
          rating: r.rating,
          text: r.review_text || '',
        });
      }

      for (const c of contractRows) {
        contracts.push({
          contractId: c.id,
          taskDescription: c.task_description || '',
          status: c.contract_status,
          amount: String(c.agreed_rate ?? 0),
          review: reviewMap.get(c.id) || null,
        });
      }
    }

    // 6. Compute stats
    let totalEarned = 0n;

    // Mission rewards
    for (const m of missions) {
      totalEarned += safeParseBigInt(m.reward);
    }

    // Competition prizes
    for (const c of competitions) {
      totalEarned += safeParseBigInt(c.prizeAmount);
    }

    // Contract amounts (only completed)
    for (const c of contracts) {
      if (c.status === 'completed') {
        totalEarned += safeParseBigInt(c.amount);
      }
    }

    const stats: PortfolioStats = {
      totalMissions: missions.length,
      totalCompetitions: competitions.length,
      totalContracts: contracts.length,
      totalEarned: totalEarned.toString(),
      topCapabilities: (agent.capabilities || []).slice(0, 5),
      activeSince: agent.registered_at,
    };

    return {
      success: true,
      portfolio: {
        missions,
        competitions,
        contracts,
        stats,
        pagination: {
          totalMissions: missionsCountResult.count ?? 0,
          totalCompetitions: competitionsCountResult.count ?? 0,
          totalContracts: contractsCountResult.count ?? 0,
          limit,
          offset,
        },
      },
    };
  } catch (error) {
    console.error('[Portfolio] Error fetching portfolio:', error);
    return { success: false, error: 'Failed to fetch portfolio' };
  }
}

// ==========================================
// Helpers
// ==========================================

function safeParseBigInt(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  const str = String(value).trim();
  if (/^-?\d+$/.test(str)) return BigInt(str);
  const parts = str.split('.');
  if (parts.length === 2 && /^-?\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    return BigInt(parts[0]);
  }
  return 0n;
}
