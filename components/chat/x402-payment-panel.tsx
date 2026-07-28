// components/chat/x402-payment-panel.tsx
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useChatStore } from '@/lib/store/chat';
import { toast } from 'sonner';
import type { X402PaymentProof } from '@/lib/x402/types';
import { formatUnits } from 'viem';
import type { Address } from 'viem';
import { useBalance } from 'wagmi';
import { useCirclePayment as usePaymentTransaction } from '@/lib/hooks/use-circle-payment';
import { CONTRACTS } from '@/lib/contracts/addresses';
import { PredictionMarketCategoryPanel } from '../prediction-markets/prediction-market-category-panel';
import { AIModelSelectorModal } from './ai-model-selector-modal';

interface X402PaymentData {
  paymentRequest: {
    amount: string;
    token: string;
    recipient: string;
    chainId: number;
    description?: string;
  };
  agentId: string;
  agentName: string;
  endpointId: string;
  originalParams: Record<string, any>;
  agentContext?: any; // For conversational agents
}

interface X402PaymentPanelProps {
  data: X402PaymentData;
}

type PaymentStep = 'ready' | 'paying' | 'verifying' | 'retrying' | 'completed' | 'error' | 'category_selection' | 'ai_model_selection';

export function X402PaymentPanel({ data }: X402PaymentPanelProps) {
  const { paymentRequest, agentName, endpointId, originalParams, agentContext } = data;
  const [step, setStep] = useState<PaymentStep>('ready');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [storedPaymentProof, setStoredPaymentProof] = useState<X402PaymentProof | null>(null);
  const [optimisticDeduction, setOptimisticDeduction] = useState(0n);

  // Use the shared payment hook
  const payment = usePaymentTransaction();

  const addMessage = useChatStore((state) => state.addMessage);
  const getCurrentSession = useChatStore((state) => state.getCurrentSession);

  const amount = BigInt(paymentRequest.amount);
  const amountFormatted = formatUnits(amount, 6);
  const recipientAddress = paymentRequest.recipient as Address;
  const tokenAddress = (paymentRequest.token || CONTRACTS.USDC) as Address;

  // Get payment wallet USDC balance
  const { data: balanceData, isLoading: isLoadingBalance, refetch: refetchBalance } = useBalance({
    address: payment.paymentAddress as Address,
    token: tokenAddress,
    query: {
      enabled: payment.isWalletReady && !!payment.paymentAddress,
    },
  });

  // ETH balance check removed - EIP-3009 is gasless for users

  const rawBalance = balanceData?.value;
  const balance = rawBalance !== undefined ? rawBalance - optimisticDeduction : undefined;
  // Only consider balance insufficient if we've actually loaded it (not undefined)
  const balanceLoaded = balance !== undefined;
  const hasEnoughBalance = balanceLoaded && balance >= amount;

  // Note: EIP-3009 is gasless for users (relayer pays gas)
  // CDP wallets are also gasless via paymaster

  // Refetch balance when wallet becomes ready or address changes
  useEffect(() => {
    if (payment.isWalletReady && payment.paymentAddress) {
      // Small delay to ensure wallet state is fully propagated
      const timer = setTimeout(() => {
        refetchBalance();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [payment.isWalletReady, payment.paymentAddress, refetchBalance]);

  // Refetch balance after payment completes to show updated balance
  useEffect(() => {
    if (step === 'completed') {
      // Delay to allow blockchain to update
      const timer = setTimeout(() => {
        refetchBalance();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [step, refetchBalance]);

  // Handle retry after payment with retry mechanism for indexing delays
  const handleRetryWithPayment = useCallback(async (proof: X402PaymentProof) => {
    setStep('retrying');

    const session = getCurrentSession();
    if (!session) {
      setErrorMessage('Session not found');
      setStep('error');
      return;
    }

    const payload = {
      endpointId,
      params: originalParams,
      paymentProof: proof,
      agentContext, // Include agentContext for conversational agents
    };

    // Retry configuration for handling RPC indexing delays
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 5000;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch('/api/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `[RUN_WITH_PAYMENT] ${JSON.stringify(payload)}`,
            sessionId: session.id,
            walletAddress: payment.paymentAddress
          }),
        });

        // Handle 422 - Unprocessable Entity (e.g., token not found)
        // Don't retry these - the issue won't resolve with retries
        if (response.status === 422) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Token analysis failed');
        }

        // Handle 400 - Bad Request (payment verification pending)
        // These may succeed on retry as RPC indexes the transaction
        if (response.status === 400) {
          const errorData = await response.json().catch(() => ({}));

          if (attempt < MAX_RETRIES) {
            toast.info(`Waiting for transaction confirmation... (attempt ${attempt}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            continue;
          }
          throw new Error(errorData.message || 'Payment verification failed after retries');
        }

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        let messageContent = result.message;
        const messageMetadata: { action?: { type: string; data?: any } } = {};

        try {
          const parsed = JSON.parse(result.message);
          if (parsed.message) {
            messageContent = parsed.message;
          }
          // Preserve any action returned by the server so the chat UI can render
          // structured result panels (defi_yield_result, wallet_*_result, etc.).
          if (parsed.action?.type) {
            messageMetadata.action = parsed.action;
          }
        } catch {
          // Not JSON
        }

        addMessage({
          role: 'assistant',
          content: messageContent,
          metadata: messageMetadata,
        });

        setStep('completed');
        toast.success('Analysis complete!');
        return;

      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error');
        console.error(`[X402PaymentPanel] Attempt ${attempt} failed:`, lastError.message);

        if (!lastError.message.includes('400') && attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    setErrorMessage(lastError?.message || 'Payment verification failed after multiple attempts');
    setStep('error');
    toast.error('Verification failed. Your transaction succeeded - please contact support with your tx hash.');
  }, [endpointId, originalParams, getCurrentSession, addMessage, payment.paymentAddress]);

  // Handle payment
  const handlePay = useCallback(async () => {
    setStep('paying');
    setErrorMessage(null);

    await payment.executePayment({
      recipient: recipientAddress,
      amount: amountFormatted,
      tokenAddress,
      onSuccess: async (txHash) => {
        setStep('verifying');
        toast.success('Payment sent!');
        setOptimisticDeduction((prev) => prev + amount);

        const proof: X402PaymentProof = {
          txHash: txHash as `0x${string}`,
          from: payment.paymentAddress as Address,
          to: recipientAddress,
          amount: paymentRequest.amount,
          token: tokenAddress,
          timestamp: Date.now(),
        };

        refetchBalance();

        // For prediction-market, check if category was already selected during conversation
        if (endpointId === 'prediction-market') {
          const validCategories = ['Sports', 'Politics', 'Crypto', 'Business', 'AI', 'Trump', 'Stocks', 'Creators'];
          const userInterest = originalParams.interest;
          const wantsAll = originalParams.showAll === true;

          // User explicitly asked for "everything" / "all categories"
          if (wantsAll) {
            toast.info('Scanning all categories...');
            handleRetryWithPayment(proof);
            return;
          }

          // User specified a valid category during conversation
          if (userInterest) {
            const isValidCategory = validCategories.some(
              cat => cat.toLowerCase() === userInterest.toLowerCase()
            );

            if (isValidCategory) {
              toast.info('Running analysis...');
              handleRetryWithPayment(proof);
              return;
            }

            // Invalid/unclear category - show selection modal
            toast.info('Let\'s pick a category from the available options');
            setStoredPaymentProof(proof);
            setStep('category_selection');
            return;
          }

          // No interest specified at all - show category selection modal
          setStoredPaymentProof(proof);
          setStep('category_selection');
          return;
        }

        // For contract-audit, show AI model selection after payment
        if (endpointId === 'contract-audit') {
          setStoredPaymentProof(proof);
          setStep('ai_model_selection');
          return;
        }

        // For other endpoints, run analysis immediately with optimistic verification
        toast.info('Running analysis...');
        handleRetryWithPayment(proof);
      },
      onError: (error) => {
        setErrorMessage(error.message);
        setStep('error');
        toast.error('Payment failed');
      },
    });
  }, [payment, recipientAddress, amountFormatted, tokenAddress, paymentRequest.amount, refetchBalance, handleRetryWithPayment, endpointId]);

  // Status configurations
  const getStepConfig = () => {
    switch (step) {
      case 'paying':
        return { text: 'Sending payment...', showSpinner: true };
      case 'verifying':
        return { text: 'Verifying...', showSpinner: true };
      case 'retrying':
        return { text: 'Running analysis...', showSpinner: true };
      case 'completed':
        return { text: 'Complete', showSpinner: false };
      case 'error':
        return { text: 'Failed', showSpinner: false };
      default:
        return null;
    }
  };

  const stepConfig = getStepConfig();
  const isProcessing = ['paying', 'verifying', 'retrying'].includes(step) || payment.isProcessing;

  // Determine button state and text
  const getButtonConfig = () => {
    // Show checking state when loading OR when wallet is ready but balance hasn't loaded yet
    const isBalanceLoading = isLoadingBalance || (payment.isWalletReady && !balanceLoaded);

    if (isBalanceLoading) {
      return { text: 'Checking...', disabled: true };
    }
    // Only show insufficient balance error after balance has actually loaded
    if (balanceLoaded && !hasEnoughBalance) {
      return { text: `Need $${amountFormatted} USDC`, disabled: true, isError: true };
    }
    if (payment.isProcessing) {
      return { text: 'Confirming...', disabled: true };
    }
    return { text: `Pay $${amountFormatted}`, disabled: false };
  };

  const buttonConfig = getButtonConfig();

  // Show category selection panel for prediction-market after payment
  if (step === 'category_selection' && storedPaymentProof) {
    return (
      <PredictionMarketCategoryPanel
        paymentProof={storedPaymentProof}
        originalParams={originalParams}
        endpointId={endpointId}
        onComplete={() => setStep('completed')}
      />
    );
  }

  // Show AI model selection for contract-audit after payment
  if (step === 'ai_model_selection' && storedPaymentProof) {
    return (
      <AIModelSelectorModal
        paymentProof={storedPaymentProof}
        originalParams={originalParams}
        endpointId={endpointId}
        onComplete={() => setStep('completed')}
      />
    );
  }

  return (
    <div className="border border-[#e5e7eb] bg-white max-w-xs rounded-[12px]">
      {/* Header */}
      <div className="border-b border-[#e5e7eb] px-3 py-1.5 bg-white text-[#3a3a3a] flex items-center justify-between rounded-t-[12px]">
        <span className="text-[11px] font-semibold text-[#6b7280]">
          {step === 'completed' ? 'Paid' : 'Payment'}
        </span>
        <span className="font-mono text-[8px] text-[#6b7280]">X402</span>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Service + Amount */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-xs tracking-tight truncate text-[#3a3a3a]">{agentName}</div>
            <div className="text-[9px] text-[#6b7280] truncate">
              {paymentRequest.description || 'Analysis'}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono font-black text-lg">${amountFormatted}</div>
            <div className="font-mono text-[8px] text-[#6b7280]">USDC</div>
          </div>
        </div>

        {/* Balance - show in ready, completed, and error states */}
        {payment.isWalletReady && payment.paymentAddress && ['ready', 'completed', 'error'].includes(step) && (
          <div className="py-1.5 px-2 bg-[#f8fafc] border border-[#e5e7eb] rounded-lg text-[9px] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[#6b7280]">Balance</span>
              <span className={`font-mono font-bold ${!balanceLoaded ? 'text-black/50' :
                  hasEnoughBalance ? 'text-green-700' : 'text-red-700'
                }`}>
                {isLoadingBalance || !balanceLoaded ? 'Loading...' : `$${formatUnits(balance || 0n, 6)}`}
              </span>
            </div>
            {step === 'ready' && balanceLoaded && (
              <div className="flex items-center justify-between text-[#6b7280]">
                <span className="font-mono">After payment</span>
                <span className={`font-mono font-bold ${hasEnoughBalance ? 'text-[#6b7280]' : 'text-red-500'}`}>
                  {hasEnoughBalance
                    ? `$${formatUnits((balance || 0n) - amount, 6)}`
                    : 'Insufficient'
                  }
                </span>
              </div>
            )}
          </div>
        )}

        {/* Wallet Not Connected Notice */}
        {!payment.isWalletReady && step === 'ready' && (
          <div className="py-2 px-2 bg-[#f8fafc] border border-[#e5e7eb] rounded-lg text-center">
            <span className="text-[9px] text-[#6b7280]">
              Wallet not connected
            </span>
          </div>
        )}

        {/* Status */}
        {stepConfig && (
          <div className={`flex items-center justify-center gap-1.5 py-2 border rounded-lg ${step === 'completed' ? 'bg-green-50 border-green-200' :
              step === 'error' ? 'bg-red-50 border-red-200' :
                'bg-[#f8fafc] border-[#e5e7eb]'
            }`}>
            {stepConfig.showSpinner && (
              <div className="w-3 h-3 border-2 border-[#e5e7eb] border-t-[#3a3a3a] rounded-full animate-spin" />
            )}
            {step === 'completed' && (
              <svg className="w-3 h-3 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {step === 'error' && (
              <svg className="w-3 h-3 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className={`text-[9px] font-semibold ${step === 'completed' ? 'text-green-700' : step === 'error' ? 'text-red-700' : 'text-[#6b7280]'
              }`}>
              {stepConfig.text}
            </span>
          </div>
        )}

        {/* Error */}
        {step === 'error' && errorMessage && (
          <p className="text-[8px] font-mono text-red-700 text-center">{errorMessage}</p>
        )}

        {/* Tx Link */}
        {payment.txHash && (
          <a
            href={`https://basescan.org/tx/${payment.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-[8px] font-mono text-[#6b7280] hover:text-[#3a3a3a]"
          >
            View TX
          </a>
        )}

        {/* Pay Button */}
        {step === 'ready' && (
          <button
            type="button"
            onClick={handlePay}
            disabled={buttonConfig.disabled}
            className={`w-full py-2 border border-[#e5e7eb] rounded-lg font-mono text-[10px] font-bold transition-colors ${buttonConfig.disabled
                ? buttonConfig.isError
                  ? 'bg-white text-red-600 cursor-not-allowed opacity-60'
                  : 'bg-white text-[#6b7280] cursor-not-allowed'
                : 'bg-[#3a3a3a] text-white hover:bg-[#f7f7f7] hover:text-[#3a3a3a]'
              }`}
          >
            {buttonConfig.text}
          </button>
        )}

        {/* Retry */}
        {step === 'error' && (
          <button
            type="button"
            onClick={() => {
              setStep('ready');
              setErrorMessage(null);
              payment.reset();
            }}
            className="w-full py-2 border border-[#e5e7eb] rounded-lg bg-white text-[#3a3a3a] font-mono text-[10px] font-bold hover:bg-[#f7f7f7] transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
