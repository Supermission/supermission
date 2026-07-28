'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import { useChatStore } from '@/lib/store/chat';
import { toast } from 'sonner';
import { formatUnits, type Address } from 'viem';
import { useBalance } from 'wagmi';
import { CONTRACTS } from '@/lib/contracts/addresses';
import { usePaymentTransaction } from '@/lib/hooks/use-payment-transaction';
import type { X402PaymentProof } from '@/lib/x402/types';

// Popular chains with their IDs for the dropdown
const POPULAR_CHAINS = [
  { id: '1', name: 'Ethereum', symbol: 'ETH' },
  { id: '56', name: 'BNB Smart Chain', symbol: 'BSC' },
  { id: '137', name: 'Polygon', symbol: 'MATIC' },
  { id: '42161', name: 'Arbitrum One', symbol: 'ARB' },
  { id: '10', name: 'Optimism', symbol: 'OP' },
  { id: '43114', name: 'Avalanche C-Chain', symbol: 'AVAX' },
  { id: '8453', name: 'Base', symbol: 'BASE' },
  { id: '250', name: 'Fantom', symbol: 'FTM' },
  { id: '324', name: 'zkSync Era', symbol: 'ZK' },
  { id: '59144', name: 'Linea', symbol: 'LINEA' },
];

// Analysis types available for Token DD
const ANALYSIS_OPTIONS = [
  {
    id: 'token-due-diligence',
    name: 'Token Due Diligence',
    description: 'A-Z analysis of a token',
    icon: '',
  },
];

// Token DD endpoint IDs that should show analysis options
const TOKEN_DD_ENDPOINTS = ['token-due-diligence'];

// Contract Audit endpoint IDs
const CONTRACT_AUDIT_ENDPOINTS = ['contract-audit'];

// Image Generation endpoint IDs
const IMAGE_GEN_ENDPOINTS = ['super-image-gen'];

// Quality tiers for image generation
const IMAGE_QUALITY_TIERS = [
  { id: 'flash', name: 'Flash', price: '$0.04', description: '1K resolution, fastest' },
  { id: 'standard', name: 'Standard', price: '$0.08', description: '2K resolution, high quality' },
  { id: 'premium', name: 'Premium', price: '$0.12', description: '4K resolution, highest quality' },
];

// Aspect ratios for image generation
const ASPECT_RATIOS = [
  { id: '1:1', name: 'Square (1:1)' },
  { id: '16:9', name: 'Landscape (16:9)' },
  { id: '9:16', name: 'Portrait (9:16)' },
  { id: '4:3', name: 'Standard (4:3)' },
  { id: '3:4', name: 'Portrait (3:4)' },
];

// Color grading/style presets for image generation
const STYLE_PRESETS = [
  { id: 'auto', name: 'Auto' },
  { id: 'vibrant', name: 'Vibrant' },
  { id: 'muted', name: 'Muted' },
  { id: 'cinematic', name: 'Cine' },
  { id: 'bw', name: 'B&W' },
  { id: 'anime', name: 'Anime' },
  { id: 'neon', name: 'Neon' },
  { id: 'vintage', name: 'Vintage' },
];

// Background options for image generation
const BACKGROUND_OPTIONS = [
  { id: 'auto', name: 'Auto', description: 'AI decides background' },
  { id: 'transparent', name: 'None', description: 'Transparent background' },
  { id: 'white', name: 'White', description: 'Clean white background' },
  { id: 'blur', name: 'Blur', description: 'Blurred background' },
];

// Image generation AI models (actual configured models based on Gemini Nano Banana docs)
const IMAGE_GEN_MODELS = [
  { id: 'nano-banana-pro', name: 'Nano Banana Pro', provider: 'Google', description: 'Professional, up to 4K, Thinking mode', logo: '/models/google.png', modelId: 'gemini-3-pro-image-preview' },
  { id: 'nano-banana', name: 'Nano Banana', provider: 'Google', description: 'Fast & efficient, 1K resolution', logo: '/models/google.png', modelId: 'gemini-2.5-flash-image' },
  // Future: when OpenAI API key is configured
  // { id: 'gpt-image', name: 'GPT Image 1.5 HiFi', provider: 'OpenAI', description: 'High fidelity output', logo: '/models/openai.png', modelId: 'gpt-image-1.5' },
];

