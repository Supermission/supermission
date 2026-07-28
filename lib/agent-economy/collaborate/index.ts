/**
 * Collaboration Hub - Multi-agent missions
 */

import { Address, parseAbi, encodeFunctionData } from 'viem';
import { supabaseAdmin } from '@/lib/supabase/client';
import { baseClient } from '@/lib/viem/clients';
import { relayTransaction } from '@/lib/server-wallets/relayer';
import { TRANSFER_WITH_AUTHORIZATION_ABI, splitSignature, recoverUSDCAuthorizationSignature, createEIP3009Authorization } from '@/lib/x402/eip3009';
import type { PaymentPayload } from '../x402/types';

// Use raw client to bypass strict typing for new tables
import { v4 as uuidv4 } from 'uuid';
import { getErc8004AgentId, submitFeedbackAndSync } from '../erc8004/reputation';
import { getWalletByAgentName } from '../wallet/create';
import { triggerWebhook } from '../webhooks';
import { autoAssignTask, type AutoAssignCriteria, type AssignmentStrategy } from './auto-assign';
import { verifyMandate } from '../ap2/verify-mandate';
import { autoActivateMissionIfNeeded, resolveCreatorAgentId } from './negotiation';
import { USDC_ADDRESS, USDC_DECIMALS } from '../constants';

// ==========================================
// On-chain USDC verification
// ==========================================

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

/**
 * Check on-chain USDC balance for an address.
 */
async function checkUSDCBalance(address: Address): Promise<bigint> {
  return baseClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
}

/**
 * Verify a USDC Transfer event in a transaction receipt.
 * Returns whether the transfer matches expected from/to/amount.
 */
async function verifyUSDCTransfer(
  txHash: `0x${string}`,
  expectedFrom: Address,
  expectedTo: Address,
  expectedAmount: bigint
): Promise<{ verified: boolean; actualAmount?: bigint; error?: string }> {
  try {
    const receipt = await baseClient.getTransactionReceipt({ hash: txHash });

    // Find USDC Transfer events
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // keccak256('Transfer(address,address,uint256)')

    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
        log.topics[0] === transferTopic &&
        log.topics.length >= 3
      ) {
        const from = ('0x' + log.topics[1]!.slice(26)) as Address;
        const to = ('0x' + log.topics[2]!.slice(26)) as Address;
        const amount = BigInt(log.data);

        if (
          from.toLowerCase() === expectedFrom.toLowerCase() &&
          to.toLowerCase() === expectedTo.toLowerCase() &&
          amount >= expectedAmount
        ) {
          return { verified: true, actualAmount: amount };
        }
      }
    }

    return { verified: false, error: 'No matching USDC Transfer event found in transaction' };
  } catch (error) {
    // Use shortMessage if available (viem errors) to avoid leaking library internals
    const viemError = error as Error & { shortMessage?: string };
    const msg = viemError.shortMessage
      ?? (error instanceof Error
        ? error.message.split('\n').filter((l) => !l.startsWith('Version:')).join(' ').trim()
        : 'unknown error');
    return { verified: false, error: `Failed to verify transaction: ${msg}` };
  }
}

/**
 * Format atomic USDC amount to human-readable string.
 */
function formatUSDC(atomicAmount: bigint): string {
  const divisor = BigInt(10 ** USDC_DECIMALS);
  const whole = atomicAmount / divisor;
  const frac = atomicAmount % divisor;
  return `${whole}.${frac.toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '') || '0'}`;
}

// ==========================================
// Helpers
// ==========================================

/** Maximum budget in human-readable units (1 billion) to prevent overflow/DoS */
const MAX_BUDGET = 1_000_000_000;

/** Maximum description length in characters */
const MAX_DESCRIPTION_LENGTH = 5000;

import { sanitizeInput } from '../utils/sanitize';
import { PLATFORM_FEES } from '../constants';

/**
 * Safely parse an amount string to BigInt using string manipulation.
 * Avoids Number() to prevent precision loss for large values.
 * Handles decimal strings (e.g. "0.05") by rounding to nearest integer.
 * Returns 0n for unparseable values.
 */
function safeParseAmount(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  const str = String(value).trim();
  // Fast path: already a valid integer string
  if (/^-?\d+$/.test(str)) return BigInt(str);
  // Handle decimals: split on '.' and round
  const parts = str.split('.');
  if (parts.length === 2 && /^-?\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    const intPart = BigInt(parts[0]);
    const firstDecDigit = parseInt(parts[1][0] || '0', 10);
    const sign = str.startsWith('-') ? -1n : 1n;
    return firstDecDigit >= 5 ? intPart + sign : intPart;
  }
  return 0n;
}

/**
 * Safely parse a number for validation comparisons (not on-chain values).
 * Uses Number() — fine for values < 1B.
 */
function safeParseNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  return isNaN(num) || !isFinite(num) ? 0 : num;
}

// ==========================================
// Types (re-exported from canonical source)
// ==========================================

export type {
  MissionStatus,
  TaskStatus,
  Mission,
  MissionTask,
  TeamMember,
  CreateMissionRequest,
} from '../types';
import type {
  MissionStatus,
  TaskStatus,
  Mission,
  MissionTask,
  TeamMember,
  CreateMissionRequest,
} from '../types';

// ==========================================
// Mission Management
// ==========================================

/**
 * Create a new mission
 */
export async function createMission(
  request: CreateMissionRequest
): Promise<{
  success: boolean;
  missionId?: string;
  status?: string;
  nextStep?: string;
  error?: string;
}> {
  try {
    // Validate title
    if (!request.title || typeof request.title !== 'string' || request.title.trim().length < 3) {
      return { success: false, error: 'Title must be at least 3 characters' };
    }
    if (request.title.length > 200) {
      return { success: false, error: 'Title must be 200 characters or less' };
    }

    // Validate description length
    if (request.description && request.description.length > MAX_DESCRIPTION_LENGTH) {
      return { success: false, error: `Description must be ${MAX_DESCRIPTION_LENGTH.toLocaleString()} characters or less` };
    }

    // Sanitize text inputs
    request.title = sanitizeInput(request.title).trim();
    request.description = sanitizeInput(request.description || '').trim();

    // Validate budget — minimum $0.01 USDC (1 cent) to ensure tasks can actually be paid
    const budgetNum = safeParseNumber(request.budget);
    if (budgetNum < 0.01) {
      return { success: false, error: 'Budget must be at least $0.01 USDC' };
    }
    if (budgetNum > MAX_BUDGET) {
      return { success: false, error: `Budget cannot exceed ${MAX_BUDGET.toLocaleString()}` };
    }

    // Validate deadline is in the future
    if (request.deadline) {
      const deadlineDate = request.deadline instanceof Date ? request.deadline : new Date(request.deadline);
      if (deadlineDate.getTime() <= Date.now()) {
        return { success: false, error: 'Deadline must be in the future' };
      }
    }

    // Check creator's on-chain USDC balance (strict — blocks mission creation if underfunded)
    const budgetAtomic = safeParseAmount(request.budget);
    if (budgetAtomic > 0n) {
      try {
        const balance = await checkUSDCBalance(request.clientAddress);
        if (balance < budgetAtomic) {
          return {
            success: false,
            error: `Insufficient USDC balance. You have ${formatUSDC(balance)} USDC but need ${formatUSDC(budgetAtomic)} USDC. Fund your wallet (${request.clientAddress}) on Base before creating a mission.`,
          };
        }
      } catch (err) {
        console.error('[createMission] On-chain balance check failed:', err);
        return {
          success: false,
          error: 'Unable to verify your USDC balance on Base. Please try again later.',
        };
      }
    }

    const missionId = uuidv4();

    // Insert mission with active status (open for applications)
    const { error: missionError } = await supabaseAdmin
      .from('collaborate_missions')
      .insert({
        id: missionId,
        title: request.title,
        description: request.description,
        creator_address: request.clientAddress,
        category: request.category || 'other',
        budget: request.budget,
        deadline: request.deadline ? (request.deadline instanceof Date ? request.deadline.toISOString() : new Date(request.deadline).toISOString()) : null,
        status: 'active',
        // Agent discovery/matching fields
        required_capabilities: request.requiredCapabilities || [],
        nice_to_have_capabilities: request.niceToHaveCapabilities || [],
        excluded_capabilities: request.excludedCapabilities || [],
        min_reputation: request.minReputation ?? 0,
        auto_assign: request.autoAssign ?? false,
      });

    if (missionError) {
      console.error('[createMission] Mission insert error:', missionError);
      return { success: false, error: 'Failed to create mission' };
    }

    // Insert tasks if provided
    if (request.tasks && request.tasks.length > 0) {
      // Validate task fields
      let totalTaskRewards = 0;
      for (const task of request.tasks) {
        if (!task.title) {
          await supabaseAdmin.from('collaborate_missions').delete().eq('id', missionId);
          return { success: false, error: 'Each task must have a title' };
        }
        const reward = safeParseNumber(task.budget || task.reward || '0');
        if (reward < 0) {
          await supabaseAdmin.from('collaborate_missions').delete().eq('id', missionId);
          return { success: false, error: 'Task reward cannot be negative' };
        }
        if (reward > MAX_BUDGET) {
          await supabaseAdmin.from('collaborate_missions').delete().eq('id', missionId);
          return { success: false, error: `Task reward cannot exceed ${MAX_BUDGET.toLocaleString()}` };
        }
        totalTaskRewards += reward;
      }

      if (totalTaskRewards > budgetNum) {
        await supabaseAdmin.from('collaborate_missions').delete().eq('id', missionId);
        return { success: false, error: `Total task rewards (${totalTaskRewards}) exceed mission budget (${budgetNum})` };
      }

      const tasksToInsert = request.tasks.map((task, index) => ({
        id: uuidv4(),
        mission_id: missionId,
        title: sanitizeInput(task.title).trim(),
        description: sanitizeInput(task.description || '').trim(),
        reward: task.budget || task.reward || '0',
        dependencies: task.dependencies || [],
        priority: index,
        status: 'pending',
      }));

      const { error: tasksError } = await supabaseAdmin
        .from('collaborate_tasks')
        .insert(tasksToInsert);

      if (tasksError) {
        console.error('[createMission] Task insert error:', tasksError);
        await supabaseAdmin.from('collaborate_missions').delete().eq('id', missionId);
        return { success: false, error: 'Failed to create tasks' };
      }
    }

    return {
      success: true,
      missionId,
      status: 'active',
      nextStep: 'Mission is now active. Agents can apply via POST /api/agent-economy/collaborate/join. Accept applications, then agents complete tasks and you pay them directly.',
    };
  } catch (error) {
    console.error('Error creating mission:', error);
    return {
      success: false,
      error: 'Internal error',
    };
  }
}

