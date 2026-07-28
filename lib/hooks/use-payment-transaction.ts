// hooks/usePaymentTransaction.ts
import { useState, useCallback } from 'react';
import { parseUnits, formatUnits, encodeFunctionData } from 'viem';
import type { Address } from 'viem';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { CONTRACTS } from '@/lib/contracts/addresses';
import { useSwitchChain, useChainId, useWalletClient } from 'wagmi';
import { useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth';
import { base } from 'viem/chains';

interface PaymentParams {
  recipient: Address;
  amount: string; // In USDC (e.g., "0.01")
  tokenAddress?: Address; // Defaults to CONTRACTS.USDC
  onSuccess?: (txHash: string) => void | Promise<void>;
  onError?: (error: Error) => void;
}

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

export function usePaymentTransaction() {
  // Unified payment wallet (Privy embedded)
  const { paymentAddress, isReady: isWalletReady, walletType } = usePaymentWallet();

  // Chain management
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient, isLoading: isWalletClientLoading } = useWalletClient();
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();

  // Wallet is ready when walletClient is available
  const isWalletTrulyReady = isWalletReady && !!walletClient && !isWalletClientLoading;

  // Payment state
  const [isProcessing, setIsProcessing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Handle payment via Privy-sponsored transaction (gasless for user)
  const executePaymentViaPrivy = useCallback(async (params: PaymentParams): Promise<string | null> => {
    if (!paymentAddress) {
      throw new Error('Wallet not connected');
    }
    if (!privySendTransaction) {
      throw new Error('Privy sendTransaction not available');
    }

    const tokenAddress = params.tokenAddress || CONTRACTS.USDC;
    const amountInWei = parseUnits(params.amount, 6);
    const amountFormatted = formatUnits(amountInWei, 6);

    console.log('[usePaymentTransaction] Sending payment via Privy gas sponsorship:', {
      from: paymentAddress,
      to: params.recipient,
      amount: amountFormatted,
      token: tokenAddress,
      currentChainId,
      requiredChainId: base.id,
    });

    // Step 0: Ensure wallet is on Base chain
    if (currentChainId !== base.id) {
      console.log('[usePaymentTransaction] Switching to Base chain...');
      try {
        await switchChainAsync({ chainId: base.id });
      } catch (switchError) {
        console.error('[usePaymentTransaction] Failed to switch chain:', switchError);
        throw new Error('Please switch to Base network to complete this payment');
      }
    }

    // Step 1: Encode the transfer function call
    const transferData = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transfer',
      args: [params.recipient as Address, amountInWei],
    });

    console.log('[usePaymentTransaction] Executing sponsored transfer:', {
      to: tokenAddress,
      data: transferData,
    });

    // Step 2: Send transaction with Privy sponsoring the gas
    const tx = await privySendTransaction(
      {
        to: tokenAddress,
        data: transferData,
        chainId: base.id,
      },
      { sponsor: true, address: paymentAddress } // Privy sponsors the gas!
    );

    console.log('[usePaymentTransaction] Transaction submitted:', tx.hash);

    // Wait for confirmation
    // Note: We don't need to wait for receipt since we're using optimistic verification
    // The agent will verify on-chain

    return tx.hash;
  }, [paymentAddress, privySendTransaction, currentChainId, switchChainAsync]);

  // Main payment execution function
  const executePayment = useCallback(async (params: PaymentParams) => {
    if (!isWalletTrulyReady) {
      const error = new Error(
        !walletClient
          ? 'Wallet client initializing... Please try again in a moment.'
          : 'Please connect a wallet first'
      );
      setError(error);
      params.onError?.(error);
      return;
    }

    setIsProcessing(true);
    setError(null);
    setTxHash(null);

    try {
      // Use Privy gas sponsorship
      const hash = await executePaymentViaPrivy(params);
      if (hash) {
        setTxHash(hash);
        await params.onSuccess?.(hash);
      }
      setIsProcessing(false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Payment failed');
      console.error('[usePaymentTransaction] Payment error:', error);
      setError(error);
      setIsProcessing(false);
      params.onError?.(error);
    }
  }, [isWalletTrulyReady, walletClient, executePaymentViaPrivy]);

  const reset = useCallback(() => {
    setIsProcessing(false);
    setTxHash(null);
    setError(null);
  }, []);

  return {
    // Wallet info
    paymentAddress,
    isWalletReady: isWalletTrulyReady,
    walletType,

    // Payment execution
    executePayment,

    // Payment state
    isProcessing,
    txHash,
    error,

    // Utilities
    reset,
  };
}
