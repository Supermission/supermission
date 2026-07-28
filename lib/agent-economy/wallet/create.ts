/**
 * Server Wallet - Agentic Wallet Registration
 *
 * Platform creates Privy-backed wallets for agents at onboarding.
 * No private keys are ever held by the platform — Privy MPC manages custody.
 * This module provisions wallets via Privy and registers addresses in the DB.
 */

import { Address } from 'viem';
import { PrivyClient } from '@privy-io/node';
import { supabaseAdmin } from '@/lib/supabase/client';
import { CreateWalletRequest, CreateWalletResponse, AgentPolicy } from './types';
import { DEFAULT_POLICY } from '../constants';

/**
 * Provision a new Privy-backed wallet for an agent.
 * Uses the platform's Privy app credentials — agents need no credentials of their own.
 * Returns walletId (Privy internal ID) and walletAddress (0x... on Base).
 */
export async function createPrivyWallet(): Promise<{
  success: boolean;
  walletId?: string;
  walletAddress?: Address;
  error?: string;
}> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    return { success: false, error: 'Privy credentials not configured on platform' };
  }

  try {
    const privy = new PrivyClient({ appId, appSecret });
    const wallet = await privy.wallets().create({ chain_type: 'ethereum' }) as any;

    return {
      success: true,
      walletId: wallet.id,
      walletAddress: wallet.address as Address,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[createPrivyWallet] Failed:', msg);
    return { success: false, error: `Privy wallet creation failed: ${msg}` };
  }
}

/**
 * Sign EIP-712 typed data using an agent's Privy-provisioned wallet.
 * Used by creators to sign x402 payment authorizations without needing
 * the platform's Privy app credentials directly.
 */
export async function signTypedDataWithPrivyWallet(
  walletId: string,
  typedData: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }
): Promise<{ success: boolean; signature?: string; error?: string }> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    return { success: false, error: 'Privy credentials not configured on platform' };
  }

  try {
    const privy = new PrivyClient({ appId, appSecret });
    const result = await (privy.wallets().ethereum() as any).signTypedData(walletId, {
      params: {
        typed_data: {
          domain: typedData.domain,
          types: typedData.types,
          primary_type: typedData.primaryType,
          message: typedData.message,
        },
      },
    });
    return { success: true, signature: result.signature as string };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[signTypedDataWithPrivyWallet] Failed:', msg);
    return { success: false, error: `Signing failed: ${msg}` };
  }
}

/**
 * Validates policy configuration values
 */
function validatePolicyConfig(policy: Partial<AgentPolicy>): string[] {
  const errors: string[] = [];

  if (policy.dailySpendingLimit !== undefined && policy.dailySpendingLimit < 0) {
    errors.push('Daily spending limit cannot be negative');
  }

  if (policy.perTxLimit !== undefined && policy.perTxLimit < 0) {
    errors.push('Per-transaction limit cannot be negative');
  }

  if (
    policy.dailySpendingLimit !== undefined &&
    policy.perTxLimit !== undefined &&
    policy.perTxLimit > policy.dailySpendingLimit
  ) {
    errors.push('Per-transaction limit cannot exceed daily limit');
  }

  if (policy.cooldownSeconds !== undefined && policy.cooldownSeconds < 0) {
    errors.push('Cooldown seconds cannot be negative');
  }

  if (
    policy.requireApprovalAbove !== undefined &&
    policy.requireApprovalAbove !== null &&
    policy.requireApprovalAbove < 0
  ) {
    errors.push('Approval threshold cannot be negative');
  }

  return errors;
}

// Supabase client

/**
 * Register an agent's external wallet address.
 * Agents manage their own private keys — the platform only stores the address.
 */