/**
 * Create a single-agent job in the collaborate system.
 * Used by new-agents routes to track work as collaborate_missions.
 * Creates mission + task + auto-approved application in one call.
 */
export async function createSingleAgentJob(params: {
  agentName: string;
  agentWallet: string;
  title: string;
  description: string;
  budget: string;
  category: string;
  creatorAddress: string;
}): Promise<{
  success: boolean;
  missionId?: string;
  taskId?: string;
  error?: string;
}> {
  try {
    const { agentName, agentWallet, title, description, budget, category, creatorAddress } = params;

    // Validate required fields
    if (!title || !creatorAddress || !agentName) {
      return { success: false, error: 'Missing required fields: title, creatorAddress, agentName' };
    }

    // USDC balance check (non-blocking for now — logged for future payment support)
    const budgetAtomic = safeParseAmount(budget);
    if (budgetAtomic > 0n && creatorAddress.startsWith('0x')) {
      try {
        const balance = await checkUSDCBalance(creatorAddress as Address);
        if (balance < budgetAtomic) {
          console.warn(
            `[createSingleAgentJob] Low USDC balance for ${creatorAddress}: has ${formatUSDC(balance)}, job costs ${formatUSDC(budgetAtomic)}`
          );
        }
      } catch (err) {
        console.warn('[createSingleAgentJob] USDC balance check failed (non-blocking):', err);
      }
    }

    const missionId = uuidv4();
    const taskId = uuidv4();
    const now = new Date().toISOString();

    // 1. Create collaborate_mission (status: in_progress — agent is already working)
    const { error: missionError } = await supabaseAdmin
      .from('collaborate_missions')
      .insert({
        id: missionId,
        title: sanitizeInput(title).trim(),
        description: sanitizeInput(description || '').trim(),
        creator_address: creatorAddress,
        category: category || 'other',
        budget,
        status: 'in_progress',
        required_agents: 1,
        current_agents: 1,
        started_at: now,
      });

    if (missionError) {
      console.error('[createSingleAgentJob] Mission insert error:', missionError);
      return { success: false, error: 'Failed to create mission record' };
    }

    // 2. Resolve agent in marketplace_agents (lookup by wallet + name, or create)
    let agentId: string | null = null;
    const { data: existingAgent } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id')
      .eq('wallet_address', agentWallet)
      .eq('agent_name', agentName)
      .single();

    if (existingAgent) {
      agentId = existingAgent.id;
    } else {
      // Auto-register the agent
      const { data: newAgent, error: agentError } = await supabaseAdmin
        .from('marketplace_agents')
        .insert({
          agent_name: agentName,
          wallet_address: agentWallet,
          agent_type: 'ai',
          status: 'active',
          capabilities: [category],
        })
        .select('id')
        .single();

      if (agentError) {
        console.error('[createSingleAgentJob] Agent register error:', agentError);
        // Non-fatal — continue without agent_id on application/task
      } else {
        agentId = newAgent.id;
      }
    }

    // 3. Create collaborate_task (assigned, in_progress)
    const { error: taskError } = await supabaseAdmin
      .from('collaborate_tasks')
      .insert({
        id: taskId,
        mission_id: missionId,
        title,
        description: description || '',
        reward: budget,
        status: 'in_progress',
        priority: 0,
        assigned_agent_id: agentId,
        assigned_at: now,
      });

    if (taskError) {
      console.error('[createSingleAgentJob] Task insert error:', taskError);
      // Clean up mission
      await supabaseAdmin.from('collaborate_missions').delete().eq('id', missionId);
      return { success: false, error: 'Failed to create task record' };
    }

    // 4. Create auto-approved collaborate_application
    if (agentId) {
      const { error: appError } = await supabaseAdmin
        .from('collaborate_applications')
        .insert({
          mission_id: missionId,
          agent_id: agentId,
          application_text: `Auto-assigned: ${agentName} service request`,
          proposed_rate: budget,
          agreed_rate: budget,
          proposed_tasks: [taskId],
          status: 'accepted',
          agent_approved: true,
          creator_approved: true,
          agent_approved_at: now,
          creator_approved_at: now,
          applied_at: now,
          responded_at: now,
        });

      if (appError) {
        console.error('[createSingleAgentJob] Application insert error (non-fatal):', appError);
      }
    }

    return { success: true, missionId, taskId };
  } catch (error) {
    console.error('[createSingleAgentJob] Unexpected error:', error);
    return { success: false, error: 'Internal error creating job record' };
  }
}

/**
 * Complete a single-agent job. Call after the agent finishes its work.
 */
export async function completeSingleAgentJob(params: {
  missionId: string;
  taskId: string;
  submissionData?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();

    // Update task to completed
    const { error: taskError } = await supabaseAdmin
      .from('collaborate_tasks')
      .update({
        status: 'approved',
        submission_data: params.submissionData || {},
        completed_at: now,
      })
      .eq('id', params.taskId);

    if (taskError) {
      console.error('[completeSingleAgentJob] Task update error:', taskError);
      return { success: false, error: 'Failed to update task' };
    }

    // Update mission to completed
    const { error: missionError } = await supabaseAdmin
      .from('collaborate_missions')
      .update({
        status: 'completed',
        completed_at: now,
      })
      .eq('id', params.missionId);

    if (missionError) {
      console.error('[completeSingleAgentJob] Mission update error:', missionError);
      return { success: false, error: 'Failed to update mission' };
    }

    return { success: true };
  } catch (error) {
    console.error('[completeSingleAgentJob] Unexpected error:', error);
    return { success: false, error: 'Internal error completing job' };
  }
}

/**
 * Get mission by ID
 */
export async function getMission(missionId: string): Promise<Mission | null> {
  const { data, error } = await supabaseAdmin
    .from('collaborate_missions')
    .select('*')
    .eq('id', missionId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    clientAddress: data.creator_address as Address,
    leadAgentId: null, // Derived from applications
    status: data.status as MissionStatus,
    category: data.category || 'other',
    budget: safeParseAmount(data.budget),
    requiredAgents: data.required_agents || 1,
    currentAgents: data.current_agents || 0,
    deadline: data.deadline ? new Date(data.deadline) : null,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.started_at || data.created_at),
  };
}

/**
 * Get mission tasks (with assigned agent reputation)
 */
export async function getMissionTasks(missionId: string): Promise<(MissionTask & { assignedAgent?: { name: string; reputation: { rating: number | null; jobsCompleted: number; totalReviews: number; totalEarnings: string } } })[]> {
  const { data, error } = await supabaseAdmin
    .from('collaborate_tasks')
    .select('*')
    .eq('mission_id', missionId)
    .order('priority', { ascending: true })
    .limit(200);

  if (error || !data) {
    return [];
  }

  // Batch-fetch agent info for assigned tasks
  const assignedAgentIds = [...new Set(data.filter(t => t.assigned_agent_id).map(t => t.assigned_agent_id))];
  const agentMap = new Map<string, { name: string; rating: number | null; jobs_completed: number; total_reviews: number; total_earnings: string }>();

  if (assignedAgentIds.length > 0) {
    const { data: agents } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name, rating, jobs_completed, total_reviews, total_earnings')
      .in('id', assignedAgentIds);

    for (const a of agents || []) {
      agentMap.set(a.id, {
        name: a.agent_name,
        rating: a.rating,
        jobs_completed: a.jobs_completed || 0,
        total_reviews: a.total_reviews || 0,
        total_earnings: a.total_earnings || '0',
      });
    }
  }

  return data.map((task) => {
    const agent = task.assigned_agent_id ? agentMap.get(task.assigned_agent_id) : undefined;
    return {
    id: task.id,
    missionId: task.mission_id,
    title: task.title,
    description: task.description || '',
    assignedAgentId: task.assigned_agent_id,
    status: task.status as TaskStatus,
    budget: safeParseAmount(task.reward),
    dependencies: task.dependencies || [],
    submissionData: task.submission_data || null,
    ...(agent ? {
      assignedAgent: {
        name: agent.name,
        reputation: {
          rating: agent.rating,
          jobsCompleted: agent.jobs_completed,
          totalReviews: agent.total_reviews,
          totalEarnings: agent.total_earnings,
        },
      },
    } : {}),
    completedAt: task.completed_at ? new Date(task.completed_at) : null,
  };
  });
}

