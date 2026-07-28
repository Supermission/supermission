// use-bridge-execution.ts - Bridge Base USDC → Polygon via Polymarket's native Bridge API
// Uses Privy useSendTransaction with gas sponsorship for embedded wallets, wagmi fallback for external
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useAccount, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { useWallets, useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth';
import { parseUnits, encodeFunctionData } from 'viem';
import { base, polygon } from 'wagmi/chains';

const POLYGON_USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
export { POLYGON_USDC };
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export type BridgeStep =
  | 'idle'
  | 'getting_deposit_address'
  | 'approving'
  | 'sending_transfer'
  | 'waiting_confirmation'
  | 'completed'
  | 'failed';

export interface BridgeProgress {
  step: BridgeStep;
  message: string;
  txHash?: string;
  error?: string;
  canRetry?: boolean;
}

export interface BridgeResult {
  status: 'success' | 'failed';
  txHash?: string;
}

const ERC20_TRANSFER_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Poll Polygon USDC balance until it increases (bridge arrival)
async function waitForBalanceIncrease(
  polygonClient: NonNullable<ReturnType<typeof usePublicClient>>,
  address: `0x${string}`,
  preBridgeBalance: bigint,
): Promise<boolean> {
  const TIMEOUT = 180_000; // 3 minutes for Polymarket bridge
  const INTERVAL = 5_000;
  const start = Date.now();

  while (Date.now() - start < TIMEOUT) {
    try {
      const bal = await polygonClient.readContract({
        address: POLYGON_USDC as `0x${string}`,
        abi: BALANCE_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      if (bal > preBridgeBalance) {
        console.log('[Bridge] Balance increased on Polygon');
        return true;
      }
    } catch (err) {
      console.warn('[Bridge] Balance poll error:', err);
    }
    await new Promise(resolve => setTimeout(resolve, INTERVAL));
  }

  console.error('[Bridge] Balance poll timed out after 3 minutes');
  return false;
}

export function useBridgeExecution() {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { switchChainAsync } = useSwitchChain();
  const { refetch: refetchWalletClient } = useWalletClient();
  const polygonClient = usePublicClient({ chainId: polygon.id });
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();

  const [progress, setProgress] = useState<BridgeProgress>({ step: 'idle', message: '' });
  const [isBridging, setIsBridging] = useState(false);
  const [lastBridgeParams, setLastBridgeParams] = useState<{ amount: string } | null>(null);

  // Detect Privy embedded wallet
  const getEmbeddedWallet = useCallback(() => {
    return wallets.find(w => w.walletClientType === 'privy');
  }, [wallets]);

  // Get pre-bridge Polygon USDC balance
  const getPolygonBalance = useCallback(async (addr: `0x${string}`): Promise<bigint> => {
    if (!polygonClient) return 0n;
    try {
      return await polygonClient.readContract({
        address: POLYGON_USDC as `0x${string}`,
        abi: BALANCE_ABI,
        functionName: 'balanceOf',
        args: [addr],
      });
    } catch {
      return 0n;
    }
  }, [polygonClient]);

  // Execute bridge: Base USDC → Polygon via Polymarket's native Bridge API
  const executeBridgeToPolygon = useCallback(
    async (amount: string): Promise<BridgeResult | null> => {
      if (!address) {
        toast.error('Wallet not connected');
        return null;
      }

      setLastBridgeParams({ amount });
      setIsBridging(true);

      const embedded = getEmbeddedWallet();
      const isSilent = !!embedded;

      try {
        console.log('[Bridge] Starting Polymarket native bridge: Base → Polygon');
        console.log('[Bridge] Amount:', amount, 'USDC');
        console.log('[Bridge] Mode:', isSilent ? 'silent (Privy, gas-sponsored)' : 'interactive (wagmi)');

        // Record pre-bridge balance for polling
        const preBridgeBalance = await getPolygonBalance(address);
        console.log('[Bridge] Pre-bridge Polygon balance:', preBridgeBalance.toString());

        // Step 1: Get deposit address from Polymarket Bridge API
        setProgress({ step: 'getting_deposit_address', message: 'Getting deposit address...' });

        const amountInDecimals = parseUnits(amount, 6).toString();
        const depositRes = await fetch('/api/trade/bridge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromAddress: address, amount: amountInDecimals }),
        });

        if (!depositRes.ok) {
          const err = await depositRes.json().catch(() => ({ error: 'Failed to get deposit address' }));
          throw new Error(err.error || `Bridge request failed (${depositRes.status})`);
        }

        const { depositAddress } = await depositRes.json();
        console.log('[Bridge] Deposit address:', depositAddress);

        // Step 2: Ensure we're on Base chain
        if (isSilent) {
          await embedded.switchChain(base.id);
        } else {
          await switchChainAsync({ chainId: base.id });
          await new Promise(r => setTimeout(r, 1000));
        }

        // Step 3: Send USDC to deposit address (simple ERC20 transfer)
        setProgress({ step: 'sending_transfer', message: 'Sending USDC to Polymarket bridge...' });
        if (!isSilent) toast.info('Please confirm the USDC transfer');

        // Encode ERC20 transfer(depositAddress, amount)
        const transferData = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [depositAddress as `0x${string}`, parseUnits(amount, 6)],
        });

        let transferTxHash: string;

        if (isSilent) {
          // Use Privy's useSendTransaction with gas sponsorship
          const receipt = await privySendTransaction(
            {
              to: BASE_USDC,
              data: transferData,
              chainId: base.id,
            },
            {
              sponsor: true,
              address: address,
            },
          );
          transferTxHash = receipt.hash;
        } else {
          const { data: walletClient } = await refetchWalletClient();
          if (!walletClient) throw new Error('Wallet not available');
          transferTxHash = await walletClient.sendTransaction({
            to: BASE_USDC as `0x${string}`,
            data: transferData as `0x${string}`,
            value: 0n,
          });
        }

        console.log('[Bridge] USDC transfer sent:', transferTxHash);

        // Step 4: Wait for funds on Polygon
        setProgress({
          step: 'waiting_confirmation',
          message: 'USDC sent! Waiting for Polymarket bridge (~1-3 min)...',
          txHash: transferTxHash,
        });

        if (!polygonClient) {
          console.warn('[Bridge] No polygonClient, waiting fixed 90s');
          await new Promise(r => setTimeout(r, 90000));
        } else {
          const arrived = await waitForBalanceIncrease(polygonClient, address, preBridgeBalance);
          if (!arrived) {
            throw new Error(
              'USDC sent to Polymarket bridge but funds have not arrived on Polygon yet. ' +
              'This can take a few minutes. Check your balance and retry the trade.'
            );
          }
        }

        // Success!
        console.log('[Bridge] Polymarket bridge completed successfully');
        setProgress({ step: 'completed', message: 'Bridge completed!', txHash: transferTxHash });
        setIsBridging(false);
        return { status: 'success', txHash: transferTxHash };

      } catch (error: unknown) {
        console.error('[Bridge] Failed:', error);
        const msg = error instanceof Error ? error.message : 'Bridge failed';
        setProgress({ step: 'failed', message: msg, error: msg, canRetry: true });
        toast.error(`Bridge failed: ${msg}`);
        setIsBridging(false);
        return null;
      }
    },
    [address, getEmbeddedWallet, switchChainAsync, refetchWalletClient, polygonClient, getPolygonBalance, privySendTransaction]
  );

  // Retry
  const retryBridge = useCallback(async (): Promise<BridgeResult | null> => {
    if (!lastBridgeParams) {
      toast.error('No previous bridge to retry');
      return null;
    }
    return executeBridgeToPolygon(lastBridgeParams.amount);
  }, [lastBridgeParams, executeBridgeToPolygon]);

  // Cancel
  const cancelBridge = useCallback(() => {
    setProgress({ step: 'idle', message: '' });
    setIsBridging(false);
    setLastBridgeParams(null);
  }, []);

  // Reset
  const reset = useCallback(() => {
    setProgress({ step: 'idle', message: '' });
    setIsBridging(false);
    setLastBridgeParams(null);
  }, []);

  return {
    executeBridgeToPolygon,
    retryBridge,
    cancelBridge,
    progress,
    isBridging,
    canRetry: progress.canRetry || false,
    reset,
  };
}
