import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useChatStore } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { parseSSE } from '@/lib/utils/parse-sse';
import { useAgentStatusStore } from '@/lib/stores/agent-status';

/**
 * Custom hook for sending messages to the ORACLE prediction market agent.
 * Buffers SSE text behind a skeleton loader, then reveals full response at once.
 */
export function useOracleSender() {
  const {
    addMessage,
    setLoading,
    getCurrentSession,
  } = useChatStore(
    useShallow((state) => ({
      addMessage: state.addMessage,
      setLoading: state.setLoading,
      getCurrentSession: state.getCurrentSession,
    }))
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  }, [setLoading]);

  const sendMessageToOracle = useCallback(
    async (userMessage: string, walletAddress: string | null) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const session = getCurrentSession();
        if (!session) {
          toast.error('No active session');
          return { success: false };
        }

        // Build history: last messages, excluding the just-added user message
        const allMessages = [...session.messages];
        const last = allMessages[allMessages.length - 1];
        if (last && last.role === 'user' && last.content === userMessage) {
          allMessages.pop();
        }

        const history = allMessages
          .slice(-10)
          .filter((msg) => msg.role !== 'system')
          .map((msg) => ({ role: msg.role, content: msg.content }));

        let response: Response | undefined;
        let lastFetchError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
          if (controller.signal.aborted) break;
          try {
            response = await fetch('/api/markets/oracle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: userMessage,
                walletAddress,
                history,
                sessionId: session.id,
              }),
              signal: controller.signal,
            });
            break;
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            lastFetchError = err;
          }
        }
        if (!response) throw lastFetchError;

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `API error: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('text/event-stream')) {
          // SSE mode — buffer text behind skeleton, reveal on done
          let bufferedText = '';
          let receivedAction: { type: string; data?: Record<string, unknown> } | null = null;

          for await (const { event, data } of parseSSE(response)) {
            switch (event) {
              case 'status':
                // Update skeleton status message (e.g. "Searching markets...", "Researching latest news...")
                setLoading(true, data.stage || 'Working...');
                break;

              case 'text':
                // Buffer text silently — skeleton stays visible
                bufferedText += data.chunk || '';
                break;

              case 'action':
                receivedAction = data.action || null;
                break;

              case 'error':
                throw new Error(data.error || 'Oracle service error');

              case 'done':
                break;
            }
          }

          // Stream complete — reveal everything at once
          setLoading(false);

          const text = bufferedText.trim();

          if (text && receivedAction) {
            addMessage({ role: 'assistant', content: text, metadata: { action: receivedAction, typingAnimate: true } });
          } else if (text) {
            addMessage({ role: 'assistant', content: text, metadata: { typingAnimate: true } });
          } else if (receivedAction) {
            const label = getActionLabel(receivedAction);
            addMessage({ role: 'assistant', content: label, metadata: { action: receivedAction } });
          } else {
            addMessage({ role: 'assistant', content: "Hmm, I couldn't process that. Try rephrasing your question." });
          }
        } else {
          // JSON fallback (backwards compat)
          const data = await response.json();
          setLoading(false);

          const text: string = data.message || '';
          const action = data.action || null;

          if (text && action) {
            addMessage({ role: 'assistant', content: text, metadata: { action } });
          } else if (text) {
            addMessage({ role: 'assistant', content: text });
          } else if (action) {
            const label = getActionLabel(action);
            addMessage({ role: 'assistant', content: label, metadata: { action } });
          } else {
            addMessage({ role: 'assistant', content: "Hmm, I couldn't process that. Try rephrasing your question." });
          }
        }

        useAgentStatusStore.getState().setStatus('oracle', 'ok');
        return { success: true };
      } catch (error) {
        setLoading(false);
        if (error instanceof DOMException && error.name === 'AbortError') {
          addMessage({ role: 'assistant', content: 'Response stopped.' });
          return { success: false, aborted: true };
        }
        useAgentStatusStore.getState().setStatus('oracle', 'error');
        toast.error(
          `Error: ${error instanceof Error ? error.message : 'Failed to reach ORACLE'}`
        );
        addMessage({
          role: 'assistant',
          content: 'ORACLE is temporarily unavailable. Please try again in a moment.',
        });
        return { success: false, error };
      } finally {
        abortControllerRef.current = null;
      }
    },
    [getCurrentSession, addMessage, setLoading]
  );

  return { sendMessageToOracle, stopGeneration };
}

function getActionLabel(action: { type: string; data?: Record<string, unknown> } | null): string {
  switch (action?.type) {
    case 'oracle_positions': return 'Here are your positions:';
    case 'oracle_trade_confirm': return 'Trade ready for confirmation:';
    case 'oracle_sell_confirm': return 'Ready to sell this position:';
    case 'oracle_sell_confirm_batch': return 'Here are your sell orders:';
    case 'prediction_market_grid': return ''; // Markets shown as markdown tables, not cards
    default: return '';
  }
}
