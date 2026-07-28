// use-defi-positions.ts - Reads on-chain DeFi positions (Aave V3 + Compound III) on Base
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';
import { base } from 'wagmi/chains';

export type SupportedProtocol = 'aave-v3' | 'compound-iii';

export interface DeFiPosition {
  protocol: SupportedProtocol;
  label: string;
  balanceRaw: bigint;
  balanceFormatted: string; // human-readable, e.g. "12.34"
}

const BALANCE_OF_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// aToken for USDC on Base (aBasUSDC)
const AAVE_ATOKEN_USDC = '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB' as const;
// Compound III USDC comet on Base
const COMPOUND_COMET = '0x46e6b214b524310239732d51387075e0e70970bf' as const;

const PROTOCOLS: { key: SupportedProtocol; label: string; address: `0x${string}` }[] = [
  { key: 'aave-v3', label: 'Aave V3', address: AAVE_ATOKEN_USDC },
  { key: 'compound-iii', label: 'Compound III', address: COMPOUND_COMET },
];

export function useDefiPositions() {
  const { address } = useAccount();
  const baseClient = usePublicClient({ chainId: base.id });

  const { data: positions = [], isLoading, error: queryError, refetch } = useQuery<DeFiPosition[]>({
    queryKey: ['defi-positions', address],
    queryFn: async () => {
      const results = await Promise.all(
        PROTOCOLS.map(async (proto) => {
          const balance = await baseClient!.readContract({
            address: proto.address,
            abi: BALANCE_OF_ABI,
            functionName: 'balanceOf',
            args: [address!],
          });
          return {
            protocol: proto.key,
            label: proto.label,
            balanceRaw: balance,
            balanceFormatted: parseFloat(formatUnits(balance, 6)).toFixed(2),
          };
        })
      );

      // Only show protocols with balance > 0
      return results.filter((p) => p.balanceRaw > 0n);
    },
    enabled: !!address && !!baseClient,
  });

  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Failed to fetch DeFi positions') : null;

  return { positions, isLoading, error, refetch };
}
