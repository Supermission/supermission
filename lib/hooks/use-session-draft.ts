import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store/chat';

/**
 * Per-session chat input preservation.
 *
 * When the user switches chats, the current in-progress text is saved to the outgoing
 * session's draft and the incoming session's draft is restored into the input.
 */
export function useSessionDraft(sessionId: string | null) {
  const setSessionDraft = useChatStore((state) => state.setSessionDraft);
  const [input, setInput] = useState('');

  const inputRef = useRef(input);
  inputRef.current = input;
  const prevSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevSessionIdRef.current;
    if (prevId && prevId !== sessionId) {
      setSessionDraft(prevId, inputRef.current);
    }
    if (sessionId && sessionId !== prevId) {
      const draft = useChatStore.getState().sessionDrafts[sessionId] ?? '';
      setInput(draft);
    }
    prevSessionIdRef.current = sessionId;
  }, [sessionId, setSessionDraft]);

  const clearDraft = useCallback(() => {
    setInput('');
    if (sessionId) setSessionDraft(sessionId, '');
  }, [sessionId, setSessionDraft]);

  return { input, setInput, clearDraft };
}
