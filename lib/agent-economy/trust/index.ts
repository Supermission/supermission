/**
 * Trust Score Computation — Agent Trust Layer
 *
 * Computes a composite trust score for marketplace agents by aggregating
 * signals across reputation, reliability, activity, competitive record,
 * and on-chain verification.
 */

import { supabaseAdmin } from '@/lib/supabase/client';


// ==========================================
// Types
// ==========================================

export interface TrustProfile {
  agentId: string;
  agentName: string;
  trustScore: number;
  tier: string;
  breakdown: {
    reputation: { score: number; weight: number; reviews: number; avgRating: number };
    reliability: { score: number; weight: number; tasksCompleted: number; taskSuccessRate: number; missionsCompleted: number };
    activity: { score: number; weight: number; uptimePercent: number; lastSeenAt: string | null };
    competitiveRecord: { score: number; weight: number; entered: number; topThree: number; avgScore: number };
    verification: { score: number; weight: number; onChain: boolean; erc8004Id: string | null; walletVerified: boolean };
  };
  highlights: string[];
  redFlags: string[];
  lastUpdated: string;
}

// ==========================================
// Weights
// ==========================================

const WEIGHTS = {
  reputation: 0.30,
  reliability: 0.25,
  activity: 0.15,
  competitive: 0.15,
  verification: 0.15,
} as const;

// ==========================================
// Tier Mapping
// ==========================================

function getTier(score: number): string {
  if (score >= 95) return 'Legendary';
  if (score >= 85) return 'Master';
  if (score >= 70) return 'Expert';
  if (score >= 50) return 'Reliable';
  return 'New';
}

// ==========================================
// Expected heartbeats per 7 days
// Assumes 1 heartbeat per 10 minutes = 6/hour * 24h * 7d = 1008
// ==========================================

const EXPECTED_HEARTBEATS_7D = 1008;

// ==========================================
// Sub-score Computations
// ==========================================

function computeReputationScore(
  reviews: Array<{ rating: number }>,
  agentRating: number
): { score: number; reviews: number; avgRating: number } {
  const reviewCount = reviews.length;
  const avgRating = reviewCount > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
    : agentRating || 0;

  // Normalized to 0-100 (rating is 1-5 scale)
  const normalizedRating = avgRating > 0 ? (avgRating / 5) * 100 : 0;

  // Review count bonus: +1 per review, capped at +10
  const reviewBonus = Math.min(reviewCount, 10);

  const score = Math.min(Math.round(normalizedRating + reviewBonus), 100);
  return { score, reviews: reviewCount, avgRating: Math.round(avgRating * 100) / 100 };
}

function computeReliabilityScore(
  tasks: Array<{ status: string }>,
  missionsCompleted: number
): { score: number; tasksCompleted: number; taskSuccessRate: number; missionsCompleted: number } {
  const approved = tasks.filter(t => t.status === 'approved').length;
  const rejected = tasks.filter(t => t.status === 'rejected').length;
  const total = approved + rejected;

  const taskSuccessRate = total > 0 ? (approved / total) * 100 : 0;

  // Mission completion bonus: +5 per mission, capped at +20
  const missionBonus = Math.min(missionsCompleted * 5, 20);

  const score = total > 0
    ? Math.min(Math.round(taskSuccessRate + missionBonus), 100)
    : missionBonus; // No tasks yet, only mission bonus

  return {
    score,
    tasksCompleted: approved,
    taskSuccessRate: Math.round(taskSuccessRate * 100) / 100,
    missionsCompleted,
  };
}

function computeActivityScore(
  heartbeats: Array<{ created_at: string }>
): { score: number; uptimePercent: number; lastSeenAt: string | null } {
  const lastSeenAt = heartbeats.length > 0
    ? heartbeats[0].created_at
    : null;

  const uptimePercent = heartbeats.length > 0
    ? Math.min((heartbeats.length / EXPECTED_HEARTBEATS_7D) * 100, 100)
    : 0;

  const score = Math.round(uptimePercent);
  return { score, uptimePercent: Math.round(uptimePercent * 100) / 100, lastSeenAt };
}

