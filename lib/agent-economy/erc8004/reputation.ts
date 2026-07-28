/**
 * ERC-8004 Integration - Reputation Management
 * Uses real ERC-8004 Reputation Registry on Base mainnet
 */

import { encodeFunctionData, type Address } from 'viem';
import { supabaseAdmin } from '@/lib/supabase/client';
import { baseClient } from '@/lib/viem/clients';


import {
  ERC8004_CONTRACTS,
  REPUTATION_REGISTRY_ABI,
} from './contracts';
import { getReputationTier } from '../constants';

// ==========================================
// Types
// ==========================================

export interface OnChainReputation {
  count: number;
  averageScore: number;
  decimals: number;
}

export interface OnChainFeedback {
  clientAddress: string;
  value: number;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackURI: string;
  revoked: boolean;
}

// ==========================================
// On-Chain Feedback Submission
// ==========================================

/**
 * Build unsigned tx for submitting on-chain feedback.
 * The caller (agent or platform operator) signs and submits with their own wallet.
 */
export function buildSubmitFeedbackTx(params: {
  agentId: bigint;
  value: number;
  tag1: string;
  tag2: string;
  feedbackURI?: string;
}): { to: Address; data: `0x${string}`; value: bigint; description: string } {
  const data = encodeFunctionData({
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'giveFeedback',
    args: [
      params.agentId,
      BigInt(params.value),
      0,
      params.tag1,
      params.tag2,
      'supermission.fun',
      params.feedbackURI || '',
      '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    ],
  });

  return {
    to: ERC8004_CONTRACTS.reputationRegistry,
    data,
    value: 0n,
    description: `Submit feedback (score: ${params.value}) for agent #${params.agentId}`,
  };
}

/**
 * @deprecated Platform no longer relays feedback transactions.
 * Use buildSubmitFeedbackTx() and submit with your own wallet.
 * This function is kept as a no-op for backward compatibility.
 */
export async function submitOnChainFeedback(params: {
  agentId: bigint;
  value: number;
  tag1: string;
  tag2: string;
  feedbackURI?: string;
}): Promise<{ success: boolean; txHash?: string; error?: string }> {
  console.warn('[ERC-8004] submitOnChainFeedback is deprecated. Use buildSubmitFeedbackTx() instead.');
  // Return success: false but don't throw — non-blocking
  return {
    success: false,
    error: 'Feedback submission via platform relayer is deprecated. Use buildSubmitFeedbackTx() and submit with your agentic wallet.',
  };
}

// ==========================================
// On-Chain Reputation Reads
// ==========================================

/**
 * Get the on-chain reputation summary for an agent.
 * Returns null on error (non-blocking).
 */
export async function getOnChainReputation(agentId: bigint): Promise<OnChainReputation | null> {
  try {
    // getSummary(agentId, [], "", "") — empty arrays/strings for unfiltered summary
    const result = await baseClient.readContract({
      address: ERC8004_CONTRACTS.reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getSummary',
      args: [agentId, [], '', ''],
    });

    const [count, summaryValue, summaryValueDecimals] = result as [bigint, bigint, number];

    const countNum = Number(count);
    if (countNum === 0) {
      return { count: 0, averageScore: 0, decimals: 0 };
    }

    // summaryValue is the total sum; divide by count for average
    const divisor = 10 ** summaryValueDecimals;
    const averageScore = Number(summaryValue) / divisor / countNum;

    return {
      count: countNum,
      averageScore: Math.round(averageScore * 100) / 100,
      decimals: summaryValueDecimals,
    };
  } catch (error) {
    console.error('[ERC-8004] Error fetching on-chain reputation:', error);
    return null;
  }
}

/**
 * Get all feedback entries for an agent from chain.
 */
export async function getOnChainFeedback(agentId: bigint): Promise<OnChainFeedback[]> {
  try {
    const result = await baseClient.readContract({
      address: ERC8004_CONTRACTS.reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'readAllFeedback',
      args: [agentId, [], '', '', false],
    });

    const feedbacks = result as Array<{
      clientAddress: string;
      value: bigint;
      valueDecimals: number;
      tag1: string;
      tag2: string;
      endpoint: string;
      feedbackURI: string;
      feedbackHash: string;
      revoked: boolean;
    }>;

    return feedbacks.map((f) => ({
      clientAddress: f.clientAddress,
      value: Number(f.value),
      valueDecimals: f.valueDecimals,
      tag1: f.tag1,
      tag2: f.tag2,
      endpoint: f.endpoint,
      feedbackURI: f.feedbackURI,
      revoked: f.revoked,
    }));
  } catch (error) {
    console.error('[ERC-8004] Error fetching on-chain feedback:', error);
    return [];
  }
}

// ==========================================
// Reputation Sync
// ==========================================

/**
 * Sync on-chain reputation to the Supabase cache.
 */
export async function syncReputationToCache(
  agentId: bigint,
  marketplaceAgentId: string
): Promise<void> {
  try {
    const rep = await getOnChainReputation(agentId);
    if (!rep) return;

    // Update erc8004_identities cache (primary source for on-chain reputation)
    await supabaseAdmin
      .from('erc8004_identities')
      .update({
        on_chain_reputation_score: rep.averageScore,
        on_chain_review_count: rep.count,
        last_synced_at: new Date().toISOString(),
      })
      .eq('erc8004_agent_id', Number(agentId))
      .eq('chain_id', 8453);
  } catch (error) {
    console.error('[ERC-8004] Failed to sync reputation to cache:', error);
  }
}

// ==========================================
// Leaderboard & Local Computations (kept)
// ==========================================

/**
 * Get reputation leaderboard from cache.
 */
export async function getReputationLeaderboard(
  limit: number = 50
): Promise<
  Array<{
    agentId: string;
    score: number;
    totalReviews: number;
    tier: { tier: string; symbol: string; color: string };
  }>
> {
  try {
    const { data, error } = await supabaseAdmin
      .from('erc8004_identities')
      .select('erc8004_agent_id, on_chain_reputation_score, on_chain_review_count')
      .order('on_chain_reputation_score', { ascending: false })
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data.map((record) => {
      const score = record.on_chain_reputation_score || 0;
      return {
        agentId: record.erc8004_agent_id?.toString() || '',
        score,
        totalReviews: record.on_chain_review_count || 0,
        tier: getReputationTier(score),
      };
    });
  } catch (error) {
    console.error('[ERC-8004] Error fetching leaderboard:', error);
    return [];
  }
}

/**
 * Calculate success rate from tasks.
 */
export function calculateSuccessRate(
  successfulTasks: number,
  failedTasks: number
): number {
  const total = successfulTasks + failedTasks;
  if (total === 0) return 0;
  return Math.round((successfulTasks / total) * 100);
}

/**
 * Calculate average rating from reviews.
 */
export function calculateAverageRating(
  totalScore: number,
  totalReviews: number
): number {
  if (totalReviews === 0) return 0;
  return Math.round((totalScore / totalReviews) * 10) / 10;
}

// ==========================================
// ERC-8004 Agent ID Lookup
// ==========================================

/**
 * Resolve the ERC-8004 agent ID for a marketplace agent.
 * Checks the FK join (erc8004_identities) first, then falls back to metadata.
 */
export async function getErc8004AgentId(marketplaceAgentId: string): Promise<string | null> {
  try {
    // 1. Check erc8004_identities via FK
    const { data: identity } = await supabaseAdmin
      .from('erc8004_identities')
      .select('erc8004_agent_id')
      .eq('marketplace_agent_id', marketplaceAgentId)
      .limit(1);
    if (identity && identity.length > 0) {
      return identity[0].erc8004_agent_id.toString();
    }
    // 2. Fallback to metadata
    const { data: agent } = await supabaseAdmin
      .from('marketplace_agents')
      .select('metadata')
      .eq('id', marketplaceAgentId)
      .single();
    return (agent?.metadata as Record<string, unknown>)?.erc8004_agent_id?.toString() || null;
  } catch (error) {
    console.error('[ERC-8004] Error looking up agent ID:', error);
    return null;
  }
}

// ==========================================
// Submit Feedback + Sync Wrapper
// ==========================================

/**
 * Submit on-chain feedback and sync the resulting reputation to cache.
 */
export async function submitFeedbackAndSync(params: {
  marketplaceAgentId: string;
  agentId: bigint;
  value: number;
  tag1: string;
  tag2: string;
  feedbackURI?: string;
}): Promise<void> {
  const result = await submitOnChainFeedback({
    agentId: params.agentId,
    value: params.value,
    tag1: params.tag1,
    tag2: params.tag2,
    feedbackURI: params.feedbackURI,
  });
  if (result.success) {
    await syncReputationToCache(params.agentId, params.marketplaceAgentId);
  }
}
