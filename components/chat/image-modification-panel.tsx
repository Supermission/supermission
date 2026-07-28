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
import { getDataUrl } from '@/lib/utils/image-utils';

// Modification presets
const MODIFICATION_PRESETS = [
  { id: 'vibrant', name: 'Vibrant', description: 'Make colors pop' },
  { id: 'neon', name: 'Neon', description: 'Add glow effects' },
  { id: 'vintage', name: 'Vintage', description: 'Retro film look' },
  { id: 'anime', name: 'Anime', description: 'Anime style' },
  { id: 'cinematic', name: 'Cinematic', description: 'Movie grading' },
  { id: 'enhance', name: 'Enhance', description: 'Improve quality' },
  { id: 'b&w', name: 'B&W', description: 'Black & white' },
];

// AI Models for image generation
const IMAGE_GEN_MODELS = [
  { id: 'nano-banana-pro', name: 'Nano Banana Pro', description: 'Professional, up to 4K' },
  { id: 'nano-banana', name: 'Nano Banana', description: 'Fast, 1K resolution' },
];

interface ImageModificationPanelProps {
  data: {
    sourceImage: string;
    mimeType: string;
    suggestedPreset?: string;
    presets?: Array<{ id: string; name: string; description: string }>;
  };
}

type ProcessingStep = 'idle' | 'paying' | 'generating' | 'completed' | 'error';

