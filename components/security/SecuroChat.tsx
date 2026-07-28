'use client';

/**
 * SecuroChat
 *
 * Full-screen AI assistant chat for the SECURO smart contract security agent.
 * Follows the AGENT_BLUEPRINT pattern (like DelphiChat).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useUIStore } from '@/lib/store/ui';
import { toast } from 'sonner';
import { useChatStore } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useSecuroSender } from '@/lib/hooks/use-securo-sender';
import { useChatAutoScroll } from '@/lib/hooks/use-chat-auto-scroll';
import { useSessionDraft } from '@/lib/hooks/use-session-draft';
import { useChatUrlSync } from '@/lib/hooks/use-chat-url-sync';
import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageSkeleton } from '@/components/chat/message-skeleton';
import { OracleLoadingSkeleton } from '@/components/chat/oracle-loading-skeleton';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { ArrowDown } from 'lucide-react';

const AGENT_ID = 'securo';

const SECURITY_PROMPTS = [
  { label: 'Audit a contract by address', description: 'Paste a contract address for security analysis' },
  { label: 'Check for vulnerabilities', description: 'Reentrancy, access control & more' },
  { label: 'Gas optimization review', description: 'Find gas savings in your contract' },
  { label: 'OpenZeppelin compliance', description: 'Check standard pattern usage' },
];

export default function SecuroChat() {
  const [mounted, setMounted] = useState(false);
  const [deepAudit, setDeepAudit] = useState(false);
  const { sidebarOpen, setSidebarOpen, setHideMobileNav } = useUIStore();

  useEffect(() => {
    setHideMobileNav(true);
    return () => setHideMobileNav(false);
  }, [setHideMobileNav]);

  const {
    currentSessionId,
    sessions,
    isLoading,
    loadingMessage,
    isHydrated,
    addMessage,
    setLoading,
    createNewSession,
    switchSession,
    updateSessionWallet,
    hydrateFromSupabase,
    truncateMessagesFrom,
  } = useChatStore(
    useShallow((state) => ({
      currentSessionId: state.currentSessionId,
      sessions: state.sessions,
      isLoading: state.isLoading,
      loadingMessage: state.loadingMessage,
      isHydrated: state.isHydrated,
      addMessage: state.addMessage,
      setLoading: state.setLoading,
      createNewSession: state.createNewSession,
      switchSession: state.switchSession,
      updateSessionWallet: state.updateSessionWallet,
      hydrateFromSupabase: state.hydrateFromSupabase,
      truncateMessagesFrom: state.truncateMessagesFrom,
    }))
  );

  const { paymentAddress, isReady: isWalletReady } = usePaymentWallet();
  const { sendMessageToSecuro, stopGeneration } = useSecuroSender();

  const messages = currentSessionId && sessions[currentSessionId]
    && sessions[currentSessionId].selectedAgentId === AGENT_ID
    ? sessions[currentSessionId].messages
    : [];

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { input, setInput, clearDraft } = useSessionDraft(currentSessionId);

  const lastMessageContent = messages.length > 0 ? messages[messages.length - 1].content : '';
  const { scrollContainerRef, messagesEndRef, isAtBottom, unreadCount, scrollToBottom } =
    useChatAutoScroll({
      messages,
      sessionId: currentSessionId,
      streamingContent: lastMessageContent,
      isLoading,
    });

  useEffect(() => { setMounted(true); }, []);

  useChatUrlSync({ agentId: AGENT_ID, ready: isHydrated || !paymentAddress });

  // Auto-focus textarea when loading ends
  useEffect(() => {
    if (mounted && !isLoading) {
      textareaRef.current?.focus();
    }
  }, [isLoading, mounted]);

  // Hydrate from Supabase when wallet is ready
  useEffect(() => {
    if (paymentAddress && !isHydrated) {
      hydrateFromSupabase(paymentAddress);
    }
  }, [paymentAddress, isHydrated, hydrateFromSupabase]);

  // Restore latest SECURO session on entry when available; do not auto-create an empty one.
  useEffect(() => {
    if (paymentAddress && !isHydrated) return;
    const currentSession = currentSessionId ? sessions[currentSessionId] : null;
    if (currentSession?.selectedAgentId === AGENT_ID) return;

    const existingSession = Object.values(sessions)
      .filter((s) => s.selectedAgentId === AGENT_ID)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0];

    if (existingSession) {
      switchSession(existingSession.id);
    }
  }, [currentSessionId, sessions, switchSession, isHydrated, paymentAddress]);

  const ensureAgentSession = useCallback(() => {
    const currentSession = currentSessionId ? sessions[currentSessionId] : null;
    if (currentSession?.selectedAgentId === AGENT_ID) return currentSessionId;

    const existingSession = Object.values(sessions)
      .filter((s) => s.selectedAgentId === AGENT_ID)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0];

    if (existingSession) {
      switchSession(existingSession.id);
      return existingSession.id;
    }

    return createNewSession(AGENT_ID, paymentAddress ?? undefined);
  }, [currentSessionId, sessions, switchSession, createNewSession, paymentAddress]);

  // Patch wallet address onto session when wallet connects after session creation
  useEffect(() => {
    if (paymentAddress && currentSessionId) {
      const session = sessions[currentSessionId];
      if (session?.selectedAgentId === AGENT_ID && !session.walletAddress) {
        updateSessionWallet(paymentAddress);
      }
    }
  }, [paymentAddress, currentSessionId, sessions, updateSessionWallet]);

  // No auto-greeting — the empty state with suggested prompts handles the welcome

  const handlePromptClick = useCallback(async (prompt: string) => {
    if (!isWalletReady) {
      toast.error('Please connect a wallet first');
      return;
    }
    if (isLoading) return;

    ensureAgentSession();
    addMessage({ role: 'user', content: prompt });
    const promptWithFlags = deepAudit ? `${prompt}\n[deep-audit]` : prompt;
    setLoading(true, deepAudit ? 'Running Deep Audit (Nemesis + Pashov)...' : 'SECURO is analyzing...');
    await sendMessageToSecuro(promptWithFlags, paymentAddress);
  }, [isWalletReady, isLoading, ensureAgentSession, addMessage, setLoading, sendMessageToSecuro, paymentAddress, deepAudit]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!isWalletReady) {
      toast.error('Please connect a wallet first');
      return;
    }

    const userMessage = input.trim();
    const messageWithFlags = deepAudit ? `${userMessage}\n[deep-audit]` : userMessage;

    ensureAgentSession();
    addMessage({ role: 'user', content: userMessage });
    clearDraft();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    setLoading(true, deepAudit ? 'Running Deep Audit (Nemesis + Pashov)...' : 'SECURO is analyzing...');
    await sendMessageToSecuro(messageWithFlags, paymentAddress);
  }, [input, isLoading, isWalletReady, ensureAgentSession, addMessage, clearDraft, setLoading, sendMessageToSecuro, paymentAddress, deepAudit]);

  const handleRetry = useCallback(async (messageIndex: number) => {
    // Find the last user message before this assistant message
    const prevMessages = messages.slice(0, messageIndex);
    const lastUserMsg = [...prevMessages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg || isLoading) return;
    ensureAgentSession();
    addMessage({ role: 'user', content: lastUserMsg.content });
    const retryText = deepAudit ? `${lastUserMsg.content}\n[deep-audit]` : lastUserMsg.content;
    setLoading(true, deepAudit ? 'Running Deep Audit (Nemesis + Pashov)...' : 'SECURO is analyzing...');
    await sendMessageToSecuro(retryText, paymentAddress);
  }, [messages, isLoading, deepAudit, ensureAgentSession, addMessage, setLoading, sendMessageToSecuro, paymentAddress]);

  const handleEdit = useCallback(async (messageIndex: number, newContent: string) => {
    if (!currentSessionId || isLoading) return;
    truncateMessagesFrom(currentSessionId, messageIndex);
    ensureAgentSession();
    addMessage({ role: 'user', content: newContent });
    const messageWithFlags = deepAudit ? `${newContent}\n[deep-audit]` : newContent;
    setLoading(true, deepAudit ? 'Running Deep Audit (Nemesis + Pashov)...' : 'SECURO is analyzing...');
    await sendMessageToSecuro(messageWithFlags, paymentAddress);
  }, [currentSessionId, isLoading, deepAudit, truncateMessagesFrom, ensureAgentSession, addMessage, setLoading, sendMessageToSecuro, paymentAddress]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter inserts a newline so users can compose multi-line prompts.
    // Cmd/Ctrl+Enter sends.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  };

  if (!mounted) {
    return (
      <div className="flex flex-col h-full bg-white min-h-0 flex-1 pt-3 sm:pt-4">
        <div className="flex-1 p-4">
          <MessageSkeleton isUser={false} />
          <MessageSkeleton isUser={true} />
        </div>
      </div>
    );
  }

  return (
    <div data-agent-chat-scope className="flex h-full min-h-0 flex-1 bg-white relative overflow-hidden">
      <ChatSidebar agentIdFilter={AGENT_ID} embedded isOpen={sidebarOpen} onToggle={setSidebarOpen} />
      <div className="flex flex-col flex-1 min-w-0 pt-0 md:pt-4">
      {/* Messages area */}
      <div ref={scrollContainerRef} className={`flex-1 px-0 py-0 pb-40 md:px-6 md:py-6 md:pb-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${messages.length === 0 ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <div className="max-w-4xl mx-auto w-full h-full">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 md:px-0">
              <div className="text-center mb-8">
                <h2 className="text-[2rem] md:text-[1.75rem] font-bold text-[#1a1a1a] tracking-tight leading-none" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                  Hey, I&apos;m <span className="text-[#f59e0b]">Securo.</span>
                </h2>
                <p className="text-[15px] md:text-sm text-[#9ca3af] mt-2" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                  Your smart contract security analyst. Paste and audit.
                </p>
              </div>

              {/* Suggested prompts */}
              {isWalletReady && (
                <div className="w-full max-w-lg">
                  <div className="flex flex-wrap justify-center gap-2">
                    {SECURITY_PROMPTS.map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => handlePromptClick(p.label)}
                        disabled={isLoading}
                        className="px-3.5 py-1.5 text-[11px] font-medium text-[#6b7280] bg-[#f5f3f0] hover:bg-[#ece8e3] hover:text-[#1a1a1a] border border-[#e8e4df] rounded-full transition-all duration-200 disabled:opacity-40"
                        style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!isWalletReady && (
                <div className="mt-10 md:mt-8 inline-flex items-center gap-2.5 md:gap-2 py-3 px-5 md:py-2 md:px-4 border border-amber-300 bg-amber-50 rounded-xl md:rounded-[8px]">
                  <span className="relative flex h-2 w-2 md:h-1.5 md:w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full bg-amber-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 md:h-1.5 md:w-1.5 bg-amber-500" />
                  </span>
                  <span className="text-sm md:text-[10px] font-semibold text-amber-700" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                    Connect wallet to start
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 md:px-0 py-4 md:py-0 mb-4">
              {messages.map((message, idx) => {
                if (!message.content && !(message.metadata as any)?.action) return null;
                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onRetry={message.role === 'assistant' ? () => handleRetry(idx) : undefined}
                    onEdit={message.role === 'user' ? (newContent) => handleEdit(idx, newContent) : undefined}
                    showActions={message.role === 'assistant'}
                  />
                );
              })}
            </div>
          )}

          {isLoading && (
            <div className="px-4 md:px-0">
              <OracleLoadingSkeleton statusMessage={loadingMessage} />
            </div>
          )}
          <div className="h-32 md:h-0 shrink-0" />
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll-down arrow */}
      {!isAtBottom && messages.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-20 md:bottom-24 left-1/2 -translate-x-1/2 z-50 h-8 px-4 rounded-full bg-white border border-[#e0e0e0] shadow-md flex items-center gap-1.5 hover:shadow-lg hover:border-[#c5c5c5] active:scale-95 transition-all duration-200 animate-in fade-in zoom-in-75"
        >
          <ArrowDown className="w-3.5 h-3.5 text-gray-600" />
          <span className="text-xs font-medium text-gray-600">
            {unreadCount > 0 ? `${unreadCount} new message${unreadCount === 1 ? '' : 's'}` : 'Jump to latest'}
          </span>
        </button>
      )}

      {/* Input bar — fixed bottom on mobile, docked on desktop */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[85%] md:w-auto md:static md:translate-x-0 md:left-auto px-0 md:px-8 pt-0 md:pt-3 pb-0 md:pb-3 z-40 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="agent-chat-input-wrapper bg-gradient-to-b from-[#f8f8f8] to-[#f0f0f0] rounded-[14px] md:rounded-2xl border border-[#e0e0e0] shadow-sm hover:shadow-md hover:border-[#c5c5c5] transition-all duration-200">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={!isWalletReady ? 'Connect wallet to start...' : 'Audit address or code...'}
                disabled={!isWalletReady || isLoading}
                rows={1}
                className="w-full min-h-[40px] md:min-h-[48px] max-h-[100px] md:max-h-[150px] resize-none bg-transparent pl-3 pr-12 md:pl-4 md:pr-14 py-2.5 md:py-3.5 text-sm md:text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed rounded-t-[14px] md:rounded-t-2xl"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overflowY: 'auto', lineHeight: '1.5' }}
              />
              <div className="flex items-center justify-between px-3 pb-2 md:px-3 md:pb-2 rounded-b-[14px] md:rounded-b-2xl">
                <div className="flex items-center gap-1.5 md:gap-2">
                  <span className="text-[9px] md:text-[10px] font-semibold text-[#6b7280] tracking-wider" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>SECURO</span>
                  <button
                    type="button"
                    onClick={() => setDeepAudit(v => !v)}
                    title={deepAudit ? 'Deep Audit ON: Nemesis + Pashov (~2-3 min)' : 'Enable Deep Audit (Nemesis + Pashov AI passes)'}
                    className={`inline-flex items-center gap-1 md:gap-1 px-2 py-1 md:px-2 md:py-1 rounded-md text-[9px] md:text-[9px] min-h-0 font-bold uppercase tracking-wider border transition-all duration-150 active:scale-95 ${deepAudit ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'}`}
                    style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                  >
                    <svg className="w-2.5 h-2.5 md:w-2.5 md:h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    Deep
                  </button>
                </div>
                {isLoading ? (
                  <button
                    type="button"
                    onClick={stopGeneration}
                    className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gray-900 text-white hover:bg-red-600 active:scale-90 transition-all duration-200 flex items-center justify-center shadow-sm"
                    title="Stop generating"
                  >
                    <svg className="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!isWalletReady || !input.trim()}
                    className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gray-900 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-gray-800 active:scale-90 transition-all duration-200 flex items-center justify-center shadow-sm"
                    title={!isWalletReady ? 'Connect wallet first' : 'Send message'}
                  >
                    <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}