/**
 * List missions
 */
export async function listMissions(options: {
  clientAddress?: Address;
  status?: MissionStatus;
  limit?: number;
  offset?: number;
}): Promise<{ missions: (Mission & { taskCount: number; teamSize: number })[]; total: number }> {
  let query = supabaseAdmin
    .from('collaborate_missions')
    .select('*', { count: 'exact' });

  if (options.clientAddress) {
    query = query.eq('creator_address', options.clientAddress);
  }
  if (options.status) {
    // Explicit status filter — return exactly what was asked for
    query = query.eq('status', options.status);
  } else {
    // Default: only show missions workers can act on — exclude cancelled and completed
    query = query.in('status', ['active', 'in_progress']);
  }

  const limit = Math.min(options.limit || 20, 100); // Cap at 100
  const offset = options.offset || 0;
  query = query.range(offset, offset + limit - 1);
  query = query.order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    return { missions: [], total: 0 };
  }

  // Batch-query task counts and team sizes for all missions (A1)
  const missionIds = (data || []).map((m) => m.id);
  const taskCountMap = new Map<string, number>();
  const teamSizeMap = new Map<string, number>();

  if (missionIds.length > 0) {
    const [taskRows, appRows] = await Promise.all([
      supabaseAdmin
        .from('collaborate_tasks')
        .select('mission_id')
        .in('mission_id', missionIds),
      supabaseAdmin
        .from('collaborate_applications')
        .select('mission_id')
        .in('mission_id', missionIds)
        .eq('status', 'accepted'),
    ]);

    for (const t of taskRows.data || []) {
      taskCountMap.set(t.mission_id, (taskCountMap.get(t.mission_id) || 0) + 1);
    }
    for (const a of appRows.data || []) {
      teamSizeMap.set(a.mission_id, (teamSizeMap.get(a.mission_id) || 0) + 1);
    }
  }

  const missions = (data || []).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    clientAddress: m.creator_address as Address,
    leadAgentId: null,
    status: m.status as MissionStatus,
    category: m.category || 'other',
    budget: safeParseAmount(m.budget),
    requiredAgents: m.required_agents || 1,
    currentAgents: m.current_agents || 0,
    taskCount: taskCountMap.get(m.id) || 0,
    teamSize: teamSizeMap.get(m.id) || 0,
    deadline: m.deadline ? new Date(m.deadline) : null,
    createdAt: new Date(m.created_at),
    updatedAt: new Date(m.started_at || m.created_at),
  }));

  return { missions, total: count || 0 };
}

// ==========================================
// Team Management
// ==========================================

/**
 * Join a mission as a team member
 */
export async function joinMission(
  missionId: string,
  agentId: string,
  applicationText?: string,
  proposedRate?: string
): Promise<{ success: boolean; applicationId?: string; expiresAt?: string; proposedRate?: string; error?: string }> {
  try {
    // Check if mission exists and is accepting members
    const mission = await getMission(missionId);
    if (!mission) {
      return { success: false, error: 'Mission not found' };
    }
    if (mission.status !== 'active') {
      return { success: false, error: 'Mission is not accepting new members' };
    }

    // Block self-apply: check if applicant owns the mission
    const { data: applicantAgent } = await supabaseAdmin
      .from('marketplace_agents')
      .select('wallet_address, hourly_rate')
      .eq('id', agentId)
      .single();

    if (applicantAgent &&
        applicantAgent.wallet_address.toLowerCase() === mission.clientAddress.toLowerCase()) {
      return { success: false, error: 'Cannot apply to your own mission' };
    }

    // Check if already applied
    const { data: existing } = await supabaseAdmin
      .from('collaborate_applications')
      .select('id')
      .eq('mission_id', missionId)
      .eq('agent_id', agentId)
      .single();

    if (existing) {
      return { success: false, error: 'Already applied to this mission' };
    }

    // Auto-fill proposedRate from agent's hourly_rate if not explicitly provided
    const effectiveRate = proposedRate || (applicantAgent?.hourly_rate ? String(Math.floor(Number(applicantAgent.hourly_rate))) : null);

    // Calculate expiration date from mission settings
    const { data: missionSettings } = await supabaseAdmin
      .from('collaborate_missions')
      .select('application_deadline, auto_reject_after_days')
      .eq('id', missionId)
      .single();

    let expiresAt: string | null = null;
    if (missionSettings?.application_deadline) {
      // Use explicit deadline if set
      expiresAt = missionSettings.application_deadline;
    } else if (missionSettings?.auto_reject_after_days) {
      // Calculate expiration from auto_reject_after_days
      const days = missionSettings.auto_reject_after_days;
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + days);
      expiresAt = expDate.toISOString();
    }

    // Create application
    const { data, error } = await supabaseAdmin
      .from('collaborate_applications')
      .insert({
        mission_id: missionId,
        agent_id: agentId,
        application_text: applicationText || '',
        proposed_rate: effectiveRate || null,
        expires_at: expiresAt,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error || !data) {
      return { success: false, error: 'Failed to join mission' };
    }

    // Insert initial system message with the proposed rate
    if (effectiveRate) {
      const rateSource = proposedRate ? 'proposed' : 'from agent profile';
      await supabaseAdmin
        .from('application_messages')
        .insert({
          application_id: data.id,
          sender_address: 'system',
          content: `Application submitted with rate: ${effectiveRate} (${rateSource})`,
          message_type: 'system',
          metadata: { proposedRate: effectiveRate, rateSource },
        });
    }

    // Increment agent count on mission (best effort - RPC may not exist)
    try {
      await supabaseAdmin.rpc('increment_mission_agents', {
        p_mission_id: missionId,
      });
    } catch {
      // RPC may not exist yet, that's okay
    }

    // Notify mission creator of the new application.
    // Await the lookup here (fast ~10ms DB query) so triggerWebhook is called within
    // the request context — this lets after() schedule delivery correctly. Without this,
    // triggerWebhook runs outside the request context, after() throws, and the fallback
    // fire-and-forget causes unpredictable ~10s delays on the first webhook event.
    const clientAddress = mission.clientAddress;
    const newMatchPayload = {
      applicationId: data.id,
      missionId,
      missionTitle: mission.title,
      applicantAgentId: agentId,
      proposedRate: effectiveRate || null,
      message: 'A new agent has applied to your mission.',
    };
    const creatorAgentId = await resolveCreatorAgentId(clientAddress).catch(err => {
      console.error('[Webhook] Failed to resolve creator for mission.new_match:', err);
      return null;
    });
    if (creatorAgentId) {
      triggerWebhook(creatorAgentId, 'mission.new_match', newMatchPayload);
    }

    return { success: true, applicationId: data.id, expiresAt: expiresAt || undefined, proposedRate: effectiveRate || undefined };
  } catch (error) {
    console.error('Error joining mission:', error);
    return {
      success: false,
      error: 'Internal error',
    };
  }
}

/**
 * Get mission team (accepted applications)
 */
export async function getMissionTeam(missionId: string): Promise<TeamMember[]> {
  const { data, error } = await supabaseAdmin
    .from('collaborate_applications')
    .select(`
      agent_id,
      status,
      applied_at,
      marketplace_agents(agent_name)
    `)
    .eq('mission_id', missionId)
    .eq('status', 'accepted');

  if (error || !data) {
    return [];
  }

  return data.map((m) => {
    // Handle both array and object cases from Supabase join
    const agents = m.marketplace_agents;
    let agentName = 'Unknown';
    if (Array.isArray(agents) && agents.length > 0) {
      agentName = (agents[0] as { agent_name: string }).agent_name || 'Unknown';
    } else if (agents && typeof agents === 'object' && 'agent_name' in agents) {
      agentName = (agents as { agent_name: string }).agent_name || 'Unknown';
    }
    return {
      agentId: m.agent_id,
      agentName,
      role: 'contributor' as const,
      contribution: 0,
      joinedAt: new Date(m.applied_at),
    };
  });
}

// ==========================================
// Task Management
// ==========================================

/**
 * Create a new task for an existing mission
 */
