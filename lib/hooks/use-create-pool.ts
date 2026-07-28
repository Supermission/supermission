'use client';

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { createPool, type CreatePoolParams, type CreatePoolResult } from '@/lib/uniswap/pool-creator';

export type CreatePoolStep = 'idle' | 'validating' | 'creating' | 'completed' | 'failed';

export interface CreatePoolProgress {
  step: CreatePoolStep;
  message: string;
  txHash?: string;
  poolAddress?: string;
  error?: string;
}

export function useCreatePool() {
  const { address } = useAccount();
  const [progress, setProgress] = useState<CreatePoolProgress>({ step: 'idle', message: '' });
  const [isCreating, setIsCreating] = useState(false);

  const create = useCallback(async (params: CreatePoolParams): Promise<CreatePoolResult | undefined> => {
    if (!address) return;
    setIsCreating(true);

    try {
      setProgress({ step: 'validating', message: 'Validating pool parameters...' });

      // Basic validation
      if (params.token0.toLowerCase() === params.token1.toLowerCase()) {
        throw new Error('Token pair must be different');
      }

      setProgress({ step: 'creating', message: 'Creating pool on-chain...' });

      const result = await createPool(params);

      // Record activity
      fetch('/api/defi/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: address,
          activity_type: 'pool_create',
          chain_id: params.chainId,
          tx_hash: result.txHash,
          status: 'confirmed',
          token_in: params.token0,
          token_out: params.token1,
          metadata: { fee: params.fee, tickSpacing: params.tickSpacing, hookAddress: params.hookAddress },
        }),
      }).catch(() => {});

      setProgress({
        step: 'completed',
        message: 'Pool created successfully!',
        txHash: result.txHash,
        poolAddress: result.poolAddress,
      });
      setIsCreating(false);
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Pool creation failed';
      setProgress({ step: 'failed', message: msg, error: msg });
      setIsCreating(false);
      throw error;
    }
  }, [address]);

  const reset = useCallback(() => {
    setProgress({ step: 'idle', message: '' });
    setIsCreating(false);
  }, []);

  return { create, progress, isCreating, reset };
}
