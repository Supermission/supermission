import { useCallback } from 'react';
import { toast } from 'sonner';
import { useChatStore, MessageAttachment } from '@/lib/store/chat';
import { logger } from '@/lib/logger';
import { useShallow } from 'zustand/react/shallow';
import { parseSSE } from '@/lib/utils/parse-sse';

interface AgentResult {
  message: string;
  sessionId?: string;
  conversationState?: {
    toolResults?: Record<string, unknown>;
  };
}

/**
 * Custom hook for sending messages and handling agent interactions
 */
export function useMessageSender() {
  const {
    addMessage,
    setLoading,
    getCurrentSession,
    updateSessionId,
    updateToolResults,
    appendToLastAssistantMessage,
    getSelectedAgentId,
    getSelectedModelId,
  } = useChatStore(
    useShallow((state) => ({
      addMessage: state.addMessage,
      setLoading: state.setLoading,
      getCurrentSession: state.getCurrentSession,
      updateSessionId: state.updateSessionId,
      updateToolResults: state.updateToolResults,
      appendToLastAssistantMessage: state.appendToLastAssistantMessage,
      getSelectedAgentId: state.getSelectedAgentId,
      getSelectedModelId: state.getSelectedModelId,
    }))
  );

  const sendMessageToAgent = useCallback(async (
    userMessage: string,
    paymentAddress: string | null,
    attachments?: MessageAttachment[]
  ) => {
    try {
      const session = getCurrentSession();
      if (!session) {
        toast.error('No active session');
        return { success: false };
      }

      const agentId = getSelectedAgentId();
      const modelId = getSelectedModelId();

      // Build conversation history, excluding the just-added user turn
      const priorMessages = [...session.messages];
      const lastMessage = priorMessages[priorMessages.length - 1];
      if (
        lastMessage &&
        lastMessage.role === 'user' &&
        lastMessage.content === userMessage
      ) {
        priorMessages.pop();
      }

      const conversationHistory = priorMessages
        .slice(-30)
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role,
          content: msg.content,
          ...(msg.metadata ? { metadata: msg.metadata } : {}),
        }));

      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          sessionId: session.id,
          walletAddress: paymentAddress,
          conversationState: {
            messages: conversationHistory,
            toolResults: session.toolResults || {},
          },
          selectedAgentId: agentId,
          selectedModelId: modelId,
          attachments: attachments && attachments.length > 0 ? attachments : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // Check if response is SSE stream or plain JSON (fallback)
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        // Stream mode: read SSE events
        let resultData: AgentResult | null = null;
        // Track whether we've started receiving streamed text chunks.
        // WHY: When the LLM streams a direct answer (no agent call), we create
        // a placeholder assistant message on the first text chunk, then append
        // subsequent chunks to it. This gives the user real-time text rendering
        // instead of waiting 2-4s for the full response.
        let isStreamingText = false;

        for await (const { event, data } of parseSSE(response)) {
          switch (event) {
            case 'status':
              // Update loading message in real-time
              if (data.stage) {
                setLoading(true, data.stage);
              }
              break;

            case 'text':
              // Streamed LLM text chunk — render progressively
              if (!isStreamingText) {
                isStreamingText = true;
                // Hide loading indicator and create a placeholder message
                setLoading(false);
                addMessage({ role: 'assistant', content: data.chunk || '' });
              } else {
                appendToLastAssistantMessage(data.chunk || '');
              }
              break;

            case 'result':
              resultData = data;
              break;

            case 'error':
              throw new Error(data.error || 'AI service error');

            case 'done':
              break;
          }
        }

        if (!resultData) {
          throw new Error('No result received from stream');
        }

        // If we streamed text, the message is already in the store.
        // The 'result' event still carries the final canonical response + toolResults,
        // so we process it but skip adding a duplicate message.
        processResult(resultData, session.id, isStreamingText);
      } else {
        // Fallback: plain JSON response (backwards compatible)
        const data = await response.json();
        processResult(data, session.id);
      }

      return { success: true };
    } catch (error) {
      logger.error('[Message Sender] Error:', error);
      const raw = error instanceof Error ? error.message : 'Failed to send message';
      toast.error(`Error: ${raw}`);
      // Also surface an inline error so the user has a persistent trace + retry affordance
      addMessage({
        role: 'assistant',
        content: 'The agent is temporarily unavailable. Please try again in a moment.',
      });
      return { success: false, error };
    } finally {
      setLoading(false);
    }

    /**
     * @param skipMessage — When true, the assistant message was already added progressively
     *   via text streaming events, so we only need to sync session/toolResults, not re-add
     *   the message. WHY: Without this flag, streamed text messages would appear twice —
     *   once from the text events and again from processResult.
     */
    // eslint-disable-next-line @typescript-eslint/no-shadow
    function processResult(data: AgentResult, currentSessionId: string, skipMessage = false) {
      // Sync session ID if changed
      if (data.sessionId && data.sessionId !== currentSessionId) {
        updateSessionId(currentSessionId, data.sessionId);
      }

      // Persist toolResults from server response
      if (data.conversationState?.toolResults) {
        updateToolResults(data.conversationState.toolResults);
      }

      // If message was already streamed via text events, don't add again
      if (skipMessage) return;

      // Parse response for actions and agentContext
      let messageContent: string = data.message;
      const messageMetadata: {
        action?: { type: string; data?: Record<string, unknown> };
        agentContext?: Record<string, unknown>;
      } = {};

      try {
        const parsed = JSON.parse(data.message);
        if (parsed.message !== undefined) {
          messageContent = parsed.message;
          if (parsed.action) {
            messageMetadata.action = parsed.action;
          }
          if (parsed.metadata?.agentContext) {
            messageMetadata.agentContext = parsed.metadata.agentContext;
          }
        }
      } catch {
        // Not JSON, use as regular message
      }

      addMessage({
        role: 'assistant',
        content: messageContent,
        metadata: messageMetadata,
      });
    }
  }, [getCurrentSession, addMessage, setLoading, updateSessionId, updateToolResults, appendToLastAssistantMessage, getSelectedAgentId, getSelectedModelId]);

  return { sendMessageToAgent };
}
