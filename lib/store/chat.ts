import { create } from 'zustand';

export interface MessageAttachment {
  type: 'image' | 'document';
  name: string;
  mimeType: string;
  data: string;  // base64
  size: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  attachments?: MessageAttachment[];
  metadata?: {
    gigId?: number;
    txHash?: string;
    functionCall?: {
      name: string;
      arguments: Record<string, unknown>;
    };
    action?: {
      type: string;
      data?: Record<string, unknown>;
    };
    agentContext?: Record<string, unknown>;
    autoPayment?: {
      txHash: string;
      amount: string;
    };
    typingAnimate?: boolean;
    /** True when this message was loaded from DB (history mode) — action components must not re-execute */
    isHistory?: boolean;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  lastMessageAt: number;
  selectedAgentId?: string | null;
  selectedModelId?: string;
  walletAddress?: string;
  toolResults?: Record<string, any>;
}

interface ChatState {
  currentSessionId: string | null;
  sessions: Record<string, ChatSession>;
  isLoading: boolean;
  loadingMessage: string;
  isHydrated: boolean;

  // Getters
  getCurrentSession: () => ChatSession | null;
  getMessages: () => Message[];
  getSelectedAgentId: () => string | null;
  getSelectedModelId: () => string;

  // Session management
  createNewSession: (selectedAgentId?: string | null, walletAddress?: string) => string;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, newTitle: string) => void;
  updateSessionId: (oldId: string, newId: string) => void;

  // Agent selection for current session
  setSelectedAgent: (agentId: string | null) => void;

  // AI model selection for current session
  setSelectedModel: (modelId: string) => void;

  // Patch wallet address on existing session (for late wallet connect)
  updateSessionWallet: (walletAddress: string) => void;

  // Tool results (agent context across requests)
  updateToolResults: (toolResults: Record<string, any>) => void;

  // Remove all messages at/after a given index in a session (local + DB).
  // Used for edit-and-resubmit: truncate from the edited message, then add the new one.
  truncateMessagesFrom: (sessionId: string, fromIndex: number) => void;

  // Message management
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  addLocalMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;

  /**
   * Append text to the last assistant message's content (for streaming).
   * WHY: When the LLM streams a direct answer token-by-token, we need to
   * progressively update the displayed message. Without this, we'd have to
   * wait for the full response before showing anything. This enables real-time
   * text rendering as the LLM generates each chunk.
   */
  appendToLastAssistantMessage: (text: string) => void;

  /**
   * Merge new metadata into the last assistant message.
   * WHY: Action cards arrive via SSE `action` event AFTER text streaming completes.
   * We need to attach them to the already-created assistant message.
   */
  updateLastAssistantMetadata: (metadata: Partial<NonNullable<Message['metadata']>>) => void;

  // Per-session in-progress draft text (preserves typing when switching chats)
  sessionDrafts: Record<string, string>;
  setSessionDraft: (sessionId: string, text: string) => void;

  // State management
  setLoading: (loading: boolean, message?: string) => void;

  // Supabase sync
  hydrateFromSupabase: (walletAddress: string) => Promise<void>;
  loadSessionMessages: (sessionId: string) => Promise<void>;
  saveMessageToSupabase: (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => Promise<void>;
}

/** Derive a session title from the first user message */
function deriveTitle(currentTitle: string, message: { role: string; content: string }): string {
  if (currentTitle !== 'New Chat' && currentTitle !== 'Chat') return currentTitle;
  if (message.role !== 'user') return currentTitle;
  return message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '');
}

/** Strip base64 data URLs from metadata before saving to Supabase */
function sanitizeForStorage(metadata: Message['metadata']): Message['metadata'] {
  if (!metadata) return metadata;

  // Strip UI-only flags that shouldn't be persisted
  const { typingAnimate, isHistory, ...rest } = metadata;

  const sanitize = (obj: unknown): unknown => {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      if (obj.startsWith('data:image')) return '[IMAGE_STORED_ON_IPFS]';
      return obj.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/g, '[IMAGE_STORED_ON_IPFS]');
    }
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        result[k] = sanitize(v);
      }
      return result;
    }
    return obj;
  };

  return sanitize(rest) as Message['metadata'];
}

// Clean up legacy localStorage on first load (one-time migration)
if (typeof window !== 'undefined') {
  try { localStorage.removeItem('supermission-chat-storage'); } catch { /* noop */ }
}

