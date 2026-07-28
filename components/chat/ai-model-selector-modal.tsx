'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useChatStore } from '@/lib/store/chat';
import { toast } from 'sonner';
import type { X402PaymentProof } from '@/lib/x402/types';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useBalance } from 'wagmi';
import { CONTRACTS } from '@/lib/contracts/addresses';
import { formatUnits } from 'viem';
import type { Address } from 'viem';

interface AIModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  description: string;
  icon: string;
}

const AI_MODELS: AIModel[] = [
  {
    id: 'claude',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    modelId: 'anthropic/claude-sonnet-4',
    description: 'Best for detailed security analysis and reasoning',
    icon: 'CL',
  },
  {
    id: 'gpt5',
    name: 'GPT-5',
    provider: 'OpenAI',
    modelId: 'openai/gpt-5',
    description: 'Advanced reasoning with superior audit capabilities',
    icon: 'GP',
  },
  {
    id: 'gemini',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    modelId: 'google/gemini-2.5-pro-preview-05-06',
    description: 'Fast analysis with large context window',
    icon: 'GE',
  },
];

interface AIModelSelectorModalProps {
  paymentProof: X402PaymentProof;
  originalParams: Record<string, unknown>;
  endpointId: string;
  onComplete: () => void;
}

type PanelStep = 'selecting' | 'loading' | 'completed' | 'error';

export function AIModelSelectorModal({
  paymentProof,
  originalParams,
  endpointId,
  onComplete,
}: AIModelSelectorModalProps) {
  const [step, setStep] = useState<PanelStep>('selecting');
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const addMessage = useChatStore((state) => state.addMessage);
  const getCurrentSession = useChatStore((state) => state.getCurrentSession);

  // Get wallet and balance for display
  const { paymentAddress, isReady: isWalletReady } = usePaymentWallet();
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: paymentAddress as Address,
    token: CONTRACTS.USDC as Address,
    query: {
      enabled: isWalletReady && !!paymentAddress,
    },
  });

  // Refetch balance on mount to show updated balance after payment
  useEffect(() => {
    if (isWalletReady && paymentAddress) {
      const timer = setTimeout(() => refetchBalance(), 1000);
      return () => clearTimeout(timer);
    }
  }, [isWalletReady, paymentAddress, refetchBalance]);

  const handleModelSelect = useCallback(
    async (model: AIModel) => {
      setSelectedModel(model);
      setStep('loading');
      setErrorMessage(null);

      const session = getCurrentSession();
      if (!session) {
        setErrorMessage('Session not found');
        setStep('error');
        return;
      }

      const payload = {
        endpointId,
        params: {
          ...originalParams,
          selectedModel: model.modelId,
        },
        paymentProof,
      };

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
              walletAddress: paymentAddress,
            }),
          });

          // Handle 422 - Unprocessable Entity (audit failed)
          if (response.status === 422) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Contract audit failed');
          }

          // Handle 400 - Bad Request (payment verification pending)
          if (response.status === 400) {
            const errorData = await response.json().catch(() => ({}));
            if (attempt < MAX_RETRIES) {
              toast.info(
                `Verifying payment... (${attempt}/${MAX_RETRIES})`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, RETRY_DELAY_MS)
              );
              continue;
            }
            throw new Error(
              errorData.message || 'Payment verification failed'
            );
          }

          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }

          const result = await response.json();
          let messageContent = result.message;
          const messageMetadata: { action?: { type: string; data?: Record<string, unknown> } } =
            {};

          try {
            const parsed = JSON.parse(result.message);
            if (parsed.message) {
              messageContent = parsed.message;
            }
            if (parsed.action?.type === 'contract_audit_result') {
              messageMetadata.action = {
                type: 'contract_audit_result',
                data: parsed.action.data as Record<string, unknown>,
              };
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
          toast.success('Audit complete!');
          onComplete();
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('Unknown error');
          if (
            !lastError.message.includes('400') &&
            attempt < MAX_RETRIES
          ) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }

      setErrorMessage(lastError?.message || 'Failed to complete audit');
      setStep('error');
      toast.error('Audit failed');
    },
    [
      endpointId,
      originalParams,
      paymentProof,
      getCurrentSession,
      addMessage,
      onComplete,
      paymentAddress,
    ]
  );

  const handleRetry = () => {
    setStep('selecting');
    setSelectedModel(null);
    setErrorMessage(null);
  };

  if (step === 'completed') {
    return null;
  }

  return (
    <div className="border border-[#e5e7eb] bg-white max-w-sm rounded-[12px]">
      {/* Header */}
      <div className="border-b border-[#e5e7eb] px-3 py-1.5 bg-white text-[#3a3a3a] flex items-center justify-between rounded-t-[12px]">
        <span className="text-[11px] font-semibold text-[#6b7280]">
          Select AI Model
        </span>
        <span className="text-[8px] text-[#6b7280]">Audit</span>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Payment Success + Balance */}
        {isWalletReady && paymentAddress && (
          <div className="flex items-center justify-between py-1.5 px-2 bg-green-50 border border-green-200 text-[9px]">
            <div className="flex items-center gap-1.5">
              <svg
                className="w-3 h-3 text-green-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="font-mono uppercase text-green-700 font-bold">
                Paid
              </span>
            </div>
            <span className="font-mono font-bold text-green-700">
              Balance: $
              {balanceData?.value
                ? formatUnits(balanceData.value, 6)
                : '...'}
            </span>
          </div>
        )}

        {step === 'selecting' && (
          <>
            <p className="text-[11px] text-[#6b7280]">
              Choose an AI model for your audit report
            </p>

            {/* Model Cards */}
            <div className="space-y-2">
              {AI_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleModelSelect(model)}
                  className="w-full p-3 border border-[#e5e7eb] bg-white hover:bg-[#f7f7f7] transition-colors text-left group rounded-[12px]"
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="w-8 h-8 border border-[#e5e7eb] rounded-lg flex items-center justify-center font-mono text-[10px] font-bold shrink-0">
                      {model.icon}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-[#3a3a3a]">
                          {model.name}
                        </span>
                        <span className="text-[8px] text-[#6b7280]">
                          {model.provider}
                        </span>
                      </div>
                      <p className="text-[9px] text-[#6b7280] mt-0.5">
                        {model.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <div className="w-5 h-5 border-2 border-[#e5e7eb] border-t-[#3a3a3a] rounded-full animate-spin" />
            <div className="text-center">
              <span className="text-[10px] font-semibold text-[#6b7280] block">
                Running audit with {selectedModel?.name}...
              </span>
              <span className="text-[8px] text-[#6b7280] block mt-1">
                This may take a moment
              </span>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-1.5 py-2 bg-red-50 border border-red-200">
              <svg
                className="w-3 h-3 text-red-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <span className="text-[9px] font-semibold text-red-700">
                Failed
              </span>
            </div>
            {errorMessage && (
              <p className="text-[8px] font-mono text-red-700 text-center">
                {errorMessage}
              </p>
            )}
            <button
              onClick={handleRetry}
              className="w-full py-2 border border-[#e5e7eb] rounded-lg bg-white text-[#3a3a3a] font-mono text-[10px] font-bold hover:bg-[#f7f7f7] transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
