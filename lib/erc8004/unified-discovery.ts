/**
 * Unified Agent Discovery
 * Combines official ERC-8004 registry data with local capabilities
 */

import { type Address, type PublicClient } from 'viem';
import { ERC8004_OFFICIAL, type ReputationSummary } from './official-client';

// ABIs for reading from official registry
const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'ownerOf',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenURI',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
] as const;

const REPUTATION_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getSummary',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddresses', type: 'address[]' },
      { name: 'tag1', type: 'bytes32' },
      { name: 'tag2', type: 'bytes32' },
    ],
    outputs: [
      { name: 'count', type: 'uint64' },
      { name: 'summaryValue', type: 'int128' },
      { name: 'summaryValueDecimals', type: 'uint8' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getClients',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
  },
] as const;

/**
 * Enhanced agent data combining on-chain and off-chain sources
 */
export interface EnhancedAgentData {
  // Core identity
  agentId: string; // ERC-8004 NFT token ID
  owner: Address;
  name: string;
  description: string;

  // On-chain data
  tokenUri: string;
  isRegistered: boolean;

  // Agent capabilities (from metadata)
  agentType: 'ai' | 'human' | 'hybrid';
  capabilities: string[];

  // Service info
  cdpWallet?: Address;
  endpoint?: string;
  pricing?: {
    perTask?: number;
    perMessage?: number;
    currency?: string;
  };

  // Reputation (from ERC-8004 Reputation Registry)
  reputation: {
    count: number; // Total feedback count
    averageScore: number; // 0-100
    rating: number; // 0-5 stars
    tier: string; // Elite, Excellent, Great, Good, Average, New
    clients: Address[]; // List of clients who gave feedback
  };

  // Metadata
  contact?: {
    twitter?: string;
    github?: string;
    website?: string;
  };
  registeredAt?: string;
}

/**
 * Get agent data by ERC-8004 ID
 */