export async function createTask(
  missionId: string,
  task: {
    title: string;
    description?: string;
    reward?: string;
    budget?: string;
    dependencies?: string[];
    // Auto-assignment options
    autoAssign?: boolean;
    assignmentStrategy?: AssignmentStrategy;
    requiredCapabilities?: string[];
    minReputation?: number;
    maxActiveTasks?: number;
  },
  creatorAddress: string
): Promise<{
  success: boolean;
  taskId?: string;
  error?: string;
  autoAssigned?: boolean;
  assignedTo?: string;
  assignedAgentName?: string;
}> {
  try {
    if (!task.title || typeof task.title !== 'string' || task.title.trim().length < 3) {
      return { success: false, error: 'Task title must be at least 3 characters' };
    }
    if (task.title.length > 200) {
      return { success: false, error: 'Task title must be 200 characters or less' };
    }
    if (task.description && task.description.length > MAX_DESCRIPTION_LENGTH) {
      return { success: false, error: `Task description must be ${MAX_DESCRIPTION_LENGTH.toLocaleString()} characters or less` };
    }

    // Sanitize text inputs
    task.title = sanitizeInput(task.title).trim();
    task.description = sanitizeInput(task.description || '').trim();

    // Validate reward cap
    const taskReward = safeParseNumber(task.budget || task.reward || '0');
    if (taskReward < 0) {
      return { success: false, error: 'Task reward cannot be negative' };
    }
    if (taskReward > MAX_BUDGET) {
      return { success: false, error: `Task reward cannot exceed ${MAX_BUDGET.toLocaleString()}` };
    }

    // Verify mission exists and caller is the creator
    const { data: mission, error: missionError } = await supabaseAdmin
      .from('collaborate_missions')
      .select('creator_address, status, budget')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return { success: false, error: 'Mission not found' };
    }

    if (mission.creator_address.toLowerCase() !== creatorAddress.toLowerCase()) {
      return { success: false, error: 'Only the mission creator can add tasks' };
    }

    if (mission.status === 'completed' || mission.status === 'cancelled') {
      return { success: false, error: 'Cannot add tasks to a completed or cancelled mission' };
    }

    // Validate task reward doesn't exceed remaining mission budget
    const missionBudget = safeParseNumber(mission.budget || '0');
    const { data: existingTasks } = await supabaseAdmin
      .from('collaborate_tasks')
      .select('reward')
      .eq('mission_id', missionId);

    const allocatedRewards = (existingTasks || []).reduce(
      (sum, t) => sum + safeParseNumber(t.reward || '0'), 0
    );

    if (taskReward + allocatedRewards > missionBudget) {
      const remaining = Math.max(0, missionBudget - allocatedRewards);
      return {
        success: false,
        error: `Task reward (${taskReward}) exceeds remaining mission budget (${remaining} of ${missionBudget})`,
      };
    }

    const taskId = uuidv4();
    const { error: insertError } = await supabaseAdmin
      .from('collaborate_tasks')
      .insert({
        id: taskId,
        mission_id: missionId,
        title: task.title,
        description: task.description || '',
        reward: task.budget || task.reward || '0',
        dependencies: task.dependencies || [],
        status: 'pending',
      });

    if (insertError) {
      console.error('[createTask] Insert error:', insertError);
      return { success: false, error: 'Failed to create task' };
    }

    // Auto-assignment if enabled
    if (task.autoAssign) {
      const criteria: AutoAssignCriteria = {
        strategy: task.assignmentStrategy || 'best_match',
        capabilities: task.requiredCapabilities,
        minReputation: task.minReputation,
        maxActiveTasks: task.maxActiveTasks,
      };

      const assignResult = await autoAssignTask(taskId, missionId, criteria);

      if (assignResult.success) {
        return {
          success: true,
          taskId,
          autoAssigned: true,
          assignedTo: assignResult.assignedTo,
          assignedAgentName: assignResult.agentName,
        };
      }
      // If auto-assign failed, still return success (task was created)
      console.log(`[createTask] Auto-assign failed: ${assignResult.reason || assignResult.error}`);
    }

    return { success: true, taskId };
  } catch (error) {
    console.error('Error creating task:', error);
    return {
      success: false,
      error: 'Internal error',
    };
  }
}

// ==========================================
// Task Assignment
// ==========================================

/**
 * Assign a task to an agent
 */
export async function assignTask(
  taskId: string,
  agentId: string,
  callerAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if task can be assigned
    const { data: task, error: taskError } = await supabaseAdmin
      .from('collaborate_tasks')
      .select('status, dependencies, mission_id')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return { success: false, error: 'Task not found' };
    }

    // Verify caller is mission creator OR the agent is self-assigning as a team member
    const { data: mission } = await supabaseAdmin
      .from('collaborate_missions')
      .select('creator_address, metadata')
      .eq('id', task.mission_id)
      .single();

    const isCreator = mission && mission.creator_address.toLowerCase() === callerAddress.toLowerCase();

    if (!isCreator) {
      // Check if agent is a team member (accepted application) — allow self-assign
      const { data: membership } = await supabaseAdmin
        .from('collaborate_applications')
        .select('id')
        .eq('mission_id', task.mission_id)
        .eq('agent_id', agentId)
        .eq('status', 'accepted')
        .limit(1);

      if (!membership || membership.length === 0) {
        return { success: false, error: 'Only the mission creator or accepted team members can assign tasks' };
      }
    }

    if (task.status !== 'pending') {
      return { success: false, error: 'Task is not available for assignment' };
    }

    // Check dependencies are completed
    if (task.dependencies && task.dependencies.length > 0) {
      const { data: deps } = await supabaseAdmin
        .from('collaborate_tasks')
        .select('id, status')
        .in('id', task.dependencies);

      const incomplete = (deps || []).filter((d) => d.status !== 'approved');
      if (incomplete.length > 0) {
        return { success: false, error: 'Dependencies not completed' };
      }
    }

    // Check agent has an accepted application
    const { data: applications } = await supabaseAdmin
      .from('collaborate_applications')
      .select('id')
      .eq('mission_id', task.mission_id)
      .eq('agent_id', agentId)
      .eq('status', 'accepted')
      .limit(1);

    if (!applications || applications.length === 0) {
      return { success: false, error: 'Agent is not a team member' };
    }

    // Verify agent has a wallet (required for receiving payment later)
    const { data: agentRecord } = await supabaseAdmin
      .from('marketplace_agents')
      .select('agent_name')
      .eq('id', agentId)
      .single();

    if (agentRecord) {
      const agentWallet = await getWalletByAgentName(agentRecord.agent_name);
      if (!agentWallet) {
        return { success: false, error: 'Agent does not have a wallet. Register one via POST /api/agents/onboard with a walletAddress.' };
      }
    }

    // Check AP2 mandate if mission requires it
    const missionMetadata = (mission as Record<string, unknown>).metadata as Record<string, unknown> | null;
    if (missionMetadata?.requires_mandate) {
      const mandateId = missionMetadata.mandate_id as string | undefined;
      if (!mandateId) {
        return { success: false, error: 'Mission requires an AP2 mandate but none is configured' };
      }

      const verification = await verifyMandate({
        mandateId,
        amount: BigInt(0), // Task assignment doesn't transfer funds — amount checked at payment time
        merchantAddress: (mission as Record<string, unknown>).creator_address as string,
      });

      if (!verification.valid) {
        return {
          success: false,
          error: `AP2 mandate verification failed: ${verification.errors.join(', ')}`,
        };
      }
    }

    // Assign — conditional on status still being 'pending' to prevent double-assignment
    const { data: assignedRows, error } = await supabaseAdmin
      .from('collaborate_tasks')
      .update({
        assigned_agent_id: agentId,
        assigned_at: new Date().toISOString(),
        status: 'assigned',
      })
      .eq('id', taskId)
      .eq('status', 'pending')
      .select('id');

    if (error) {
      return { success: false, error: 'Failed to assign task' };
    }
    if (!assignedRows || assignedRows.length === 0) {
      return { success: false, error: 'Task is no longer available for assignment' };
    }

    // Trigger webhook (non-blocking)
    const { data: taskDetails } = await supabaseAdmin
      .from('collaborate_tasks')
      .select('title, reward')
      .eq('id', taskId)
      .single();

    triggerWebhook(agentId, 'task.assigned', {
      taskId,
      missionId: task.mission_id,
      title: taskDetails?.title || 'Unknown',
      reward: taskDetails?.reward || '0',
    }).catch(err => console.error('[Webhook] task.assigned trigger failed:', err));

    return { success: true };
  } catch (error) {
    console.error('Error assigning task:', error);
    return {
      success: false,
      error: 'Internal error',
    };
  }
}

/**
 * Complete a task (submit for approval)
 *
 * Tasks must be explicitly assigned by the mission creator before an agent can complete them.
 * This prevents multiple agents from racing for the same task and wasting effort.
 */
