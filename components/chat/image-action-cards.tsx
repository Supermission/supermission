'use client';

import React, { useState, useCallback } from 'react';
import { ImageGenResponse } from '@/lib/new-agents/imageGeneration/types';
import { useChatStore } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { usePaymentTransaction } from '@/lib/hooks/use-payment-transaction';
import { CONTRACTS } from '@/lib/contracts/addresses';
import type { X402PaymentProof } from '@/lib/x402/types';
import { formatUnits, type Address } from 'viem';
import { useBalance } from 'wagmi';
import { toast } from 'sonner';

// Pricing for image generation
const PRICING = {
  standard: { amount: '80000', display: '$0.08' }, // 2K
  premium: { amount: '120000', display: '$0.12' }, // 4K
};

interface ActionCardProps {
  originalData: ImageGenResponse;
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
}

// Shared hook for x402 payment execution
function useImageGenPayment() {
  const payment = usePaymentTransaction();
  const { addMessage, getCurrentSession, setLoading } = useChatStore(
    useShallow((state) => ({
      addMessage: state.addMessage,
      getCurrentSession: state.getCurrentSession,
      setLoading: state.setLoading,
    }))
  );
  const [isExecuting, setIsExecuting] = useState(false);

  const tokenAddress = CONTRACTS.USDC as Address;
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: payment.paymentAddress as Address,
    token: tokenAddress,
    query: { enabled: payment.isWalletReady && !!payment.paymentAddress },
  });

  const executeWithPayment = useCallback(async (
    prompt: string,
    tier: 'standard' | 'premium' = 'standard',
    extraParams: Record<string, unknown> = {}
  ) => {
    if (!payment.isWalletReady || !payment.paymentAddress) {
      toast.error('Please connect a wallet first');
      return;
    }

    const session = getCurrentSession();
    if (!session) {
      toast.error('No active session');
      return;
    }

    const pricing = PRICING[tier];
    const amount = BigInt(pricing.amount);
    const balance = balanceData?.value || 0n;

    if (balance < amount) {
      toast.error(`Insufficient balance. Need ${pricing.display}, have $${formatUnits(balance, 6)}`);
      return;
    }

    setIsExecuting(true);
    setLoading(true, 'Processing payment...');

    try {
      // Execute payment
      const recipientAddress = '0xABaF59180e0209bdB8b3048bFbe64e855074C0c4' as Address;

      await new Promise<void>((resolve, reject) => {
        payment.executePayment({
          recipient: recipientAddress,
          amount: formatUnits(amount, 6),
          tokenAddress,
          onSuccess: async (txHash) => {
            toast.success('Payment sent!');
            setLoading(true, 'Generating image...');

            // Add user message AFTER payment succeeds to avoid race conditions
            addMessage({ role: 'user', content: prompt });
            refetchBalance();

            const proof: X402PaymentProof = {
              txHash: txHash as `0x${string}`,
              from: payment.paymentAddress as Address,
              to: recipientAddress,
              amount: pricing.amount,
              token: tokenAddress,
              timestamp: Date.now(),
            };

            // Call image generation API directly with payment proof
            // Using [RUN_WITH_PAYMENT] prefix to bypass normal routing and execute directly
            const apiPayload = {
              endpointId: 'super-image-gen',
              params: {
                prompt,
                model: tier,
                aiModel: 'nano-banana-pro',
                enhancePrompt: true,
                ...extraParams,
              },
              paymentProof: proof,
            };

            const response = await fetch('/api/agent/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: `[RUN_WITH_PAYMENT] ${JSON.stringify(apiPayload)}`,
                sessionId: session.id,
                walletAddress: payment.paymentAddress,
                // Explicitly set selectedAgentId to null to avoid any routing conflicts
                selectedAgentId: null,
              }),
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const result = await response.json();

            let messageContent = result.message;
            const messageMetadata: { action?: { type: string; data?: Record<string, unknown> } } = {};

            try {
              const parsed = JSON.parse(result.message);
              if (parsed.message) messageContent = parsed.message;

              // Handle ALL action types properly
              if (parsed.action) {
                messageMetadata.action = {
                  type: parsed.action.type,
                  data: parsed.action.data as Record<string, unknown>,
                };

                // Only show success if we got an image result
                if (parsed.action.type === 'image_gen_result') {
                  toast.success('Image generated!');
                } else if (parsed.action.type === 'x402_payment_required') {
                  // Payment gating disabled - skip
                } else if (parsed.action.type === 'param_request') {
                  // This shouldn't happen with [RUN_WITH_PAYMENT] but handle it
                  toast.info('Additional parameters needed');
                }
              } else {
                // No action in response, likely just a text response
                toast.success('Request processed!');
              }
            } catch {
              // Not JSON - just a text response
              toast.success('Request processed!');
            }

            addMessage({ role: 'assistant', content: messageContent, metadata: messageMetadata });
            resolve();
          },
          onError: (error) => reject(error),
        });
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed: ${errMsg}`);
      addMessage({ role: 'assistant', content: `Failed to generate image: ${errMsg}` });
    } finally {
      setIsExecuting(false);
      setLoading(false);
    }
  }, [payment, balanceData, refetchBalance, addMessage, getCurrentSession, setLoading]);

  return { executeWithPayment, isExecuting, isWalletReady: payment.isWalletReady };
}

// Variation Card - inline chat component
export function VariationActionCard({ originalData }: ActionCardProps) {
  const [selected, setSelected] = useState<string>('creative');
  const [note, setNote] = useState('');
  const { executeWithPayment, isExecuting, isWalletReady } = useImageGenPayment();

  const options = [
    { id: 'creative', label: 'Creative' },
    { id: 'subtle', label: 'Subtle' },
    { id: 'dramatic', label: 'Dramatic' },
    { id: 'color', label: 'Color Shift' },
  ];

  const handleSubmit = () => {
    const base = originalData.metadata.originalPrompt;
    let prompt = '';
    switch (selected) {
      case 'subtle':
        prompt = `Generate a subtle variation of: "${base}" - same composition, minor tweaks`;
        break;
      case 'dramatic':
        prompt = `Dramatic reinterpretation of: "${base}" - same subject, different perspective`;
        break;
      case 'color':
        prompt = `"${base}" with a completely different color palette`;
        break;
      default:
        prompt = `Creative variation of: "${base}"`;
    }
    if (note.trim()) prompt += `. ${note.trim()}`;
    executeWithPayment(prompt, 'standard');
  };

  return (
    <div className="max-w-xs border border-[#e5e7eb] rounded-[12px] bg-white font-sans">
      <div className="px-3 py-2 bg-white text-[#3a3a3a] border-b border-[#e5e7eb] rounded-t-[12px]">
        <span className="text-[10px] font-bold">Variation Options</span>
      </div>
      <div className="p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              disabled={isExecuting}
              className={`text-[10px] px-2 py-1 border rounded-[6px] font-bold transition-all disabled:opacity-50 ${
                selected === opt.id
                  ? 'border-[#3a3a3a] bg-[#3a3a3a] text-white'
                  : 'border-[#e5e7eb] hover:bg-[#f7f7f7]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add notes (optional)..."
          disabled={isExecuting}
          className="w-full p-2 border border-[#e5e7eb] rounded-[6px] text-[11px] focus:border-[#3a3a3a] focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-green-700 font-bold font-mono">$0.08</span>
          <button
            onClick={handleSubmit}
            disabled={isExecuting || !isWalletReady}
            className="px-3 py-1.5 bg-[#3a3a3a] text-white rounded-[6px] text-[10px] font-bold hover:bg-[#3a3a3a]/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExecuting ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Style Card - inline chat component
export function StyleActionCard({ originalData }: ActionCardProps) {
  const [selected, setSelected] = useState<string>('');
  const { executeWithPayment, isExecuting, isWalletReady } = useImageGenPayment();

  const styles = [
    { id: 'anime', label: 'Anime' },
    { id: 'oil-painting', label: 'Oil Paint' },
    { id: 'watercolor', label: 'Watercolor' },
    { id: 'pixel-art', label: 'Pixel Art' },
    { id: '3d-render', label: '3D Render' },
    { id: 'sketch', label: 'Sketch' },
    { id: 'cyberpunk', label: 'Cyberpunk' },
    { id: 'minimalist', label: 'Minimal' },
  ];

  const handleSubmit = () => {
    if (!selected) {
      toast.error('Please select a style');
      return;
    }
    const style = styles.find(s => s.id === selected);
    const prompt = `Transform "${originalData.metadata.originalPrompt}" into ${style?.label.toLowerCase()} style - maintain the subject but completely change the artistic style`;
    executeWithPayment(prompt, 'standard', { style: selected });
  };

  return (
    <div className="max-w-xs border border-[#e5e7eb] rounded-[12px] bg-white font-sans">
      <div className="px-3 py-2 bg-white text-[#3a3a3a] border-b border-[#e5e7eb] rounded-t-[12px]">
        <span className="text-[10px] font-bold">Choose Style</span>
      </div>
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-4 gap-1.5">
          {styles.map((style) => (
            <button
              key={style.id}
              onClick={() => setSelected(style.id)}
              disabled={isExecuting}
              className={`p-1.5 border rounded-[6px] text-[8px] font-bold transition-all disabled:opacity-50 ${
                selected === style.id
                  ? 'border-[#3a3a3a] bg-[#3a3a3a] text-white'
                  : 'border-[#e5e7eb] hover:bg-[#f7f7f7]'
              }`}
            >
              {style.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-green-700 font-bold font-mono">$0.08</span>
          <button
            onClick={handleSubmit}
            disabled={isExecuting || !selected || !isWalletReady}
            className="px-3 py-1.5 bg-[#3a3a3a] text-white rounded-[6px] text-[10px] font-bold hover:bg-[#3a3a3a]/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExecuting ? 'Generating...' : selected ? `Apply ${styles.find(s => s.id === selected)?.label}` : 'Select Style'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Quality Card - inline chat component
export function QualityActionCard({ originalData }: ActionCardProps) {
  const [resolution, setResolution] = useState<'standard' | 'premium'>('premium');
  const [enhancements, setEnhancements] = useState<string[]>(['detail']);
  const { executeWithPayment, isExecuting, isWalletReady } = useImageGenPayment();

  const enhancementOptions = [
    { id: 'detail', label: 'Ultra Detail' },
    { id: 'lighting', label: 'Pro Lighting' },
    { id: 'texture', label: 'Rich Textures' },
  ];

  const toggleEnhancement = (id: string) => {
    setEnhancements(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    const enhText = enhancements
      .map(e => enhancementOptions.find(x => x.id === e)?.label.toLowerCase())
      .filter(Boolean)
      .join(', ');
    const resText = resolution === 'premium' ? '4K' : '2K';
    const prompt = `"${originalData.metadata.originalPrompt}" in ${resText} resolution with ${enhText || 'maximum quality'} - professional grade output`;
    executeWithPayment(prompt, resolution);
  };

  return (
    <div className="max-w-xs border border-[#e5e7eb] rounded-[12px] bg-white font-sans">
      <div className="px-3 py-2 bg-white text-[#3a3a3a] border-b border-[#e5e7eb] rounded-t-[12px]">
        <span className="text-[10px] font-bold">Quality Settings</span>
      </div>
      <div className="p-3 space-y-3">
        {/* Resolution */}
        <div className="flex gap-2">
          <button
            onClick={() => setResolution('standard')}
            disabled={isExecuting}
            className={`flex-1 py-2 border rounded-[8px] text-center transition-all disabled:opacity-50 ${
              resolution === 'standard'
                ? 'border-[#3a3a3a] bg-[#3a3a3a] text-white'
                : 'border-[#e5e7eb] hover:bg-[#f7f7f7]'
            }`}
          >
            <div className="text-sm font-bold">2K</div>
            <div className="text-[8px] opacity-70 font-mono">$0.08</div>
          </button>
          <button
            onClick={() => setResolution('premium')}
            disabled={isExecuting}
            className={`flex-1 py-2 border rounded-[8px] text-center transition-all disabled:opacity-50 ${
              resolution === 'premium'
                ? 'border-[#3a3a3a] bg-[#3a3a3a] text-white'
                : 'border-[#e5e7eb] hover:bg-[#f7f7f7]'
            }`}
          >
            <div className="text-sm font-bold">4K</div>
            <div className="text-[8px] opacity-70 font-mono">$0.12</div>
          </button>
        </div>
        {/* Enhancements */}
        <div className="flex flex-wrap gap-1.5">
          {enhancementOptions.map((en) => (
            <button
              key={en.id}
              onClick={() => toggleEnhancement(en.id)}
              disabled={isExecuting}
              className={`text-[9px] px-2 py-1 border rounded-[6px] font-bold transition-all disabled:opacity-50 ${
                enhancements.includes(en.id)
                  ? 'border-[#3a3a3a] bg-[#3a3a3a] text-white'
                  : 'border-[#e5e7eb] hover:bg-[#f7f7f7]'
              }`}
            >
              {en.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-green-700 font-bold font-mono">
            {resolution === 'premium' ? '$0.12' : '$0.08'}
          </span>
          <button
            onClick={handleSubmit}
            disabled={isExecuting || !isWalletReady}
            className="px-3 py-1.5 bg-[#3a3a3a] text-white rounded-[6px] text-[10px] font-bold hover:bg-[#3a3a3a]/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExecuting ? 'Generating...' : `Generate ${resolution === 'premium' ? '4K' : '2K'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
