'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient, useSwitchChain } from 'wagmi';
import { useWallets, useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth';
import { parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { base, polygon, mainnet } from 'wagmi/chains';
import type { Chain } from 'viem';

export type TransferStep =
  | 'idle'
  | 'checking_balance'
  | 'sending'
  | 'completed'
  | 'failed';

export interface TransferProgress {
  step: TransferStep;
  message: string;
  txHash?: string;
  error?: string;
}

export interface TransferParams {
  tokenAddress: string;
  toAddress: string;
  amount: string; // human-readable
  decimals: number;
  chainId: number;
}

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  137: polygon,
};

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

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

export function useTokenTransfer() {
  const { address: wagmiAddress } = useAccount();
  const { wallets } = useWallets();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();
  const { refetch: refetchWalletClient } = useWalletClient();

  // Use Privy embedded wallet address if available, fall back to wagmi address
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
  const address = (embeddedWallet?.address as `0x${string}` | undefined) || wagmiAddress;

  const basePublicClient = usePublicClient({ chainId: base.id });
  const polygonPublicClient = usePublicClient({ chainId: polygon.id });
  const mainnetPublicClient = usePublicClient({ chainId: mainnet.id });

  const [progress, setProgress] = useState<TransferProgress>({ step: 'idle', message: '' });
  const [isTransferring, setIsTransferring] = useState(false);

  const getPublicClient = useCallback((chainId: number) => {
    if (chainId === 8453) return basePublicClient;
    if (chainId === 137) return polygonPublicClient;
    if (chainId === 1) return mainnetPublicClient;
    return basePublicClient;
  }, [basePublicClient, polygonPublicClient, mainnetPublicClient]);

  const getEmbeddedWallet = useCallback(() => {
    return wallets.find(w => w.walletClientType === 'privy');
  }, [wallets]);

  const executeTransfer = useCallback(async (params: TransferParams): Promise<string | undefined> => {
    if (!address) throw new Error('Wallet not connected');

    const publicClient = getPublicClient(params.chainId);
    if (!publicClient) throw new Error('Public client not available');

    const embedded = getEmbeddedWallet();
    const isSilent = !!embedded;
    const chain = CHAIN_MAP[params.chainId];

    setIsTransferring(true);

    try {
      // Switch chain if needed
      if (!isSilent) {
        await switchChainAsync({ chainId: params.chainId });
      } else if (embedded) {
        await embedded.switchChain(params.chainId);
      }

      // Step 1: Check balance
      setProgress({ step: 'checking_balance', message: 'Checking token balance...' });
      const amountRaw = parseUnits(params.amount, params.decimals);

      const isNative =
        params.tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000';

      if (isNative) {
        const balance = await publicClient.getBalance({ address });
        if (balance < amountRaw) {
          const balFmt = formatUnits(balance, params.decimals);
          throw new Error(`Insufficient balance. Have ${parseFloat(balFmt).toFixed(4)}, need ${params.amount}`);
        }
      } else {
        const balance = await publicClient.readContract({
          address: params.tokenAddress as `0x${string}`,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [address],
        });

        if (balance < amountRaw) {
          const balFmt = formatUnits(balance, params.decimals);
          throw new Error(`Insufficient balance. Have ${parseFloat(balFmt).toFixed(4)}, need ${params.amount}`);
        }
      }

      // Step 2: Send transfer
      setProgress({ step: 'sending', message: 'Sending transfer...' });

      let txHash: string;

      if (isNative) {
        // Native token transfer (ETH/MATIC)
        const tx = {
          to: params.toAddress as `0x${string}`,
          value: amountRaw,
          chainId: params.chainId,
        };

        if (isSilent) {
          const receipt = await privySendTransaction(tx, { sponsor: true, address });
          txHash = receipt.hash;
        } else {
          const { data: walletClient } = await refetchWalletClient();
          if (!walletClient) throw new Error('Wallet not available');
          txHash = await walletClient.sendTransaction({ account: address, chain, ...tx });
        }
      } else {
        // ERC20 transfer
        const transferData = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [params.toAddress as `0x${string}`, amountRaw],
        });

        const tx = {
          to: params.tokenAddress as `0x${string}`,
          data: transferData,
          chainId: params.chainId,
        };

        if (isSilent) {
          const receipt = await privySendTransaction(tx, { sponsor: true, address });
          txHash = receipt.hash;
        } else {
          const { data: walletClient } = await refetchWalletClient();
          if (!walletClient) throw new Error('Wallet not available');
          txHash = await walletClient.sendTransaction({ account: address, chain, ...tx, value: 0n });
        }
      }

      setProgress({ step: 'completed', message: 'Transfer complete!', txHash });
      setIsTransferring(false);
      return txHash;

    } catch (error: unknown) {
      const msg = error instanceof Error ? (error as { shortMessage?: string }).shortMessage || error.message : 'Transfer failed';
      console.error('[TokenTransfer] Failed:', error);
      setProgress({ step: 'failed', message: msg, error: msg });
      setIsTransferring(false);
      throw error;
    }
  }, [address, getPublicClient, getEmbeddedWallet, privySendTransaction, refetchWalletClient, switchChainAsync]);

  const reset = useCallback(() => {
    setProgress({ step: 'idle', message: '' });
    setIsTransferring(false);
  }, []);

  return { executeTransfer, progress, isTransferring, reset };
}