function computeCompetitiveScore(
  entries: Array<{ score: number | null; rank: number | null }>
): { score: number; entered: number; topThree: number; avgScore: number } {
  const entered = entries.length;
  if (entered === 0) {
    return { score: 0, entered: 0, topThree: 0, avgScore: 0 };
  }

  const topThree = entries.filter(e => e.rank !== null && e.rank <= 3).length;

  const scoredEntries = entries.filter(e => e.score !== null);
  const avgScore = scoredEntries.length > 0
    ? scoredEntries.reduce((sum, e) => sum + (e.score || 0), 0) / scoredEntries.length
    : 0;

  // Participation: 10 pts per entry, capped at 40
  const participationPts = Math.min(entered * 10, 40);

  // Podium: 20 pts per top-3 finish, capped at 40
  const podiumPts = Math.min(topThree * 20, 40);

  // Avg score contribution: normalized to 0-20
  const scorePts = Math.round((avgScore / 100) * 20);

  const score = Math.min(participationPts + podiumPts + scorePts, 100);
  return {
    score,
    entered,
    topThree,
    avgScore: Math.round(avgScore * 100) / 100,
  };
}

function computeVerificationScore(
  erc8004Identity: { erc8004_agent_id: number | null; marketplace_agent_id: string | null } | null,
  walletAddress: string | null
): { score: number; onChain: boolean; erc8004Id: string | null; walletVerified: boolean } {
  const onChain = erc8004Identity !== null && erc8004Identity.erc8004_agent_id !== null;
  const walletVerified = walletAddress !== null && walletAddress.length > 0;

  let score = 0;
  if (onChain) score += 50;
  if (walletVerified) score += 50;

  const erc8004Id = onChain ? erc8004Identity!.erc8004_agent_id!.toString() : null;

  return { score, onChain, erc8004Id, walletVerified };
}

// ==========================================
// Highlights & Red Flags
// ==========================================

function generateHighlights(breakdown: TrustProfile['breakdown']): string[] {
  const highlights: string[] = [];

  if (breakdown.reputation.avgRating >= 4.5 && breakdown.reputation.reviews >= 5) {
    highlights.push('Top-rated agent (4.5+ stars)');
  }
  if (breakdown.reliability.taskSuccessRate >= 90 && breakdown.reliability.tasksCompleted >= 5) {
    highlights.push('Top 10% reliability');
  }
  if (breakdown.competitiveRecord.topThree >= 3) {
    highlights.push(`${breakdown.competitiveRecord.topThree} competition podiums`);
  }
  if (breakdown.activity.uptimePercent >= 95) {
    highlights.push('Near-perfect uptime (95%+)');
  }
  if (breakdown.verification.onChain && breakdown.verification.walletVerified) {
    highlights.push('Fully verified (on-chain + wallet)');
  }
  if (breakdown.reliability.missionsCompleted >= 5) {
    highlights.push(`${breakdown.reliability.missionsCompleted} missions completed`);
  }
  if (breakdown.competitiveRecord.avgScore >= 80) {
    highlights.push('High competition scorer (80+ avg)');
  }

  return highlights;
}

function generateRedFlags(breakdown: TrustProfile['breakdown']): string[] {
  const redFlags: string[] = [];

  if (breakdown.activity.lastSeenAt) {
    const lastSeen = new Date(breakdown.activity.lastSeenAt);
    const daysSinceLastSeen = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastSeen > 7) {
      redFlags.push('No activity in 7+ days');
    }
  } else {
    redFlags.push('No heartbeat activity recorded');
  }

  if (breakdown.reputation.reviews >= 3 && breakdown.reputation.avgRating < 3.0) {
    redFlags.push('Below average ratings');
  }

  if (breakdown.reliability.tasksCompleted + breakdown.reliability.missionsCompleted === 0) {
    redFlags.push('No completed work history');
  }

  if (breakdown.reliability.taskSuccessRate < 50 &&
      (breakdown.reliability.tasksCompleted > 0 || breakdown.reliability.missionsCompleted > 0)) {
    redFlags.push('Low task success rate');
  }

  if (!breakdown.verification.onChain) {
    redFlags.push('No on-chain identity');
  }

  return redFlags;
}

// ==========================================
// Main Function
// ==========================================

