/**
 * ERC-8004 Integration - Contract Configuration
 * Real contracts deployed on Base mainnet
 */

import { Address } from 'viem';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

// ==========================================
// Contract Addresses
// ==========================================

/** Base Mainnet ERC-8004 contracts */
export const ERC8004_CONTRACTS = {
  identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as Address,
  reputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as Address,
};

// ==========================================
// ABI - Identity Registry (ERC-721 + extensions)
// ==========================================

export const IDENTITY_REGISTRY_ABI = [
  // register() → uint256
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  // register(string agentURI) → uint256
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  // register(string agentURI, MetadataEntry[] metadata) → uint256
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentURI', type: 'string' },
      {
        name: 'metadata',
        type: 'tuple[]',
        components: [
          { name: 'metadataKey', type: 'string' },
          { name: 'metadataValue', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  // setAgentURI(uint256 agentId, string newURI)
  {
    name: 'setAgentURI',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newURI', type: 'string' },
    ],
    outputs: [],
  },
  // getMetadata(uint256 agentId, string key) → bytes
  {
    name: 'getMetadata',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ name: 'value', type: 'bytes' }],
  },
  // setMetadata(uint256 agentId, string key, bytes value)
  {
    name: 'setMetadata',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'bytes' },
    ],
    outputs: [],
  },
  // setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes sig)
  {
    name: 'setAgentWallet',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newWallet', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'sig', type: 'bytes' },
    ],
    outputs: [],
  },
  // getAgentWallet(uint256 agentId) → address
  {
    name: 'getAgentWallet',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: 'wallet', type: 'address' }],
  },
  // ownerOf(uint256 tokenId) → address  [ERC-721]
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'owner', type: 'address' }],
  },
  // tokenURI(uint256 tokenId) → string  [ERC-721]
  {
    name: 'tokenURI',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'uri', type: 'string' }],
  },
  // Registered event
  {
    type: 'event',
    name: 'Registered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'agentURI', type: 'string', indexed: false },
      { name: 'owner', type: 'address', indexed: true },
    ],
  },
] as const;

// ==========================================
// ABI - Reputation Registry
// ==========================================

export const REPUTATION_REGISTRY_ABI = [
  // giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)
  {
    name: 'giveFeedback',
    type: 'function',
    stateMutability: 'nonpayable',
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
  },
  // getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) → (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
  {
    name: 'getSummary',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddresses', type: 'address[]' },
      { name: 'tag1', type: 'string' },
      { name: 'tag2', type: 'string' },
    ],
    outputs: [
      { name: 'count', type: 'uint64' },
      { name: 'summaryValue', type: 'int128' },
      { name: 'summaryValueDecimals', type: 'uint8' },
    ],
  },
  // readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) → (...)
  {
    name: 'readAllFeedback',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddresses', type: 'address[]' },
      { name: 'tag1', type: 'string' },
      { name: 'tag2', type: 'string' },
      { name: 'includeRevoked', type: 'bool' },
    ],
    outputs: [
      {
        name: 'feedbacks',
        type: 'tuple[]',
        components: [
          { name: 'clientAddress', type: 'address' },
          { name: 'value', type: 'int128' },
          { name: 'valueDecimals', type: 'uint8' },
          { name: 'tag1', type: 'string' },
          { name: 'tag2', type: 'string' },
          { name: 'endpoint', type: 'string' },
          { name: 'feedbackURI', type: 'string' },
          { name: 'feedbackHash', type: 'bytes32' },
          { name: 'revoked', type: 'bool' },
        ],
      },
    ],
  },
  // getClients(uint256 agentId) → address[]
  {
    name: 'getClients',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: 'clients', type: 'address[]' }],
  },
  // revokeFeedback(uint256 agentId, uint64 feedbackIndex)
  {
    name: 'revokeFeedback',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'feedbackIndex', type: 'uint64' },
    ],
    outputs: [],
  },
  // NewFeedback event
  {
    type: 'event',
    name: 'NewFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'clientAddress', type: 'address', indexed: true },
      { name: 'feedbackIndex', type: 'uint64', indexed: false },
    ],
  },
] as const;

// ==========================================
// Global Agent ID Format
// ==========================================

/**
 * Creates a globally unique agent identifier
 * Format: eip155:{chainId}:{registryAddress}:{agentId}
 */
export function getGlobalAgentId(
  chainId: number,
  registryAddress: Address,
  agentId: string
): string {
  return `eip155:${chainId}:${registryAddress}:${agentId}`;
}

/**
 * Parse a global agent ID
 */
export function parseGlobalAgentId(globalId: string): {
  chainId: number;
  registryAddress: Address;
  agentId: string;
} | null {
  const parts = globalId.split(':');
  if (parts.length !== 4 || parts[0] !== 'eip155') {
    return null;
  }

  return {
    chainId: parseInt(parts[1], 10),
    registryAddress: parts[2] as Address,
    agentId: parts[3],
  };
}

// ==========================================
// Chain Configuration
// ==========================================

export const CHAIN_CONFIG = {
  base: {
    chainId: 8453,
    rpcUrl: httpRpcUrl('base'),
    contracts: ERC8004_CONTRACTS,
  },
};
