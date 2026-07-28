// use-defi-invest.ts - One-click DeFi deposits into Aave V3 and Compound III on Base
// Uses Privy useSendTransaction with gas sponsorship for embedded wallets, wagmi fallback for external
import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient, useSwitchChain } from 'wagmi';
import { useWallets, useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth';
import { parseUnits, encodeFunctionData, formatUnits } from 'viem';
import { base } from 'wagmi/chains';

export type SupportedProtocol = 'aave-v3' | 'compound-iii';

export type InvestStep =
  | 'idle'
  | 'checking_balance'
  | 'checking_allowance'
  | 'approving'
  | 'depositing'
  | 'completed'
  | 'failed';

export interface InvestProgress {
  step: InvestStep;
  message: string;
  txHash?: string;
  error?: string;
}

export interface InvestParams {
  protocol: SupportedProtocol;
  amountUsdc: string; // human-readable, e.g. "100"
}

// Protocol config — all on Base (chainId 8453)
const PROTOCOL_CONFIG: Record<SupportedProtocol, { poolAddress: `0x${string}`; label: string }> = {
  'aave-v3': {
    poolAddress: '0xa238dd80c259a72e81d7e4664a9801593f98d1c5',
    label: 'Aave V3',
  },
  'compound-iii': {
    poolAddress: '0x46e6b214b524310239732d51387075e0e70970bf',
    label: 'Compound III',
  },
};

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
const BASE_CHAIN_ID = 8453;

// Minimal ABIs — inline as const (matches codebase pattern)
const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ERC20_ALLOWANCE_ABI = [
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const AAVE_V3_SUPPLY_ABI = [
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
      { name: 'referralCode', type: 'uint16' },
    ],
    name: 'supply',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const COMPOUND_SUPPLY_ABI = [
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'supply',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export function useDefiInvest() {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { refetch: refetchWalletClient } = useWalletClient({ chainId: base.id });
  const { switchChainAsync } = useSwitchChain();
  const baseClient = usePublicClient({ chainId: base.id });
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();

  const [progress, setProgress] = useState<InvestProgress>({ step: 'idle', message: '' });
  const [isInvesting, setIsInvesting] = useState(false);

  const getEmbeddedWallet = useCallback(() => {
    return wallets.find(w => w.walletClientType === 'privy');
  }, [wallets]);

  const executeInvest = useCallback(async (params: InvestParams): Promise<string | undefined> => {
    if (!address || !baseClient) return;

    const config = PROTOCOL_CONFIG[params.protocol];
    const amountRaw = parseUnits(params.amountUsdc, 6); // USDC = 6 decimals
    const embedded = getEmbeddedWallet();
    const isSilent = !!embedded;

    setIsInvesting(true);

    try {
      // Ensure we're on Base chain
      if (!isSilent) {
        await switchChainAsync({ chainId: base.id });
      }

      // Step 1: Check USDC balance
      setProgress({ step: 'checking_balance', message: 'Checking USDC balance...' });

      const balance = await baseClient.readContract({
        address: BASE_USDC,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [address],
      });

      if (balance < amountRaw) {
        const balanceFormatted = formatUnits(balance, 6);
        throw new Error(`Insufficient USDC balance. You have $${parseFloat(balanceFormatted).toFixed(2)} but need $${params.amountUsdc}`);
      }

      // Step 2: Check allowance
      setProgress({ step: 'checking_allowance', message: 'Checking USDC allowance...' });

      const currentAllowance = await baseClient.readContract({
        address: BASE_USDC,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: 'allowance',
        args: [address, config.poolAddress],
      });

      // Step 3: Approve if needed (use generous amount to avoid bundler simulation race)
      if (currentAllowance < amountRaw) {
        setProgress({ step: 'approving', message: `Approving USDC for ${config.label}...` });

        const approveAmount = amountRaw * 10n;
        const approveData = encodeFunctionData({
          abi: ERC20_APPROVE_ABI,
          functionName: 'approve',
          args: [config.poolAddress, approveAmount],
        });

        if (isSilent) {
          const approveReceipt = await privySendTransaction(
            { to: BASE_USDC, data: approveData, chainId: BASE_CHAIN_ID },
            { sponsor: true, address },
          );
          // Poll fast (250ms) to catch Base Flashblocks preconfirmations (~200ms
          // receipts on QuickNode Base) instead of waiting up to a full 2s block.
          await baseClient.waitForTransactionReceipt({ hash: approveReceipt.hash as `0x${string}`, pollingInterval: 250 });
        } else {
          const { data: walletClient } = await refetchWalletClient();
          if (!walletClient) throw new Error('Wallet not available');
          const approveTxHash = await walletClient.sendTransaction({
            account: address,
            chain: base,
            to: BASE_USDC,
            data: approveData,
            value: 0n,
          });
          await baseClient.waitForTransactionReceipt({ hash: approveTxHash, pollingInterval: 250 });
        }

        // Re-verify allowance (bundler may simulate against stale state)
        const newAllowance = await baseClient.readContract({
          address: BASE_USDC,
          abi: ERC20_ALLOWANCE_ABI,
          functionName: 'allowance',
          args: [address, config.poolAddress],
        });

        if (newAllowance < amountRaw) {
          await new Promise(r => setTimeout(r, 3000));
        }

        console.log('[DefiInvest] USDC approved for', config.label);
      }

      // Step 4: Deposit into protocol
      setProgress({ step: 'depositing', message: `Depositing $${params.amountUsdc} USDC into ${config.label}...` });

      let supplyData: `0x${string}`;

      if (params.protocol === 'aave-v3') {
        supplyData = encodeFunctionData({
          abi: AAVE_V3_SUPPLY_ABI,
          functionName: 'supply',
          args: [BASE_USDC, amountRaw, address, 0],
        });
      } else {
        supplyData = encodeFunctionData({
          abi: COMPOUND_SUPPLY_ABI,
          functionName: 'supply',
          args: [BASE_USDC, amountRaw],
        });
      }

      let supplyTxHash: string;

      if (isSilent) {
        const receipt = await privySendTransaction(
          { to: config.poolAddress, data: supplyData, chainId: BASE_CHAIN_ID },
          { sponsor: true, address },
        );
        supplyTxHash = receipt.hash;
      } else {
        const { data: walletClient } = await refetchWalletClient();
        if (!walletClient) throw new Error('Wallet not available');
        supplyTxHash = await walletClient.sendTransaction({
          account: address,
          chain: base,
          to: config.poolAddress,
          data: supplyData,
          value: 0n,
        });
      }

      console.log('[DefiInvest] Deposit tx:', supplyTxHash);

      setProgress({ step: 'completed', message: 'Deposit successful!', txHash: supplyTxHash });
      setIsInvesting(false);
      return supplyTxHash;

    } catch (error: unknown) {
      console.error('[DefiInvest] Failed:', error);
      const raw = error instanceof Error ? (error as { shortMessage?: string }).shortMessage || error.message : 'Deposit failed';
      let msg = raw;
      if (raw.includes('UserOperation reverted') || raw.includes('reason: 0x')) {
        msg = 'Deposit transaction failed. The approval may not have settled yet. Please try again.';
      } else if (raw.includes('Insufficient')) {
        msg = raw;
      } else if (raw.length > 120) {
        msg = 'Deposit failed. Please try again in a few seconds.';
      }
      setProgress({ step: 'failed', message: msg, error: msg });
      setIsInvesting(false);
      throw error;
    }
  }, [address, baseClient, getEmbeddedWallet, privySendTransaction, refetchWalletClient, switchChainAsync]);

  const reset = useCallback(() => {
    setProgress({ step: 'idle', message: '' });
    setIsInvesting(false);
  }, []);

  return { executeInvest, progress, isInvesting, reset };
}