export async function computeTrustProfile(
  agentId: string
): Promise<{ success: boolean; profile?: TrustProfile; error?: string }> {
  try {
    // 1. Verify agent exists
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name, rating, wallet_address')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return { success: false, error: 'Agent not found' };
    }

    // 2. Query all data sources in parallel
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      reviewsResult,
      tasksResult,
      heartbeatsResult,
      competitionEntriesResult,
      erc8004Result,
      missionsCompletedResult,
    ] = await Promise.all([
      // Reviews (cap at 100 most recent for score computation)
      supabaseAdmin
        .from('marketplace_reviews')
        .select('rating')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(100),

      // Tasks assigned to this agent (approved + rejected for reliability)
      supabaseAdmin
        .from('collaborate_tasks')
        .select('status')
        .eq('assigned_agent_id', agentId)
        .in('status', ['approved', 'rejected'])
        .limit(100),

      // Heartbeats in last 7 days (cap at expected max)
      supabaseAdmin
        .from('agent_heartbeats')
        .select('created_at')
        .eq('agent_id', agentId)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100),

      // Competition entries
      supabaseAdmin
        .from('competition_entries')
        .select('score, rank')
        .eq('agent_id', agentId)
        .limit(100),

      // ERC-8004 identity
      supabaseAdmin
        .from('erc8004_identities')
        .select('erc8004_agent_id, marketplace_agent_id')
        .eq('marketplace_agent_id', agentId)
        .limit(1),

      // Missions completed (agent was accepted and mission is completed)
      supabaseAdmin
        .from('collaborate_applications')
        .select('mission_id, collaborate_missions!inner(status)')
        .eq('agent_id', agentId)
        .eq('status', 'accepted')
        .limit(100),
    ]);

    // Extract data, defaulting to empty arrays on error
    const reviews = reviewsResult.data || [];
    const tasks = (tasksResult.data || []).filter((t): t is { status: string } => t.status !== null);
    const heartbeats = (heartbeatsResult.data || []).filter((h): h is { created_at: string } => h.created_at !== null);
    const competitionEntries = competitionEntriesResult.data || [];
    const erc8004Identity = erc8004Result.data && erc8004Result.data.length > 0
      ? erc8004Result.data[0]
      : null;

    // Count completed missions from applications joined to missions
    const missionsCompleted = (missionsCompletedResult.data || []).filter(app => {
      const mission = app.collaborate_missions as unknown as { status: string } | null;
      return mission?.status === 'completed';
    }).length;

    // 3. Compute each sub-score
    const reputationResult = computeReputationScore(reviews, agent.rating || 0);
    const reliabilityResult = computeReliabilityScore(tasks, missionsCompleted);
    const activityResult = computeActivityScore(heartbeats);
    const competitiveResult = computeCompetitiveScore(competitionEntries);
    const verificationResult = computeVerificationScore(erc8004Identity, agent.wallet_address);

    // 4. Build breakdown
    const breakdown: TrustProfile['breakdown'] = {
      reputation: { ...reputationResult, weight: WEIGHTS.reputation },
      reliability: { ...reliabilityResult, weight: WEIGHTS.reliability },
      activity: { ...activityResult, weight: WEIGHTS.activity },
      competitiveRecord: { ...competitiveResult, weight: WEIGHTS.competitive },
      verification: { ...verificationResult, weight: WEIGHTS.verification },
    };

    // 5. Compute weighted trust score
    const trustScore = Math.round(
      breakdown.reputation.score * WEIGHTS.reputation +
      breakdown.reliability.score * WEIGHTS.reliability +
      breakdown.activity.score * WEIGHTS.activity +
      breakdown.competitiveRecord.score * WEIGHTS.competitive +
      breakdown.verification.score * WEIGHTS.verification
    );

    // 6. Generate highlights and red flags
    const highlights = generateHighlights(breakdown);
    const redFlags = generateRedFlags(breakdown);

    // 7. Build profile
    const profile: TrustProfile = {
      agentId: agent.id,
      agentName: agent.agent_name,
      trustScore,
      tier: getTier(trustScore),
      breakdown,
      highlights,
      redFlags,
      lastUpdated: new Date().toISOString(),
    };

    return { success: true, profile };
  } catch (error) {
    console.error('[TrustScore] Error computing trust profile:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compute trust profile',
    };
  }
}
