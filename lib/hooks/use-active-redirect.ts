'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatStore, type Message } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { AGENT_REDIRECT_MAP, type AgentRedirectTarget } from '@/lib/ai/agent-redirect-config';

export interface ActiveRedirectData {
  targetAgent: AgentRedirectTarget;
  reason: string;
  /** The user's original message that triggered the redirect */
  originalMessage: string;
}

/**
 * Detect a sister-agent redirect from message text content.
 * Matches patterns like "ORACLE handles", "consult DELPHI", "SECURO can audit",
 * or any mention of an agent name in context of capabilities/scope.
 */
function detectRedirectFromText(text: string): { agentId: string; reason: string } | null {
  // Only short responses are likely redirects — long ones are real answers
  if (!text || text.length > 600) return null;

  // Each agent: name + contextual signals that indicate a redirect (not just a mention)
  const agents: { id: string; name: string; contextWords: RegExp }[] = [
    { id: 'delphi', name: 'DELPHI', contextWords: /swap|DeFi|yield|bridge|wallet|token|Dashboard|LP|liquidity/i },
    { id: 'oracle', name: 'ORACLE', contextWords: /prediction|market|bet|trade|polymarket|odds|signal/i },
    { id: 'hyperion', name: 'HYPERION', contextWords: /perp|futures|leverage|trading|margin|long|short/i },
    { id: 'securo', name: 'SECURO', contextWords: /audit|security|contract|vulnerab|exploit|solidity/i },
  ];

  for (const { id, name, contextWords } of agents) {
    // Must mention the agent name
    if (!text.includes(name)) continue;
    // Skip self-introductions ("I'm DELPHI", "I am DELPHI", "I'm ORACLE")
    const selfIntro = new RegExp(`\\b(I'm|I am)\\s+${name}\\b`, 'i');
    if (selfIntro.test(text)) continue;
    // Must also have context words suggesting the user should go there
    if (!contextWords.test(text)) continue;
    // Must have redirect-like phrasing (not just "I am DELPHI")
    const redirectPhrasing = /\b(handled by|handles|consult|head over|check the|go to|visit|redirect|use|specializ|talk to|managed by)\b/i;
    if (!redirectPhrasing.test(text)) continue;

    // Extract first sentence as reason
    const firstSentence = text.trim().split(/(?<=[.!?])\s/)[0]?.trim() || '';
    const reason = firstSentence.length > 120
      ? firstSentence.slice(0, 117) + '...'
      : firstSentence || `This task is handled by ${name}.`;

    return { agentId: id, reason };
  }

  return null;
}

export function useActiveRedirect(currentAgentId?: string): {
  redirect: ActiveRedirectData | null;
  dismiss: () => void;
} {
  const { currentSessionId, sessions } = useChatStore(
    useShallow((state) => ({
      currentSessionId: state.currentSessionId,
      sessions: state.sessions,
    }))
  );

  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const lastRedirectMsgId = useRef<string | null>(null);

  const messages =
    currentSessionId && sessions[currentSessionId]
      ? sessions[currentSessionId].messages
      : [];

  let redirect: ActiveRedirectData | null = null;
  let msgId: string | null = null;

  // Check the latest assistant message for redirects
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant') {
      const isHistory = (msg.metadata as { isHistory?: boolean } | undefined)?.isHistory;
      if (isHistory) break;

      let detectedAgent: string | null = null;
      let detectedReason = '';

      // Path 1: Check action metadata (from tool call or server safety net)
      const action = (msg.metadata as { action?: { type: string; data?: Record<string, unknown> } } | undefined)?.action;
      if (action?.type === 'agent_redirect' && action.data) {
        const data = action.data as { targetAgent?: string; reason?: string };
        detectedAgent = data.targetAgent || null;
        detectedReason = data.reason || '';
      }

      // Path 2: Fallback — detect from message text content
      if (!detectedAgent) {
        const textDetection = detectRedirectFromText(msg.content);
        if (textDetection) {
          detectedAgent = textDetection.agentId;
          detectedReason = textDetection.reason;
        }
      }

      if (detectedAgent) {
        // Skip self-redirects (e.g., DELPHI redirecting to DELPHI)
        if (currentAgentId && detectedAgent === currentAgentId) break;
        const target = AGENT_REDIRECT_MAP[detectedAgent];
        if (target) {
          // Find the user message that triggered this redirect
          let originalMessage = '';
          for (let j = i - 1; j >= 0; j--) {
            if (messages[j].role === 'user') {
              originalMessage = messages[j].content;
              break;
            }
          }
          redirect = { targetAgent: target, reason: detectedReason, originalMessage };
          msgId = msg.id;
        }
      }
      break; // only check the latest assistant message
    }
  }

  // Reset dismissed state when a new redirect arrives
  useEffect(() => {
    if (msgId && msgId !== lastRedirectMsgId.current) {
      lastRedirectMsgId.current = msgId;
      setDismissedId(null);
    }
  }, [msgId]);

  // If a user message was sent after the redirect, it's been answered
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === 'user') {
    redirect = null;
  }

  if (dismissedId === msgId) {
    redirect = null;
  }

  return {
    redirect,
    dismiss: () => {
      if (msgId) setDismissedId(msgId);
    },
  };
}
