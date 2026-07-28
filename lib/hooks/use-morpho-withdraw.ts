// use-morpho-withdraw.ts - ERC-4626 redeem (full withdrawal) from MetaMorpho vaults on Base
// Privy embedded wallet (gas-sponsored) + wagmi external wallet dual-path
import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient, useSwitchChain } from 'wagmi';
import { useWallets, useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth';
import { encodeFunctionData } from 'viem';
import { base } from 'wagmi/chains';
import { ERC4626_VAULT_ABI } from '@/lib/morpho/abis';

const BASE_CHAIN_ID = 8453;

export type MorphoWithdrawStep = 'idle' | 'reading_balance' | 'withdrawing' | 'completed' | 'failed';

export interface MorphoWithdrawProgress {
  step: MorphoWithdrawStep;
  message: string;
  txHash?: string;
  error?: string;
}

export interface MorphoWithdrawParams {
  vaultAddress: `0x${string}`;
  assetDecimals: number;
}

export function useMorphoWithdraw() {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { refetch: refetchWalletClient } = useWalletClient({ chainId: base.id });
  const { switchChainAsync } = useSwitchChain();
  const baseClient = usePublicClient({ chainId: base.id });
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();

  const [progress, setProgress] = useState<MorphoWithdrawProgress>({ step: 'idle', message: '' });
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const getEmbeddedWallet = useCallback(() => {
    return wallets.find((w) => w.walletClientType === 'privy');
  }, [wallets]);

  // ERC-4626 redeem(shares, receiver, owner) — redeems all shares for underlying assets
  const executeWithdraw = useCallback(async (params: MorphoWithdrawParams): Promise<string | undefined> => {
    if (!address || !baseClient) return;

    const embedded = getEmbeddedWallet();
    const isSilent = !!embedded;

    setIsWithdrawing(true);

    try {
      if (!isSilent) {
        await switchChainAsync({ chainId: base.id });
      }

      // Step 1: Read share balance via balanceOf(owner)
      setProgress({ step: 'reading_balance', message: 'Reading vault position...' });
      const shares = await baseClient.readContract({
        address: params.vaultAddress,
        abi: ERC4626_VAULT_ABI,
        functionName: 'balanceOf',
        args: [address],
      });

      if (shares === 0n) {
        throw new Error('No position found in this vault');
      }

      // Step 2: Redeem all shares via redeem(shares, receiver, owner)
      setProgress({ step: 'withdrawing', message: 'Withdrawing from vault...' });
      const redeemData = encodeFunctionData({
        abi: ERC4626_VAULT_ABI,
        functionName: 'redeem',
        args: [shares, address, address],
      });

      let txHash: string;
      if (isSilent) {
        const receipt = await privySendTransaction(
          { to: params.vaultAddress, data: redeemData, chainId: BASE_CHAIN_ID },
          { sponsor: true, address },
        );
        txHash = receipt.hash;
      } else {
        const { data: walletClient } = await refetchWalletClient();
        if (!walletClient) throw new Error('Wallet not available');
        txHash = await walletClient.sendTransaction({
          account: address,
          chain: base,
          to: params.vaultAddress,
          data: redeemData,
          value: 0n,
        });
        // Wait for on-chain confirmation before declaring success
        await baseClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      }

      setProgress({ step: 'completed', message: 'Withdrawal successful!', txHash });
      setIsWithdrawing(false);
      return txHash;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Withdrawal failed';
      console.error('[MorphoWithdraw] Failed:', error);
      setProgress({ step: 'failed', message: msg, error: msg });
      setIsWithdrawing(false);
      throw error;
    }
  }, [address, baseClient, getEmbeddedWallet, privySendTransaction, refetchWalletClient, switchChainAsync]);

  const reset = useCallback(() => {
    setProgress({ step: 'idle', message: '' });
    setIsWithdrawing(false);
  }, []);

  return { executeWithdraw, progress, isWithdrawing, reset };
}
