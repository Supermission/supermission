/**
 * QuickGig ERC-8004 Official Singleton Integration
 * Uses official ERC-8004 v1.0 contracts for cross-platform reputation
 *
 * Official Contract Addresses (Base Mainnet):
 * - Identity Registry:   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 * - Reputation Registry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 * - Validation Registry: 0x8004C269D0A5647E51E121FeB226200ECE932d55
 *
 * Source: https://github.com/erc-8004/erc-8004-contracts
 */

import { type Address, type PublicClient, type WalletClient, parseEventLogs } from 'viem';

/**
 * Official ERC-8004 v1.0 Singleton Addresses
 * These are read from environment variables so they can be swapped per-chain.
 * Fallbacks are the Base Mainnet addresses.
 */
export const ERC8004_OFFICIAL = {
  IDENTITY_REGISTRY: (process.env.NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY ?? '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432') as Address,
  REPUTATION_REGISTRY: (process.env.NEXT_PUBLIC_ERC8004_REPUTATION_REGISTRY ?? '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63') as Address,
  VALIDATION_REGISTRY: (process.env.NEXT_PUBLIC_ERC8004_VALIDATION_REGISTRY ?? '0x8004C269D0A5647E51E121FeB226200ECE932d55') as Address,
} as const;

/**
 * Identity Registry ABI (ERC-721 based agent NFTs)
 */
const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'register',
    inputs: [],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'register',
    inputs: [{ name: 'tokenUri', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
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
  {
    type: 'event',
    name: 'Registered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'tokenURI', type: 'string', indexed: false },
      { name: 'owner', type: 'address', indexed: true },
    ],
  },
] as const;

/**
 * Reputation Registry ABI (int128 value system with string tags)
 */
const REPUTATION_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'giveFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'value', type: 'int128' },
      { name: 'valueDecimals', type: 'uint8' },
      { name: 'tag1', type: 'string' },
      { name: 'tag2', type: 'string' },
      { name: 'endpoint', type: 'string' },
      { name: 'feedbackURI', type: 'string' },
      { name: 'feedbackHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
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
  {
    type: 'event',
    name: 'NewFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'clientAddress', type: 'address', indexed: true },
      { name: 'value', type: 'int128', indexed: false },
      { name: 'valueDecimals', type: 'uint8', indexed: false },
      { name: 'tag1', type: 'string', indexed: false },
      { name: 'tag2', type: 'string', indexed: false },
      { name: 'endpoint', type: 'string', indexed: false },
      { name: 'feedbackURI', type: 'string', indexed: false },
      { name: 'feedbackHash', type: 'bytes32', indexed: false },
    ],
  },
] as const;

/**
 * Agent reputation summary
 */
export interface ReputationSummary {
  count: bigint;
  summaryValue: bigint;
  summaryValueDecimals: number;
  clients: Address[];
}

/**
 * Agent registration result
 */
export interface AgentRegistration {
  agentId: bigint;
  txHash: Address;
  owner: Address;
}

/**
 * Official ERC-8004 Client
 * Connects to official singleton contracts for cross-platform reputation
 */
export class OfficialERC8004Client {
  constructor(
    private publicClient: PublicClient,
    private walletClient?: WalletClient
  ) {}

  /**
   * Register agent on official ERC-8004 registry
   * Creates ERC-721 NFT representing agent identity
   */
  async registerAgent(tokenUri?: string): Promise<AgentRegistration> {
    if (!this.walletClient) {
      throw new Error('Wallet client required for registration');
    }

    const account = this.walletClient.account;
    if (!account) {
      throw new Error('No account connected');
    }

    // Simulate transaction - handle both overloads
    let txHash: `0x${string}`;
    if (tokenUri) {
      const { request } = await this.publicClient.simulateContract({
        address: ERC8004_OFFICIAL.IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        args: [tokenUri] as const,
        account,
      });
      txHash = await this.walletClient.writeContract(request);
    } else {
      const { request } = await this.publicClient.simulateContract({
        address: ERC8004_OFFICIAL.IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        args: [] as const,
        account,
      });
      txHash = await this.walletClient.writeContract(request);
    }

    // Wait for receipt
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    // Parse Registered event
    const logs = parseEventLogs({
      abi: IDENTITY_REGISTRY_ABI,
      logs: receipt.logs,
    });

    const registeredEvent = logs.find((log) => log.eventName === 'Registered');
    if (!registeredEvent || !('args' in registeredEvent)) {
      throw new Error('Registration event not found');
    }

    return {
      agentId: registeredEvent.args.agentId,
      txHash,
      owner: registeredEvent.args.owner,
    };
  }

  /**
   * Get agent reputation summary
   */
  async getReputationSummary(
    agentId: bigint,
    clientAddresses: Address[] = []
  ): Promise<ReputationSummary> {
    const [count, summaryValue, summaryValueDecimals] = await this.publicClient.readContract({
      address: ERC8004_OFFICIAL.REPUTATION_REGISTRY,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getSummary',
      args: [agentId, clientAddresses, ('0x' + '0'.repeat(64)) as `0x${string}`, ('0x' + '0'.repeat(64)) as `0x${string}`],
    });

    const clientsReadonly = await this.publicClient.readContract({
      address: ERC8004_OFFICIAL.REPUTATION_REGISTRY,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getClients',
      args: [agentId],
    });

    return {
      count,
      summaryValue,
      summaryValueDecimals,
      clients: [...clientsReadonly] as Address[],
    };
  }

  /**
   * Submit feedback for agent (called after mission completion)
   */
  async submitFeedback(
    agentId: bigint,
    value: number, // int128 value (e.g. 0-100)
    feedbackUri?: string,
    options?: { tag1?: string; tag2?: string; endpoint?: string; valueDecimals?: number }
  ): Promise<Address> {
    if (!this.walletClient) {
      throw new Error('Wallet client required');
    }

    const account = this.walletClient.account;
    if (!account) {
      throw new Error('No account connected');
    }

    const { request } = await this.publicClient.simulateContract({
      address: ERC8004_OFFICIAL.REPUTATION_REGISTRY,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'giveFeedback',
      args: [
        agentId,
        BigInt(value), // int128 value
        options?.valueDecimals ?? 0, // uint8 valueDecimals
        options?.tag1 ?? '', // string tag1
        options?.tag2 ?? '', // string tag2
        options?.endpoint ?? '', // string endpoint
        feedbackUri || '', // string feedbackURI
        ('0x' + '0'.repeat(64)) as `0x${string}`, // bytes32 feedbackHash
      ],
      account,
    });

    return await this.walletClient.writeContract(request);
  }

  /**
   * Check if address owns an agent NFT
   */
  async getAgentByOwner(owner: Address): Promise<bigint | null> {
    // Note: This requires iterating or maintaining an off-chain index
    // For now, return null - implement proper indexing later
    return null;
  }
}

/**
 * Helper: Convert score to star rating (0-5)
 */
export function scoreToStars(score: number): number {
  return (score / 100) * 5;
}

/**
 * Helper: Get reputation badge tier
 */
export function getReputationTier(score: number): {
  tier: string;
  color: string;
  emoji: string;
} {
  if (score >= 95) return { tier: 'Elite', color: 'purple', emoji: '' };
  if (score >= 90) return { tier: 'Excellent', color: 'green', emoji: '' };
  if (score >= 80) return { tier: 'Great', color: 'blue', emoji: '' };
  if (score >= 70) return { tier: 'Good', color: 'yellow', emoji: '' };
  if (score >= 50) return { tier: 'Average', color: 'gray', emoji: '' };
  return { tier: 'New', color: 'gray', emoji: '' };
}