export async function createAgentWallet(
  request: CreateWalletRequest
): Promise<CreateWalletResponse> {
  try {
    // Validate agent name
    if (!request.agentName || request.agentName.trim().length === 0) {
      return { success: false, error: 'Agent name is required' };
    }

    if (request.agentName.length > 50) {
      return { success: false, error: 'Agent name must be 50 characters or less' };
    }

    // Wallet address is required (agentic-only)
    const walletAddress = request.externalAddress;
    if (!walletAddress) {
      return { success: false, error: 'walletAddress is required. Agents must provide their own wallet address.' };
    }

    // Validate the address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      return { success: false, error: 'Invalid wallet address format' };
    }

    // Check if agent name already exists
    const { data: existing } = await supabaseAdmin
      .from('server_wallets')
      .select('id')
      .eq('agent_name', request.agentName)
      .single();

    if (existing) {
      return { success: false, error: `Agent name "${request.agentName}" is already taken. Please choose a different name.` };
    }

    // Validate policy if provided
    if (request.policy) {
      const policyErrors = validatePolicyConfig(request.policy);
      if (policyErrors.length > 0) {
        return { success: false, error: policyErrors.join(', ') };
      }
    }

    const walletData: { address: Address } = { address: walletAddress };

    // Merge default policy with any custom policy
    const finalPolicy = {
      ...DEFAULT_POLICY,
      ...request.policy,
    };

    // Store wallet in server_wallets (single source of truth)
    const { data: serverWallet, error: serverWalletError } = await supabaseAdmin
      .from('server_wallets')
      .insert({
        owner_address: (request.ownerAddress || walletData.address).toLowerCase(),
        agent_name: request.agentName,
        account_address: walletData.address,
        encrypted_private_key: 'AGENTIC',
        wallet_type: 'agentic',
        privy_wallet_id: request.privyWalletId || null,
        daily_limit: finalPolicy.dailySpendingLimit?.toString() || '0',
        spent_today: '0',
        is_active: true,
      })
      .select('id')
      .single();

    if (serverWalletError) {
      // Unique constraint violation on agent_name or account_address
      if (serverWalletError.code === '23505') {
        const msg = serverWalletError.message || '';
        if (msg.includes('account_address')) {
          return { success: false, error: `Wallet address "${request.externalAddress}" is already registered to another agent. Each agent needs a unique wallet address.` };
        }
        return { success: false, error: `Agent name "${request.agentName}" is already taken. Please choose a different name.` };
      }
      console.error('Failed to create wallet entry:', serverWalletError);
      return { success: false, error: 'Failed to store wallet record' };
    }

    // Insert policy records
    const policies = [];

    if (finalPolicy.dailySpendingLimit || finalPolicy.perTxLimit) {
      policies.push({
        wallet_id: serverWallet.id,
        policy_type: 'spending_limit',
        policy_config: {
          daily_limit: finalPolicy.dailySpendingLimit?.toString() || '0',
          per_tx_limit: finalPolicy.perTxLimit?.toString() || '0',
          require_approval_above: finalPolicy.requireApprovalAbove?.toString() || null,
        },
        is_active: true,
      });
    }

    if (finalPolicy.allowedRecipients && finalPolicy.allowedRecipients.length > 0) {
      policies.push({
        wallet_id: serverWallet.id,
        policy_type: 'allowlist',
        policy_config: { addresses: finalPolicy.allowedRecipients },
        is_active: true,
      });
    }

    if (finalPolicy.blockedRecipients && finalPolicy.blockedRecipients.length > 0) {
      policies.push({
        wallet_id: serverWallet.id,
        policy_type: 'blocklist',
        policy_config: { addresses: finalPolicy.blockedRecipients },
        is_active: true,
      });
    }

    if (finalPolicy.cooldownSeconds && finalPolicy.cooldownSeconds > 0) {
      policies.push({
        wallet_id: serverWallet.id,
        policy_type: 'cooldown',
        policy_config: { seconds: finalPolicy.cooldownSeconds },
        is_active: true,
      });
    }

    if (finalPolicy.allowedTokens && finalPolicy.allowedTokens.length > 0) {
      policies.push({
        wallet_id: serverWallet.id,
        policy_type: 'token_allowlist',
        policy_config: { tokens: finalPolicy.allowedTokens },
        is_active: true,
      });
    }

    if (policies.length > 0) {
      await supabaseAdmin.from('wallet_policies').insert(policies);
    }

    return {
      success: true,
      walletId: request.agentName,
      agentKey: request.agentName, // For CDP, the agent name IS the key to access the wallet
      accountAddress: walletData.address,
    };
  } catch (error) {
    console.error('Error creating agent wallet:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get wallet by agent name
 */
export async function getWalletByAgentName(agentName: string) {
  const { data } = await supabaseAdmin
    .from('server_wallets')
    .select('agent_name, account_address, created_at')
    .eq('agent_name', agentName)
    .single();

  if (!data) return null;

  return {
    id: data.agent_name,
    agentName: data.agent_name,
    accountAddress: data.account_address as Address,
    networkId: 'base',
    createdAt: new Date(data.created_at),
  };
}

/**
 * Get wallet by on-chain address
 */
export async function getWalletByAddress(address: Address) {
  const { data } = await supabaseAdmin
    .from('server_wallets')
    .select('agent_name, account_address, created_at')
    .eq('account_address', address)
    .single();

  if (!data) return null;

  return {
    id: data.agent_name,
    agentName: data.agent_name,
    accountAddress: data.account_address as Address,
    networkId: 'base',
    createdAt: new Date(data.created_at),
  };
}

/**
 * Get wallet by ID (agent_id)
 */
export async function getWalletById(walletId: string) {
  return getWalletByAgentName(walletId);
}

/**
 * Look up a server_wallet by agent name, with fallback to account_address.
 * Handles old wallets created with UUID names that can only be found by address.
 */
async function findServerWallet(agentNameOrAddress: string): Promise<{ id: string } | null> {
  // Try by agent_name first
  const { data: byName } = await supabaseAdmin
    .from('server_wallets')
    .select('id')
    .eq('agent_name', agentNameOrAddress)
    .single();

  if (byName) return byName;

  // Fallback: try by account_address (handles old/orphaned wallets)
  const { data: byAddress } = await supabaseAdmin
    .from('server_wallets')
    .select('id')
    .eq('account_address', agentNameOrAddress)
    .single();

  return byAddress || null;
}

/**
 * Get wallet policy (from server_wallets/wallet_policies)
 */
export async function getWalletPolicy(agentName: string): Promise<AgentPolicy | null> {
  // First get the server_wallet entry (with address fallback)
  const serverWallet = await findServerWallet(agentName);

  if (!serverWallet) {
    return null;
  }

  // Get all policies for this wallet
  const { data: policies, error } = await supabaseAdmin
    .from('wallet_policies')
    .select('*')
    .eq('wallet_id', serverWallet.id)
    .eq('is_active', true)
    .limit(50);

  if (error || !policies || policies.length === 0) {
    return null;
  }

  // Aggregate policies into a single object
  const aggregated: AgentPolicy = {
    id: policies[0].id,
    walletId: serverWallet.id,
    dailySpendingLimit: BigInt(0),
    perTxLimit: BigInt(0),
    allowedRecipients: [],
    blockedRecipients: [],
    allowedTokens: [],
    requireApprovalAbove: null,
    cooldownSeconds: 0,
    updatedAt: new Date(policies[0].updated_at),
  };

  for (const policy of policies) {
    const config = policy.policy_config || {};

    switch (policy.policy_type) {
      case 'spending_limit':
        if (config.daily_limit) aggregated.dailySpendingLimit = BigInt(config.daily_limit);
        if (config.per_tx_limit) aggregated.perTxLimit = BigInt(config.per_tx_limit);
        if (config.require_approval_above) {
          aggregated.requireApprovalAbove = BigInt(config.require_approval_above);
        }
        break;
      case 'allowlist':
        if (config.addresses) aggregated.allowedRecipients = config.addresses as Address[];
        break;
      case 'blocklist':
        if (config.addresses) aggregated.blockedRecipients = config.addresses as Address[];
        break;
      case 'cooldown':
        if (config.seconds) aggregated.cooldownSeconds = config.seconds;
        break;
      case 'token_allowlist':
        if (config.tokens) aggregated.allowedTokens = config.tokens as Address[];
        break;
    }

    const policyUpdated = new Date(policy.updated_at);
    if (policyUpdated > aggregated.updatedAt!) {
      aggregated.updatedAt = policyUpdated;
    }
  }

  return aggregated;
}

/**
 * Update wallet policy
 */
export async function updateWalletPolicy(
  agentName: string,
  updates: Partial<AgentPolicy>
): Promise<{ success: boolean; error?: string }> {
  const errors = validatePolicyConfig(updates);
  if (errors.length > 0) {
    return { success: false, error: errors.join(', ') };
  }

  // Get server_wallet ID (with address fallback for old wallets)
  const serverWallet = await findServerWallet(agentName);

  if (!serverWallet) {
    return { success: false, error: 'Wallet not found' };
  }

  const walletId = serverWallet.id;

  // Update spending_limit policy if relevant fields changed
  if (
    updates.dailySpendingLimit !== undefined ||
    updates.perTxLimit !== undefined ||
    updates.requireApprovalAbove !== undefined
  ) {
    const config: Record<string, unknown> = {};
    if (updates.dailySpendingLimit !== undefined) {
      config.daily_limit = updates.dailySpendingLimit.toString();
    }
    if (updates.perTxLimit !== undefined) {
      config.per_tx_limit = updates.perTxLimit.toString();
    }
    if (updates.requireApprovalAbove !== undefined) {
      config.require_approval_above = updates.requireApprovalAbove?.toString() || null;
    }

    // Check if policy exists
    const { data: existingPolicy } = await supabaseAdmin
      .from('wallet_policies')
      .select('id')
      .eq('wallet_id', walletId)
      .eq('policy_type', 'spending_limit')
      .single();

    if (existingPolicy) {
      // Update existing policy by merging config
      const { data: currentPolicy } = await supabaseAdmin
        .from('wallet_policies')
        .select('policy_config')
        .eq('id', existingPolicy.id)
        .single();

      await supabaseAdmin
        .from('wallet_policies')
        .update({
          policy_config: { ...(currentPolicy?.policy_config || {}), ...config },
        })
        .eq('id', existingPolicy.id);
    } else {
      // Insert new policy
      await supabaseAdmin.from('wallet_policies').insert({
        wallet_id: walletId,
        policy_type: 'spending_limit',
        policy_config: config,
        is_active: true,
      });
    }

    // Also update daily_limit on server_wallets
    if (updates.dailySpendingLimit !== undefined) {
      await supabaseAdmin
        .from('server_wallets')
        .update({ daily_limit: updates.dailySpendingLimit.toString() })
        .eq('id', walletId);
    }
  }

  // Update allowlist policy
  if (updates.allowedRecipients !== undefined) {
    const { data: existingPolicy } = await supabaseAdmin
      .from('wallet_policies')
      .select('id')
      .eq('wallet_id', walletId)
      .eq('policy_type', 'allowlist')
      .single();

    if (existingPolicy) {
      await supabaseAdmin
        .from('wallet_policies')
        .update({ policy_config: { addresses: updates.allowedRecipients } })
        .eq('id', existingPolicy.id);
    } else {
      await supabaseAdmin.from('wallet_policies').insert({
        wallet_id: walletId,
        policy_type: 'allowlist',
        policy_config: { addresses: updates.allowedRecipients },
        is_active: true,
      });
    }
  }

  // Update blocklist policy
  if (updates.blockedRecipients !== undefined) {
    const { data: existingPolicy } = await supabaseAdmin
      .from('wallet_policies')
      .select('id')
      .eq('wallet_id', walletId)
      .eq('policy_type', 'blocklist')
      .single();

    if (existingPolicy) {
      await supabaseAdmin
        .from('wallet_policies')
        .update({ policy_config: { addresses: updates.blockedRecipients } })
        .eq('id', existingPolicy.id);
    } else {
      await supabaseAdmin.from('wallet_policies').insert({
        wallet_id: walletId,
        policy_type: 'blocklist',
        policy_config: { addresses: updates.blockedRecipients },
        is_active: true,
      });
    }
  }

  // Update token_allowlist policy
  if (updates.allowedTokens !== undefined) {
    const { data: existingPolicy } = await supabaseAdmin
      .from('wallet_policies')
      .select('id')
      .eq('wallet_id', walletId)
      .eq('policy_type', 'token_allowlist')
      .single();

    if (existingPolicy) {
      await supabaseAdmin
        .from('wallet_policies')
        .update({ policy_config: { tokens: updates.allowedTokens } })
        .eq('id', existingPolicy.id);
    } else {
      await supabaseAdmin.from('wallet_policies').insert({
        wallet_id: walletId,
        policy_type: 'token_allowlist',
        policy_config: { tokens: updates.allowedTokens },
        is_active: true,
      });
    }
  }

  // Update cooldown policy
  if (updates.cooldownSeconds !== undefined) {
    const { data: existingPolicy } = await supabaseAdmin
      .from('wallet_policies')
      .select('id')
      .eq('wallet_id', walletId)
      .eq('policy_type', 'cooldown')
      .single();

    if (existingPolicy) {
      await supabaseAdmin
        .from('wallet_policies')
        .update({ policy_config: { seconds: updates.cooldownSeconds } })
        .eq('id', existingPolicy.id);
    } else {
      await supabaseAdmin.from('wallet_policies').insert({
        wallet_id: walletId,
        policy_type: 'cooldown',
        policy_config: { seconds: updates.cooldownSeconds },
        is_active: true,
      });
    }
  }

  return { success: true };
}
