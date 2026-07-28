// use-defi-withdraw.ts - One-click DeFi withdrawals from Aave V3 and Compound III on Base
// Mirrors use-defi-invest.ts structure (Privy/wagmi dual-path, step states)
import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient, useSwitchChain } from 'wagmi';
import { useWallets, useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth';
import { encodeFunctionData, maxUint256 } from 'viem';
import { base } from 'wagmi/chains';
import { SupportedProtocol } from './use-defi-positions';

export type WithdrawStep = 'idle' | 'withdrawing' | 'completed' | 'failed';

export interface WithdrawProgress {
  step: WithdrawStep;
  message: string;
  txHash?: string;
  error?: string;
}

export interface WithdrawParams {
  protocol: SupportedProtocol;
  balanceRaw: bigint; // exact balance for Compound
}

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
const BASE_CHAIN_ID = 8453;

// Aave V3 Pool on Base
const AAVE_POOL = '0xa238dd80c259a72e81d7e4664a9801593f98d1c5' as `0x${string}`;
// Compound III USDC comet on Base
const COMPOUND_COMET = '0x46e6b214b524310239732d51387075e0e70970bf' as `0x${string}`;

const AAVE_WITHDRAW_ABI = [
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    name: 'withdraw',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const COMPOUND_WITHDRAW_ABI = [
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export function useDefiWithdraw() {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { refetch: refetchWalletClient } = useWalletClient({ chainId: base.id });
  const { switchChainAsync } = useSwitchChain();
  const baseClient = usePublicClient({ chainId: base.id });
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();

  const [progress, setProgress] = useState<WithdrawProgress>({ step: 'idle', message: '' });
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const getEmbeddedWallet = useCallback(() => {
    return wallets.find((w) => w.walletClientType === 'privy');
  }, [wallets]);

  const executeWithdraw = useCallback(
    async (params: WithdrawParams): Promise<string | undefined> => {
      if (!address || !baseClient) return;

      const embedded = getEmbeddedWallet();
      const isSilent = !!embedded;

      setIsWithdrawing(true);

      try {
        // Ensure we're on Base
        if (!isSilent) {
          await switchChainAsync({ chainId: base.id });
        }

        setProgress({ step: 'withdrawing', message: 'Withdrawing from protocol...' });

        let withdrawData: `0x${string}`;
        let to: `0x${string}`;

        if (params.protocol === 'aave-v3') {
          // Aave: withdraw(asset, maxUint256, to) → full withdraw including interest
          withdrawData = encodeFunctionData({
            abi: AAVE_WITHDRAW_ABI,
            functionName: 'withdraw',
            args: [BASE_USDC, maxUint256, address],
          });
          to = AAVE_POOL;
        } else {
          // Compound: withdraw(asset, exactBalance)
          withdrawData = encodeFunctionData({
            abi: COMPOUND_WITHDRAW_ABI,
            functionName: 'withdraw',
            args: [BASE_USDC, params.balanceRaw],
          });
          to = COMPOUND_COMET;
        }

        let txHash: string;

        if (isSilent) {
          const receipt = await privySendTransaction(
            { to, data: withdrawData, chainId: BASE_CHAIN_ID },
            { sponsor: true, address }
          );
          txHash = receipt.hash;
        } else {
          const { data: walletClient } = await refetchWalletClient();
          if (!walletClient) throw new Error('Wallet not available');
          txHash = await walletClient.sendTransaction({
            account: address,
            chain: base,
            to,
            data: withdrawData,
            value: 0n,
          });
        }

        console.log('[DefiWithdraw] Withdraw tx:', txHash);

        setProgress({ step: 'completed', message: 'Withdrawal successful!', txHash });
        setIsWithdrawing(false);
        return txHash;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Withdrawal failed';
        console.error('[DefiWithdraw] Failed:', error);
        setProgress({ step: 'failed', message: msg, error: msg });
        setIsWithdrawing(false);
        throw error;
      }
    },
    [address, baseClient, getEmbeddedWallet, privySendTransaction, refetchWalletClient, switchChainAsync]
  );

  const reset = useCallback(() => {
    setProgress({ step: 'idle', message: '' });
    setIsWithdrawing(false);
  }, []);

  return { executeWithdraw, progress, isWithdrawing, reset };
}
