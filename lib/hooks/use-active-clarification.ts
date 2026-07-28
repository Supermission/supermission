'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import type { AgentClarificationData } from '@/lib/types/clarification';

export function useActiveClarification(): {
  clarification: AgentClarificationData | null;
  dismiss: () => void;
} {
  const { currentSessionId, sessions } = useChatStore(
    useShallow((state) => ({
      currentSessionId: state.currentSessionId,
      sessions: state.sessions,
    }))
  );

  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const lastClarificationMsgId = useRef<string | null>(null);

  const messages =
    currentSessionId && sessions[currentSessionId]
      ? sessions[currentSessionId].messages
      : [];

  // Find the latest assistant message with agent_clarification action
  let clarification: AgentClarificationData | null = null;
  let msgId: string | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant') {
      const action = (msg.metadata as { action?: { type: string; data?: unknown }; isHistory?: boolean } | undefined)?.action;
      const isHistory = (msg.metadata as { isHistory?: boolean } | undefined)?.isHistory;
      if (action?.type === 'agent_clarification' && action.data && !isHistory) {
        clarification = action.data as AgentClarificationData;
        msgId = msg.id;
      }
      break; // only check the latest assistant message
    }
  }

  // Reset dismissed state when a new clarification arrives
  useEffect(() => {
    if (msgId && msgId !== lastClarificationMsgId.current) {
      lastClarificationMsgId.current = msgId;
      setDismissedId(null);
    }
  }, [msgId]);

  // If a user message was sent after the clarification, it's been answered
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === 'user') {
    clarification = null;
  }

  if (dismissedId === msgId) {
    clarification = null;
  }

  return {
    clarification,
    dismiss: () => {
      if (msgId) setDismissedId(msgId);
    },
  };
}
