'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import type { UserLPPosition } from '@/lib/uniswap/pool-manager';
import { getUserPositions } from '@/lib/uniswap/pool-manager';
import type { SupportedChainId } from '@/lib/uniswap/types';

export function useUniswapPositions(chainId: SupportedChainId = 8453) {
  const { address } = useAccount();
  const [positions, setPositions] = useState<UserLPPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await getUserPositions(address, chainId);
      setPositions(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch positions');
      setPositions([]);
    } finally {
      setIsLoading(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  return { positions, isLoading, error, refetch: fetchPositions };
}
