/**
 * Official ERC-8004 Discovery Integration
 * Combines QuickGig registry (capability search) with official ERC-8004 reputation
 */

import { useReadContract, usePublicClient } from 'wagmi';
import type { Address } from 'viem';
import { ERC8004_OFFICIAL } from './official-client';
import { useAgentReputation } from './official-hooks';
import { useEffect, useState } from 'react';

/**
 * Official ERC-8004 Reputation Summary
 */
export interface OfficialReputationSummary {
  count: bigint;
  averageScore: number; // 0-100
  clients: Address[];
}

/**
 * Get official cross-platform reputation for an agent address
 * Uses official ERC-8004 singleton reputation registry
 */
export function useOfficialReputation(workerAddress?: Address) {
  const { reputation, isLoading, isError } = useAgentReputation(
    workerAddress ? BigInt(workerAddress) : undefined,
    []
  );

  if (!reputation || !workerAddress) {
    return {
      data: null,
      isLoading,
      error: isError,
    };
  }

  const { count, summaryValue, summaryValueDecimals } = reputation;
  const countNum = Number(count);
  const divisor = 10 ** summaryValueDecimals;
  const averageScore = countNum > 0
    ? Math.round((Number(summaryValue) / divisor / countNum) * 100) / 100
    : 0;

  return {
    data: {
      count,
      averageScore,
      rating: averageScore / 20, // Convert 0-100 to 0-5 stars
      formattedRating: `${averageScore}/100`,
    },
    isLoading,
    error: isError,
  };
}

/**
 * Check if address is registered in official ERC-8004 identity registry
 */
export function useIsOfficialAgent(address?: Address) {
  return useReadContract({
    address: ERC8004_OFFICIAL.IDENTITY_REGISTRY,
    abi: [
      {
        type: 'function',
        name: 'balanceOf',
        inputs: [{ name: 'owner', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
      },
    ],
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });
}

/**
 * Get official agent ID for an address (if registered)
 * Note: This requires tokenOfOwnerByIndex which may not be in minimal ERC-721
 * Falls back to checking if they own any tokens
 */
export function useOfficialAgentId(address?: Address) {
  const { data: balance } = useIsOfficialAgent(address);
  const hasAgent = balance !== undefined && balance > 0n;

  return {
    data: hasAgent ? address : null, // Simplified: use address as ID
    hasOfficialAgent: hasAgent,
    isLoading: balance === undefined,
  };
}

/**
 * Combined agent data: QuickGig registry + Official ERC-8004 reputation
 */
export interface EnhancedAgentData {
  // QuickGig local data
  agentId: string;
  owner: Address;
  capabilities: string[];
  verified: boolean;

  // Official ERC-8004 cross-platform reputation
  officialReputation: {
    count: bigint;
    averageScore: number;
    rating: number; // 0-5 stars
    isRegistered: boolean;
  } | null;
}

/**
 * Hook to get enhanced agent data with official reputation
 */
export function useEnhancedAgentData(agentId?: string, ownerAddress?: Address) {
  const { data: officialRep } = useOfficialReputation(ownerAddress);
  const { hasOfficialAgent } = useOfficialAgentId(ownerAddress);

  return {
    officialReputation: officialRep
      ? {
          ...officialRep,
          isRegistered: hasOfficialAgent,
        }
      : null,
  };
}

/**
 * Registered Event ABI for event log queries
 */
const REGISTERED_EVENT_ABI = [
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
 * Hook to look up official agentId from owner address
 * Queries Registered event logs to find the agentId
 */
export function useLookupAgentId(ownerAddress?: Address) {
  const publicClient = usePublicClient();
  const [agentId, setAgentId] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!ownerAddress || !publicClient) {
      setAgentId(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const lookupAgentId = async () => {
      try {
        // Get current block
        const currentBlock = await publicClient.getBlockNumber();

        // OPTIMIZATION: Only query recent 500k blocks to avoid RPC timeout
        const maxBlockRange = 500_000n;
        const fromBlock = currentBlock > maxBlockRange ? currentBlock - maxBlockRange : 0n;

        console.log(`Looking up agentId for ${ownerAddress} from block ${fromBlock} to ${currentBlock}`);

        // Query Registered events filtered by owner address
        const logs = await publicClient.getLogs({
          address: ERC8004_OFFICIAL.IDENTITY_REGISTRY,
          event: REGISTERED_EVENT_ABI[0],
          args: {
            owner: ownerAddress,
          },
          fromBlock,
          toBlock: 'latest',
        });

        if (logs.length > 0) {
          // Get the first (oldest) registration - agents should only register once
          const firstLog = logs[0];
          if (firstLog.args.agentId !== undefined) {
            setAgentId(firstLog.args.agentId);
          } else {
            setAgentId(null);
          }
        } else {
          setAgentId(null);
        }
      } catch (err) {
        console.error('Failed to lookup agentId:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setAgentId(null);
      } finally {
        setIsLoading(false);
      }
    };

    lookupAgentId();
  }, [ownerAddress, publicClient]);

  return {
    agentId,
    isLoading,
    error,
    hasAgentId: agentId !== null,
  };
}
