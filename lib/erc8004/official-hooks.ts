/**
 * QuickGig React Hooks for Official ERC-8004 Singleton Contracts
 * Provides easy access to cross-platform reputation data
 */

'use client';

import { useMemo, useCallback } from 'react';
import { useReadContract, usePublicClient, useWalletClient } from 'wagmi';
import type { Address } from 'viem';
import {
  ERC8004_OFFICIAL,
  OfficialERC8004Client,
  type ReputationSummary,
  scoreToStars,
} from './official-client';

/**
 * Identity Registry ABI
 */
const IDENTITY_ABI = [
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

/**
 * Reputation Registry ABI
 */
const REPUTATION_ABI = [
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
 * Get official ERC-8004 client instance
 */
export function useOfficialERC8004Client() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const client = useMemo(() => {
    if (!publicClient) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new OfficialERC8004Client(publicClient as any, walletClient as any || undefined);
  }, [publicClient, walletClient]);

  return client;
}

/**
 * Check if agent ID exists (has an owner)
 */
export function useAgentExists(agentId?: bigint) {
  const result = useReadContract({
    address: ERC8004_OFFICIAL.IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'ownerOf',
    args: agentId !== undefined ? [agentId] : undefined,
    query: {
      enabled: agentId !== undefined,
    },
  });

  return {
    exists: !result.isError && result.data !== undefined,
    owner: result.data as Address | undefined,
    isLoading: result.isLoading,
  };
}

/**
 * Get agent reputation summary
 */
export function useAgentReputation(agentId?: bigint, clientAddresses: Address[] = []) {
  const summaryResult = useReadContract({
    address: ERC8004_OFFICIAL.REPUTATION_REGISTRY,
    abi: REPUTATION_ABI,
    functionName: 'getSummary',
    args:
      agentId !== undefined
        ? [agentId, clientAddresses, ('0x' + '0'.repeat(64)) as `0x${string}`, ('0x' + '0'.repeat(64)) as `0x${string}`]
        : undefined,
    query: {
      enabled: agentId !== undefined,
    },
  });

  const clientsResult = useReadContract({
    address: ERC8004_OFFICIAL.REPUTATION_REGISTRY,
    abi: REPUTATION_ABI,
    functionName: 'getClients',
    args: agentId !== undefined ? [agentId] : undefined,
    query: {
      enabled: agentId !== undefined,
    },
  });

  const reputation = useMemo(() => {
    if (!summaryResult.data || !clientsResult.data) return null;

    const [count, summaryValue, summaryValueDecimals] = summaryResult.data;

    return {
      count,
      summaryValue,
      summaryValueDecimals,
      clients: clientsResult.data as Address[],
    } as ReputationSummary;
  }, [summaryResult.data, clientsResult.data]);

  return {
    reputation,
    isLoading: summaryResult.isLoading || clientsResult.isLoading,
    isError: summaryResult.isError || clientsResult.isError,
  };
}

/**
 * Convert score to star rating
 */
export function useScoreToStars(score?: number): number | null {
  return useMemo(() => {
    if (score === undefined) return null;
    return scoreToStars(score);
  }, [score]);
}

/**
 * Register agent on official ERC-8004
 */
export function useRegisterAgent() {
  const client = useOfficialERC8004Client();

  const register = useCallback(
    async (tokenUri?: string) => {
      if (!client) {
        throw new Error('Client not initialized');
      }
      return await client.registerAgent(tokenUri);
    },
    [client]
  );

  return { register, isReady: !!client };
}

/**
 * Submit feedback for agent
 */
export function useSubmitFeedback() {
  const client = useOfficialERC8004Client();

  const submitFeedback = useCallback(
    async (agentId: bigint, score: number, feedbackUri?: string) => {
      if (!client) {
        throw new Error('Client not initialized');
      }
      return await client.submitFeedback(agentId, score, feedbackUri);
    },
    [client]
  );

  return { submitFeedback, isReady: !!client };
}