export function ImageModificationPanel({ data }: ImageModificationPanelProps) {
  const { sourceImage, mimeType, suggestedPreset } = data;

  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(suggestedPreset || null);
  const [selectedModel, setSelectedModel] = useState('nano-banana-pro');
  const [processingStep, setProcessingStep] = useState<ProcessingStep>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const payment = usePaymentTransaction();
  const addMessage = useChatStore((state) => state.addMessage);
  const getCurrentSession = useChatStore((state) => state.getCurrentSession);

  const tokenAddress = CONTRACTS.USDC as Address;
  const { data: balanceData, isLoading: isLoadingBalance, refetch: refetchBalance } = useBalance({
    address: payment.paymentAddress as Address,
    token: tokenAddress,
    query: {
      enabled: payment.isWalletReady && !!payment.paymentAddress,
    },
  });

  // Build the final prompt
  const buildPrompt = useCallback(() => {
    if (customPrompt.trim()) {
      return customPrompt.trim();
    }
    if (selectedPreset) {
      const presetDescriptions: Record<string, string> = {
        'vibrant': 'Make this image more vibrant with saturated, popping colors',
        'neon': 'Add neon glow effects and cyberpunk lighting',
        'vintage': 'Apply a vintage retro film filter with warm tones',
        'anime': 'Transform this into anime/illustration style',
        'cinematic': 'Apply cinematic color grading with dramatic lighting',
        'enhance': 'Enhance and improve the quality, clarity and detail',
        'b&w': 'Convert to artistic black and white with good contrast',
      };
      return presetDescriptions[selectedPreset] || `Apply ${selectedPreset} style`;
    }
    return 'Enhance this image';
  }, [customPrompt, selectedPreset]);

  const handleSubmit = useCallback(async () => {
    if (!payment.isWalletReady || !payment.paymentAddress) {
      toast.error('Please connect a wallet first');
      return;
    }

    const session = getCurrentSession();
    if (!session) {
      toast.error('Session not found');
      return;
    }

    const prompt = buildPrompt();
    if (!prompt) {
      toast.error('Please enter a prompt or select a preset');
      return;
    }

    setProcessingStep('paying');
    setErrorMessage(null);

    try {
      // First, call the API to get payment requirements
      const submitParams = {
        prompt,
        model: 'standard', // Quality tier
        aiModel: selectedModel,
        sourceImage,
        sourceMimeType: mimeType,
        enhancePrompt: true,
      };

      const payload = { endpointId: 'super-image-gen', params: submitParams };

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

      // Check if payment is required
      type ParsedResponse = {
        message?: string;
        action?: {
          type: string;
          data?: {
            paymentRequest?: {
              amount: string;
              token: string;
              recipient: string;
            };
          };
        };
      };
      let parsed: ParsedResponse | null = null;
      try {
        parsed = JSON.parse(result.message) as ParsedResponse;
      } catch {
        // Not JSON
      }

      if (parsed?.action?.type === 'x402_payment_required') {
        // Payment gating disabled - skip payment
        setProcessingStep('completed');
        addMessage({ role: 'assistant', content: 'Processing your request...' });
      } else if (parsed?.action?.type === 'image_gen_result') {
        // No payment required (unlikely but handle it)
        setProcessingStep('completed');
        toast.success('Image generated!');
        addMessage({
          role: 'assistant',
          content: parsed.message || 'Image generated!',
          metadata: { action: { type: 'image_gen_result', data: parsed.action.data } },
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setErrorMessage(errMsg);
      setProcessingStep('error');
      toast.error(`Failed: ${errMsg}`);
    }
  }, [payment, balanceData, buildPrompt, selectedModel, sourceImage, mimeType, getCurrentSession, addMessage, refetchBalance]);

  const handlePresetClick = (presetId: string) => {
    if (selectedPreset === presetId) {
      setSelectedPreset(null);
    } else {
      setSelectedPreset(presetId);
      setCustomPrompt(''); // Clear custom prompt when preset selected
    }
  };

  const isProcessing = processingStep !== 'idle' && processingStep !== 'completed' && processingStep !== 'error';

  return (
    <div className="border border-[#e5e7eb] rounded-[16px] bg-white font-sans max-w-sm">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#e5e7eb] bg-white rounded-t-[16px]">
        <h3 className="text-[10px] font-bold text-[#3a3a3a]">
          Transform Image
        </h3>
      </div>

      <div className="p-3 space-y-3">
        {/* Source Image Preview */}
        <div className="relative">
          <Image
            src={getDataUrl(sourceImage, mimeType)}
            alt="Source"
            width={400}
            height={128}
            className="w-full h-32 object-cover border border-[#e5e7eb] rounded-[8px]"
            unoptimized
          />
          <div className="absolute bottom-1 right-1 bg-[#3a3a3a] text-white text-[8px] px-1 py-0.5 rounded-[4px]">
            Source
          </div>
        </div>

        {/* Custom Prompt */}
        <div>
          <label className="text-[9px] font-bold text-black/50 mb-1 block">
            Describe Transformation
          </label>
          <textarea
            className="w-full border border-[#e5e7eb] rounded-[8px] bg-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#3a3a3a] resize-none placeholder:text-black/30"
            placeholder="e.g., Make it look like a watercolor painting..."
            rows={2}
            value={customPrompt}
            onChange={(e) => {
              setCustomPrompt(e.target.value);
              if (e.target.value.trim()) setSelectedPreset(null);
            }}
            disabled={isProcessing}
          />
        </div>

        {/* Or divider */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-[#e5e7eb]" />
          <span className="text-[9px] text-black/40">Or Choose Preset</span>
          <div className="flex-1 h-px bg-[#e5e7eb]" />
        </div>

        {/* Preset Buttons */}
        <div className="flex flex-wrap gap-1.5">
          {MODIFICATION_PRESETS.map((preset) => {
            const isSelected = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetClick(preset.id)}
                disabled={isProcessing}
                className={`px-2.5 py-1.5 text-[9px] font-bold border rounded-[6px] transition-colors ${
                  isSelected
                    ? 'border-[#3a3a3a] bg-[#3a3a3a] text-white'
                    : 'border-[#e5e7eb] bg-white text-[#3a3a3a] hover:bg-[#f7f7f7]'
                } disabled:opacity-50`}
                title={preset.description}
              >
                {preset.name}
              </button>
            );
          })}
        </div>

        {/* Model Selection */}
        <div>
          <label className="text-[9px] font-bold text-black/50 mb-1 block">
            AI Model
          </label>
          <div className="flex border border-[#e5e7eb] rounded-[8px] overflow-hidden">
            {IMAGE_GEN_MODELS.map((model) => {
              const isSelected = selectedModel === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setSelectedModel(model.id)}
                  disabled={isProcessing}
                  className={`flex-1 py-1.5 text-[9px] font-bold transition-colors border-r border-[#e5e7eb] last:border-r-0 ${
                    isSelected ? 'bg-[#3a3a3a] text-white' : 'bg-white text-[#3a3a3a] hover:bg-[#f7f7f7]'
                  } disabled:opacity-50`}
                  title={model.description}
                >
                  {model.name.replace('Nano ', '')}
                </button>
              );
            })}
          </div>
        </div>

        {/* Processing Status */}
        {isProcessing && (
          <div className="border border-[#e5e7eb] rounded-[8px] p-2 text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="w-3 h-3 border-2 border-[#e5e7eb] border-t-[#3a3a3a] rounded-full animate-spin" />
              <span className="text-[10px] font-bold text-[#3a3a3a]">
                {processingStep === 'paying' && 'Processing Payment...'}
                {processingStep === 'generating' && 'Generating Image...'}
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {processingStep === 'error' && errorMessage && (
          <div className="border border-red-600 bg-red-50 rounded-[8px] p-2 text-center">
            <p className="text-[10px] text-red-600 font-bold">Error</p>
            <p className="text-[9px] text-red-600 mt-1">{errorMessage}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-[9px] text-black/40">
            {payment.isWalletReady ? (
              <>
                <span className="text-green-700 font-bold">$0.30</span>
                {' | Bal: $'}
                {isLoadingBalance ? '...' : formatUnits(balanceData?.value || 0n, 6)}
              </>
            ) : (
              'Connect wallet'
            )}
          </div>

          {processingStep === 'error' ? (
            <button
              type="button"
              onClick={() => {
                setProcessingStep('idle');
                setErrorMessage(null);
                payment.reset();
              }}
              className="px-3 py-1.5 text-[10px] font-bold border border-[#e5e7eb] rounded-[6px] bg-white text-[#3a3a3a] hover:bg-[#f7f7f7] transition-colors"
            >
              Retry
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isProcessing || !payment.isWalletReady || (!customPrompt.trim() && !selectedPreset)}
              className="px-3 py-1.5 text-[10px] font-bold border border-[#3a3a3a] rounded-[6px] bg-[#3a3a3a] text-white hover:bg-white hover:text-[#3a3a3a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? '...' : 'Transform'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