export async function completeTask(
  taskId: string,
  agentId: string,
  submissionData?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify task exists
    const { data: task, error: taskError } = await supabaseAdmin
      .from('collaborate_tasks')
      .select('status, assigned_agent_id, mission_id, reward, dependencies')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return { success: false, error: 'Task not found' };
    }

    // Task must be assigned by the creator first — no self-claiming
    if (task.status === 'pending' && !task.assigned_agent_id) {
      return {
        success: false,
        error: 'Task is not assigned yet. The mission creator must assign this task to you first via POST /collaborate/tasks { action: "assign", taskId, agentId }.',
      };
    }

    // Check dependencies are completed
    if (task.dependencies && task.dependencies.length > 0) {
      const { data: deps } = await supabaseAdmin
        .from('collaborate_tasks')
        .select('id, status')
        .in('id', task.dependencies);

      const incomplete = (deps || []).filter((d) => d.status !== 'approved');
      if (incomplete.length > 0) {
        return { success: false, error: 'Task dependencies not completed yet' };
      }
    }

    // Verify task is assigned to this agent
    if (task.assigned_agent_id !== agentId) {
      return { success: false, error: 'Task is not assigned to you' };
    }

    if (!['assigned', 'in_progress'].includes(task.status)) {
      return { success: false, error: 'Task cannot be completed' };
    }

    // Submit task for approval — conditional on status still being 'assigned' or 'in_progress'
    const { data: submittedRows, error } = await supabaseAdmin
      .from('collaborate_tasks')
      .update({
        status: 'submitted',
        submission_data: submissionData || {},
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId)
      .in('status', ['assigned', 'in_progress'])
      .select('id');

    if (error) {
      return { success: false, error: 'Failed to complete task' };
    }
    if (!submittedRows || submittedRows.length === 0) {
      return { success: false, error: 'Task status changed concurrently, please retry' };
    }

    // Notify mission creator that a task was submitted for review
    const { data: missionRow } = await supabaseAdmin
      .from('collaborate_missions')
      .select('creator_address, title')
      .eq('id', task.mission_id)
      .single();

    if (missionRow) {
      const creatorAgentId = await resolveCreatorAgentId(missionRow.creator_address);
      if (creatorAgentId) {
        triggerWebhook(creatorAgentId, 'task.submitted', {
          taskId,
          missionId: task.mission_id,
          missionTitle: missionRow.title,
          workerAgentId: agentId,
          message: 'An agent has submitted a task for your review.',
        });
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error completing task:', error);
    return {
      success: false,
      error: 'Internal error',
    };
  }
}

/**
 * Approve a submitted task.
 * Returns payment instructions for the creator to send USDC directly to the agent.
 */
export async function approveTask(
  taskId: string,
  missionCreatorAddress: string
): Promise<{
  success: boolean;
  error?: string;
  x402?: {
    requirements: {
      x402Version: number;
      scheme: string;
      network: string;
      asset: string;
      payTo: string;
      maxAmountRequired: string;
      description: string;
      expiresAt: number;
    };
    eip712: {
      domain: { name: string; version: string; chainId: number; verifyingContract: string };
      types: { TransferWithAuthorization: Array<{ name: string; type: string }> };
      primaryType: string;
      message: { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: string };
    };
    instructions: string;
  };
}> {
  try {
    // Get task and verify mission ownership
    const { data: task, error: taskError } = await supabaseAdmin
      .from('collaborate_tasks')
      .select('status, mission_id, assigned_agent_id, reward')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return { success: false, error: 'Task not found' };
    }

    const { data: mission } = await supabaseAdmin
      .from('collaborate_missions')
      .select('creator_address, category')
      .eq('id', task.mission_id)
      .single();

    if (!mission || mission.creator_address.toLowerCase() !== missionCreatorAddress.toLowerCase()) {
      return { success: false, error: 'Not authorized to approve this task' };
    }

    if (task.status !== 'submitted') {
      return { success: false, error: 'Task is not pending approval' };
    }

    // Approve task — conditional on status still being 'submitted' to prevent double-approval
    const { data: approvedRows, error } = await supabaseAdmin
      .from('collaborate_tasks')
      .update({ status: 'approved' })
      .eq('id', taskId)
      .eq('status', 'submitted')
      .select('id');

    if (error) {
      return { success: false, error: 'Failed to approve task' };
    }
    if (!approvedRows || approvedRows.length === 0) {
      return { success: false, error: 'Task is no longer pending approval' };
    }

    // Note: Agent stats (jobs_completed, total_earnings) are updated AFTER payment
    // is confirmed on-chain in confirmTaskPayment(), not here at approval time.

    // Build x402 payment requirements for the creator to sign (EIP-3009)
    let x402Data: {
      requirements: {
        x402Version: number; scheme: string; network: string; asset: string;
        payTo: string; maxAmountRequired: string; description: string; expiresAt: number;
      };
      eip712: {
        domain: { name: string; version: string; chainId: number; verifyingContract: string };
        types: { TransferWithAuthorization: Array<{ name: string; type: string }> };
        primaryType: string;
        message: { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: string };
      };
      instructions: string;
    } | undefined;

    if (task.assigned_agent_id && task.reward) {
      const { data: agentApplication } = await supabaseAdmin
        .from('collaborate_applications')
        .select('agreed_rate')
        .eq('mission_id', task.mission_id)
        .eq('agent_id', task.assigned_agent_id)
        .eq('status', 'accepted')
        .single();

      const paymentAmount = agentApplication?.agreed_rate || task.reward;
      const agentWalletAddress = await getWorkerWalletAddress(task.assigned_agent_id);

      if (agentWalletAddress) {
        const rewardAmount = safeParseAmount(paymentAmount);
        const authParams = createEIP3009Authorization(
          missionCreatorAddress as Address,
          agentWalletAddress,
          rewardAmount,
        );

        x402Data = {
          requirements: {
            x402Version: 1,
            scheme: 'exact',
            network: 'base',
            asset: USDC_ADDRESS,
            payTo: agentWalletAddress,
            maxAmountRequired: paymentAmount,
            description: `Payment for task ${taskId}`,
            expiresAt: authParams.message.validBefore,
          },
          eip712: {
            domain: authParams.domain,
            types: authParams.types,
            primaryType: authParams.primaryType,
            message: {
              from: authParams.message.from,
              to: authParams.message.to,
              value: authParams.message.value.toString(),
              validAfter: authParams.message.validAfter.toString(),
              validBefore: authParams.message.validBefore.toString(),
              nonce: authParams.message.nonce,
            },
          },
          instructions: `Sign the eip712 object with your wallet (signTypedData / eth_signTypedData_v4), then POST { "action": "confirm_payment", "taskId": "${taskId}", "paymentPayload": { "x402Version": 1, "scheme": "exact", "network": "base", "payload": { "signature": "0x...", "authorization": { "from": "${missionCreatorAddress}", "to": "${agentWalletAddress}", "value": "${paymentAmount}", "validAfter": "${authParams.message.validAfter}", "validBefore": "${authParams.message.validBefore}", "nonce": "${authParams.message.nonce}" } } } }`,
        };
      }
    }

    // Trigger webhook for task approval (non-blocking)
    if (task.assigned_agent_id) {
      const { data: agentApp } = await supabaseAdmin
        .from('collaborate_applications')
        .select('agreed_rate')
        .eq('mission_id', task.mission_id)
        .eq('agent_id', task.assigned_agent_id)
        .eq('status', 'accepted')
        .single();

      triggerWebhook(task.assigned_agent_id, 'task.approved', {
        taskId,
        missionId: task.mission_id,
        reward: agentApp?.agreed_rate || task.reward,
      }).catch(err => console.error('[Webhook] task.approved trigger failed:', err));
    }

    return { success: true, x402: x402Data };
  } catch (error) {
    console.error('Error approving task:', error);
    return {
      success: false,
      error: 'Internal error',
    };
  }
}

/**
 * Update agent stats when a task is completed
 */
async function updateAgentStatsOnTaskComplete(agentId: string, reward: string): Promise<void> {
  try {
    // Get current agent stats
    const { data: agent, error: fetchError } = await supabaseAdmin
      .from('marketplace_agents')
      .select('jobs_completed, total_earnings')
      .eq('id', agentId)
      .single();

    if (fetchError) {
      console.error(`[Stats] Failed to fetch agent ${agentId}:`, fetchError.message, fetchError.details);
      return;
    }

    if (!agent) {
      console.warn(`[Stats] Agent ${agentId} not found in marketplace_agents - stats not updated`);
      return;
    }

    const currentJobs = agent.jobs_completed || 0;
    let currentEarnings: bigint;
    let taskReward: bigint;

    try {
      currentEarnings = BigInt(agent.total_earnings || '0');
    } catch {
      console.error(`[Stats] Cannot parse total_earnings "${agent.total_earnings}" as BigInt for agent ${agentId}, defaulting to 0`);
      currentEarnings = BigInt(0);
    }

    try {
      taskReward = BigInt(reward);
    } catch {
      console.error(`[Stats] Cannot parse reward "${reward}" as BigInt for agent ${agentId}, defaulting to 0`);
      taskReward = BigInt(0);
    }

    // Update stats
    const { error: updateError } = await supabaseAdmin
      .from('marketplace_agents')
      .update({
        jobs_completed: currentJobs + 1,
        total_earnings: (currentEarnings + taskReward).toString(),
      })
      .eq('id', agentId);

    if (updateError) {
      console.error(`[Stats] Failed to update agent ${agentId}:`, updateError.message, updateError.details);
      return;
    }

    console.log(`[Stats] Updated agent ${agentId}: jobs=${currentJobs + 1}, earnings=${currentEarnings + taskReward}`);
  } catch (error) {
    console.error(`[Stats] Unexpected error updating agent ${agentId}:`, error);
    // Don't fail the task approval if stats update fails
  }
}

// ==========================================
// On-Chain Escrow Confirmation
// ==========================================

/**
 * Look up the wallet address for an assigned agent.
 */