// AI Models for contract audit
const AI_MODELS = [
  {
    id: 'claude',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    modelId: 'anthropic/claude-sonnet-4',
    description: 'Best for detailed security analysis',
    icon: 'CL',
  },
  {
    id: 'gpt5',
    name: 'GPT-5',
    provider: 'OpenAI',
    modelId: 'openai/gpt-5',
    description: 'Advanced reasoning capabilities',
    icon: 'GP',
  },
  {
    id: 'gemini',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    modelId: 'google/gemini-2.5-pro-preview-05-06',
    description: 'Fast with large context window',
    icon: 'GE',
  },
];

interface BodyParam {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
}

interface ExtractionInfo {
  platform?: string;
  confidence?: number;
  tokenName?: string;
  tokenSymbol?: string;
}

interface ParamRequestData {
  endpointId: string;
  endpointName: string;
  description?: string;
  requiredParams: BodyParam[];
  provided?: Record<string, any>;
  extractedFrom?: ExtractionInfo;  // Info about image extraction source
}

interface ParamRequestPanelProps {
  data: ParamRequestData;
}

type PaymentStep = 'idle' | 'checking' | 'paying' | 'verifying' | 'retrying' | 'completed' | 'error' | 'ai_model_selection';

export function ParamRequestPanel({ data }: ParamRequestPanelProps) {
  const { endpointId, endpointName, description, requiredParams, provided = {} } = data;

  const isTokenDD = TOKEN_DD_ENDPOINTS.includes(endpointId);
  const isContractAudit = CONTRACT_AUDIT_ENDPOINTS.includes(endpointId);
  const isImageGen = IMAGE_GEN_ENDPOINTS.includes(endpointId);

  const [formValues, setFormValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    for (const param of requiredParams) {
      if (param.key === 'chainId' && isTokenDD) {
        initial[param.key] = provided[param.key] ?? '1';
      } else if (param.key === 'chainId' && isContractAudit) {
        initial[param.key] = provided[param.key] ?? '8453';
      } else {
        initial[param.key] = provided[param.key] ?? '';
      }
    }
    return initial;
  });

  const [selectedAnalysis, setSelectedAnalysis] = useState<string>(
    TOKEN_DD_ENDPOINTS.includes(endpointId) ? endpointId : 'token-due-diligence'
  );

  const [auditInputMode, setAuditInputMode] = useState<'paste' | 'fetch'>('paste');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentStep, setPaymentStep] = useState<PaymentStep>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Image generation state
  const [imageQuality, setImageQuality] = useState<string>('standard');
  const [imageAspectRatio, setImageAspectRatio] = useState<string>('1:1');
  const [imageStyle, setImageStyle] = useState<string>('auto');
  const [imageBackground, setImageBackground] = useState<string>('auto');
  const [imageAIModel, setImageAIModel] = useState<string>('nano-banana-pro');
  const [showModelDropdown, setShowModelDropdown] = useState<boolean>(false);
  const [enhancePrompt, setEnhancePrompt] = useState<boolean>(true);

  // For AI model selection after payment (contract audit only)
  const [storedPaymentProof, setStoredPaymentProof] = useState<X402PaymentProof | null>(null);
  const [storedParams, setStoredParams] = useState<Record<string, unknown> | null>(null);

  const payment = usePaymentTransaction();
  const [optimisticDeduction, setOptimisticDeduction] = useState(0n);

  const tokenAddress = CONTRACTS.USDC as Address;
  const { data: balanceData, isLoading: isLoadingBalance, refetch: refetchBalance } = useBalance({
    address: payment.paymentAddress as Address,
    token: tokenAddress,
    query: {
      enabled: payment.isWalletReady && !!payment.paymentAddress,
    },
  });

  const addMessage = useChatStore((state) => state.addMessage);
  const getCurrentSession = useChatStore((state) => state.getCurrentSession);

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const processPaymentAndRetry = useCallback(async (
    paymentRequest: { amount: string; token: string; recipient: string; chainId: number; description?: string },
    finalEndpointId: string,
    params: Record<string, unknown>,
    sessionId: string
  ) => {
    if (!payment.isWalletReady || !payment.paymentAddress) {
      throw new Error('Please connect a wallet first');
    }

    const amount = BigInt(paymentRequest.amount);
    const amountFormatted = formatUnits(amount, 6);
    const recipientAddress = paymentRequest.recipient as Address;
    const paymentTokenAddress = (paymentRequest.token || CONTRACTS.USDC) as Address;

    const balance = balanceData?.value;
    if (balance === undefined || balance < amount) {
      const balanceFormatted = formatUnits(balance || 0n, 6);
      throw new Error(`Insufficient USDC balance. Need $${amountFormatted}, have $${balanceFormatted}`);
    }

    setPaymentStep('paying');

    return new Promise((resolve, reject) => {
      payment.executePayment({
        recipient: recipientAddress,
        amount: amountFormatted,
        tokenAddress: paymentTokenAddress,
        onSuccess: async (txHash) => {
          setPaymentStep('verifying');
          toast.success('Payment sent!');
          setOptimisticDeduction((prev) => prev + amount);

          const proof: X402PaymentProof = {
            txHash: txHash as `0x${string}`,
            from: payment.paymentAddress as Address,
            to: recipientAddress,
            amount: paymentRequest.amount,
            token: paymentTokenAddress,
            timestamp: Date.now(),
          };

          refetchBalance();

          // For contract-audit, show AI model selection instead of immediately running
          if (CONTRACT_AUDIT_ENDPOINTS.includes(finalEndpointId)) {
            setStoredPaymentProof(proof);
            setStoredParams(params);
            setPaymentStep('ai_model_selection');
            resolve({ aiModelSelection: true });
            return;
          }

          // For other endpoints, continue with analysis
          setPaymentStep('retrying');
          toast.info('Running analysis...');

          const payload = {
            endpointId: finalEndpointId,
            params: params,
            paymentProof: proof,
          };

          try {
            const response = await fetch('/api/agent/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: `[RUN_WITH_PAYMENT] ${JSON.stringify(payload)}`,
                sessionId: sessionId,
                walletAddress: payment.paymentAddress
              }),
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const result = await response.json();
            resolve(result);
          } catch (err) {
            reject(err);
          }
        },
        onError: (error) => reject(error),
      });
    });
  }, [payment, balanceData, refetchBalance]);

  // Handle AI model selection and run audit
  const handleAIModelSelect = useCallback(async (modelId: string) => {
    if (!storedPaymentProof || !storedParams) {
      toast.error('Payment data not found');
      setPaymentStep('error');
      return;
    }

    const session = getCurrentSession();
    if (!session) {
      toast.error('Session not found');
      setPaymentStep('error');
      return;
    }

    setPaymentStep('retrying');
    toast.info('Running audit with AI analysis...');

    const payload = {
      endpointId: 'contract-audit',
      params: {
        ...storedParams,
        selectedModel: modelId,
      },
      paymentProof: storedPaymentProof,
    };

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

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const result = await response.json();

      let messageContent = result.message;
      const messageMetadata: { action?: { type: string; data?: any } } = {};

      try {
        const parsed = JSON.parse(result.message);
        if (parsed.message) messageContent = parsed.message;
        if (parsed.action?.type) {
          messageMetadata.action = parsed.action;
        }
      } catch {
        // Not JSON
      }

      setPaymentStep('completed');
      toast.success('Audit complete!');
      addMessage({ role: 'assistant', content: messageContent, metadata: messageMetadata });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setErrorMessage(errMsg);
      setPaymentStep('error');
      toast.error(`Failed: ${errMsg}`);
    } finally {
      setIsSubmitting(false);
      setStoredPaymentProof(null);
      setStoredParams(null);
    }
  }, [storedPaymentProof, storedParams, getCurrentSession, payment.paymentAddress, addMessage]);

  const handleSubmit = async () => {
    if (!isContractAudit && !isImageGen) {
      for (const param of requiredParams) {
        const value = formValues[param.key];
        if (param.required && (value === '' || value === undefined || value === null)) {
          toast.error(`Please fill "${param.label}"`);
          return;
        }
      }
    }

    // Image generation validation
    if (isImageGen) {
      if (!formValues['prompt'] || formValues['prompt'].trim().length === 0) {
        toast.error('Please enter an image prompt');
        return;
      }
    }

    if (isContractAudit) {
      if (auditInputMode === 'paste') {
        if (!formValues['sourceCode'] || formValues['sourceCode'].trim().length === 0) {
          toast.error('Please paste your Solidity source code');
          return;
        }
      } else {
        if (!formValues['contractAddress'] || formValues['contractAddress'].trim().length === 0) {
          toast.error('Please enter a contract address');
          return;
        }
        if (!formValues['chainId']) {
          toast.error('Please select a chain');
          return;
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(formValues['contractAddress'])) {
          toast.error('Invalid contract address format');
          return;
        }
      }
    }

    if (isTokenDD && formValues['contractAddress']) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(formValues['contractAddress'])) {
        toast.error('Invalid contract address format');
        return;
      }
    }

    if (!payment.isWalletReady) {
      toast.error('Please connect a wallet first');
      return;
    }

    const session = getCurrentSession();
    if (!session) {
      toast.error('Session not found');
      return;
    }

    const finalEndpointId = isTokenDD ? selectedAnalysis : endpointId;

    let submitParams = formValues;
    if (isContractAudit) {
      if (auditInputMode === 'paste') {
        submitParams = { sourceCode: formValues['sourceCode'] };
      } else {
        submitParams = {
          contractAddress: formValues['contractAddress'],
          chainId: formValues['chainId']
        };
      }
    } else if (isImageGen) {
      submitParams = {
        prompt: formValues['prompt'],
        model: imageQuality,
        aiModel: imageAIModel,
        aspectRatio: imageAspectRatio,
        style: imageStyle,
        background: imageBackground,
        enhancePrompt: enhancePrompt
      };
    }

    const payload = { endpointId: finalEndpointId, params: submitParams };

    setIsSubmitting(true);
    setPaymentStep('checking');
    setErrorMessage(null);

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[RUN_WITH_PARAMS] ${JSON.stringify(payload)}`,
          sessionId: session.id,
          walletAddress: payment.paymentAddress
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const result = await response.json();
      let messageContent = result.message;
      const messageMetadata: { action?: { type: string; data?: any } } = {};

      let parsed: { message?: string; action?: { type: string; data?: any } } | null = null;
      try {
        parsed = JSON.parse(result.message);
        if (parsed?.message) messageContent = parsed.message;
      } catch {
        // Not JSON
      }

      if (parsed?.action?.type === 'x402_payment_required') {
        // Payment gating disabled - skip payment and show message
        setPaymentStep('completed');
        addMessage({ role: 'assistant', content: 'Processing your request...' });
        return;
      } else if (parsed?.action?.type) {
        messageMetadata.action = parsed.action;
      }

      setPaymentStep('completed');
      addMessage({ role: 'assistant', content: messageContent, metadata: messageMetadata });

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setErrorMessage(errMsg);
      setPaymentStep('error');
      toast.error(`Failed: ${errMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`border border-[#e5e7eb] bg-white rounded-[12px] ${isContractAudit ? 'max-w-lg' : isImageGen ? 'max-w-xs' : 'max-w-sm'}`}>
      {/* Header - Compact for image gen */}
      <div className={`flex items-center justify-between ${isImageGen ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <h3 className={`font-semibold text-[#3a3a3a] ${isImageGen ? 'text-[10px]' : 'text-xs'}`}>
          {isImageGen ? 'Generate Image' : 'Additional Details Required'}
        </h3>
        {!isImageGen && (
          <span className="text-[10px] text-[#9ca3af]">
            {endpointName}
          </span>
        )}
      </div>

      {/* Body */}
      <div className={`${isImageGen ? 'px-3 pb-3 space-y-2' : 'px-4 pb-4 space-y-4'}`}>
        {description && !isImageGen && (
          <p className="text-xs text-[#6b7280] leading-relaxed">
            {description}
          </p>
        )}

        {/* Contract Audit Input Mode Toggle */}
        {isContractAudit && paymentStep !== 'ai_model_selection' && (
          <div className="flex border border-[#e5e7eb] rounded-[8px] overflow-hidden">
            <button
              type="button"
              onClick={() => setAuditInputMode('paste')}
              disabled={isSubmitting}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${auditInputMode === 'paste'
                  ? 'bg-[#3a3a3a] text-white'
                  : 'bg-white text-[#3a3a3a] hover:bg-[#f7f7f7]'
                }`}
            >
              Paste Code
            </button>
            <button
              type="button"
              onClick={() => setAuditInputMode('fetch')}
              disabled={isSubmitting}
              className={`flex-1 py-2.5 text-xs font-medium border-l border-[#e5e7eb] transition-colors ${auditInputMode === 'fetch'
                  ? 'bg-[#3a3a3a] text-white'
                  : 'bg-white text-[#3a3a3a] hover:bg-[#f7f7f7]'
                }`}
            >
              Fetch by Address
            </button>
          </div>
        )}

        {/* Contract Audit - Paste Code Mode */}
        {isContractAudit && auditInputMode === 'paste' && paymentStep !== 'ai_model_selection' && (
          <div className="border border-[#e5e7eb] p-3 rounded-[8px]">
            <label className="text-[10px] font-semibold text-[#6b7280]">
              Solidity Source Code <span className="text-red-600">*</span>
            </label>
            <textarea
              className="mt-2 w-full border border-[#e5e7eb] bg-white p-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#3a3a3a] resize-none placeholder:text-[#9ca3af] rounded-[8px]"
              placeholder="// SPDX-License-Identifier: MIT pragma solidity ^0.8.0;  contract MyContract { // Paste your Solidity code here... }"
              rows={8}
              value={formValues['sourceCode'] ?? ''}
              onChange={(e) => handleChange('sourceCode', e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-[10px] text-[#9ca3af] mt-2">
              Paste your complete Solidity contract source code
            </p>
          </div>
        )}

        {/* Contract Audit - Fetch by Address Mode */}
        {isContractAudit && auditInputMode === 'fetch' && paymentStep !== 'ai_model_selection' && (
          <div className="space-y-3">
            <div className="border border-[#e5e7eb] p-3 rounded-[8px]">
              <label className="text-[10px] font-semibold text-[#6b7280]">
                Contract Address <span className="text-red-600">*</span>
              </label>
              <input
                className="mt-2 w-full border border-[#e5e7eb] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#3a3a3a] placeholder:text-[#9ca3af] rounded-[8px]"
                placeholder="0x..."
                value={formValues['contractAddress'] ?? ''}
                onChange={(e) => handleChange('contractAddress', e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="border border-[#e5e7eb] p-3 rounded-[8px]">
              <label className="text-[10px] font-semibold text-[#6b7280]">
                Chain <span className="text-red-600">*</span>
              </label>
              <div className="relative mt-2">
                <select
                  className="w-full appearance-none border border-[#e5e7eb] bg-white px-3 py-2 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-[#3a3a3a] cursor-pointer rounded-[8px]"
                  value={formValues['chainId'] ?? '8453'}
                  onChange={(e) => handleChange('chainId', e.target.value)}
                  disabled={isSubmitting}
                >
                  {POPULAR_CHAINS.map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.name} ({chain.symbol})
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-3 h-3 text-[#6b7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <p className="text-[10px] text-[#9ca3af] mt-2">
                Contract must be verified on block explorer
              </p>
            </div>
          </div>
        )}

        {/* Image Generation Fields - Compact */}
        {isImageGen && (
          <div className="space-y-2">
            {/* Prompt Input */}
            <div>
              <textarea
                className="w-full border border-[#e5e7eb] bg-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#3a3a3a] resize-none placeholder:text-[#9ca3af] rounded-[8px]"
                placeholder="Describe your image..."
                rows={2}
                value={formValues['prompt'] ?? ''}
                onChange={(e) => handleChange('prompt', e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {/* AI Model Dropdown */}
            <div className="relative">
              <label className="text-[9px] font-semibold text-[#6b7280] mb-1 block">Model</label>
              <button
                type="button"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                disabled={isSubmitting}
                className="w-full flex items-center justify-between border border-[#e5e7eb] bg-white px-2 py-1.5 text-left hover:bg-[#f7f7f7] transition-colors disabled:opacity-50 rounded-[8px]"
              >
                <div className="flex items-center gap-2">
                  <Image
                    src={IMAGE_GEN_MODELS.find(m => m.id === imageAIModel)?.logo ?? ''}
                    alt=""
                    className="w-4 h-4 object-contain"
                    width={16}
                    height={16}
                    unoptimized
                  />
                  <span className="text-[10px] font-medium text-[#3a3a3a]">{IMAGE_GEN_MODELS.find(m => m.id === imageAIModel)?.name}</span>
                </div>
                <svg className={`w-3 h-3 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showModelDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 border border-[#e5e7eb] bg-white z-50 max-h-40 overflow-y-auto rounded-[8px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {IMAGE_GEN_MODELS.map((model) => {
                    const isSelected = imageAIModel === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          setImageAIModel(model.id);
                          setShowModelDropdown(false);
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-2 text-left border-b border-[#e5e7eb]/60 last:border-b-0 transition-colors rounded-[8px] ${isSelected ? 'bg-[#3a3a3a] text-white' : 'hover:bg-[#f7f7f7]'
                          }`}
                      >
                        <Image
                          src={model.logo}
                          alt=""
                          className={`w-4 h-4 object-contain ${isSelected ? 'brightness-0 invert' : ''}`}
                          width={16}
                          height={16}
                          unoptimized
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-medium block">{model.name}</span>
                          <span className={`text-[8px] ${isSelected ? 'text-white/60' : 'text-[#9ca3af]'}`}>{model.description}</span>
                        </div>
                        {isSelected && (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quality + Aspect in one row */}
            <div className="flex gap-2">
              {/* Quality Tier - Compact dropdown */}
              <div className="flex-1">
                <label className="text-[9px] font-semibold text-[#6b7280] mb-1 block">Quality</label>
                <div className="flex border border-[#e5e7eb] rounded-[8px] overflow-hidden">
                  {IMAGE_QUALITY_TIERS.map((tier) => {
                    const isSelected = imageQuality === tier.id;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setImageQuality(tier.id)}
                        disabled={isSubmitting}
                        className={`flex-1 py-1.5 text-[9px] font-medium transition-colors border-r border-[#e5e7eb] last:border-r-0 ${isSelected ? 'bg-[#3a3a3a] text-white' : 'bg-white text-[#3a3a3a] hover:bg-[#f7f7f7]'
                          } disabled:opacity-50`}
                      >
                        {tier.id === 'flash' ? '1K' : tier.id === 'standard' ? '2K' : '4K'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Aspect Ratio - Compact */}
              <div className="flex-1">
                <label className="text-[9px] font-semibold text-[#6b7280] mb-1 block">Ratio</label>
                <div className="flex border border-[#e5e7eb] rounded-[8px] overflow-hidden">
                  {ASPECT_RATIOS.slice(0, 3).map((ratio) => {
                    const isSelected = imageAspectRatio === ratio.id;
                    return (
                      <button
                        key={ratio.id}
                        type="button"
                        onClick={() => setImageAspectRatio(ratio.id)}
                        disabled={isSubmitting}
                        className={`flex-1 py-1.5 text-[9px] font-medium transition-colors border-r border-[#e5e7eb] last:border-r-0 ${isSelected ? 'bg-[#3a3a3a] text-white' : 'bg-white text-[#3a3a3a] hover:bg-[#f7f7f7]'
                          } disabled:opacity-50`}
                      >
                        {ratio.id}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Style - Full width row with scrollable options */}
            <div>
              <label className="text-[9px] font-semibold text-[#6b7280] mb-1 block">Style</label>
              <div className="flex flex-wrap md:flex-nowrap border border-[#e5e7eb] rounded-[8px] overflow-hidden md:overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {STYLE_PRESETS.map((style) => {
                  const isSelected = imageStyle === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setImageStyle(style.id)}
                      disabled={isSubmitting}
                      className={`px-3 py-1.5 text-[9px] font-medium transition-colors border-r border-[#e5e7eb] last:border-r-0 whitespace-nowrap ${isSelected ? 'bg-[#3a3a3a] text-white' : 'bg-white text-[#3a3a3a] hover:bg-[#f7f7f7]'
                        } disabled:opacity-50`}
                    >
                      {style.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Background - Full width row */}
            <div>
              <label className="text-[9px] font-semibold text-[#6b7280] mb-1 block">Background</label>
              <div className="flex border border-[#e5e7eb] rounded-[8px] overflow-hidden">
                {BACKGROUND_OPTIONS.map((bg) => {
                  const isSelected = imageBackground === bg.id;
                  return (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => setImageBackground(bg.id)}
                      disabled={isSubmitting}
                      title={bg.description}
                      className={`flex-1 py-1.5 text-[9px] font-medium transition-colors border-r border-[#e5e7eb] last:border-r-0 ${isSelected ? 'bg-[#3a3a3a] text-white' : 'bg-white text-[#3a3a3a] hover:bg-[#f7f7f7]'
                        } disabled:opacity-50`}
                    >
                      {bg.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Enhance toggle in footer row */}
            <div className="flex items-center justify-end pt-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[#6b7280]">Enhance</span>
                <button
                  type="button"
                  onClick={() => setEnhancePrompt(!enhancePrompt)}
                  disabled={isSubmitting}
                  className={`w-8 h-4 border border-[#e5e7eb] transition-colors relative rounded-full ${enhancePrompt ? 'bg-green-600' : 'bg-white'
                    }`}
                >
                  <div
                    className={`absolute top-0.5 w-2.5 h-2.5 transition-transform rounded-full ${enhancePrompt ? 'translate-x-4 bg-white' : 'translate-x-0.5 bg-[#9ca3af]'
                      }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fields for non-contract-audit endpoints */}
        {!isContractAudit && !isImageGen && (
          <div className="space-y-3">
            {requiredParams.map((param) => (
              <div key={param.key} className="border border-[#e5e7eb] p-3 rounded-[8px]">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-[#6b7280]">
                    {param.label}
                    {param.required && <span className="text-red-600 ml-1">*</span>}
                  </label>
                  <span className="text-[9px] text-[#9ca3af]">{param.key}</span>
                </div>

                {param.key === 'chainId' && isTokenDD ? (
                  <div className="relative mt-2">
                    <select
                      className="w-full appearance-none border border-[#e5e7eb] bg-white px-3 py-2 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-[#3a3a3a] cursor-pointer rounded-[8px]"
                      value={formValues[param.key] ?? '1'}
                      onChange={(e) => handleChange(param.key, e.target.value)}
                      disabled={isSubmitting}
                    >
                      {POPULAR_CHAINS.map((chain) => (
                        <option key={chain.id} value={chain.id}>
                          {chain.name} ({chain.symbol})
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-3 h-3 text-[#6b7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                ) : (
                  <input
                    className="mt-2 w-full border border-[#e5e7eb] bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#3a3a3a] placeholder:text-[#9ca3af] rounded-[8px]"
                    placeholder={param.key === 'contractAddress' ? '0x...' : ''}
                    value={formValues[param.key] ?? ''}
                    onChange={(e) => handleChange(param.key, e.target.value)}
                    disabled={isSubmitting}
                  />
                )}

                {provided[param.key] && (
                  <p className="text-[9px] text-[#9ca3af] mt-2">
                    Detected: <span className="text-[#3a3a3a]">{String(provided[param.key])}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Analysis Type Selection for Token DD */}
        {isTokenDD && (
          <div className="border border-[#e5e7eb] p-3 rounded-[8px]">
            <label className="text-[10px] font-semibold text-[#6b7280] block mb-2">
              Analysis Type
            </label>
            <div className="space-y-2">
              {ANALYSIS_OPTIONS.map((option) => {
                const isSelected = selectedAnalysis === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedAnalysis(option.id)}
                    disabled={isSubmitting}
                    className={`w-full text-left p-3 border transition-colors rounded-[8px] ${isSelected
                        ? 'border-[#3a3a3a] bg-[#3a3a3a] text-white'
                        : 'border-[#e5e7eb] bg-white text-[#3a3a3a] hover:bg-[#f7f7f7]'
                      } disabled:opacity-50`}
                  >
                    <span className="text-xs font-medium">{option.name}</span>
                    <p className={`text-[10px] mt-1 ${isSelected ? 'text-white/70' : 'text-[#6b7280]'}`}>
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Wallet Balance - Compact for image gen */}
        {payment.isWalletReady && payment.paymentAddress && !isImageGen && (
          <div className="border border-[#e5e7eb] p-3 flex items-center justify-between rounded-[8px]">
            <span className="text-[10px] text-[#6b7280]">
              {payment.walletType === 'privy' ? 'Payment Wallet' : 'Wallet'}
            </span>
            <span className={`text-xs font-bold font-mono ${((balanceData?.value || 0n) - optimisticDeduction) > 0n ? 'text-green-700' : 'text-red-700'}`}>
              {isLoadingBalance ? '...' : `$${formatUnits((balanceData?.value || 0n) - optimisticDeduction, 6)}`} USDC
            </span>
          </div>
        )}

        {/* Not Connected - Compact for image gen */}
        {!payment.isWalletReady && !isImageGen && (
          <div className="border border-[#e5e7eb] p-3 text-center rounded-[8px]">
            <p className="text-[10px] text-[#6b7280]">
              Connect a wallet to run analysis
            </p>
          </div>
        )}

        {/* AI Model Selection */}
        {paymentStep === 'ai_model_selection' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between py-1.5 px-2 bg-green-50 border border-green-200 text-[9px] rounded-[8px]">
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-mono text-green-700 font-bold">Payment Successful</span>
              </div>
            </div>

            <p className="text-[11px] text-[#6b7280]">
              Choose an AI model for your audit report
            </p>

            <div className="space-y-2">
              {AI_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleAIModelSelect(model.modelId)}
                  className="w-full p-3 border border-[#e5e7eb] bg-white hover:bg-[#f7f7f7] transition-colors text-left group rounded-[8px]"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 border border-[#e5e7eb] flex items-center justify-center font-mono text-[10px] font-bold shrink-0 rounded-[6px]">
                      {model.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-[#3a3a3a]">
                          {model.name}
                        </span>
                        <span className="text-[8px] text-[#9ca3af]">
                          {model.provider}
                        </span>
                      </div>
                      <p className="text-[9px] text-[#6b7280] mt-0.5 group-hover:text-[#3a3a3a]">
                        {model.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Payment Status */}
        {paymentStep !== 'idle' && paymentStep !== 'completed' && paymentStep !== 'ai_model_selection' && (
          <div className={`border p-3 text-center rounded-[8px] ${paymentStep === 'error' ? 'border-red-600 bg-red-50' : 'border-[#e5e7eb]'}`}>
            <div className="flex items-center justify-center gap-2">
              {paymentStep !== 'error' && (
                <div className="w-3 h-3 border-2 border-[#e5e7eb] border-t-[#3a3a3a] rounded-full animate-spin" />
              )}
              <span className={`text-[10px] font-medium ${paymentStep === 'error' ? 'text-red-600' : 'text-[#3a3a3a]'}`}>
                {paymentStep === 'checking' && 'Preparing...'}
                {paymentStep === 'paying' && 'Processing...'}
                {paymentStep === 'verifying' && 'Verifying...'}
                {paymentStep === 'retrying' && 'Running analysis...'}
                {paymentStep === 'error' && 'Error'}
              </span>
            </div>
            {paymentStep === 'error' && errorMessage && (
              <p className="text-[9px] text-red-600 mt-2">{errorMessage}</p>
            )}
          </div>
        )}

        {/* Footer - hide during AI model selection */}
        {paymentStep !== 'ai_model_selection' && (
          <div className={`flex items-center justify-between ${isImageGen ? 'pt-1' : 'pt-2'}`}>
            {isImageGen ? (
              /* Image Gen: Empty spacer for layout */
              <span />
            ) : (
              <p className="text-[10px] text-[#9ca3af]">
                {isTokenDD ? 'Fee: $0.1 USDC' : isContractAudit ? 'Fee: $0.2 USDC' : 'Fill fields to run'}
              </p>
            )}
            {paymentStep === 'error' ? (
              <button
                type="button"
                onClick={() => {
                  setPaymentStep('idle');
                  setErrorMessage(null);
                  payment.reset();
                }}
                className={`border border-[#e5e7eb] bg-white text-[#3a3a3a] font-medium hover:bg-[#f7f7f7] transition-colors rounded-[8px] ${isImageGen ? 'px-3 py-1.5 text-[10px]' : 'px-5 py-2.5 text-xs'}`}
              >
                Retry
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !payment.isWalletReady}
                className={`border border-[#3a3a3a] bg-[#3a3a3a] text-white font-medium hover:bg-white hover:text-[#3a3a3a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-[8px] ${isImageGen ? 'px-3 py-1.5 text-[10px]' : 'px-5 py-2.5 text-xs'}`}
              >
                {isSubmitting ? '...' : isImageGen ? 'Generate' : 'Run Analysis'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
