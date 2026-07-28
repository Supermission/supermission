import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useChatStore } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { parseSSE } from '@/lib/utils/parse-sse';
import { useAgentStatusStore } from '@/lib/stores/agent-status';

/** Sends messages to the RORO stocks & options agent (Robinhood). */
export function useRoroSender() {
  const { addMessage, setLoading, getCurrentSession } = useChatStore(
    useShallow((state) => ({
      addMessage: state.addMessage,
      setLoading: state.setLoading,
      getCurrentSession: state.getCurrentSession,
    }))
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
  }, [setLoading]);

  const sendMessageToRoro = useCallback(
    async (userMessage: string, walletAddress: string | null) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const session = getCurrentSession();
        if (!session) {
          setLoading(false);
          toast.error('No active session');
          return { success: false };
        }

        const allMessages = [...session.messages];
        const last = allMessages[allMessages.length - 1];
        if (last && last.role === 'user' && last.content === userMessage) allMessages.pop();

        const history = allMessages
          .slice(-10)
          .filter((msg) => msg.role !== 'system')
          .map((msg) => ({ role: msg.role, content: msg.content }));

        const response = await fetch('/api/dashboard/roro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage, walletAddress, history, sessionId: session.id }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `API error: ${response.status}`);
        }

        let bufferedText = '';
        let receivedAction: { type: string; data?: Record<string, unknown> } | null = null;

        for await (const { event, data } of parseSSE(response)) {
          switch (event) {
            case 'status': setLoading(true, data.stage || 'Working...'); break;
            case 'text': bufferedText += data.chunk || ''; break;
            case 'action': receivedAction = data.action || null; break;
            case 'error': throw new Error(data.error || 'RORO service error');
            case 'done': break;
          }
        }

        setLoading(false);
        const text = bufferedText.trim();

        if (text && receivedAction) {
          addMessage({ role: 'assistant', content: text, metadata: { action: receivedAction, typingAnimate: true } });
        } else if (text) {
          addMessage({ role: 'assistant', content: text, metadata: { typingAnimate: true } });
        } else if (receivedAction) {
          addMessage({ role: 'assistant', content: getActionLabel(receivedAction), metadata: { action: receivedAction } });
        } else {
          addMessage({ role: 'assistant', content: "Hmm, I couldn't process that. Try rephrasing." });
        }

        useAgentStatusStore.getState().setStatus('roro', 'ok');
        return { success: true };
      } catch (error) {
        setLoading(false);
        if (error instanceof DOMException && error.name === 'AbortError') {
          addMessage({ role: 'assistant', content: 'Response stopped.' });
          return { success: false, aborted: true };
        }
        useAgentStatusStore.getState().setStatus('roro', 'error');
        toast.error(`Error: ${error instanceof Error ? error.message : 'Failed to reach RORO'}`);
        addMessage({ role: 'assistant', content: 'RORO is temporarily unavailable. Please try again in a moment.' });
        return { success: false, error };
      } finally {
        abortControllerRef.current = null;
      }
    },
    [getCurrentSession, addMessage, setLoading]
  );

  return { sendMessageToRoro, stopGeneration };
}

function getActionLabel(action: { type: string; data?: Record<string, unknown> } | null): string {
  switch (action?.type) {
    case 'roro_order_ready': return 'Order ready — type **yes** to place, or **cancel**:';
    default: return 'Here are the results:';
  }
}