async function getWorkerWalletAddress(agentId: string): Promise<Address | null> {
  const { data: agent } = await supabaseAdmin
    .from('marketplace_agents')
    .select('agent_name')
    .eq('id', agentId)
    .single();

  if (!agent) return null;

  const wallet = await getWalletByAgentName(agent.agent_name);
  return wallet?.accountAddress || null;
}

/**
 * Confirm payment for a task via x402 (EIP-3009 TransferWithAuthorization).
 *
 * Flow:
 * 1. Creator signs EIP-712 typed data (from approveTask response) with their wallet
 * 2. Creator submits the PaymentPayload (signature + authorization) here
 * 3. Platform verifies the signature cryptographically — no trust required
 * 4. Platform settles on-chain via relayer → gets txHash
 * 5. Task marked paid, agent stats updated
 *
 * Plain ERC-20 transfer() txHashes are NOT accepted.
 */
export async function confirmTaskPayment(
  taskId: string,
  paymentPayload: PaymentPayload,
  callerAddress: string
): Promise<{ success: boolean; error?: string; txHash?: string }> {
  try {
    // Get task and mission in parallel
    const { data: task, error: taskError } = await supabaseAdmin
      .from('collaborate_tasks')
      .select('status, mission_id, assigned_agent_id, reward, payment_status')
      .eq('id', taskId)
      .single();

    if (taskError || !task) return { success: false, error: 'Task not found' };
    if (task.payment_status === 'paid') return { success: false, error: 'Task is already paid' };
    if (task.status !== 'approved') return { success: false, error: 'Task must be approved before payment can be confirmed' };
    if (!task.assigned_agent_id) return { success: false, error: 'Task has no assigned agent' };

    const { data: mission } = await supabaseAdmin
      .from('collaborate_missions')
      .select('creator_address, category')
      .eq('id', task.mission_id)
      .single();

    if (!mission || mission.creator_address.toLowerCase() !== callerAddress.toLowerCase()) {
      return { success: false, error: 'Not authorized to confirm payment for this task' };
    }

    // Validate x402 payload structure
    if (!paymentPayload?.payload?.signature || !paymentPayload?.payload?.authorization) {
      return { success: false, error: 'Invalid x402 paymentPayload — must include payload.signature and payload.authorization' };
    }
    if (paymentPayload.x402Version !== 1) {
      return { success: false, error: 'Invalid x402Version — must be 1' };
    }
    if (paymentPayload.scheme !== 'exact') {
      return { success: false, error: 'Invalid scheme — must be "exact"' };
    }
    if (paymentPayload.network !== 'base') {
      return { success: false, error: 'Invalid network — must be "base"' };
    }

    const auth = paymentPayload.payload.authorization;
    const signature = paymentPayload.payload.signature as `0x${string}`;

    // Get expected values from DB (ground truth — not from caller)
    const agentWalletAddress = await getWorkerWalletAddress(task.assigned_agent_id);
    if (!agentWalletAddress) return { success: false, error: 'Agent wallet address not found' };

    const { data: paymentApp } = await supabaseAdmin
      .from('collaborate_applications')
      .select('agreed_rate')
      .eq('mission_id', task.mission_id)
      .eq('agent_id', task.assigned_agent_id)
      .eq('status', 'accepted')
      .single();

    const paymentAmountStr = paymentApp?.agreed_rate || task.reward;
    const expectedAmount = safeParseAmount(paymentAmountStr);

    // Verify authorization fields match DB ground truth
    if (auth.to.toLowerCase() !== agentWalletAddress.toLowerCase()) {
      return { success: false, error: `Payment recipient mismatch — must pay worker at ${agentWalletAddress}` };
    }
    if (auth.from.toLowerCase() !== mission.creator_address.toLowerCase()) {
      return { success: false, error: `Payment sender mismatch — must be signed by mission creator ${mission.creator_address}` };
    }
    const authorizedAmount = BigInt(auth.value);
    if (authorizedAmount < expectedAmount) {
      return { success: false, error: `Authorized amount ${authorizedAmount} is less than required ${expectedAmount}` };
    }

    // Verify validity window
    const now = Math.floor(Date.now() / 1000);
    if (now < Number(auth.validAfter)) return { success: false, error: 'Authorization not yet valid' };
    if (now > Number(auth.validBefore)) return { success: false, error: 'Authorization has expired — request a new approval' };

    // Recover signer from EIP-712 signature (USDC-specific recovery)
    const authParams = createEIP3009Authorization(
      auth.from as Address,
      auth.to as Address,
      BigInt(auth.value),
      USDC_ADDRESS,
      8453,
    );
    // Override nonce and validity with the ones the creator actually signed
    authParams.message.nonce = auth.nonce as `0x${string}`;
    authParams.message.validAfter = Number(auth.validAfter);
    authParams.message.validBefore = Number(auth.validBefore);

    let recoveredSigner: Address;
    try {
      recoveredSigner = await recoverUSDCAuthorizationSignature(authParams, signature);
    } catch {
      return { success: false, error: 'Failed to recover signer from signature — invalid signature format' };
    }

    if (recoveredSigner.toLowerCase() !== mission.creator_address.toLowerCase()) {
      return { success: false, error: `Signature invalid — recovered signer ${recoveredSigner} does not match creator ${mission.creator_address}` };
    }

    // Anti-replay: check nonce hasn't been used
    const { isNonceUsed } = await import('@/lib/x402/nonce-manager');
    const nonceUsed = await isNonceUsed(auth.nonce as string);
    if (nonceUsed) {
      return { success: false, error: 'Nonce already used — replay attack detected' };
    }

    // Settle on-chain via relayer (platform pays gas, creator pays USDC via authorization)
    const { v, r, s } = splitSignature(signature);
    const callData = encodeFunctionData({
      abi: TRANSFER_WITH_AUTHORIZATION_ABI,
      functionName: 'transferWithAuthorization',
      args: [
        auth.from as Address,
        auth.to as Address,
        BigInt(auth.value),
        BigInt(auth.validAfter),
        BigInt(auth.validBefore),
        auth.nonce as `0x${string}`,
        v,
        r,
        s,
      ],
    });

    let txHash: string;
    try {
      txHash = await relayTransaction({
        to: USDC_ADDRESS as Address,
        data: callData as `0x${string}`,
        gas: 150000n,
      });

      // Wait for confirmation
      const receipt = await baseClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      if (receipt.status === 'reverted') {
        return { success: false, error: 'On-chain settlement reverted — authorization may have been used already' };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: `On-chain settlement failed: ${msg}` };
    }

    // Mark nonce used (anti-replay)
    const { markNonceUsed } = await import('@/lib/x402/nonce-manager');
    await markNonceUsed(auth.nonce as string, auth.from);

    // Check txHash hasn't been used for another task (belt-and-suspenders)
    const { data: existingPayment } = await supabaseAdmin
      .from('collaborate_tasks')
      .select('id')
      .eq('payment_tx_hash', txHash)
      .maybeSingle();

    if (existingPayment) {
      return { success: false, error: 'Transaction hash already recorded for another task' };
    }

    // Mark task as paid — conditional on payment_status still being 'pending' to prevent double-payment
    const { data: paidRows, error: updateError } = await supabaseAdmin
      .from('collaborate_tasks')
      .update({
        payment_status: 'paid',
        payment_tx_hash: txHash,
      })
      .eq('id', taskId)
      .eq('payment_status', 'pending')
      .select('id');

    if (updateError) {
      return { success: false, error: 'Failed to update task payment status' };
    }
    if (!paidRows || paidRows.length === 0) {
      return { success: false, error: 'Task payment was already processed' };
    }

    // Update agent stats now that payment is confirmed on-chain
    await updateAgentStatsOnTaskComplete(task.assigned_agent_id, paymentAmountStr || '0');

    // On-chain feedback + sync for task completion (non-blocking)
    // Check if a review already exists for this agent on this mission
    const erc8004Id = await getErc8004AgentId(task.assigned_agent_id);
    if (erc8004Id) {
      let feedbackValue = 70; // Default: "completed and paid" (neutral positive)
      const { data: existingReview } = await supabaseAdmin
        .from('marketplace_reviews')
        .select('rating')
        .eq('agent_id', task.assigned_agent_id)
        .eq('contract_id', task.mission_id)
        .single();
      if (existingReview?.rating) {
        feedbackValue = existingReview.rating * 20; // 1-5 star → 20-100
      }

      const missionCategory = mission?.category || 'other';
      submitFeedbackAndSync({
        marketplaceAgentId: task.assigned_agent_id,
        agentId: BigInt(erc8004Id),
        value: feedbackValue,
        tag1: 'task-complete',
        tag2: missionCategory,
      }).catch(err => console.error('[ERC-8004] Task feedback failed:', err));
    }

    // Trigger payment webhook (non-blocking)
    triggerWebhook(task.assigned_agent_id, 'payment.received', {
      taskId,
      missionId: task.mission_id,
      txHash,
      amount: paymentAmountStr,
      message: 'Payment confirmed on-chain!',
    }).catch(err => console.error('[Webhook] payment.received trigger failed:', err));

    // Check if all tasks are paid → complete mission
    await checkMissionCompletion(task.mission_id);

    return { success: true, txHash };
  } catch (error) {
    console.error('[confirmTaskPayment] Error:', error);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Check if mission is complete
 */
async function checkMissionCompletion(missionId: string): Promise<void> {
  const { data: tasks } = await supabaseAdmin
    .from('collaborate_tasks')
    .select('status, payment_status')
    .eq('mission_id', missionId);

  if (!tasks || tasks.length === 0) return;

  const allApprovedAndPaid = tasks.every(
    (t) => t.status === 'approved' && t.payment_status === 'paid'
  );

  if (allApprovedAndPaid) {
    await supabaseAdmin
      .from('collaborate_missions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', missionId);

    // Notify all team members and the creator about mission completion (non-blocking)
    const [teamResult, missionResult] = await Promise.all([
      supabaseAdmin
        .from('collaborate_applications')
        .select('agent_id')
        .eq('mission_id', missionId)
        .eq('status', 'accepted'),
      supabaseAdmin
        .from('collaborate_missions')
        .select('title, creator_address')
        .eq('id', missionId)
        .single(),
    ]);

    const missionTitle = missionResult.data?.title || 'Unknown';

    if (teamResult.data) {
      for (const member of teamResult.data) {
        triggerWebhook(member.agent_id, 'mission.completed', {
          missionId,
          missionTitle,
          message: 'Mission completed! All tasks approved and paid.',
        }).catch(err => console.error('[Webhook] mission.completed trigger failed:', err));
      }
    }

    // Also notify the creator
    if (missionResult.data?.creator_address) {
      const creatorAgentId = await resolveCreatorAgentId(missionResult.data.creator_address);
      if (creatorAgentId) {
        triggerWebhook(creatorAgentId, 'mission.completed', {
          missionId,
          missionTitle,
          message: 'Mission completed! All tasks have been approved and paid out.',
        }).catch(err => console.error('[Webhook] mission.completed creator trigger failed:', err));
      }
    }
  }
}

/**
 * Activate a mission (transition from active to in_progress)
 */
export async function activateMission(
  missionId: string,
  clientAddress: Address
): Promise<{ success: boolean; error?: string }> {
  // First verify the mission exists and belongs to this user
  const { data: mission } = await supabaseAdmin
    .from('collaborate_missions')
    .select('id, creator_address, status')
    .eq('id', missionId)
    .single();

  if (!mission) {
    return { success: false, error: 'Mission not found' };
  }

  if (mission.creator_address.toLowerCase() !== clientAddress.toLowerCase()) {
    return { success: false, error: 'Not authorized to activate this mission' };
  }

  // Idempotent: if already in_progress, return success
  if (mission.status === 'in_progress') {
    return { success: true };
  }

  if (mission.status !== 'active') {
    return { success: false, error: `Mission cannot be activated — current status is "${mission.status}"` };
  }

  const { data: updated, error } = await supabaseAdmin
    .from('collaborate_missions')
    .update({
      status: 'in_progress',
      started_at: new Date().toISOString()
    })
    .eq('id', missionId)
    .select('id')
    .single();

  if (error || !updated) {
    return { success: false, error: 'Failed to activate mission' };
  }

  return { success: true };
}

/**
 * Accept an application to join a mission
 * Sets BOTH agent_approved and creator_approved to true for backward compatibility
 */
export async function acceptApplication(
  applicationId: string,
  missionCreatorAddress: string,
  agreedRate?: string
): Promise<{ success: boolean; agreedRate?: string; error?: string }> {
  try {
    // Get application and verify mission ownership
    const { data: application, error: appError } = await supabaseAdmin
      .from('collaborate_applications')
      .select('mission_id, status, expires_at, proposed_rate')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return { success: false, error: 'Application not found' };
    }

    const { data: mission } = await supabaseAdmin
      .from('collaborate_missions')
      .select('creator_address, budget')
      .eq('id', application.mission_id)
      .single();

    if (!mission || mission.creator_address.toLowerCase() !== missionCreatorAddress.toLowerCase()) {
      return { success: false, error: 'Not authorized to accept this application' };
    }

    if (application.status !== 'pending') {
      return { success: false, error: 'Application is not pending' };
    }

    // Check if application has expired
    if (application.expires_at && new Date(application.expires_at) < new Date()) {
      // Auto-reject the expired application
      await supabaseAdmin
        .from('collaborate_applications')
        .update({ status: 'rejected', responded_at: new Date().toISOString() })
        .eq('id', applicationId);
      return { success: false, error: 'Application has expired' };
    }

    // Resolve the final agreed rate: explicit counter-offer > worker's proposed rate
    const finalRate = agreedRate || application.proposed_rate || null;

    // Validate agreed rate doesn't exceed mission budget
    if (finalRate) {
      const rateNum = safeParseNumber(finalRate);
      const budgetNum = safeParseNumber(mission.budget || '0');
      if (rateNum > budgetNum) {
        return {
          success: false,
          error: `Agreed rate (${finalRate}) exceeds mission budget (${mission.budget}). Reduce the rate or increase the budget.`,
        };
      }
    }

    // Get agent ID from application before accepting
    const { data: appDetails } = await supabaseAdmin
      .from('collaborate_applications')
      .select('agent_id')
      .eq('id', applicationId)
      .single();

    const now = new Date().toISOString();

    // Accept the application - set BOTH approvals for backward compatibility
    // Lock in the agreed_rate so it's used for payment later
    const { error } = await supabaseAdmin
      .from('collaborate_applications')
      .update({
        status: 'accepted',
        agent_approved: true,
        creator_approved: true,
        agent_approved_at: now,
        creator_approved_at: now,
        responded_at: now,
        agreed_rate: finalRate,
      })
      .eq('id', applicationId);

    if (error) {
      return { success: false, error: 'Failed to accept application' };
    }

    // Auto-activate mission if still accepting applications
    await autoActivateMissionIfNeeded(application.mission_id);

    // Trigger webhook (non-blocking)
    if (appDetails?.agent_id) {
      // Get mission title for context
      const { data: missionDetails } = await supabaseAdmin
        .from('collaborate_missions')
        .select('title')
        .eq('id', application.mission_id)
        .single();

      triggerWebhook(appDetails.agent_id, 'application.accepted', {
        applicationId,
        missionId: application.mission_id,
        missionTitle: missionDetails?.title || 'Unknown',
        agreedRate: finalRate,
        message: `Your application has been accepted! Agreed rate: ${finalRate || 'task reward'}.`,
      }).catch(err => console.error('[Webhook] application.accepted trigger failed:', err));
    }

    return { success: true, agreedRate: finalRate || undefined };
  } catch (error) {
    console.error('Error accepting application:', error);
    return {
      success: false,
      error: 'Internal error',
    };
  }
}

/**
 * Get applications for a mission
 */
export async function getMissionApplications(
  missionId: string
): Promise<Array<{
  id: string;
  agentId: string;
  agentName: string;
  applicationText: string;
  status: string;
  appliedAt: Date;
  agentApproved: boolean;
  creatorApproved: boolean;
  proposedRate: string | null;
  agreedRate: string | null;
  agreedRateCurrency: string;
  expiresAt: Date | null;
  reputation: {
    rating: number | null;
    jobsCompleted: number;
    totalReviews: number;
    totalEarnings: string;
  };
}>> {
  const { data, error } = await supabaseAdmin
    .from('collaborate_applications')
    .select(`
      id,
      agent_id,
      application_text,
      status,
      applied_at,
      agent_approved,
      creator_approved,
      proposed_rate,
      agreed_rate,
      agreed_rate_currency,
      expires_at,
      marketplace_agents(agent_name, rating, jobs_completed, total_reviews, total_earnings)
    `)
    .eq('mission_id', missionId)
    .order('applied_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((app) => {
    const agents = app.marketplace_agents;
    let agentName = 'Unknown';
    let rating: number | null = null;
    let jobsCompleted = 0;
    let totalReviews = 0;
    let totalEarnings = '0';

    if (Array.isArray(agents) && agents.length > 0) {
      const a = agents[0] as { agent_name: string; rating: number | null; jobs_completed: number | null; total_reviews: number | null; total_earnings: string | null };
      agentName = a.agent_name || 'Unknown';
      rating = a.rating;
      jobsCompleted = a.jobs_completed || 0;
      totalReviews = a.total_reviews || 0;
      totalEarnings = a.total_earnings || '0';
    } else if (agents && typeof agents === 'object' && 'agent_name' in agents) {
      const a = agents as unknown as { agent_name: string; rating: number | null; jobs_completed: number | null; total_reviews: number | null; total_earnings: string | null };
      agentName = a.agent_name || 'Unknown';
      rating = a.rating;
      jobsCompleted = a.jobs_completed || 0;
      totalReviews = a.total_reviews || 0;
      totalEarnings = a.total_earnings || '0';
    }

    return {
      id: app.id,
      agentId: app.agent_id,
      agentName,
      applicationText: app.application_text || '',
      status: app.status,
      appliedAt: new Date(app.applied_at),
      agentApproved: app.agent_approved ?? false,
      creatorApproved: app.creator_approved ?? false,
      proposedRate: app.proposed_rate || null,
      agreedRate: app.agreed_rate || null,
      agreedRateCurrency: app.agreed_rate_currency || 'USDC',
      expiresAt: app.expires_at ? new Date(app.expires_at) : null,
      reputation: {
        rating,
        jobsCompleted,
        totalReviews,
        totalEarnings,
      },
    };
  });
}

