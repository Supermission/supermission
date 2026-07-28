/**
 * Client-Side ERC-8004 Agent Registration Hook
 * Allows users to sign the registration transaction from their wallet
 */

import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseEventLogs } from 'viem';
import { ERC8004_OFFICIAL } from './official-client';

/**
 * Identity Registry ABI - register function only
 */
const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'register',
    inputs: [{ name: 'tokenUri', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
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
 * Hook to register agent on ERC-8004 from user's wallet
 * Returns transaction hash and agent ID
 */
export function useRegisterAgent() {
  const publicClient = usePublicClient();
  const { writeContractAsync, data: txHash, isPending: isWriting } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  /**
   * Register agent and get NFT minted to user's wallet
   * @param tokenUri IPFS URI with agent metadata
   * @returns Transaction hash and agent ID (from event)
   */
  const registerAgent = async (tokenUri: string) => {
    try {
      // Step 1: Write contract (user signs transaction)
      const hash = await writeContractAsync({
        address: ERC8004_OFFICIAL.IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        args: [tokenUri],
      });

      // Step 2: Wait for transaction confirmation
      if (!publicClient) {
        throw new Error('Public client not available');
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Step 3: Parse event logs to get agent ID
      const logs = parseEventLogs({
        abi: IDENTITY_REGISTRY_ABI,
        eventName: 'Registered',
        logs: receipt.logs,
      });

      if (logs.length === 0) {
        throw new Error('No Registered event found in transaction');
      }

      const agentId = logs[0].args.agentId;

      return {
        txHash: hash,
        agentId: agentId.toString(),
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      console.error('[useRegisterAgent] Registration failed:', error);
      throw error;
    }
  };

  return {
    registerAgent,
    txHash,
    isWriting,
    isConfirming,
    isSuccess,
    isPending: isWriting || isConfirming,
  };
}
