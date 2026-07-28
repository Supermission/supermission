'use client';

import { useState } from 'react';
import { useChatStore } from '@/lib/store/chat';
import { toast } from 'sonner';

interface MissionModePanelProps {
  data: {
    originalMessage: string;
  };
}

export function MissionModePanel({ data }: MissionModePanelProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const addMessage = useChatStore((state) => state.addMessage);
  const getCurrentSession = useChatStore((state) => state.getCurrentSession);

  const handleAIMatching = async () => {
    setIsProcessing(true);
    try {
      // Call agent recommendation endpoint
      const session = getCurrentSession();
      if (!session) {
        toast.error('Session not found');
        return;
      }

      // Send request to get agent recommendations
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[AI_AGENT_MATCHING] ${data.originalMessage}`,
          sessionId: session.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();

      // Parse action response
      let messageContent = result.message;
      const messageMetadata: {
        action?: { type: string; data?: Record<string, unknown> };
      } = {};

      try {
        const parsed = JSON.parse(result.message);
        if (parsed.action) {
          messageContent = parsed.message;
          messageMetadata.action = parsed.action;
        }
      } catch {
        // Not JSON, use as regular message
      }

      // Add assistant response with agent recommendations
      addMessage({
        role: 'assistant',
        content: messageContent,
        metadata: messageMetadata,
      });
    } catch (error) {
      toast.error(`Failed to get agent recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('AI matching error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="border border-[#e5e7eb] bg-white rounded-[12px] max-w-2xl">
      {/* Header */}
      <div className="border-b border-[#e5e7eb] p-2 bg-white text-[#3a3a3a] rounded-t-[12px]">
        <h3 className="text-[11px] font-semibold text-[#6b7280]">Choose Deployment Mode</h3>
      </div>

      <div className="p-3 grid grid-cols-1 gap-3">
        {/* AI Agent Matching */}
        <button
          onClick={handleAIMatching}
          disabled={isProcessing}
          className="group border border-[#e5e7eb] bg-white p-3 text-left transition-colors hover:bg-[#f7f7f7] rounded-[12px] disabled:cursor-not-allowed relative overflow-hidden"
        >
          {isProcessing && (
            <div className="absolute inset-0 bg-black bg-opacity-95 flex items-center justify-center z-10">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-white text-[10px]">Analyzing...</span>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 border border-[#e5e7eb] bg-[#f8fafc] rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                <rect x="7" y="4" width="10" height="12" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <circle cx="10" cy="8" r="1" fill="currentColor" />
                <circle cx="14" cy="8" r="1" fill="currentColor" />
                <path d="M9 12 L12 13 L15 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-xs mb-1">AI Agent Matching</h4>
              <p className="text-[10px] text-[#6b7280] mb-2">
                Analyze requirements, find the best agent for the job, deploy instantly
              </p>
              <div className="flex items-center gap-1 text-[9px] font-semibold text-[#6b7280]">
                <span>Select Agents</span>
                <span className="transition-transform group-hover:translate-x-1">&gt;</span>
              </div>
            </div>
          </div>
        </button>

      </div>
    </div>
  );
}