// ==========================================
// Reject / Cancel Workflows (B1, B2, B3)
// ==========================================

/**
 * Reject a submitted task — moves it back to 'assigned' so the agent can revise (B1)
 */
export async function rejectTask(
  taskId: string,
  creatorAddress: string,
  reason?: string
): Promise<{ success: boolean; error?: string; rejectionCount?: number }> {
  try {
    const { data: task, error: taskError } = await supabaseAdmin
      .from('collaborate_tasks')
      .select('status, mission_id')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return { success: false, error: 'Task not found' };
    }

    // Verify mission ownership
    const { data: mission } = await supabaseAdmin
      .from('collaborate_missions')
      .select('creator_address')
      .eq('id', task.mission_id)
      .single();

    if (!mission || mission.creator_address.toLowerCase() !== creatorAddress.toLowerCase()) {
      return { success: false, error: 'Not authorized to reject this task' };
    }

    if (task.status !== 'submitted') {
      return { success: false, error: 'Only submitted tasks can be rejected' };
    }

    // Get assigned agent and current rejection count before update
    const { data: taskBeforeUpdate } = await supabaseAdmin
      .from('collaborate_tasks')
      .select('assigned_agent_id, title, rejection_count')
      .eq('id', taskId)
      .single();

    const currentRejectionCount = taskBeforeUpdate?.rejection_count || 0;
    const newRejectionCount = currentRejectionCount + 1;

    // Sanitize rejection reason
    const sanitizedReason = reason ? sanitizeInput(reason).trim().slice(0, 1000) : null;

    const { data: rejectedRows, error } = await supabaseAdmin
      .from('collaborate_tasks')
      .update({
        status: 'assigned',
        submission_data: null,
        completed_at: null,
        rejection_reason: sanitizedReason,
        rejection_count: newRejectionCount,
      })
      .eq('id', taskId)
      .eq('status', 'submitted')
      .select('id');

    if (error) {
      return { success: false, error: 'Failed to reject task' };
    }
    if (!rejectedRows || rejectedRows.length === 0) {
      return { success: false, error: 'Task is no longer in a rejectable state' };
    }

    // Trigger webhook (non-blocking)
    if (taskBeforeUpdate?.assigned_agent_id) {
      triggerWebhook(taskBeforeUpdate.assigned_agent_id, 'task.rejected', {
        taskId,
        missionId: task.mission_id,
        title: taskBeforeUpdate.title,
        reason: sanitizedReason,
        rejectionCount: newRejectionCount,
        message: sanitizedReason || 'Task submission rejected. Please revise and resubmit.',
      }).catch(err => console.error('[Webhook] task.rejected trigger failed:', err));
    }

    return { success: true, rejectionCount: newRejectionCount };
  } catch (error) {
    console.error('Error rejecting task:', error);
    return {
      success: false,
      error: 'Internal error',
    };
  }
}

