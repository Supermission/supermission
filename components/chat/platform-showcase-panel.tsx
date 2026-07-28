'use client';

import React from 'react';
import { useChatStore } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useMessageSender } from '@/lib/hooks/use-message-sender';
import { toast } from 'sonner';
import { PlatformAgent } from '@/lib/ai/platform-knowledge';

interface PlatformShowcaseData {
  agents: PlatformAgent[];
  intentType: string;
}

interface PlatformShowcasePanelProps {
  data: PlatformShowcaseData;
}

export function PlatformShowcasePanel({ data }: PlatformShowcasePanelProps) {
  const { agents } = data;

  const { addMessage, setLoading, setSelectedAgent } = useChatStore(
    useShallow((state) => ({
      addMessage: state.addMessage,
      setLoading: state.setLoading,
      setSelectedAgent: state.setSelectedAgent,
    }))
  );

  const { paymentAddress, isReady: isWalletReady } = usePaymentWallet();
  const { sendMessageToAgent } = useMessageSender();
  const isLoading = useChatStore((state) => state.isLoading);

  const handleAgentClick = async (agent: PlatformAgent) => {
    if (!isWalletReady) {
      toast.error('Connect wallet first');
      return;
    }
    if (isLoading) return;

    setSelectedAgent(agent.id);
    addMessage({ role: 'user', content: agent.prompt });
    setLoading(true, `Starting ${agent.name}...`);
    await sendMessageToAgent(agent.prompt, paymentAddress);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-2">
      {agents.map((agent) => (
        <button
          key={agent.id}
          onClick={() => handleAgentClick(agent)}
          disabled={isLoading || !isWalletReady}
          className="group flex items-center gap-2 p-2 bg-white border border-[#e5e7eb] rounded-[12px]
                     hover:bg-[#f7f7f7] hover:-translate-y-0.5 transition-all
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {/* Icon */}
          <div className="w-7 h-7 bg-[#f8fafc] border border-[#e5e7eb] rounded-lg flex-shrink-0 flex items-center justify-center
                          transition-colors">
            <span className="text-[9px] font-bold text-[#3a3a3a]">
              {agent.icon}
            </span>
          </div>
          {/* Name */}
          <span className="text-[10px] font-semibold text-[#3a3a3a] truncate
                         transition-colors">
            {agent.name.replace(' Due Diligence', '').replace(' Finder', '').replace('AI ', '')}
          </span>
        </button>
      ))}
    </div>
  );
}
