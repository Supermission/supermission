/**
 * Agent Competitions - Challenges with rewards
 */

import { Address } from 'viem';
import { createClient } from '@supabase/supabase-js';

// Use raw client to bypass strict typing for new tables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
import { v4 as uuidv4 } from 'uuid';
import { submitOnChainFeedback } from '../erc8004/reputation';

// ==========================================
// Types (re-exported from canonical source)
// ==========================================

export type {
  CompetitionStatus,
  Competition,
  Prize,
  JudgingCriteria,
  CompetitionEntry,
  CreateCompetitionRequest,
} from '../types';
import type {
  CompetitionStatus,
  Competition,
  Prize,
  JudgingCriteria,
  CompetitionEntry,
  CreateCompetitionRequest,
} from '../types';

// ==========================================
// Competition Management
// ==========================================

/**
 * Create a new competition
 */
export async function createCompetition(
  request: CreateCompetitionRequest
): Promise<{ success: boolean; competitionId?: string; error?: string }> {
  try {
    const competitionId = uuidv4();

    // Validate prize pool matches prizes
    const totalPrizes = request.prizes.reduce(
      (sum, p) => sum + BigInt(p.amount),
      BigInt(0)
    );
    if (totalPrizes > BigInt(request.prizePool)) {
      return { success: false, error: 'Prize amounts exceed prize pool' };
    }

    const { error } = await supabaseAdmin.from('competitions').insert({
      id: competitionId,
      title: request.title,
      description: request.description,
      category: request.category || 'other',
      creator_address: request.sponsorAddress, // DB uses creator_address
      prize_pool: request.prizePool,
      prize_distribution: request.prizes.reduce((acc, p) => {
        acc[p.rank] = (BigInt(p.amount) * BigInt(100) / BigInt(request.prizePool)).toString();
        return acc;
      }, {} as Record<number, string>),
      judging_criteria: request.judgingCriteria,
      entry_fee: request.entryFee || '0',
      max_entries: request.maxEntries || 100,
      current_entries: 0,
      starts_at: request.startsAt.toISOString(),
      ends_at: request.endsAt.toISOString(),
      judging_ends_at: request.judgingEndsAt.toISOString(),
      status: 'upcoming',
      metadata: {
        rules: request.rules,
        prizes: request.prizes,
      },
    });

    if (error) {
      console.error('Failed to create competition:', error);
      return { success: false, error: 'Failed to create competition' };
    }

    return { success: true, competitionId };
  } catch (error) {
    console.error('Error creating competition:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get competition by ID
 */
export async function getCompetition(
  competitionId: string
): Promise<Competition | null> {
  const { data, error } = await supabaseAdmin
    .from('competitions')
    .select('*')
    .eq('id', competitionId)
    .single();

  if (error || !data) {
    return null;
  }

  // Extract prizes from metadata or prize_distribution
  const metadata = data.metadata || {};
  const prizeDistribution = data.prize_distribution || {};
  const prizePool = BigInt(data.prize_pool || '0');

  // Build prizes array from prize_distribution percentages or metadata
  let prizes: Prize[] = [];
  if (metadata.prizes && Array.isArray(metadata.prizes)) {
    prizes = metadata.prizes.map((p: Record<string, unknown>) => ({
      rank: p.rank as number,
      amount: BigInt(p.amount as string || '0'),
      description: p.description as string | undefined,
    }));
  } else {
    // Calculate from prize_distribution percentages
    prizes = Object.entries(prizeDistribution).map(([rank, pct]) => ({
      rank: parseInt(rank),
      amount: prizePool * BigInt(pct as number) / BigInt(100),
      description: undefined,
    })).sort((a, b) => a.rank - b.rank);
  }

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    category: data.category,
    sponsorAddress: data.creator_address as Address, // DB uses creator_address
    prizePool,
    prizes,
    rules: metadata.rules || '',
    judgingCriteria: (data.judging_criteria || []) as JudgingCriteria[],
    status: data.status as CompetitionStatus,
    entryFee: BigInt(data.entry_fee || '0'),
    maxEntries: data.max_entries || 100,
    currentEntries: data.current_entries || 0,
    startsAt: new Date(data.starts_at),
    endsAt: new Date(data.ends_at),
    judgingEndsAt: new Date(data.judging_ends_at || data.ends_at),
    createdAt: new Date(data.created_at),
  };
}

/**
 * List competitions
 */
export async function listCompetitions(options: {
  category?: string;
  status?: CompetitionStatus;
  limit?: number;
  offset?: number;
}): Promise<{ competitions: Competition[]; total: number }> {
  let query = supabaseAdmin
    .from('competitions')
    .select('*', { count: 'exact' });

  if (options.category) {
    query = query.eq('category', options.category);
  }
  if (options.status) {
    query = query.eq('status', options.status);
  }

  const limit = options.limit || 20;
  const offset = options.offset || 0;
  query = query.range(offset, offset + limit - 1);
  query = query.order('starts_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    return { competitions: [], total: 0 };
  }

  const competitions = (data || []).map((c) => {
    const metadata = c.metadata || {};
    const prizeDistribution = c.prize_distribution || {};
    const prizePool = BigInt(c.prize_pool || '0');

    let prizes: Prize[] = [];
    if (metadata.prizes && Array.isArray(metadata.prizes)) {
      prizes = metadata.prizes.map((p: Record<string, unknown>) => ({
        rank: p.rank as number,
        amount: BigInt(p.amount as string || '0'),
        description: p.description as string | undefined,
      }));
    } else {
      prizes = Object.entries(prizeDistribution).map(([rank, pct]) => ({
        rank: parseInt(rank),
        amount: prizePool * BigInt(pct as number) / BigInt(100),
        description: undefined,
      })).sort((a, b) => a.rank - b.rank);
    }

    return {
      id: c.id,
      title: c.title,
      description: c.description,
      category: c.category,
      sponsorAddress: c.creator_address as Address,
      prizePool,
      prizes,
      rules: metadata.rules || '',
      judgingCriteria: (c.judging_criteria || []) as JudgingCriteria[],
      status: c.status as CompetitionStatus,
      entryFee: BigInt(c.entry_fee || '0'),
      maxEntries: c.max_entries || 100,
      currentEntries: c.current_entries || 0,
      startsAt: new Date(c.starts_at),
      endsAt: new Date(c.ends_at),
      judgingEndsAt: new Date(c.judging_ends_at || c.ends_at),
      createdAt: new Date(c.created_at),
    };
  });

  return { competitions, total: count || 0 };
}

// ==========================================
// Entries
// ==========================================

/**
 * Enter a competition
 */
export async function enterCompetition(
  competitionId: string,
  agentId: string
): Promise<{ success: boolean; entryId?: string; error?: string }> {
  try {
    // Get competition
    const competition = await getCompetition(competitionId);
    if (!competition) {
      return { success: false, error: 'Competition not found' };
    }

    // Check status - allow 'upcoming' or 'active'
    if (!['upcoming', 'active'].includes(competition.status)) {
      return { success: false, error: `Competition is ${competition.status}, not accepting entries` };
    }

    // Auto-transition to active if past start time
    const now = new Date();
    if (competition.status === 'upcoming' && now >= competition.startsAt) {
      await supabaseAdmin
        .from('competitions')
        .update({ status: 'active' })
        .eq('id', competitionId);
    }

    // Check if ended
    if (now > competition.endsAt) {
      return { success: false, error: 'Competition has ended' };
    }

    // Check capacity
    if (competition.currentEntries >= competition.maxEntries) {
      return { success: false, error: 'Competition is full' };
    }

    // Check if already entered
    const { data: existing } = await supabaseAdmin
      .from('competition_entries')
      .select('id')
      .eq('competition_id', competitionId)
      .eq('agent_id', agentId)
      .single();

    if (existing) {
      return { success: false, error: 'Already entered this competition' };
    }

    // Create entry
    const entryId = uuidv4();
    const { error } = await supabaseAdmin.from('competition_entries').insert({
      id: entryId,
      competition_id: competitionId,
      agent_id: agentId,
      submission_data: {},
      status: 'registered',
      score: null,
      rank: null,
    });

    if (error) {
      console.error('Failed to create entry:', error);
      return { success: false, error: 'Failed to enter competition' };
    }

    // Increment entry count directly (RPC may not exist)
    await supabaseAdmin
      .from('competitions')
      .update({ current_entries: competition.currentEntries + 1 })
      .eq('id', competitionId);

    return { success: true, entryId };
  } catch (error) {
    console.error('Error entering competition:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Submit entry for a competition
 */
export async function submitEntry(
  entryId: string,
  agentId: string,
  submission: {
    url?: string;
    data?: Record<string, unknown>;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify entry ownership
    const { data: entry, error: entryError } = await supabaseAdmin
      .from('competition_entries')
      .select('competition_id, agent_id')
      .eq('id', entryId)
      .single();

    if (entryError || !entry) {
      return { success: false, error: 'Entry not found' };
    }

    if (entry.agent_id !== agentId) {
      return { success: false, error: 'Not your entry' };
    }

    // Check competition is still accepting submissions
    const competition = await getCompetition(entry.competition_id);
    if (!competition) {
      return { success: false, error: 'Competition not found' };
    }

    // Allow submissions for 'upcoming' or 'active' competitions that haven't ended
    const now = new Date();
    if (!['upcoming', 'active'].includes(competition.status)) {
      return { success: false, error: 'Competition is not accepting submissions' };
    }
    if (now > competition.endsAt) {
      return { success: false, error: 'Competition submission deadline has passed' };
    }

    // Update entry
    const { error } = await supabaseAdmin
      .from('competition_entries')
      .update({
        submission_url: submission.url || null,
        submission_data: submission.data || {},
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', entryId);

    if (error) {
      return { success: false, error: 'Failed to submit entry' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error submitting entry:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get competition entries
 */
export async function getCompetitionEntries(
  competitionId: string
): Promise<CompetitionEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('competition_entries')
    .select(`
      *,
      marketplace_agents(agent_name)
    `)
    .eq('competition_id', competitionId)
    .order('score', { ascending: false, nullsFirst: true });

  if (error || !data) {
    console.error('Error fetching competition entries:', error);
    return [];
  }

  return data.map((e) => {
    // Handle Supabase join result
    const agent = e.marketplace_agents;
    let agentName = 'Unknown';
    if (Array.isArray(agent) && agent.length > 0) {
      agentName = (agent[0] as { agent_name: string }).agent_name || 'Unknown';
    } else if (agent && typeof agent === 'object' && 'agent_name' in agent) {
      agentName = (agent as { agent_name: string }).agent_name || 'Unknown';
    }

    return {
      id: e.id,
      competitionId: e.competition_id,
      agentId: e.agent_id,
      agentName,
      submissionUrl: e.submission_url,
      submissionData: (e.submission_data || {}) as Record<string, unknown>,
      score: e.score,
      rank: e.rank,
      submittedAt: new Date(e.submitted_at || e.registered_at),
    };
  });
}

// ==========================================
// Judging
// ==========================================

/**
 * Transition a competition from active to judging phase.
 * Only the sponsor can do this, and only after the competition end time.
 */
export async function startJudging(
  competitionId: string,
  sponsorAddress: Address
): Promise<{ success: boolean; error?: string }> {
  try {
    const competition = await getCompetition(competitionId);
    if (!competition) {
      return { success: false, error: 'Competition not found' };
    }

    if (competition.status !== 'active') {
      return { success: false, error: `Competition is "${competition.status}", must be "active" to start judging` };
    }

    const now = new Date();
    if (now < competition.endsAt) {
      return { success: false, error: 'Competition has not ended yet' };
    }

    if (competition.sponsorAddress.toLowerCase() !== sponsorAddress.toLowerCase()) {
      return { success: false, error: 'Only the competition sponsor can start judging' };
    }

    const { error } = await supabaseAdmin
      .from('competitions')
      .update({ status: 'judging' })
      .eq('id', competitionId);

    if (error) {
      return { success: false, error: 'Failed to transition to judging phase' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error starting judging:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Score an entry
 */
export async function scoreEntry(
  entryId: string,
  judgeAddress: Address,
  score: number,
  comments?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get entry and competition
    const { data: entry } = await supabaseAdmin
      .from('competition_entries')
      .select('competition_id')
      .eq('id', entryId)
      .single();

    if (!entry) {
      return { success: false, error: 'Entry not found' };
    }

    const competition = await getCompetition(entry.competition_id);
    if (!competition || competition.status !== 'judging') {
      return { success: false, error: 'Competition is not in judging phase' };
    }

    // Record judge score
    await supabaseAdmin.from('competition_judges').upsert({
      entry_id: entryId,
      judge_address: judgeAddress,
      score,
      comments: comments || '',
    });

    // Update entry average score
    const { data: scores } = await supabaseAdmin
      .from('competition_judges')
      .select('score')
      .eq('entry_id', entryId);

    if (scores && scores.length > 0) {
      const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
      await supabaseAdmin
        .from('competition_entries')
        .update({ score: avgScore })
        .eq('id', entryId);
    }

    return { success: true };
  } catch (error) {
    console.error('Error scoring entry:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Finalize competition and assign ranks
 */
export async function finalizeCompetition(
  competitionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const competition = await getCompetition(competitionId);
    if (!competition) {
      return { success: false, error: 'Competition not found' };
    }

    if (competition.status !== 'judging') {
      return { success: false, error: 'Competition is not in judging phase' };
    }

    // Get all entries sorted by score
    const { data: entries } = await supabaseAdmin
      .from('competition_entries')
      .select('id, score')
      .eq('competition_id', competitionId)
      .not('score', 'is', null)
      .order('score', { ascending: false });

    if (!entries || entries.length === 0) {
      return { success: false, error: 'No scored entries' };
    }

    // Assign ranks
    for (let i = 0; i < entries.length; i++) {
      await supabaseAdmin
        .from('competition_entries')
        .update({ rank: i + 1 })
        .eq('id', entries[i].id);
    }

    // Async on-chain feedback for top 3 (non-blocking)
    const top3 = entries.slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      try {
        const { data: entryData } = await supabaseAdmin
          .from('competition_entries')
          .select('agent_id')
          .eq('id', top3[i].id)
          .single();

        if (entryData?.agent_id) {
          const { data: agentData } = await supabaseAdmin
            .from('marketplace_agents')
            .select('metadata')
            .eq('id', entryData.agent_id)
            .single();

          const agentMetadata = (agentData?.metadata || {}) as Record<string, unknown>;
          const erc8004Id = agentMetadata.erc8004_agent_id;
          if (erc8004Id) {
            const rank = i + 1;
            submitOnChainFeedback({
              agentId: BigInt(erc8004Id as string),
              value: rank === 1 ? 100 : rank === 2 ? 90 : 80,
              tag1: 'competition-win',
              tag2: competition.category || 'other',
            }).catch(err => console.error('[ERC-8004] Competition feedback failed:', err));
          }
        }
      } catch (feedbackErr) {
        console.error('[ERC-8004] Competition feedback lookup failed:', feedbackErr);
      }
    }

    // Update competition status
    await supabaseAdmin
      .from('competitions')
      .update({ status: 'completed' })
      .eq('id', competitionId);

    return { success: true };
  } catch (error) {
    console.error('Error finalizing competition:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get leaderboard for a competition
 */
export async function getLeaderboard(
  competitionId: string
): Promise<
  Array<{
    rank: number;
    agentId: string;
    agentName: string;
    score: number;
    prizeAmount: bigint;
  }>
> {
  const competition = await getCompetition(competitionId);
  if (!competition) return [];

  const entries = await getCompetitionEntries(competitionId);
  const rankedEntries = entries.filter((e) => e.rank !== null);

  return rankedEntries.map((e) => {
    const prize = competition.prizes.find((p) => p.rank === e.rank);
    return {
      rank: e.rank!,
      agentId: e.agentId,
      agentName: e.agentName,
      score: e.score || 0,
      prizeAmount: prize?.amount || BigInt(0),
    };
  });
}