/**
 * Reject an application to join a mission (B2)
 */
export async function rejectApplication(
  applicationId: string,
  creatorAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: application, error: appError } = await supabaseAdmin
      .from('collaborate_applications')
      .select('mission_id, status, agent_id')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return { success: false, error: 'Application not found' };
    }

    const { data: mission } = await supabaseAdmin
      .from('collaborate_missions')
      .select('creator_address, title')
      .eq('id', application.mission_id)
      .single();

    if (!mission || mission.creator_address.toLowerCase() !== creatorAddress.toLowerCase()) {
      return { success: false, error: 'Not authorized to reject this application' };
    }

    if (application.status !== 'pending') {
      return { success: false, error: 'Application is not pending' };
    }

    const { error } = await supabaseAdmin
      .from('collaborate_applications')
      .update({
        status: 'rejected',
        responded_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    if (error) {
      return { success: false, error: 'Failed to reject application' };
    }

    // Trigger webhook (non-blocking)
    if (application.agent_id) {
      triggerWebhook(application.agent_id, 'application.rejected', {
        applicationId,
        missionId: application.mission_id,
        missionTitle: mission.title || 'Unknown',
        message: 'Your application has been rejected.',
      }).catch(err => console.error('[Webhook] application.rejected trigger failed:', err));
    }

    return { success: true };
  } catch (error) {
    console.error('Error rejecting application:', error);
    return {
      success: false,
      error: 'Internal error',
    };
  }
}

/**
 * Hard-delete an untouched mission.
 * Only allowed when zero applications exist — use cancelMission for active ones.
 */
export async function deleteMission(
  missionId: string,
  clientAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: mission, error: missionError } = await supabaseAdmin
      .from('collaborate_missions')
      .select('creator_address, status')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return { success: false, error: 'Mission not found' };
    }

    if (mission.creator_address.toLowerCase() !== clientAddress.toLowerCase()) {
      return { success: false, error: 'Not authorized to delete this mission' };
    }

    // Block hard delete if anyone has applied — use cancel instead
    const { count, error: countError } = await supabaseAdmin
      .from('collaborate_applications')
      .select('id', { count: 'exact', head: true })
      .eq('mission_id', missionId);

    if (countError) {
      return { success: false, error: 'Failed to check mission applications' };
    }

    if (count && count > 0) {
      return {
        success: false,
        error: `Cannot delete: this mission has ${count} application(s). Use action: "cancel" instead to close it without losing history.`,
      };
    }

    const { error } = await supabaseAdmin
      .from('collaborate_missions')
      .delete()
      .eq('id', missionId);

    if (error) {
      return { success: false, error: 'Failed to delete mission' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting mission:', error);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Update a mission's editable fields.
 * Only the creator can update. Only allowed while status is 'recruiting' or 'active'.
 * Budget cannot be lowered below the highest accepted agreedRate.
 */
export async function updateMission(
  missionId: string,
  clientAddress: string,
  updates: {
    title?: string;
    description?: string;
    budget?: string;
    deadline?: string | null;
    category?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: mission, error: missionError } = await supabaseAdmin
      .from('collaborate_missions')
      .select('creator_address, status')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return { success: false, error: 'Mission not found' };
    }

    if (mission.creator_address.toLowerCase() !== clientAddress.toLowerCase()) {
      return { success: false, error: 'Not authorized to update this mission' };
    }

    if (!['recruiting', 'active'].includes(mission.status)) {
      return { success: false, error: `Cannot update a mission with status "${mission.status}"` };
    }

    // If lowering budget, ensure it's not below the highest accepted agreedRate
    if (updates.budget !== undefined) {
      const { data: acceptedApps } = await supabaseAdmin
        .from('collaborate_applications')
        .select('agreed_rate')
        .eq('mission_id', missionId)
        .eq('status', 'accepted');

      if (acceptedApps && acceptedApps.length > 0) {
        const maxAgreed = Math.max(
          ...acceptedApps.map(a => Number(a.agreed_rate ?? 0))
        );
        if (Number(updates.budget) < maxAgreed) {
          return {
            success: false,
            error: `Budget cannot be set below the highest accepted rate (${maxAgreed} atomic USDC)`,
          };
        }
      }
    }

    const patch: Record<string, unknown> = {};
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.budget !== undefined) patch.budget = updates.budget;
    if (updates.deadline !== undefined) patch.deadline = updates.deadline;
    if (updates.category !== undefined) patch.category = updates.category;

    if (Object.keys(patch).length === 0) {
      return { success: false, error: 'No fields to update' };
    }

    const { error } = await supabaseAdmin
      .from('collaborate_missions')
      .update(patch)
      .eq('id', missionId);

    if (error) {
      return { success: false, error: 'Failed to update mission' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating mission:', error);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Cancel a mission.
 * No escrow — just updates DB status.
 */
export async function cancelMission(
  missionId: string,
  clientAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: mission, error: missionError } = await supabaseAdmin
      .from('collaborate_missions')
      .select('creator_address, status')
      .eq('id', missionId)
      .single();

    if (missionError || !mission) {
      return { success: false, error: 'Mission not found' };
    }

    if (mission.creator_address.toLowerCase() !== clientAddress.toLowerCase()) {
      return { success: false, error: 'Not authorized to cancel this mission' };
    }

    if (mission.status === 'completed' || mission.status === 'cancelled') {
      return { success: false, error: `Mission is already "${mission.status}"` };
    }

    // Block cancellation if tasks are actively being worked on
    const { data: activeTasks } = await supabaseAdmin
      .from('collaborate_tasks')
      .select('id, status')
      .eq('mission_id', missionId)
      .in('status', ['assigned', 'in_progress', 'submitted']);

    if (activeTasks && activeTasks.length > 0) {
      return {
        success: false,
        error: `Cannot cancel: ${activeTasks.length} task(s) are in progress. Complete or unassign them first.`,
      };
    }

    const { error } = await supabaseAdmin
      .from('collaborate_missions')
      .update({ status: 'cancelled' })
      .eq('id', missionId);

    if (error) {
      return { success: false, error: 'Failed to cancel mission' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error cancelling mission:', error);
    return {
      success: false,
      error: 'Internal error',
    };
  }
}
