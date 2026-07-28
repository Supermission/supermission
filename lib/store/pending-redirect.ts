import { create } from 'zustand';

interface PendingRedirectState {
  /** The original user message to auto-send after navigation */
  pendingMessage: string | null;
  /** The target agent ID */
  pendingAgent: string | null;
  setPendingRedirect: (message: string, agent: string) => void;
  /** Peek at the pending redirect without clearing it */
  peekPendingRedirect: () => { message: string; agent: string } | null;
  /** Consume (clear) the pending redirect — only call after confirming the agent matches */
  consumePendingRedirect: () => { message: string; agent: string } | null;
}

export const usePendingRedirectStore = create<PendingRedirectState>((set, get) => ({
  pendingMessage: null,
  pendingAgent: null,
  setPendingRedirect: (message, agent) => set({ pendingMessage: message, pendingAgent: agent }),
  peekPendingRedirect: () => {
    const { pendingMessage, pendingAgent } = get();
    if (pendingMessage && pendingAgent) {
      return { message: pendingMessage, agent: pendingAgent };
    }
    return null;
  },
  consumePendingRedirect: () => {
    const { pendingMessage, pendingAgent } = get();
    if (pendingMessage && pendingAgent) {
      set({ pendingMessage: null, pendingAgent: null });
      return { message: pendingMessage, agent: pendingAgent };
    }
    return null;
  },
}));
