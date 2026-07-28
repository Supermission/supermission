import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useChatStore } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { parseSSE } from '@/lib/utils/parse-sse';
import { useAgentStatusStore } from '@/lib/stores/agent-status';

/**
 * Custom hook for sending messages to the DELPHI unified DeFi agent.
 * Buffers SSE text behind a skeleton loader, then reveals full response at once.
 */
export function useDelphiSender() {
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

  const sendMessageToDelphi = useCallback(
    async (userMessage: string, walletAddress: string | null, connectedChainId?: number | null) => {
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
        if (last && last.role === 'user' && last.content === userMessage) {
          allMessages.pop();
        }

        const history = allMessages
          .slice(-10)
          .filter((msg) => msg.role !== 'system')
          .map((msg) => ({ role: msg.role, content: msg.content }));

        const response = await fetch('/api/dashboard/delphi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            walletAddress,
            connectedChainId: connectedChainId ?? null,
            history,
            sessionId: session.id,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `API error: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('text/event-stream')) {
          let bufferedText = '';
          let receivedAction: { type: string; data?: Record<string, unknown> } | null = null;

          for await (const { event, data } of parseSSE(response)) {
            switch (event) {
              case 'status':
                setLoading(true, data.stage || 'Working...');
                break;
              case 'text':
                bufferedText += data.chunk || '';
                break;
              case 'action':
                receivedAction = data.action || null;
                break;
              case 'error':
                throw new Error(data.error || 'DELPHI service error');
              case 'done':
                break;
            }
          }

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

        useAgentStatusStore.getState().setStatus('delphi', 'ok');
        return { success: true };
      } catch (error) {
        setLoading(false);
        if (error instanceof DOMException && error.name === 'AbortError') {
          addMessage({ role: 'assistant', content: 'Response stopped.' });
          return { success: false, aborted: true };
        }
        useAgentStatusStore.getState().setStatus('delphi', 'error');
        toast.error(
          `Error: ${error instanceof Error ? error.message : 'Failed to reach DELPHI'}`
        );
        addMessage({
          role: 'assistant',
          content: 'DELPHI is temporarily unavailable. Please try again in a moment.',
        });
        return { success: false, error };
      } finally {
        abortControllerRef.current = null;
      }
    },
    [getCurrentSession, addMessage, setLoading]
  );

  return { sendMessageToDelphi, stopGeneration };
}

function getActionLabel(action: { type: string; data?: Record<string, unknown> } | null): string {
  switch (action?.type) {
    case 'token_dd_result': return 'Here\'s the token analysis:';
    case 'defi_swap_quote': return 'Swap quote ready:';
    case 'defi_yield_result': return 'Here are the best yield opportunities:';
    case 'wallet_intelligence_result': return 'Here\'s your wallet analysis:';
    case 'morpho_vault_result': return 'Here are the Morpho vaults:';
    case 'morpho_deposit_ready': return 'Deposit ready — confirm below:';
    case 'swap_ready': return 'Swap ready — confirm below:';
    case 'defi_deposit_ready': return 'Deposit ready — confirm below:';
    case 'uniswap_lp_ready': return 'LP position ready — confirm below:';
    case 'uniswap_lp_remove_ready': return 'Liquidity removal ready — confirm below:';
    case 'uniswap_lp_collect_ready': return 'Fee collection ready — confirm below:';
    case 'nansen_trending_result': return 'Here are the trending tokens:';
    case 'nansen_smart_money_result': return 'Here\'s what smart money is doing:';
    case 'nansen_analysis_result': return 'Here\'s the Nansen analysis:';
    case 'batch_buy_plan_ready': return 'Batch buy plan:';
    case 'batch_buy_execution_ready': return 'Executing batch swaps...';
    default: return 'Here are the results:';
  }
}
