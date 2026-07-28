/**
 * ERC-8004 Integration - Agent Registration
 * Uses real ERC-8004 contracts on Base mainnet
 */

import {
  Address,
  decodeEventLog,
  encodeFunctionData,
} from 'viem';
import { baseClient } from '@/lib/viem/clients';
import { relayTransaction } from '@/lib/server-wallets/relayer';
import { supabaseAdmin } from '@/lib/supabase/client';


import {
  ERC8004_CONTRACTS,
  IDENTITY_REGISTRY_ABI,
  CHAIN_CONFIG,
  getGlobalAgentId,
} from './contracts';

// ==========================================
// Types (re-exported from canonical source)
// ==========================================

export type {
  ERC8004RegisterAgentRequest as RegisterAgentRequest,
  RegisterAgentResponse,
  ERC8004OnChainAgent as ERC8004Agent,
} from '../types';
import type {
  ERC8004RegisterAgentRequest as RegisterAgentRequest,
  RegisterAgentResponse,
  ERC8004OnChainAgent as ERC8004Agent,
} from '../types';

// ==========================================
// Registration File Generation
// ==========================================

/**
 * Generate an ERC-8004 compliant registration file JSON.
 * Returns a data URI (base64 encoded).
 */
export function generateRegistrationFile(agent: {
  name: string;
  description: string;
  capabilities: string[];
  agentId?: string;
}): string {
  const registrationFile: Record<string, unknown> = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: agent.name,
    description: agent.description,
    services: [
      {
        name: 'supermission',
        endpoint: `https://supermission.fun/api/agent-economy/marketplace/list?name=${encodeURIComponent(agent.name)}`,
      },
    ],
    supportedTrust: ['reputation'],
    active: true,
    x402Support: true,
  };

  if (agent.agentId) {
    registrationFile.registrations = [
      {
        agentId: parseInt(agent.agentId),
        agentRegistry: `eip155:8453:${ERC8004_CONTRACTS.identityRegistry}`,
      },
    ];
  }

  const json = JSON.stringify(registrationFile);
  const b64 = Buffer.from(json).toString('base64');
  return `data:application/json;base64,${b64}`;
}

// ==========================================
// On-Chain Registration
// ==========================================

/**
 * Build unsigned transaction instructions for registering an agent on-chain.
 * Agents sign and submit the transaction with their own agentic wallet.
 */
export function buildRegisterAgentTx(
  request: RegisterAgentRequest
): {
  to: Address;
  data: `0x${string}`;
  value: bigint;
  description: string;
  agentURI: string;
} {
  const agentURI = generateRegistrationFile({
    name: request.name,
    description: request.description,
    capabilities: request.capabilities,
  });

  const data = encodeFunctionData({
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: [agentURI],
  });

  return {
    to: ERC8004_CONTRACTS.identityRegistry,
    data,
    value: 0n,
    description: `Register agent "${request.name}" on ERC-8004 Identity Registry`,
    agentURI,
  };
}

/**
 * Verify an on-chain agent registration and extract the agentId.
 * Called after the agent submits the register transaction.
 */
export async function verifyAgentRegistration(
  txHash: string
): Promise<RegisterAgentResponse> {
  try {
    const receipt = await baseClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: 60_000,
    });

    if (receipt.status !== 'success') {
      return { success: false, error: 'Transaction failed' };
    }

    const agentId = parseAgentIdFromReceipt(receipt);
    if (!agentId) {
      return { success: false, error: 'Failed to parse agent ID from receipt' };
    }

    const globalAgentId = getGlobalAgentId(
      CHAIN_CONFIG.base.chainId,
      ERC8004_CONTRACTS.identityRegistry,
      agentId
    );

    return {
      success: true,
      agentId,
      globalAgentId,
      txHash,
    };
  } catch (error) {
    console.error('[ERC-8004] Error verifying registration:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Register an agent on-chain via the platform relayer (Privy Server Wallet).
 * The relayer pays gas on Base (~$0.001 per registration).
 * Requires PRIVY_APP_SECRET env var.
 */
export async function registerAgentOnChain(
  request: RegisterAgentRequest
): Promise<RegisterAgentResponse> {
  if (!process.env.PRIVY_APP_SECRET) {
    return {
      success: false,
      error: 'PRIVY_APP_SECRET not configured. On-chain registration skipped.',
    };
  }

  try {
    const config = CHAIN_CONFIG.base;

    // Build the registration data (agentURI + contract call)
    const txData = buildRegisterAgentTx(request);

    // Submit via Privy server wallet relayer
    const txHash = await relayTransaction({
      to: txData.to,
      data: txData.data,
      value: txData.value,
    });

    console.log(`[ERC-8004] Tx submitted: ${txHash}`);

    // Wait for confirmation
    const receipt = await baseClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });

    if (receipt.status !== 'success') {
      return { success: false, error: 'Registration transaction reverted' };
    }

    // Parse the agentId from the Registered event
    const agentId = parseAgentIdFromReceipt(receipt);
    if (!agentId) {
      return { success: false, error: 'Transaction succeeded but could not parse agentId from logs' };
    }

    const globalAgentId = getGlobalAgentId(
      config.chainId,
      ERC8004_CONTRACTS.identityRegistry,
      agentId
    );

    // Verify on-chain state — confirm the token actually exists and the owner matches
    try {
      const owner = await baseClient.readContract({
        address: ERC8004_CONTRACTS.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'ownerOf',
        args: [BigInt(agentId)],
      });
      if ((owner as string).toLowerCase() !== request.walletAddress.toLowerCase()) {
        console.warn(`[ERC-8004] On-chain owner mismatch: got ${owner}, expected ${request.walletAddress}`);
        return { success: false, error: `Registration owner mismatch on-chain (got ${owner})` };
      }
    } catch (verifyErr) {
      // Non-fatal: token may not be indexed yet; log and continue
      console.warn('[ERC-8004] Post-registration state verify failed (non-fatal):', verifyErr);
    }

    return {
      success: true,
      agentId,
      globalAgentId,
      txHash,
    };
  } catch (error) {
    console.error('[ERC-8004] Registration error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during on-chain registration',
    };
  }
}

