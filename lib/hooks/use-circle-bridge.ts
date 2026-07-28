'use client';

/**
 * Unified bridge hook — routes to either:
 * 1. Circle CCTP Bridge Kit (when enabled) — native burn-and-mint
 * 2. Existing Polymarket bridge (fallback) — ERC20 transfer + balance polling
 *
 * DOES NOT modify use-bridge-execution.ts.
 */

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useBridgeExecution, type BridgeProgress, type BridgeResult } from './use-bridge-execution';
import { shouldUseCircleBridge, executeBridge, isCCTPSupported } from '@/lib/circle/bridge';

export type BridgeProvider = 'circle_cctp' | 'polymarket';

export function useCircleBridge() {
  const { address } = useAccount();
  const polymarketBridge = useBridgeExecution();

  const [bridgeProvider, setBridgeProvider] = useState<BridgeProvider>(
    shouldUseCircleBridge() ? 'circle_cctp' : 'polymarket'
  );
  const [cctpProgress, setCctpProgress] = useState<BridgeProgress>({ step: 'idle', message: '' });
  const [isCctpBridging, setIsCctpBridging] = useState(false);

  const executeBridgeToPolygon = useCallback(async (amount: string): Promise<BridgeResult | null> => {
    if (!address) return null;

    // Try Circle CCTP first if enabled
    if (shouldUseCircleBridge() && isCCTPSupported(8453, 137)) {
      setBridgeProvider('circle_cctp');
      setIsCctpBridging(true);
      setCctpProgress({ step: 'getting_deposit_address', message: 'Preparing CCTP bridge...' });

      try {
        setCctpProgress({ step: 'sending_transfer', message: 'Burning USDC on Base via CCTP...' });

        const result = await executeBridge({
          sourceChainId: 8453,
          destChainId: 137,
          amount,
          adapter: null, // Adapter will be provided by the API route in production
        });

        if (result.success) {
          setCctpProgress({
            step: 'completed',
            message: 'CCTP bridge complete! USDC.e minted on Polygon.',
            txHash: result.sourceTxHash,
          });
          setIsCctpBridging(false);
          return { status: 'success', txHash: result.sourceTxHash };
        }

        throw new Error(result.error || 'CCTP bridge failed');
      } catch (error: unknown) {
        console.warn('[CircleBridge] CCTP failed, falling back to Polymarket bridge:', error instanceof Error ? error.message : error);
        setCctpProgress({ step: 'idle', message: '' });
        setIsCctpBridging(false);
        // Fall through to Polymarket bridge
      }
    }

    // Fallback: existing Polymarket bridge (unchanged)
    setBridgeProvider('polymarket');
    return polymarketBridge.executeBridgeToPolygon(amount);
  }, [address, polymarketBridge]);

  const progress = bridgeProvider === 'circle_cctp' ? cctpProgress : polymarketBridge.progress;
  const isBridging = bridgeProvider === 'circle_cctp' ? isCctpBridging : polymarketBridge.isBridging;

  const reset = useCallback(() => {
    setCctpProgress({ step: 'idle', message: '' });
    setIsCctpBridging(false);
    polymarketBridge.reset();
  }, [polymarketBridge]);

  return {
    executeBridgeToPolygon,
    retryBridge: polymarketBridge.retryBridge,
    cancelBridge: polymarketBridge.cancelBridge,
    progress,
    isBridging,
    canRetry: polymarketBridge.canRetry,
    reset,
    bridgeProvider,
  };
}
