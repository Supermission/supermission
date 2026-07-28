/**
 * Agent Database Operations
 * CRUD operations for marketplace_agents (unified table), deliverables, and payments
 *
 * Column mapping (old agent_profiles → marketplace_agents):
 *   name         → agent_name
 *   address      → wallet_address
 *   bio          → description
 *   pricing_per_task → hourly_rate
 *   created_at   → registered_at
 *   All others   → same name (added via migration 031)
 */

import { supabaseAdmin } from './client';
import type { Address } from 'viem';

// ============================================================================
// TYPES
// ============================================================================

interface AgentResourceBodyParams {
  key: string;
  type: string;
  label: string;
  required: boolean;
  description: string
}

export interface AgentResource {
  id: string;
  name: string;
  route: string;
  short_description?: string;
  pricing_per_task: number;
  body_params: AgentResourceBodyParams[]
}

export interface AgentProfile {
  id: string;
  name: string;
  address: Address;
  owner_address: Address;
  capabilities: string[];
  agent_type?: 'ai' | 'human' | 'hybrid';

  pricing_per_task?: number;
  bio?: string;
  avatar_url?: string;
  endpoint_url?: string;
  endpoint_status?: 'active' | 'inactive' | 'error';
  erc8004_agent_id?: string;
  created_at?: string;
  updated_at?: string;

  resources?: AgentResource[];
}

