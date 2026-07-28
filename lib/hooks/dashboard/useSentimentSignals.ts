'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface SentimentData {
  overall: number;
  confidence: number;
  trend: 'rising' | 'falling' | 'stable';
  breakdown: {
    social: number;
    market: number;
    development: number;
  };
  sources: Array<{
    name: string;
    score: number;
    confidence: number;
    timestamp: number;
    metrics?: Record<string, unknown>;
  }>;
  signal: {
    signal: 'BUY' | 'HOLD' | 'SELL';
    reason: string;
  };
  timestamp: number;
  stale?: boolean;
}

export interface PaymentProof {
  txHash: string;
  amount: string;
  token: string;
  recipient: string;
}

export function useSentimentSignals(
  tokenAddress: string | null,
  chainId: number,
  symbol?: string
) {
  const [paymentProof, setPaymentProof] = useState<PaymentProof | null>(null);
  const [paymentRequired, setPaymentRequired] = useState<Record<string, unknown> | null>(null);

  const query = useQuery({
    queryKey: ['sentiment-signals', tokenAddress, chainId, paymentProof?.txHash],
    queryFn: async () => {
      if (!tokenAddress) throw new Error('No token address provided');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (paymentProof) {
        headers['x-payment-proof'] = JSON.stringify(paymentProof);
      }

      const res = await fetch('/api/dashboard/sentiment', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tokenAddress, chainId, symbol })
      });

      if (res.status === 402) {
        // Payment required
        const paymentReq = await res.json();
        setPaymentRequired(paymentReq);
        throw new PaymentRequiredError(paymentReq);
      }

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch sentiment');
      }

      const data = await res.json();
      return data.data as SentimentData;
    },
    enabled: !!tokenAddress,
    retry: false, // Don't auto-retry on 402
    staleTime: 5 * 60 * 1000, // 5 minutes (matches API cache)
    gcTime: 10 * 60 * 1000,
  });

  return {
    ...query,
    paymentRequired,
    setPaymentProof,
    isPaid: !!paymentProof
  };
}

// Custom error for payment required
export class PaymentRequiredError extends Error {
  constructor(public paymentRequest: Record<string, unknown>) {
    super('Payment required');
    this.name = 'PaymentRequiredError';
  }
}
