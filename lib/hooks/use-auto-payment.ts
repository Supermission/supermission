'use client';

import { useCallback, useRef } from 'react';
import { usePaymentTransaction } from '@/lib/hooks/use-payment-transaction';
import { useChatStore } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { formatUnits, type Address } from 'viem';
import type { X402PaymentProof } from '@/lib/x402/types';

/** Agent IDs that should use auto-payment (dashboard agents) */
const AUTO_PAYMENT_AGENTS = new Set([
  'token-due-diligence',
  'defi-yield',
  'wallet-intelligence',
  'prediction-market',
  'contract-audit',
]);

/**
 * useAutoPayment — silently handles x402 payment for dashboard agents.
 *
 * Handles two action types:
 *  1. `param_request` — auto-submits params via [RUN_WITH_PARAMS], then auto-pays
 *  2. `x402_payment_required` — auto-pays and retries with [RUN_WITH_PAYMENT]
 *
 * No UI panel is shown. Failures are logged but not toasted.
 */
export function useAutoPayment() {
  const payment = usePaymentTransaction();
  const handledMessageIds = useRef<Set<string>>(new Set());
  const isProcessing = useRef(false);

  const {
    addMessage,
    getCurrentSession,
    setLoading,
  } = useChatStore(
    useShallow((state) => ({
      addMessage: state.addMessage,
      getCurrentSession: state.getCurrentSession,
      setLoading: state.setLoading,
    }))
  );

  /** Execute payment and return txHash, or throw */
  const doPayment = useCallback(async (
    recipientAddress: Address,
    amount: string,
    tokenAddress: Address,
  ): Promise<string> => {
    const amountFormatted = formatUnits(BigInt(amount), 6);
    console.log(`[AutoPayment] Auto-paying $${amountFormatted} USDC`);

    return new Promise<string>((resolve, reject) => {
      payment.executePayment({
        recipient: recipientAddress,
        amount: amountFormatted,
        tokenAddress,
        onSuccess: (hash) => resolve(hash),
        onError: (err) => reject(err),
      });
    });
  }, [payment]);

  /** Send [RUN_WITH_PAYMENT] with retry logic for RPC indexing delays */
  const retryWithPayment = useCallback(async (
    proof: X402PaymentProof,
    endpointId: string,
    params: Record<string, unknown>,
    sessionId: string,
    agentContext?: Record<string, unknown>,
  ): Promise<{ messageContent: string; messageMetadata: Record<string, unknown> } | null> => {
    const retryPayload = { endpointId, params, paymentProof: proof, agentContext };
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 5000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`[AutoPayment] Verification attempt ${attempt}/${MAX_RETRIES}`);
      try {
        const response = await fetch('/api/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `[RUN_WITH_PAYMENT] ${JSON.stringify(retryPayload)}`,
            sessionId,
            walletAddress: payment.paymentAddress,
          }),
        });

        if (response.status === 422) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Agent execution failed');
        }

        if (response.status === 400 && attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        let messageContent = result.message;
        const messageMetadata: Record<string, unknown> = {};

        try {
          const parsed = JSON.parse(result.message);
          if (parsed.message) messageContent = parsed.message;
          if (parsed.action?.type) messageMetadata.action = parsed.action;
        } catch { /* Not JSON */ }

        return { messageContent, messageMetadata };
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          console.error('[AutoPayment] All retry attempts failed:', err);
          return null;
        }
      }
    }
    return null;
  }, [payment.paymentAddress]);

  /**
   * Handle `param_request` actions for dashboard agents.
   * Auto-submits the provided params, auto-pays if x402 is required.
   */
  const handleParamRequestAutoSubmit = useCallback(async (
    messageId: string,
    actionData: {
      endpointId: string;
      endpointName: string;
      requiredParams: Array<{ key: string; label: string; type: string; required: boolean }>;
      provided?: Record<string, unknown>;
    },
  ): Promise<boolean> => {
    // Idempotency + concurrency guard — never retry on failure
    if (handledMessageIds.current.has(messageId)) return true;
    if (isProcessing.current) return true;

    handledMessageIds.current.add(messageId);
    isProcessing.current = true;

    if (!payment.isWalletReady || !payment.paymentAddress) {
      console.warn('[AutoPayment] Wallet not ready for param auto-submit');
      isProcessing.current = false;
      return false; // Keep in handledMessageIds to prevent retries
    }

    const session = getCurrentSession();
    if (!session) {
      isProcessing.current = false;
      return false;
    }

    const { endpointId, provided = {} } = actionData;
    const submitParams = { ...provided };

    setLoading(true, 'Running analysis...');

    try {
      // Step 1: Submit params via [RUN_WITH_PARAMS]
      const payload = { endpointId, params: submitParams };
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[RUN_WITH_PARAMS] ${JSON.stringify(payload)}`,
          sessionId: session.id,
          walletAddress: payment.paymentAddress,
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const result = await response.json();
      let messageContent = result.message;
      const messageMetadata: Record<string, unknown> = {};

      let parsed: { message?: string; action?: { type: string; data?: Record<string, unknown> } } | null = null;
      try {
        parsed = JSON.parse(result.message);
        if (parsed?.message) messageContent = parsed.message;
      } catch { /* Not JSON */ }

      // Step 2: If server responds with x402_payment_required, auto-pay
      if (parsed?.action?.type === 'x402_payment_required') {
        const payData = parsed.action.data as {
          paymentRequest: { amount: string; token: string; recipient: string; chainId: number };
          endpointId: string;
          originalParams: Record<string, unknown>;
        };

        if (!payData?.paymentRequest) {
          throw new Error('Invalid payment request');
        }

        setLoading(true, 'Processing payment...');

        const { paymentRequest: pr } = payData;
        const recipientAddress = pr.recipient as Address;
        const tokenAddress = pr.token as Address;

        const txHash = await doPayment(recipientAddress, pr.amount, tokenAddress);
        const amountFormatted = formatUnits(BigInt(pr.amount), 6);

        const proof: X402PaymentProof = {
          txHash: txHash as `0x${string}`,
          from: payment.paymentAddress as Address,
          to: recipientAddress,
          amount: pr.amount,
          token: tokenAddress,
          timestamp: Date.now(),
        };

        setLoading(true, 'Running analysis...');

        const retryResult = await retryWithPayment(
          proof,
          payData.endpointId || endpointId,
          payData.originalParams || submitParams,
          session.id,
        );

        if (retryResult) {
          addMessage({
            role: 'assistant',
            content: retryResult.messageContent,
            metadata: {
              ...retryResult.messageMetadata,
              autoPayment: { txHash, amount: amountFormatted },
            },
          });
          console.log(`[AutoPayment] Paid $${amountFormatted} USDC — tx: ${txHash}`);
        }

        setLoading(false);
        isProcessing.current = false;
        return true;
      }

      // No payment needed — just add the result
      if (parsed?.action?.type) messageMetadata.action = parsed.action;
      addMessage({ role: 'assistant', content: messageContent, metadata: messageMetadata });
      setLoading(false);
      isProcessing.current = false;
      return true;

    } catch (err) {
      console.warn('[AutoPayment] Param auto-submit failed:', err);
      // Do NOT remove from handledMessageIds — prevents infinite retry loop
      setLoading(false);
      isProcessing.current = false;
      addMessage({
        role: 'assistant',
        content: 'Payment could not be completed. Please try again or use the main chat.',
      });
      return false;
    }
  }, [payment, getCurrentSession, addMessage, setLoading, doPayment, retryWithPayment]);

  /**
   * Handle `x402_payment_required` actions directly (when no param_request preceded it).
   */
  const handleAutoPaymentIfNeeded = useCallback(async (
    messageId: string,
    action: { type: string; data?: Record<string, unknown> } | undefined,
    agentContext?: Record<string, unknown>,
  ): Promise<boolean> => {
    if (!action || action.type !== 'x402_payment_required') return false;

    const data = action.data as {
      paymentRequest: { amount: string; token: string; recipient: string; chainId: number };
      agentId: string;
      endpointId: string;
      originalParams: Record<string, unknown>;
    } | undefined;

    if (!data?.paymentRequest) return false;
    if (!AUTO_PAYMENT_AGENTS.has(data.agentId) && !AUTO_PAYMENT_AGENTS.has(data.endpointId)) return false;
    if (handledMessageIds.current.has(messageId)) return true;
    if (isProcessing.current) return true;

    handledMessageIds.current.add(messageId);
    isProcessing.current = true;

    if (!payment.isWalletReady || !payment.paymentAddress) {
      console.warn('[AutoPayment] Wallet not ready');
      isProcessing.current = false;
      return false;
    }

    const session = getCurrentSession();
    if (!session) {
      isProcessing.current = false;
      return true;
    }

    const { paymentRequest: pr, endpointId, originalParams } = data;
    const recipientAddress = pr.recipient as Address;
    const tokenAddress = pr.token as Address;

    setLoading(true, 'Processing payment...');

    try {
      const txHash = await doPayment(recipientAddress, pr.amount, tokenAddress);
      const amountFormatted = formatUnits(BigInt(pr.amount), 6);

      const proof: X402PaymentProof = {
        txHash: txHash as `0x${string}`,
        from: payment.paymentAddress as Address,
        to: recipientAddress,
        amount: pr.amount,
        token: tokenAddress,
        timestamp: Date.now(),
      };

      setLoading(true, 'Running analysis...');

      const retryResult = await retryWithPayment(proof, endpointId, originalParams, session.id, agentContext);

      if (retryResult) {
        addMessage({
          role: 'assistant',
          content: retryResult.messageContent,
          metadata: {
            ...retryResult.messageMetadata,
            autoPayment: { txHash, amount: amountFormatted },
          },
        });
        console.log(`[AutoPayment] Paid $${amountFormatted} USDC — tx: ${txHash}`);
      }

      setLoading(false);
      isProcessing.current = false;
      return true;
    } catch (err) {
      console.warn('[AutoPayment] Payment failed silently:', err);
      // Do NOT remove from handledMessageIds — prevents infinite retry loop
      setLoading(false);
      isProcessing.current = false;
      addMessage({
        role: 'assistant',
        content: 'Payment could not be completed. Please try again or use the main chat.',
      });
      return false;
    }
  }, [payment, getCurrentSession, addMessage, setLoading, doPayment, retryWithPayment]);

  return {
    handleAutoPaymentIfNeeded,
    handleParamRequestAutoSubmit,
    isAutoPaymentAgent: (agentId: string) => AUTO_PAYMENT_AGENTS.has(agentId),
  };
}