export async function getAgentById(
  publicClient: PublicClient,
  agentId: string | bigint
): Promise<EnhancedAgentData | null> {
  try {
    const agentIdBigInt = typeof agentId === 'string' ? BigInt(agentId) : agentId;

    // Get owner from Identity Registry
    const owner = await publicClient.readContract({
      address: ERC8004_OFFICIAL.IDENTITY_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'ownerOf',
      args: [agentIdBigInt],
    });

    // Get tokenURI
    const tokenUri = await publicClient.readContract({
      address: ERC8004_OFFICIAL.IDENTITY_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'tokenURI',
      args: [agentIdBigInt],
    });

    // Get reputation summary
    const [count, summaryValue, summaryValueDecimals] = await publicClient.readContract({
      address: ERC8004_OFFICIAL.REPUTATION_REGISTRY,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getSummary',
      args: [
        agentIdBigInt,
        [],
        ('0x' + '0'.repeat(64)) as `0x${string}`,
        ('0x' + '0'.repeat(64)) as `0x${string}`,
      ],
    });

    // Compute average score from summaryValue
    const countNum = Number(count);
    const divisor = 10 ** summaryValueDecimals;
    const averageScore = countNum > 0
      ? Math.round((Number(summaryValue) / divisor / countNum) * 100) / 100
      : 0;

    const clients = await publicClient.readContract({
      address: ERC8004_OFFICIAL.REPUTATION_REGISTRY,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getClients',
      args: [agentIdBigInt],
    });

    // Fetch metadata from IPFS/tokenURI or decode base64 data URI
    let metadata: Record<string, unknown> = {};
    if (tokenUri) {
      try {
        if (tokenUri.startsWith('ipfs://')) {
          // IPFS URI - fetch from gateway
          const ipfsHash = tokenUri.replace('ipfs://', '');
          const metadataResponse = await fetch(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`);
          metadata = await metadataResponse.json();
        } else if (tokenUri.startsWith('data:application/json;base64,')) {
          // Base64-encoded data URI - decode directly
          const base64Data = tokenUri.replace('data:application/json;base64,', '');
          const jsonData = Buffer.from(base64Data, 'base64').toString('utf-8');
          metadata = JSON.parse(jsonData);
        } else if (tokenUri.startsWith('http://') || tokenUri.startsWith('https://')) {
          // HTTP URI - fetch directly
          const metadataResponse = await fetch(tokenUri);
          metadata = await metadataResponse.json();
        }
      } catch (error) {
        console.warn('[Unified Discovery] Failed to parse metadata:', error);
      }
    }

    // Convert score to stars
    const rating = (averageScore / 100) * 5;
    const tier = getReputationTier(averageScore);

    // Use production endpoint if available, fallback to metadata
    const endpoint = (metadata.endpoint as string) || '';

    return {
      agentId: agentIdBigInt.toString(),
      owner,
      name: (metadata.name as string) || `Agent #${agentId}`,
      description: (metadata.description as string) || '',
      tokenUri,
      isRegistered: true,
      agentType: (metadata.agentType as 'ai' | 'human' | 'hybrid') || 'ai',
      capabilities: (metadata.capabilities as string[]) || [],
      cdpWallet: metadata.cdpWallet as Address | undefined,
      endpoint,
      pricing: metadata.pricing as { perTask?: number; perMessage?: number; currency?: string } | undefined,
      reputation: {
        count: Number(count),
        averageScore,
        rating,
        tier,
        clients: [...clients] as Address[],
      },
      contact: metadata.contact as { twitter?: string; github?: string; website?: string } | undefined,
      registeredAt: metadata.registeredAt as string | undefined,
    };
  } catch (error) {
    console.error('[Unified Discovery] Failed to get agent:', error);
    return null;
  }
}

/**
 * Get all registered agents (requires event indexing or subgraph)
 * For now, returns hardcoded list of known agents
 */
export async function getAllAgents(
  publicClient: PublicClient
): Promise<EnhancedAgentData[]> {
  // Known agent IDs (active production agents)
  // Known agent IDs (active production agents)
  // New agents (defi-yield, wallet-intelligence)
  // will get their ERC8004 IDs assigned when registered on-chain
  const knownAgentIds = ['1591', '1592', '1593', '624']; // Token DD, Prediction Market, Contract Audit, SuperImageGen

  const agents: EnhancedAgentData[] = [];

  for (const agentId of knownAgentIds) {
    const agent = await getAgentById(publicClient, agentId);
    if (agent) {
      agents.push(agent);
    }
  }

  return agents;
}

/**
 * Search agents by capability
 */
export async function searchAgentsByCapability(
  publicClient: PublicClient,
  capability: string
): Promise<EnhancedAgentData[]> {
  const allAgents = await getAllAgents(publicClient);

  return allAgents.filter(agent =>
    agent.capabilities.some(cap =>
      cap.toLowerCase().includes(capability.toLowerCase())
    )
  );
}

/**
 * Get top agents by reputation
 */
export async function getTopAgentsByReputation(
  publicClient: PublicClient,
  limit: number = 10
): Promise<EnhancedAgentData[]> {
  const allAgents = await getAllAgents(publicClient);

  return allAgents
    .filter(agent => agent.reputation.count > 0) // Only agents with feedback
    .sort((a, b) => b.reputation.averageScore - a.reputation.averageScore)
    .slice(0, limit);
}

/**
 * Get reputation tier from score
 */
function getReputationTier(score: number): string {
  if (score >= 95) return 'Elite';
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Great';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Average';
  return 'New';
}

/**
 * Get tier color for UI
 */
export function getTierColor(tier: string): string {
  switch (tier) {
    case 'Elite': return 'purple';
    case 'Excellent': return 'green';
    case 'Great': return 'blue';
    case 'Good': return 'yellow';
    case 'Average': return 'gray';
    default: return 'gray';
  }
}

/**
 * Get tier emoji for UI
 */
export function getTierEmoji(tier: string): string {
  switch (tier) {
    case 'Elite': return '';
    case 'Excellent': return '';
    case 'Great': return '';
    case 'Good': return '';
    case 'Average': return '';
    default: return '';
  }
}
