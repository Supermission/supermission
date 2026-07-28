'use client';

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import type { HookTemplate } from '@/lib/uniswap/hooks/hook-templates';
import { deployHook, type HookDeployResult } from '@/lib/uniswap/hooks/hook-deployer';
import type { SupportedChainId } from '@/lib/uniswap/types';

export type HookStep = 'idle' | 'configuring' | 'deploying' | 'completed' | 'failed';

export interface HookProgress {
  step: HookStep;
  message: string;
  txHash?: string;
  hookAddress?: string;
  error?: string;
}

export function useUniswapHooks() {
  const { address } = useAccount();
  const [progress, setProgress] = useState<HookProgress>({ step: 'idle', message: '' });
  const [isDeploying, setIsDeploying] = useState(false);

  const deploy = useCallback(async (
    template: HookTemplate,
    config: Record<string, unknown>,
    chainId: SupportedChainId
  ): Promise<HookDeployResult | undefined> => {
    if (!address) return;
    setIsDeploying(true);

    try {
      setProgress({ step: 'deploying', message: `Deploying ${template.name} hook...` });

      const result = await deployHook({
        template,
        config,
        chainId,
        deployer: address,
      });

      // Record activity
      fetch('/api/defi/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: address,
          activity_type: 'hook_deploy',
          chain_id: chainId,
          tx_hash: result.txHash,
          status: 'confirmed',
          fee_paid_usd: parseFloat(template.x402Fee),
          metadata: { templateId: template.id, hookAddress: result.hookAddress },
        }),
      }).catch(() => {});

      setProgress({
        step: 'completed',
        message: 'Hook deployed successfully!',
        txHash: result.txHash,
        hookAddress: result.hookAddress,
      });
      setIsDeploying(false);
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Hook deployment failed';
      setProgress({ step: 'failed', message: msg, error: msg });
      setIsDeploying(false);
      throw error;
    }
  }, [address]);

  const reset = useCallback(() => {
    setProgress({ step: 'idle', message: '' });
    setIsDeploying(false);
  }, []);

  return { deploy, progress, isDeploying, reset };
}