export const useChatStore = create<ChatState>()((set, get) => ({
  currentSessionId: null,
  sessions: {},
  isLoading: false,
  loadingMessage: 'Thinking...',
  isHydrated: false,
  sessionDrafts: {},

  getCurrentSession: () => {
    const { currentSessionId, sessions } = get();
    if (!currentSessionId) return null;
    return sessions[currentSessionId] || null;
  },

  getMessages: () => {
    const session = get().getCurrentSession();
    return session?.messages || [];
  },

  getSelectedAgentId: () => {
    const session = get().getCurrentSession();
    return session?.selectedAgentId || null;
  },

  getSelectedModelId: () => {
    const session = get().getCurrentSession();
    return session?.selectedModelId || 'default';
  },

  createNewSession: (selectedAgentId = null, walletAddress?: string) => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const newSession: ChatSession = {
      id: sessionId,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
      selectedAgentId,
      walletAddress,
    };

    set((state) => ({
      sessions: { ...state.sessions, [sessionId]: newSession },
      currentSessionId: sessionId,
    }));

    return sessionId;
  },

  switchSession: (sessionId) => {
    set({ currentSessionId: sessionId });
    const session = get().sessions[sessionId];
    if (session && session.messages.length === 0) {
      get().loadSessionMessages(sessionId);
    }
  },

  deleteSession: (sessionId) => {
    set((state) => {
      const newSessions = { ...state.sessions };
      delete newSessions[sessionId];

      const newSessionDrafts = { ...state.sessionDrafts };
      delete newSessionDrafts[sessionId];

      let newCurrentId = state.currentSessionId;
      if (state.currentSessionId === sessionId) {
        const remaining = Object.values(newSessions);
        newCurrentId = remaining.length > 0
          ? remaining.sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0].id
          : null;
      }

      return { sessions: newSessions, currentSessionId: newCurrentId, sessionDrafts: newSessionDrafts };
    });

    fetch(`/api/chat/sessions?sessionId=${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    }).catch((err) => console.error('[ChatStore] Failed to delete session from Supabase:', err));
  },

  renameSession: (sessionId, newTitle) => {
    const trimmed = newTitle.trim().slice(0, 100);
    if (!trimmed) return;

    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, title: trimmed },
        },
      };
    });

    fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    }).catch((err) => console.error('[ChatStore] Failed to rename session in Supabase:', err));
  },

  updateSessionId: (oldId, newId) => {
    set((state) => {
      const session = state.sessions[oldId];
      if (!session) return state;

      const newSessions = { ...state.sessions };
      delete newSessions[oldId];
      newSessions[newId] = { ...session, id: newId };

      return {
        sessions: newSessions,
        currentSessionId: state.currentSessionId === oldId ? newId : state.currentSessionId,
      };
    });
  },

  setSelectedAgent: (agentId) => {
    set((state) => {
      const sessionId = state.currentSessionId;
      if (!sessionId) return state;
      const session = state.sessions[sessionId];
      if (!session) return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, selectedAgentId: agentId },
        },
      };
    });
  },

  updateSessionWallet: (walletAddress) => {
    set((state) => {
      const sessionId = state.currentSessionId;
      if (!sessionId) return state;
      const session = state.sessions[sessionId];
      if (!session || session.walletAddress) return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, walletAddress },
        },
      };
    });
  },

  updateToolResults: (toolResults) => {
    set((state) => {
      const sessionId = state.currentSessionId;
      if (!sessionId) return state;
      const session = state.sessions[sessionId];
      if (!session) return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, toolResults },
        },
      };
    });
  },

  setSelectedModel: (modelId) => {
    set((state) => {
      const sessionId = state.currentSessionId;
      if (!sessionId) return state;
      const session = state.sessions[sessionId];
      if (!session) return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, selectedModelId: modelId },
        },
      };
    });
  },

  truncateMessagesFrom: (sessionId, fromIndex) => {
    const state = get();
    const session = state.sessions[sessionId];
    if (!session || fromIndex < 0 || fromIndex >= session.messages.length) return;

    const cutMessage = session.messages[fromIndex];
    const remaining = session.messages.slice(0, fromIndex);

    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: { ...s.sessions[sessionId], messages: remaining },
      },
    }));

    if (session.walletAddress && cutMessage.timestamp) {
      fetch(
        `/api/chat/messages?sessionId=${encodeURIComponent(sessionId)}&fromTimestamp=${cutMessage.timestamp}`,
        { method: 'DELETE' },
      ).catch((err) => console.error('[ChatStore] Failed to truncate messages:', err));
    }
  },

  addMessage: (message) => {
    const state = get();
    const session = state.getCurrentSession();
    if (!session) return;

    const newMessage: Message = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      timestamp: Date.now(),
    };

    const isFirstUserMessage = message.role === 'user' && session.messages.length === 0;

    set({
      sessions: {
        ...state.sessions,
        [session.id]: {
          ...session,
          messages: [...session.messages, newMessage],
          title: deriveTitle(session.title, message),
          lastMessageAt: Date.now(),
        },
      },
    });

    get().saveMessageToSupabase(session.id, message);

    if (isFirstUserMessage && session.walletAddress) {
      const sessionId = session.id;
      fetch('/api/chat/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userMessage: message.content }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.title) return;
          set((s) => {
            const curr = s.sessions[sessionId];
            if (!curr) return s;
            return {
              sessions: { ...s.sessions, [sessionId]: { ...curr, title: data.title } },
            };
          });
        })
        .catch((err) => console.error('[ChatStore] Title generation failed:', err));
    }
  },

  addLocalMessage: (message) => {
    const state = get();
    const session = state.getCurrentSession();
    if (!session) return;

    const newMessage: Message = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      timestamp: Date.now(),
    };

    set({
      sessions: {
        ...state.sessions,
        [session.id]: {
          ...session,
          messages: [...session.messages, newMessage],
          lastMessageAt: Date.now(),
        },
      },
    });
  },

  appendToLastAssistantMessage: (text) => {
    set((state) => {
      const sessionId = state.currentSessionId;
      if (!sessionId) return state;
      const session = state.sessions[sessionId];
      if (!session || session.messages.length === 0) return state;

      const messages = [...session.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role !== 'assistant') return state;

      messages[messages.length - 1] = {
        ...lastMsg,
        content: lastMsg.content + text,
      };

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, messages },
        },
      };
    });
  },

  updateLastAssistantMetadata: (metadata) => {
    set((state) => {
      const sessionId = state.currentSessionId;
      if (!sessionId) return state;
      const session = state.sessions[sessionId];
      if (!session || session.messages.length === 0) return state;

      const messages = [...session.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role !== 'assistant') return state;

      messages[messages.length - 1] = {
        ...lastMsg,
        metadata: { ...lastMsg.metadata, ...metadata },
      };

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, messages },
        },
      };
    });
  },

  setSessionDraft: (sessionId, text) => set((state) => {
    const next = { ...state.sessionDrafts };
    if (text) next[sessionId] = text;
    else delete next[sessionId];
    return { sessionDrafts: next };
  }),
  setLoading: (loading, message = 'Thinking...') => set({ isLoading: loading, loadingMessage: message }),

  hydrateFromSupabase: async (walletAddress: string) => {
    try {
      const response = await fetch(`/api/chat/sessions?wallet=${walletAddress}`);
      if (!response.ok) {
        console.warn('[ChatStore] Failed to fetch sessions from Supabase');
        set({ isHydrated: true });
        return;
      }

      const data = await response.json();
      const supabaseSessions = data.sessions || [];

      const sessions: Record<string, ChatSession> = {};
      for (const s of supabaseSessions) {
        sessions[s.id] = {
          id: s.id,
          title: s.title || 'New Chat',
          messages: [],
          createdAt: s.createdAt,
          lastMessageAt: s.lastMessageAt,
          selectedAgentId: s.agentId,
          walletAddress: s.walletAddress,
        };
      }

      set({ sessions, isHydrated: true });

      const { currentSessionId } = get();
      if (currentSessionId && sessions[currentSessionId]) {
        get().loadSessionMessages(currentSessionId);
      }
    } catch (error) {
      console.error('[ChatStore] Error hydrating from Supabase:', error);
      set({ isHydrated: true });
    }
  },

  loadSessionMessages: async (sessionId: string) => {
    try {
      const response = await fetch(`/api/chat/messages?sessionId=${sessionId}`);
      if (!response.ok) {
        console.warn('[ChatStore] Failed to load messages for session:', sessionId);
        return;
      }

      const data = await response.json();
      const messages = (data.messages || []).map((m: Message) => {
        const meta = { ...m.metadata, isHistory: true };
        if (meta.typingAnimate) {
          delete (meta as any).typingAnimate;
        }
        return { ...m, metadata: meta };
      });

      set((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;

        const firstUserMsg = messages.find((m: Message) => m.role === 'user');
        const title = firstUserMsg
          ? deriveTitle(session.title, firstUserMsg)
          : session.title;

        return {
          sessions: {
            ...state.sessions,
            [sessionId]: { ...session, messages, title },
          },
        };
      });
    } catch (error) {
      console.error('[ChatStore] Error loading messages:', error);
    }
  },

  saveMessageToSupabase: async (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => {
    try {
      const state = get();
      const session = state.sessions[sessionId];

      if (!session?.walletAddress) {
        console.warn('[ChatStore] No wallet address for session, skipping Supabase save');
        return;
      }

      const sanitizedMessage = {
        ...message,
        metadata: sanitizeForStorage(message.metadata),
      };

      const sessionTitle = session.title !== 'New Chat' ? session.title : undefined;

      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: sanitizedMessage,
          walletAddress: session.walletAddress,
          title: sessionTitle,
          agentId: session.selectedAgentId,
        }),
      });

      if (!response.ok) {
        console.error('[ChatStore] Failed to save message:', await response.text());
      }
    } catch (error) {
      console.error('[ChatStore] Error saving message to Supabase:', error);
    }
  },
}));