export interface Deliverable {
  id?: string;
  mission_id: string;
  agent_id: string;
  ipfs_hash: string;
  file_type?: string;
  file_size?: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface PaymentTransaction {
  id?: string;
  mission_id?: string;
  from_address: Address;
  to_address: Address;
  amount: number;
  token_address: Address;
  tx_hash: string;
  purpose?: 'mission_payment' | 'agent_to_agent' | 'bounty_payout' | 'escrow_release';
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface CreateAgentParams {
  name: string;
  address: Address;
  capabilities: string[];
  agentType?: 'ai' | 'human' | 'hybrid';
  pricingPerTask?: number;
  bio?: string;
  avatarUrl?: string;
  endpointUrl?: string;
}

// ============================================================================
// Helpers: map marketplace_agents row → AgentProfile shape
// ============================================================================

function rowToAgentProfile(row: Record<string, unknown>): AgentProfile {
  return {
    id: row.id as string,
    name: (row.agent_name as string) ?? '',
    address: (row.wallet_address as Address) ?? ('0x' as Address),
    owner_address: (row.owner_address as Address) ?? (row.wallet_address as Address) ?? ('0x' as Address),
    capabilities: (row.capabilities as string[]) ?? [],
    agent_type: (row.agent_type as AgentProfile['agent_type']) ?? 'ai',
    pricing_per_task: row.hourly_rate ? parseFloat(row.hourly_rate as string) : undefined,
    bio: (row.description as string) ?? undefined,
    avatar_url: (row.avatar_url as string) ?? undefined,
    endpoint_url: (row.endpoint_url as string) ?? undefined,
    endpoint_status: (row.endpoint_status as AgentProfile['endpoint_status']) ?? undefined,
    erc8004_agent_id: (row.erc8004_agent_id as string) ?? undefined,
    created_at: (row.registered_at as string) ?? undefined,
    updated_at: (row.updated_at as string) ?? undefined,
    resources: (row.resources as AgentResource[]) ?? undefined,
  };
}

// ============================================================================
// AGENT PROFILES (backed by marketplace_agents)
// ============================================================================

/**
 * Create agent profile
 */
export async function createAgent(params: CreateAgentParams): Promise<AgentProfile> {
  const { data, error } = await supabaseAdmin
    .from('marketplace_agents')
    .insert([{
      agent_name: params.name,
      wallet_address: params.address,
      capabilities: params.capabilities,
      agent_type: params.agentType ?? 'ai',
      hourly_rate: params.pricingPerTask?.toString() ?? '0',
      description: params.bio,
      avatar_url: params.avatarUrl,
      endpoint_url: params.endpointUrl,
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create agent: ${error.message}`);
  return rowToAgentProfile(data);
}

/**
 * Get agent by ID
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAgent(agentId: string): Promise<AgentProfile | null> {
  // Skip the query if agentId isn't a valid UUID — Postgres will throw
  // "invalid input syntax for type uuid" otherwise.
  if (!UUID_RE.test(agentId)) return null;

  const { data, error } = await supabaseAdmin
    .from('marketplace_agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get agent: ${error.message}`);
  }

  return rowToAgentProfile(data);
}

/**
 * Get agent by address
 */
export async function getAgentByAddress(address: Address): Promise<AgentProfile | null> {
  const { data, error } = await supabaseAdmin
    .from('marketplace_agents')
    .select('*')
    .eq('wallet_address', address)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get agent by address: ${error.message}`);
  }

  return rowToAgentProfile(data);
}

/**
 * Get agent by ERC8004 agent ID (on-chain NFT ID)
 */
export async function getAgentByErc8004Id(erc8004AgentId: string): Promise<AgentProfile | null> {
  const { data, error } = await supabaseAdmin
    .from('marketplace_agents')
    .select('*')
    .eq('erc8004_agent_id', erc8004AgentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get agent by ERC8004 ID: ${error.message}`);
  }

  return rowToAgentProfile(data);
}

/**
 * Search agents by capability
 */
export async function getAgentsByCapability(
  capability: string,
  options?: {
    minReputation?: number;
    limit?: number;
  }
): Promise<AgentProfile[]> {
  let query = supabaseAdmin
    .from('marketplace_agents')
    .select('*')
    .contains('capabilities', [capability])
    .neq('erc8004_agent_id', '624'); // Exclude Research AI (deprecated)

  if (options?.minReputation) {
    query = query.gte('rating', options.minReputation / 20); // Convert 0-100 to 0-5
  }

  query = query
    .order('rating', { ascending: false })
    .limit(options?.limit || 20);

  const { data, error } = await query;

  if (error) throw new Error(`Failed to search agents: ${error.message}`);
  return (data || []).map(rowToAgentProfile);
}

/**
 * Get all agents
 */
export async function getAllAgents(limit = 100): Promise<AgentProfile[]> {
  const { data, error } = await supabaseAdmin
    .from('marketplace_agents')
    .select('*')
    .neq('erc8004_agent_id', '624') // Exclude Research AI (deprecated)
    .order('registered_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to get all agents: ${error.message}`);
  return (data || []).map(rowToAgentProfile);
}

/**
 * Ensure agent exists - creates if not found
 * Used for self-registering agents on first use
 */
export async function ensureAgentExists(params: {
  id: string;
  name: string;
  address: Address;
  capabilities: string[];
  agentType?: 'ai' | 'human' | 'hybrid';
  pricingPerTask?: number;
  bio?: string;
  avatarUrl?: string;
  endpointUrl?: string;
  erc8004AgentId?: string;
}): Promise<AgentProfile> {
  // First try to get existing agent by endpoint_url (unique per agent)
  if (params.endpointUrl) {
    const { data: existingByEndpoint } = await supabaseAdmin
      .from('marketplace_agents')
      .select('*')
      .eq('endpoint_url', params.endpointUrl)
      .single();

    if (existingByEndpoint) {
      return rowToAgentProfile(existingByEndpoint);
    }
  }

  // Agent doesn't exist, create it
  const { data, error } = await supabaseAdmin
    .from('marketplace_agents')
    .insert([{
      agent_name: params.name,
      wallet_address: params.address,
      capabilities: params.capabilities,
      agent_type: params.agentType || 'ai',
      hourly_rate: params.pricingPerTask?.toString() ?? '0',
      description: params.bio,
      avatar_url: params.avatarUrl,
      endpoint_url: params.endpointUrl,
      erc8004_agent_id: params.erc8004AgentId,
    }])
    .select()
    .single();

  if (error) throw new Error(`Failed to create agent: ${error.message}`);
  console.log(`[ensureAgentExists] Auto-registered agent: ${params.name} (${data.id})`);
  return rowToAgentProfile(data);
}


// ============================================================================
// DELIVERABLES
// ============================================================================

/**
 * Create deliverable record
 */
export async function createDeliverable(params: Omit<Deliverable, 'id' | 'created_at'>): Promise<Deliverable> {
  const { data, error } = await supabaseAdmin
    .from('deliverables')
    .insert([params])
    .select()
    .single();

  if (error) throw new Error(`Failed to create deliverable: ${error.message}`);
  return data as Deliverable;
}

/**
 * Get deliverables for mission
 */
export async function getMissionDeliverables(missionId: string): Promise<Deliverable[]> {
  const { data, error } = await supabaseAdmin
    .from('deliverables')
    .select('*')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to get mission deliverables: ${error.message}`);
  return data as Deliverable[];
}

/**
 * Get deliverables by agent
 */
export async function getAgentDeliverables(agentId: string, limit = 50): Promise<Deliverable[]> {
  const { data, error } = await supabaseAdmin
    .from('deliverables')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to get agent deliverables: ${error.message}`);
  return data as Deliverable[];
}

// ============================================================================
// PAYMENT TRANSACTIONS
// ============================================================================

/**
 * Record payment transaction
 */
export async function recordPayment(params: Omit<PaymentTransaction, 'id' | 'timestamp'>): Promise<PaymentTransaction> {
  const { data, error } = await supabaseAdmin
    .from('payment_transactions')
    .insert([params])
    .select()
    .single();

  if (error) throw new Error(`Failed to record payment: ${error.message}`);
  return data as PaymentTransaction;
}

/**
 * Get payments for mission
 */
export async function getMissionPayments(missionId: string): Promise<PaymentTransaction[]> {
  const { data, error } = await supabaseAdmin
    .from('payment_transactions')
    .select('*')
    .eq('mission_id', missionId)
    .order('timestamp', { ascending: true });

  if (error) throw new Error(`Failed to get mission payments: ${error.message}`);
  return data as PaymentTransaction[];
}

/**
 * Get payments by agent (sent or received)
 */
export async function getAgentPayments(
  agentAddress: Address,
  options?: {
    type?: 'sent' | 'received';
    limit?: number;
  }
): Promise<PaymentTransaction[]> {
  let query = supabaseAdmin.from('payment_transactions').select('*');

  if (options?.type === 'sent') {
    query = query.eq('from_address', agentAddress);
  } else if (options?.type === 'received') {
    query = query.eq('to_address', agentAddress);
  } else {
    query = query.or(`from_address.eq.${agentAddress},to_address.eq.${agentAddress}`);
  }

  query = query
    .order('timestamp', { ascending: false })
    .limit(options?.limit || 50);

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get agent payments: ${error.message}`);
  return data as PaymentTransaction[];
}

/**
 * Get payment by transaction hash
 */
export async function getPaymentByTxHash(txHash: string): Promise<PaymentTransaction | null> {
  const { data, error } = await supabaseAdmin
    .from('payment_transactions')
    .select('*')
    .eq('tx_hash', txHash)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get payment by tx hash: ${error.message}`);
  }

  return data as PaymentTransaction;
}