/**
 * Parse agentId (uint256) from the Registered event in transaction receipt.
 */
function parseAgentIdFromReceipt(receipt: {
  logs: Array<{ topics: readonly string[]; data: string; address: string }>;
}): string | null {
  const registryAddress = ERC8004_CONTRACTS.identityRegistry.toLowerCase();

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== registryAddress) continue;

    try {
      const decoded = decodeEventLog({
        abi: IDENTITY_REGISTRY_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
      });

      if (decoded.eventName === 'Registered') {
        const args = decoded.args as { agentId: bigint };
        return args.agentId.toString();
      }
    } catch {
      // Not our event, continue
    }
  }

  return null;
}

// ==========================================
// On-Chain Read Functions
// ==========================================

/**
 * Get agent info from chain via ERC-721 standard functions.
 */
export async function getAgentOnChain(agentId: string): Promise<ERC8004Agent | null> {
  try {
    const tokenId = BigInt(agentId);

    const [owner, uri] = await Promise.all([
      baseClient.readContract({
        address: ERC8004_CONTRACTS.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'ownerOf',
        args: [tokenId],
      }),
      baseClient.readContract({
        address: ERC8004_CONTRACTS.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'tokenURI',
        args: [tokenId],
      }),
    ]);

    return {
      agentId,
      owner: owner as Address,
      agentURI: uri as string,
    };
  } catch (error) {
    console.error('[ERC-8004] Error fetching agent from chain:', error);
    return null;
  }
}

/**
 * Get the wallet address associated with an ERC-8004 agent.
 */
export async function getAgentWallet(agentId: string): Promise<Address | null> {
  try {
    const wallet = await baseClient.readContract({
      address: ERC8004_CONTRACTS.identityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'getAgentWallet',
      args: [BigInt(agentId)],
    });

    return wallet as Address;
  } catch (error) {
    console.error('[ERC-8004] Error fetching agent wallet:', error);
    return null;
  }
}

/**
 * Build unsigned tx to update the agent URI on-chain.
 * Agent signs and submits with their own wallet.
 */
export function buildUpdateAgentURITx(
  agentId: string,
  newURI: string
): { to: Address; data: `0x${string}`; value: bigint; description: string } {
  const data = encodeFunctionData({
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'setAgentURI',
    args: [BigInt(agentId), newURI],
  });

  return {
    to: ERC8004_CONTRACTS.identityRegistry,
    data,
    value: 0n,
    description: `Update URI for agent #${agentId} on ERC-8004 Identity Registry`,
  };
}

// ==========================================
// Supabase Cache Helpers
// ==========================================

/**
 * Cache an on-chain registration in Supabase.
 */
export async function cacheRegistration(params: {
  marketplaceAgentId: string;
  erc8004AgentId: string;
  globalAgentId: string;
  agentURI: string;
  registrationTxHash: string;
  ownerAddress: string;
}): Promise<void> {
  try {
    // Insert into erc8004_identities
    const { data: identity, error: identityError } = await supabaseAdmin
      .from('erc8004_identities')
      .insert({
        marketplace_agent_id: params.marketplaceAgentId,
        erc8004_agent_id: parseInt(params.erc8004AgentId),
        chain_id: 8453,
        registry_address: ERC8004_CONTRACTS.identityRegistry,
        global_agent_id: params.globalAgentId,
        agent_uri: params.agentURI,
        registration_tx_hash: params.registrationTxHash,
        owner_address: params.ownerAddress,
      })
      .select('id')
      .single();

    if (identityError) {
      console.error('[ERC-8004] Failed to cache identity:', identityError);
      return;
    }

    // Update marketplace_agents with erc8004_identity_id reference
    if (identity) {
      await supabaseAdmin
        .from('marketplace_agents')
        .update({
          erc8004_identity_id: identity.id,
          verified_on_chain: true,
        })
        .eq('id', params.marketplaceAgentId);
    }
  } catch (error) {
    console.error('[ERC-8004] Failed to cache registration:', error);
  }
}
