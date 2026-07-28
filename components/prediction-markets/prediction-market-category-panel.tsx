'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useChatStore } from '@/lib/store/chat';
import { toast } from 'sonner';
import type { X402PaymentProof } from '@/lib/x402/types';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';

interface PredictionMarketCategoryPanelProps {
  paymentProof: X402PaymentProof;
  originalParams: Record<string, any>;
  endpointId: string;
  onComplete: () => void;
}

type PanelStep = 'selecting' | 'loading' | 'completed' | 'error';

export function PredictionMarketCategoryPanel({
  paymentProof,
  originalParams,
  endpointId,
  onComplete,
}: PredictionMarketCategoryPanelProps) {
  const [step, setStep] = useState<PanelStep>('selecting');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const addMessage = useChatStore((state) => state.addMessage);
  const getCurrentSession = useChatStore((state) => state.getCurrentSession);

  // Get wallet status for payment confirmation toast
  const { paymentAddress, isReady: isWalletReady } = usePaymentWallet();

  // Show toast on mount to confirm payment
  useEffect(() => {
    if (isWalletReady && paymentAddress) {
      toast.success('Payment confirmed!');
    }
  }, [isWalletReady, paymentAddress]);

  // Fetch available categories from the database
  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetch('/api/prediction-market/categories');
        const data = await response.json();
        if (data.categories && data.categories.length > 0) {
          setCategories(data.categories);
        } else {
          // Fallback if no categories found
          setCategories(['Politics', 'Finance', 'Tech']);
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error);
        setCategories(['Politics', 'Finance', 'Tech']);
      } finally {
        setLoadingCategories(false);
      }
    }
    fetchCategories();
  }, []);

  const handleCategorySelect = useCallback(async (category: string | null) => {
    setSelectedCategory(category);
    setStep('loading');
    setErrorMessage(null);

    const session = getCurrentSession();
    if (!session) {
      setErrorMessage('Session not found');
      setStep('error');
      return;
    }

    // If "Surprise Me", pick a random category
    const finalCategory = category === null
      ? categories[Math.floor(Math.random() * categories.length)]
      : category;

    const payload = {
      endpointId,
      params: {
        ...originalParams,
        interest: finalCategory,
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
          }),
        });

        if (response.status === 400) {
          const errorData = await response.json().catch(() => ({}));
          if (attempt < MAX_RETRIES) {
            toast.info(`Verifying payment... (${attempt}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            continue;
          }
          throw new Error(errorData.message || 'Payment verification failed');
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
          if (parsed.action?.type === 'prediction_market_result') {
            messageMetadata.action = {
              type: 'prediction_market_result',
              data: parsed.action.data,
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
        toast.success('Market found!');
        onComplete();
        return;

      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error');
        if (!lastError.message.includes('400') && attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    setErrorMessage(lastError?.message || 'Failed to fetch market');
    setStep('error');
    toast.error('Failed to fetch market');
  }, [endpointId, originalParams, paymentProof, getCurrentSession, addMessage, onComplete, categories]);

  const handleRetry = () => {
    setStep('selecting');
    setSelectedCategory(null);
    setErrorMessage(null);
  };

  if (step === 'completed') {
    return null;
  }

  return (
    <div className="border border-black bg-white max-w-sm">
      {/* Header */}
      <div className="border-b border-black px-3 py-1.5 bg-black text-white flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest">
          SELECT MARKET
        </span>
        <span className="font-mono text-[8px] opacity-60">PREDICTION</span>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {step === 'selecting' && (
          <>
            <p className="text-[11px] font-mono text-black/70 uppercase tracking-wide">
              What type of market interests you?
            </p>

            {/* Loading Categories */}
            {loadingCategories ? (
              <div className="flex flex-col items-center justify-center py-6 space-y-3">
                <div className="w-5 h-5 border-2 border-black/20 border-t-black animate-spin" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-black/70">
                  Loading categories...
                </span>
              </div>
            ) : (
              <>
                {/* Category Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => handleCategorySelect(category)}
                      className="py-2.5 px-3 border border-black bg-white font-mono text-[10px] font-bold uppercase tracking-wider hover:bg-black hover:text-white transition-colors"
                    >
                      {category}
                    </button>
                  ))}
                </div>

                {/* Surprise Me */}
                <button
                  onClick={() => handleCategorySelect(null)}
                  className="w-full py-2.5 border-2 border-black bg-[#f5f5f5] font-mono text-[10px] font-bold uppercase tracking-wider hover:bg-black hover:text-white transition-colors"
                >
                  Surprise Me
                </button>
              </>
            )}
          </>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-6 space-y-3">
            <div className="w-5 h-5 border-2 border-black/20 border-t-black animate-spin" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-black/70">
              Finding {selectedCategory || 'a'} market...
            </span>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-1.5 py-2 bg-red-50 border border-red-200">
              <svg className="w-3 h-3 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-red-700">
                Failed
              </span>
            </div>
            {errorMessage && (
              <p className="text-[8px] font-mono text-red-700 text-center">{errorMessage}</p>
            )}
            <button
              onClick={handleRetry}
              className="w-full py-2 border-2 border-black bg-white text-black font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
