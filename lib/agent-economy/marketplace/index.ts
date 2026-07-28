/**
 * Agent Marketplace - Core Functions
 */

import { Address } from 'viem';
import { supabaseAdmin } from '@/lib/supabase/client';

// Use raw client to bypass strict typing for new tables

/**
 * Compute reputation score from reviews and completed tasks.
 * Returns 0-100 score.
 */
import { sanitizeInput } from '../utils/sanitize';

function computeReputation(rating: number, totalReviews: number, jobsCompleted: number): number {
  const taskComponent = Math.min(jobsCompleted * 10, 50);

  if (totalReviews > 0) {
    const reviewScore = rating * 20; // 0-5 → 0-100
    return Math.min(Math.round(reviewScore * 0.7 + taskComponent * 0.3 + 10), 100);
  }

  // No reviews — use task completion as floor
  return taskComponent;
}

import { getErc8004AgentId, submitFeedbackAndSync } from '../erc8004/reputation';

// ==========================================
// Types (re-exported from canonical source)
// ==========================================

export type { MarketplaceAgent, RegisterAgentRequest } from '../types';
import type { MarketplaceAgent, RegisterAgentRequest } from '../types';


// ==========================================
// Registration
// ==========================================

/**
 * Register an agent in the marketplace
 */
export async function registerMarketplaceAgent(
  request: RegisterAgentRequest
): Promise<{ success: boolean; agentId?: string; error?: string }> {
  try {
    // Validate
    if (!request.name || typeof request.name !== 'string' || request.name.trim().length < 2) {
      return { success: false, error: 'Name must be at least 2 characters' };
    }
    if (request.name.length > 50) {
      return { success: false, error: 'Name must be 50 characters or less' };
    }
    if (!request.description || typeof request.description !== 'string' || request.description.trim().length < 10) {
      return { success: false, error: 'Description must be at least 10 characters' };
    }
    if (request.description.length > 1000) {
      return { success: false, error: 'Description must be 1000 characters or less' };
    }
    if (!request.capabilities || request.capabilities.length === 0) {
      return { success: false, error: 'At least one capability required' };
    }

    // Sanitize text inputs
    request.name = sanitizeInput(request.name).trim();
    request.description = sanitizeInput(request.description).trim();

    // Rate limit: 1 registration per wallet per 24 hours
    // Normalize to lowercase — EVM addresses are case-insensitive
    const { data: recent } = await supabaseAdmin
      .from('marketplace_agents')
      .select('registered_at')
      .eq('wallet_address', request.walletAddress.toLowerCase())
      .gte('registered_at', new Date(Date.now() - 86400000).toISOString());

    if (recent && recent.length > 0) {
      return { success: false, error: 'Rate limited: 1 registration per wallet per 24 hours' };
    }

    // Check for duplicate name
    const { data: existing } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id')
      .eq('agent_name', request.name)
      .single();

    if (existing) {
      return { success: false, error: 'Agent name already exists' };
    }

    // Check for duplicate wallet address (beyond 24h rate limit)
    const { data: existingWallet } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id')
      .eq('wallet_address', request.walletAddress.toLowerCase())
      .single();

    if (existingWallet) {
      return { success: false, error: 'Wallet address already registered to another agent' };
    }

    // Insert - use dedicated columns (migrated from metadata JSONB)
    const { data, error } = await supabaseAdmin
      .from('marketplace_agents')
      .insert({
        agent_name: request.name,
        description: request.description,
        wallet_address: request.walletAddress.toLowerCase(),
        capabilities: request.capabilities,
        hourly_rate: request.pricePerTask,
        is_available: true,
        total_reviews: 0,
        total_earnings: '0',
        jobs_completed: 0,
        rating: 0,
        agent_type: request.agentType || 'ai',
        avatar_url: request.avatarUrl || null,
        endpoint_url: request.endpointUrl || null,
        erc8004_agent_id: request.erc8004AgentId || null,
        metadata: {},
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('Failed to register agent:', error);
      return { success: false, error: 'Failed to register agent' };
    }

    // ERC-8004 on-chain registration is handled in the unified onboard flow
    // (lib/agent-economy/onboard.ts) to ensure the response includes erc8004AgentId and registrationTxHash.

    return { success: true, agentId: data.id };
  } catch (error) {
    console.error('Error registering agent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ==========================================
// Discovery
// ==========================================

// In-memory cache for marketplace listing (60s TTL, stale-while-revalidate)
const listingCache = new Map<string, { data: { agents: MarketplaceAgent[]; total: number }; fetchedAt: number }>();
const LISTING_CACHE_TTL_MS = 60_000; // 60 seconds

function getListingCacheKey(options: Record<string, unknown>): string {
  return JSON.stringify(options);
}

/**
 * List marketplace agents with filters
 */
export async function listMarketplaceAgents(options: {
  capability?: string;
  status?: string;
  agentType?: string;
  minReputation?: number;
  maxPrice?: string;
  sortBy?: 'reputation' | 'price' | 'tasks' | 'recent';
  limit?: number;
  offset?: number;
}): Promise<{ agents: MarketplaceAgent[]; total: number }> {
  // Check cache first
  const cacheKey = getListingCacheKey(options);
  const cached = listingCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < LISTING_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase TS parser can't handle !fk!left hints
    let query: any = supabaseAdmin
      .from('marketplace_agents')
      .select('*, erc8004_identities!marketplace_agents_erc8004_identity_id_fkey!left(erc8004_agent_id, on_chain_reputation_score, on_chain_review_count)', { count: 'exact' });

    // Apply filters - use actual DB column names
    if (options.capability) {
      query = query.contains('capabilities', [options.capability]);
    }
    if (options.status) {
      query = query.eq('is_available', options.status === 'active');
    } else {
      query = query.eq('is_available', true);
    }
    if (options.minReputation !== undefined) {
      query = query.gte('rating', options.minReputation / 20); // Convert 0-100 to 0-5
    }
    if (options.maxPrice) {
      query = query.lte('hourly_rate', options.maxPrice);
    }
    if (options.agentType) {
      query = query.eq('agent_type', options.agentType);
    }

    // Exclude platform agents from public listing
    query = query.eq('is_platform_agent', false);

    // Apply sorting - use actual DB column names
    switch (options.sortBy) {
      case 'reputation':
        query = query.order('rating', { ascending: false });
        break;
      case 'price':
        query = query.order('hourly_rate', { ascending: true });
        break;
      case 'tasks':
        query = query.order('jobs_completed', { ascending: false });
        break;
      case 'recent':
      default:
        query = query.order('registered_at', { ascending: false });
    }

    // Apply pagination (cap at 100)
    const limit = Math.min(options.limit || 20, 100);
    const offset = options.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count }: { data: any[] | null; error: any; count: number | null } = await query;

    if (error) {
      console.error('Error listing agents:', error);
      return { agents: [], total: 0 };
    }

    // Batch fetch wallet addresses from server_wallets
    const agentNames = (data || []).map(r => r.agent_name);
    const cdpWalletMap = new Map<string, Address>();

    const { data: walletData } = await supabaseAdmin
      .from('server_wallets')
      .select('agent_name, account_address')
      .in('agent_name', agentNames);

    if (walletData) {
      for (const w of walletData) {
        cdpWalletMap.set(w.agent_name, w.account_address as Address);
      }
    }

    const agents: MarketplaceAgent[] = (data || []).map((record) => {
      const erc8004 = record.erc8004_identities as {
        erc8004_agent_id: number;
        on_chain_reputation_score: number;
        on_chain_review_count: number;
      } | null;

      // Use on-chain score when available, fall back to local computation
      const onChainScore = erc8004?.on_chain_reputation_score || 0;
      const onChainReviews = erc8004?.on_chain_review_count || 0;

      return {
        id: record.id,
        erc8004AgentId: erc8004?.erc8004_agent_id?.toString() || record.erc8004_agent_id || null,
        verifiedOnChain: record.verified_on_chain || false,
        name: record.agent_name,
        description: record.description,
        walletAddress: record.wallet_address as Address,
        cdpWalletAddress: cdpWalletMap.get(record.agent_name) || null,
        capabilities: record.capabilities || [],
        agentType: (record.agent_type || 'ai') as 'ai' | 'human' | 'hybrid',
        status: record.is_available ? 'active' : 'inactive' as 'active' | 'inactive' | 'suspended',
        pricePerTask: BigInt(Math.floor(Number(record.hourly_rate || 0))),
        reputationScore: onChainScore > 0
          ? Math.round(Number(onChainScore))
          : computeReputation(record.rating || 0, record.total_reviews || 0, record.jobs_completed || 0),
        totalReviews: onChainReviews > 0 ? onChainReviews : (record.total_reviews || 0),
        totalTasksCompleted: record.jobs_completed || 0,
        totalEarnings: BigInt(record.total_earnings ?? 0),
        avatarUrl: record.avatar_url || null,
        endpointUrl: record.endpoint_url || null,
        createdAt: new Date(record.registered_at),
      };
    });

    // Sort by price in application code
    if (options.sortBy === 'price') {
      agents.sort((a, b) => Number(a.pricePerTask) - Number(b.pricePerTask));
    }

    const result = { agents, total: count || 0 };
    listingCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    return result;
  } catch (error) {
    console.error('Error listing agents:', error);
    return { agents: [], total: 0 };
  }
}

/**
 * Get agent by ID
 */
export async function getMarketplaceAgent(
  agentId: string
): Promise<MarketplaceAgent | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase TS parser can't handle !fk!left hints
  const { data, error } = await (supabaseAdmin as any)
    .from('marketplace_agents')
    .select('*, erc8004_identities!marketplace_agents_erc8004_identity_id_fkey!left(erc8004_agent_id, on_chain_reputation_score, on_chain_review_count)')
    .eq('id', agentId)
    .eq('is_platform_agent', false)
    .single();

  if (error || !data) {
    return null;
  }

  // Look up CDP wallet address
  let cdpWalletAddress: Address | null = null;
  const { data: walletRecord } = await supabaseAdmin
    .from('server_wallets')
    .select('account_address')
    .eq('agent_name', data.agent_name)
    .single();

  if (walletRecord) {
    cdpWalletAddress = walletRecord.account_address as Address;
  }

  const erc8004 = data.erc8004_identities as {
    erc8004_agent_id: number;
    on_chain_reputation_score: number;
    on_chain_review_count: number;
  } | null;

  // Use on-chain score when available, fall back to local computation
  const onChainScore = erc8004?.on_chain_reputation_score || 0;
  const onChainReviews = erc8004?.on_chain_review_count || 0;

  return {
    id: data.id,
    erc8004AgentId: erc8004?.erc8004_agent_id?.toString() || data.erc8004_agent_id || null,
    verifiedOnChain: data.verified_on_chain || false,
    name: data.agent_name,
    description: data.description,
    walletAddress: data.wallet_address as Address,
    cdpWalletAddress, // CDP wallet for x402 payments
    capabilities: data.capabilities || [],
    agentType: (data.agent_type || 'ai') as 'ai' | 'human' | 'hybrid',
    status: data.is_available ? 'active' : 'inactive' as 'active' | 'inactive' | 'suspended',
    pricePerTask: BigInt(Math.floor(Number(data.hourly_rate || 0))),
    reputationScore: onChainScore > 0
      ? Math.round(Number(onChainScore))
      : computeReputation(data.rating || 0, data.total_reviews || 0, data.jobs_completed || 0),
    totalReviews: onChainReviews > 0 ? onChainReviews : (data.total_reviews || 0),
    totalTasksCompleted: data.jobs_completed || 0,
    totalEarnings: BigInt(Math.floor(Number(data.total_earnings || 0))),
    avatarUrl: data.avatar_url || null,
    endpointUrl: data.endpoint_url || null,
    createdAt: new Date(data.registered_at),
  };
}

/**
 * Get agent by name (case-insensitive) — for /u/AgentName profile pages
 */
export async function getMarketplaceAgentByName(
  agentName: string
): Promise<(MarketplaceAgent & { claim?: { status: string; claimedBy: string | null } }) | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase TS parser can't handle !fk!left hints
  const { data, error } = await (supabaseAdmin as any)
    .from('marketplace_agents')
    .select('*, erc8004_identities!marketplace_agents_erc8004_identity_id_fkey!left(erc8004_agent_id, on_chain_reputation_score, on_chain_review_count)')
    .ilike('agent_name', agentName)
    .single();

  if (error || !data) {
    return null;
  }

  // Look up CDP wallet address
  let cdpWalletAddress: Address | null = null;
  const { data: walletByName } = await supabaseAdmin
    .from('server_wallets')
    .select('account_address')
    .eq('agent_name', data.agent_name)
    .single();

  if (walletByName) {
    cdpWalletAddress = walletByName.account_address as Address;
  }

  // Look up claim status
  let claim: { status: string; claimedBy: string | null } | undefined;
  const { data: claimData } = await supabaseAdmin
    .from('agent_claims')
    .select('status, claimed_by')
    .eq('marketplace_agent_id', data.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (claimData) {
    claim = { status: claimData.status, claimedBy: claimData.claimed_by };
  }

  const erc8004 = data.erc8004_identities as {
    erc8004_agent_id: number;
    on_chain_reputation_score: number;
    on_chain_review_count: number;
  } | null;

  const onChainScore = erc8004?.on_chain_reputation_score || 0;
  const onChainReviews = erc8004?.on_chain_review_count || 0;

  return {
    id: data.id,
    erc8004AgentId: erc8004?.erc8004_agent_id?.toString() || data.erc8004_agent_id || null,
    verifiedOnChain: data.verified_on_chain || false,
    name: data.agent_name,
    description: data.description,
    walletAddress: data.wallet_address as Address,
    cdpWalletAddress,
    capabilities: data.capabilities || [],
    agentType: (data.agent_type || 'ai') as 'ai' | 'human' | 'hybrid',
    status: data.is_available ? 'active' : 'inactive' as 'active' | 'inactive' | 'suspended',
    pricePerTask: BigInt(Math.floor(Number(data.hourly_rate || 0))),
    reputationScore: onChainScore > 0
      ? Math.round(Number(onChainScore))
      : computeReputation(data.rating || 0, data.total_reviews || 0, data.jobs_completed || 0),
    totalReviews: onChainReviews > 0 ? onChainReviews : (data.total_reviews || 0),
    totalTasksCompleted: data.jobs_completed || 0,
    totalEarnings: BigInt(Math.floor(Number(data.total_earnings || 0))),
    avatarUrl: data.avatar_url || null,
    endpointUrl: data.endpoint_url || null,
    createdAt: new Date(data.registered_at),
    claim,
  };
}

// ==========================================
// Reviews
// ==========================================

/**
 * Submit a review for an agent
 * Supports multi-dimensional ratings (quality, speed, communication)
 */
export async function submitAgentReview(request: {
  agentId: string;
  contractId: string;
  reviewerAddress: Address;
  rating: number;
  comment: string;
  // Multi-dimensional ratings (Sprint 4)
  qualityRating?: number;
  speedRating?: number;
  communicationRating?: number;
  category?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (request.rating < 1 || request.rating > 5) {
      return { success: false, error: 'Rating must be between 1 and 5' };
    }

    // Validate dimensional ratings if provided
    const validateDimensional = (value: number | undefined, name: string) => {
      if (value !== undefined && (value < 1 || value > 5)) {
        return `${name} must be between 1 and 5`;
      }
      return null;
    };

    const qualityError = validateDimensional(request.qualityRating, 'qualityRating');
    if (qualityError) return { success: false, error: qualityError };

    const speedError = validateDimensional(request.speedRating, 'speedRating');
    if (speedError) return { success: false, error: speedError };

    const commError = validateDimensional(request.communicationRating, 'communicationRating');
    if (commError) return { success: false, error: commError };

    // Sanitize review comment
    if (request.comment) {
      request.comment = sanitizeInput(request.comment).trim();
    }

    // ---------------------------------------------------------------
    // Determine review direction and verify eligibility
    // ---------------------------------------------------------------
    let verified = false;
    let reviewType: 'creator_to_worker' | 'worker_to_creator' = 'creator_to_worker';
    let paymentAmount = '0';

    // Check marketplace contracts first (always creator_to_worker)
    const { data: contract } = await supabaseAdmin
      .from('marketplace_contracts')
      .select('client_address, agent_id, agreed_rate')
      .eq('id', request.contractId)
      .single();

    if (contract) {
      if (contract.agent_id !== request.agentId) {
        return { success: false, error: 'Contract does not match the agent being reviewed' };
      }
      if (contract.client_address.toLowerCase() !== request.reviewerAddress.toLowerCase()) {
        return { success: false, error: 'Only the client who hired this agent can leave a review' };
      }

      // One review per marketplace contract
      const { data: existingReview } = await supabaseAdmin
        .from('marketplace_reviews')
        .select('id')
        .eq('contract_id', request.contractId)
        .eq('reviewer_address', request.reviewerAddress)
        .single();
      if (existingReview) {
        return { success: false, error: 'You have already reviewed this contract' };
      }

      paymentAmount = String(contract.agreed_rate ?? 0);
      verified = true;
    }

    // Collaborate mission path
    if (!verified) {
      const { data: mission } = await supabaseAdmin
        .from('collaborate_missions')
        .select('creator_address')
        .eq('id', request.contractId)
        .single();

      if (!mission) {
        return { success: false, error: 'Contract or mission not found' };
      }

      const isReviewerCreator = mission.creator_address.toLowerCase() === request.reviewerAddress.toLowerCase();

      if (isReviewerCreator) {
        // ── CREATOR REVIEWS WORKER ──────────────────────────────────
        reviewType = 'creator_to_worker';

        // Worker must have an accepted application
        const { data: application } = await supabaseAdmin
          .from('collaborate_applications')
          .select('id')
          .eq('mission_id', request.contractId)
          .eq('agent_id', request.agentId)
          .eq('status', 'accepted')
          .single();
        if (!application) {
          return { success: false, error: 'Agent did not work on this mission' };
        }

        // Requires at least one paid task — payment is the gate for creator
        const { data: paidTasks } = await supabaseAdmin
          .from('collaborate_tasks')
          .select('id')
          .eq('mission_id', request.contractId)
          .eq('assigned_agent_id', request.agentId)
          .eq('payment_status', 'paid');

        const paidCount = paidTasks?.length || 0;
        if (paidCount === 0) {
          return { success: false, error: 'Cannot review until at least one task has been paid. Confirm payment first via POST /collaborate/tasks { action: "confirm_payment" }.' };
        }

        // One review per paid task
        const { data: existingReviews } = await supabaseAdmin
          .from('marketplace_reviews')
          .select('id')
          .eq('contract_id', request.contractId)
          .eq('agent_id', request.agentId)
          .eq('reviewer_address', request.reviewerAddress)
          .eq('review_type', 'creator_to_worker');

        const reviewCount = existingReviews?.length || 0;
        if (reviewCount >= paidCount) {
          return { success: false, error: `You have already reviewed all ${paidCount} paid task(s) for this agent. Complete and pay another task to leave another review.` };
        }

        // Payment amount = agreed_rate of the next unreviewed paid task
        const { data: existingAmounts } = await supabaseAdmin
          .from('marketplace_reviews')
          .select('payment_amount')
          .eq('contract_id', request.contractId)
          .eq('agent_id', request.agentId)
          .eq('reviewer_address', request.reviewerAddress)
          .eq('review_type', 'creator_to_worker');

        const { data: paidTasksList } = await supabaseAdmin
          .from('collaborate_tasks')
          .select('reward')
          .eq('mission_id', request.contractId)
          .eq('assigned_agent_id', request.agentId)
          .eq('payment_status', 'paid')
          .order('updated_at', { ascending: true });

        const reviewedSoFar = existingAmounts?.length || 0;
        if (paidTasksList && paidTasksList.length > reviewedSoFar) {
          const { data: appRate } = await supabaseAdmin
            .from('collaborate_applications')
            .select('agreed_rate')
            .eq('mission_id', request.contractId)
            .eq('agent_id', request.agentId)
            .eq('status', 'accepted')
            .single();
          paymentAmount = String(appRate?.agreed_rate ?? paidTasksList[reviewedSoFar].reward ?? 0);
        }

        verified = true;

      } else {
        // ── WORKER REVIEWS CREATOR ──────────────────────────────────
        reviewType = 'worker_to_creator';

        // Reviewer must be a worker with an accepted application on this mission
        const { data: workerApp } = await supabaseAdmin
          .from('collaborate_applications')
          .select('id, agreed_rate')
          .eq('mission_id', request.contractId)
          .eq('status', 'accepted')
          .single();

        // Confirm the reviewer's wallet matches this accepted application's agent
        const { data: reviewerAgent } = await supabaseAdmin
          .from('marketplace_agents')
          .select('id')
          .ilike('wallet_address', request.reviewerAddress)
          .single();

        if (!reviewerAgent) {
          return { success: false, error: 'Reviewer is not a registered agent on this platform' };
        }

        const { data: reviewerApp } = await supabaseAdmin
          .from('collaborate_applications')
          .select('agreed_rate')
          .eq('mission_id', request.contractId)
          .eq('agent_id', reviewerAgent.id)
          .eq('status', 'accepted')
          .single();

        if (!reviewerApp) {
          return { success: false, error: 'You did not work on this mission' };
        }

        // Worker needs at least one approved task (does NOT need to be paid — this is intentional)
        const { data: approvedTasks } = await supabaseAdmin
          .from('collaborate_tasks')
          .select('id')
          .eq('mission_id', request.contractId)
          .eq('assigned_agent_id', reviewerAgent.id)
          .in('status', ['approved', 'paid']);

        if (!approvedTasks || approvedTasks.length === 0) {
          return { success: false, error: 'You can review the mission creator once at least one of your tasks has been approved' };
        }

        // One review per worker per mission for the creator
        const { data: existingWorkerReview } = await supabaseAdmin
          .from('marketplace_reviews')
          .select('id')
          .eq('contract_id', request.contractId)
          .eq('agent_id', request.agentId)
          .eq('reviewer_address', request.reviewerAddress)
          .eq('review_type', 'worker_to_creator')
          .single();

        if (existingWorkerReview) {
          return { success: false, error: 'You have already reviewed this mission creator' };
        }

        // Payment weight = agreed_rate (value of work done, even if unpaid)
        paymentAmount = String(reviewerApp.agreed_rate ?? 0);

        verified = true;
      }
    }

    if (!verified) {
      return { success: false, error: 'Not eligible to leave a review' };
    }

    // Insert review
    const { error: reviewError } = await supabaseAdmin
      .from('marketplace_reviews')
      .insert({
        agent_id: request.agentId,
        contract_id: request.contractId,
        reviewer_address: request.reviewerAddress,
        rating: request.rating,
        review_text: request.comment,
        payment_amount: paymentAmount,
        review_type: reviewType,
        quality_rating: request.qualityRating || null,
        speed_rating: request.speedRating || null,
        communication_rating: request.communicationRating || null,
        category: request.category || null,
      });

    if (reviewError) {
      console.error('Failed to submit review:', reviewError);
      return { success: false, error: 'Failed to submit review' };
    }

    // Update agent stats
    await updateAgentStats(request.agentId);

    // On-chain feedback + sync (non-blocking)
    // Determine if this is a marketplace or collaborate review for tagging
    const isCollaborateReview = !contract; // If no marketplace contract found, it's a mission review
    const erc8004Id = await getErc8004AgentId(request.agentId);
    if (erc8004Id) {
      submitFeedbackAndSync({
        marketplaceAgentId: request.agentId,
        agentId: BigInt(erc8004Id),
        value: request.rating * 20, // 1-5 star → 20-100 score
        tag1: isCollaborateReview ? 'mission-review' : 'hire-review',
        tag2: isCollaborateReview ? 'collaborate' : 'marketplace',
      }).catch(err => console.error('[ERC-8004] Feedback failed:', err));
    }

    return { success: true };
  } catch (error) {
    console.error('Error submitting review:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update agent statistics after review/task
 * Now includes multi-dimensional scores
 */
// Anti-gaming constants
const MIN_PAYMENT_FOR_RATING_WEIGHT = 100000; // $0.10 USDC in atomic units — reviews below this get zero weight
const MAX_REVIEWS_PER_REVIEWER = 3; // Same wallet can only contribute 3 weighted reviews per agent

async function updateAgentStats(agentId: string): Promise<void> {
  // Get all reviews with dimensional ratings, payment amounts, and reviewer address
  const { data: reviews } = await supabaseAdmin
    .from('marketplace_reviews')
    .select('rating, quality_rating, speed_rating, communication_rating, payment_amount, reviewer_address')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true });

  if (!reviews || reviews.length === 0) return;

  const totalReviews = reviews.length;

  // Track how many weighted reviews each reviewer has contributed
  const reviewerCounts = new Map<string, number>();

  // Payment-weighted rating with anti-gaming protections:
  // 1. Reviews below $0.10 USDC get zero weight (prevents spam with tiny tasks)
  // 2. Same reviewer can only contribute 3 weighted reviews (prevents sybil with one wallet)
  let totalWeight = 0;
  let weightedSum = 0;
  let weightedQualitySum = 0;
  let weightedSpeedSum = 0;
  let weightedCommSum = 0;
  let qualityWeight = 0;
  let speedWeight = 0;
  let commWeight = 0;

  for (const r of reviews) {
    const paymentAmount = Number(r.payment_amount || '0');
    const reviewerKey = (r.reviewer_address || '').toLowerCase();

    // Check anti-gaming rules
    const currentCount = reviewerCounts.get(reviewerKey) || 0;
    const belowMinPayment = paymentAmount < MIN_PAYMENT_FOR_RATING_WEIGHT;
    const reviewerCapped = currentCount >= MAX_REVIEWS_PER_REVIEWER;

    // Zero weight if below minimum payment or reviewer is capped
    let weight = 0;
    if (!belowMinPayment && !reviewerCapped) {
      weight = paymentAmount;
      reviewerCounts.set(reviewerKey, currentCount + 1);
    }

    totalWeight += weight;
    weightedSum += r.rating * weight;

    if (r.quality_rating != null) {
      qualityWeight += weight;
      weightedQualitySum += r.quality_rating * weight;
    }
    if (r.speed_rating != null) {
      speedWeight += weight;
      weightedSpeedSum += r.speed_rating * weight;
    }
    if (r.communication_rating != null) {
      commWeight += weight;
      weightedCommSum += r.communication_rating * weight;
    }
  }

  const avgRating = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const avgQuality = qualityWeight > 0 ? weightedQualitySum / qualityWeight : 0;
  const avgSpeed = speedWeight > 0 ? weightedSpeedSum / speedWeight : 0;
  const avgComm = commWeight > 0 ? weightedCommSum / commWeight : 0;

  // Update agent with payment-weighted scores
  await supabaseAdmin
    .from('marketplace_agents')
    .update({
      rating: Math.round(avgRating * 100) / 100,
      total_reviews: totalReviews,
      quality_score: Math.round(avgQuality * 100) / 100,
      speed_score: Math.round(avgSpeed * 100) / 100,
      communication_score: Math.round(avgComm * 100) / 100,
    })
    .eq('id', agentId);
}

/**
 * Get agent reviews
 * Now includes dimensional ratings
 */
export async function getAgentReviews(
  agentId: string,
  limit: number = 20
): Promise<
  Array<{
    id: string;
    rating: number;
    comment: string;
    reviewerAddress: Address;
    reviewType: 'creator_to_worker' | 'worker_to_creator';
    createdAt: Date;
    qualityRating: number | null;
    speedRating: number | null;
    communicationRating: number | null;
    category: string | null;
  }>
> {
  const { data, error } = await supabaseAdmin
    .from('marketplace_reviews')
    .select('id, rating, review_text, reviewer_address, review_type, created_at, quality_rating, speed_rating, communication_rating, category')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.review_text || '',
    reviewerAddress: r.reviewer_address as Address,
    reviewType: (r.review_type || 'creator_to_worker') as 'creator_to_worker' | 'worker_to_creator',
    createdAt: new Date(r.created_at),
    qualityRating: r.quality_rating || null,
    speedRating: r.speed_rating || null,
    communicationRating: r.communication_rating || null,
    category: r.category || null,
  }));
}
