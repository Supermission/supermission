'use client';

import { useState, useCallback } from 'react';
import { parseUnits, formatUnits, isAddress } from 'viem';
import type { Address } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { usePaymentWallet } from './use-payment-wallet';
import { CONTRACTS } from '@/lib/contracts/addresses';

// ERC-20 Transfer ABI
const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export type WithdrawalStatus = 'idle' | 'validating' | 'sending' | 'confirming' | 'success' | 'error';

interface WithdrawalParams {
  recipientAddress: string;
  amount: string; // In USDC (e.g., "10.00")
}

interface WithdrawalResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export function useServerWithdrawal() {
  const { paymentAddress: walletAddress, isReady } = usePaymentWallet();

  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<WithdrawalStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateWithdrawal = useCallback((params: WithdrawalParams): string | null => {
    if (!params.recipientAddress || !isAddress(params.recipientAddress)) {
      return 'Please enter a valid wallet address';
    }

    const amount = parseFloat(params.amount);
    if (isNaN(amount) || amount <= 0) {
      return 'Please enter a valid amount';
    }

    if (amount < 0.01) {
      return 'Minimum withdrawal is 0.01 USDC';
    }

    if (params.recipientAddress.toLowerCase() === walletAddress?.toLowerCase()) {
      return 'Cannot withdraw to your own wallet';
    }

    return null;
  }, [walletAddress]);

  const executeWithdrawal = useCallback(async (params: WithdrawalParams): Promise<WithdrawalResult> => {
    setStatus('validating');
    setError(null);
    setTxHash(null);

    if (!isReady || !walletAddress) {
      const errorMsg = 'Wallet not connected';
      setError(errorMsg);
      setStatus('error');
      return { success: false, error: errorMsg };
    }

    const validationError = validateWithdrawal(params);
    if (validationError) {
      setError(validationError);
      setStatus('error');
      return { success: false, error: validationError };
    }

    try {
      setStatus('sending');

      const amountInWei = parseUnits(params.amount, 6);

      console.log('[useWithdrawal] Sending withdrawal:', {
        from: walletAddress,
        to: params.recipientAddress,
        amount: formatUnits(amountInWei, 6),
        token: CONTRACTS.USDC,
      });

      // Use wagmi writeContract for direct ERC-20 transfer
      const hash = await writeContractAsync({
        address: CONTRACTS.USDC,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [params.recipientAddress as Address, amountInWei],
      });

      if (!hash) {
        throw new Error('Transaction failed - no hash returned');
      }

      setStatus('confirming');

      console.log('[useWithdrawal] Withdrawal submitted:', hash);
      setTxHash(hash);
      setStatus('success');

      return { success: true, txHash: hash };

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Withdrawal failed';
      console.error('[useWithdrawal] Withdrawal error:', errorMsg);
      setError(errorMsg);
      setStatus('error');
      return { success: false, error: errorMsg };
    }
  }, [isReady, walletAddress, validateWithdrawal, writeContractAsync]);

  const reset = useCallback(() => {
    setStatus('idle');
    setTxHash(null);
    setError(null);
  }, []);

  return {
    // Wallet info (legacy compat)
    cdpAddress: walletAddress,
    isCDPReady: isReady,

    // Withdrawal execution
    executeWithdrawal,
    validateWithdrawal,

    // Withdrawal state
    status,
    isProcessing: ['validating', 'sending', 'confirming'].includes(status),
    txHash,
    error,

    // Reset state
    reset,
  };
}

// Legacy alias
export const useCDPWithdrawal = useServerWithdrawal;
