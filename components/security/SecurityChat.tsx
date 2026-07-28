'use client';

/**
 * SecurityChat
 *
 * A dedicated chat interface for the contract-audit agent,
 * reusing the existing chat infrastructure (chatStore, MessageBubble, etc.)
 * but hardcoded to the 'contract-audit' agent.
 *
 * Auto-payment: param_request and x402_payment_required actions are
 * intercepted and handled silently via embedded wallet (Privy).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useUIStore } from '@/lib/store/ui';
import { toast } from 'sonner';
import { useChatStore } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useSecuroSender } from '@/lib/hooks/use-securo-sender';
import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageSkeleton } from '@/components/chat/message-skeleton';
import { ChatModelSelector } from '@/components/chat/chat-model-selector';
import { AgentClarificationPrompt } from '@/components/chat/agent-clarification-prompt';
import { useActiveClarification } from '@/lib/hooks/use-active-clarification';
import { AgentRedirectPrompt } from '@/components/chat/agent-redirect-prompt';
import { useActiveRedirect } from '@/lib/hooks/use-active-redirect';
import { usePendingRedirectStore } from '@/lib/store/pending-redirect';

const AGENT_ID = 'contract-audit';

const SECURITY_PROMPTS = [
  { label: 'Audit a contract by address', description: 'Paste a contract address for security analysis' },
  { label: 'Check for vulnerabilities', description: 'Reentrancy, access control & more' },
  { label: 'Gas optimization review', description: 'Find gas savings in your contract' },
  { label: 'OpenZeppelin compliance', description: 'Check standard pattern usage' },
];

export function SecurityChat() {
  const [mounted, setMounted] = useState(false);
  const setHideMobileNav = useUIStore((state) => state.setHideMobileNav);

  useEffect(() => {
    setHideMobileNav(true);
    return () => setHideMobileNav(false);
  }, [setHideMobileNav]);

  const {
    currentSessionId,
    sessions,
    isLoading,
    loadingMessage,
    addMessage,
    addLocalMessage,
    setLoading,
    createNewSession,
    getCurrentSession,
    switchSession,
  } = useChatStore(
    useShallow((state) => ({
      currentSessionId: state.currentSessionId,
      sessions: state.sessions,
      isLoading: state.isLoading,
      loadingMessage: state.loadingMessage,
      addMessage: state.addMessage,
      addLocalMessage: state.addLocalMessage,
      setLoading: state.setLoading,
      createNewSession: state.createNewSession,
      getCurrentSession: state.getCurrentSession,
      switchSession: state.switchSession,
    }))
  );

  const { paymentAddress, isReady: isWalletReady } = usePaymentWallet();
  const { sendMessageToSecuro, stopGeneration } = useSecuroSender();
  const { clarification, dismiss: dismissClarification } = useActiveClarification();
  const { redirect, dismiss: dismissRedirect } = useActiveRedirect('securo');
  const peekPendingRedirect = usePendingRedirectStore((s) => s.peekPendingRedirect);
  const consumePendingRedirect = usePendingRedirectStore((s) => s.consumePendingRedirect);

  const messages = currentSessionId && sessions[currentSessionId]
    ? sessions[currentSessionId].messages
    : [];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [deepAudit, setDeepAudit] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Auto-scroll
  useEffect(() => {
    if (mounted) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, [messages.length, currentSessionId, mounted, isLoading]);


  // Ensure session is set to contract-audit agent
  const ensureSession = useCallback(() => {
    const session = getCurrentSession();
    if (session?.selectedAgentId === AGENT_ID) return;

    const existingSession = Object.values(sessions).find((s) => s.selectedAgentId === AGENT_ID);
    if (existingSession) {
      if (existingSession.id !== currentSessionId) {
        switchSession(existingSession.id);
      }
      return;
    }

    createNewSession(AGENT_ID, paymentAddress ?? undefined);
  }, [getCurrentSession, sessions, currentSessionId, switchSession, createNewSession, paymentAddress]);

  // Create a dedicated session for this page on mount
  useEffect(() => {
    ensureSession();
  }, [ensureSession]);

  // Consume pending redirect — auto-send the original message from another agent
  const pendingConsumed = useRef(false);
  useEffect(() => {
    if (!mounted || !isWalletReady || !currentSessionId || pendingConsumed.current) return;
    const peeked = peekPendingRedirect();
    if (!peeked || (peeked.agent !== AGENT_ID && peeked.agent !== 'securo')) return;
    const pending = consumePendingRedirect();
    if (pending) {
      pendingConsumed.current = true;
      addMessage({ role: 'user', content: pending.message });
      setLoading(true, 'Connecting to agent...');
      sendMessageToSecuro(pending.message, paymentAddress);
    }
  }, [mounted, isWalletReady, currentSessionId, peekPendingRedirect, consumePendingRedirect, addMessage, setLoading, sendMessageToSecuro, paymentAddress]);

  const handlePromptClick = useCallback(async (prompt: string) => {
    if (!isWalletReady) {
      toast.error('Please connect a wallet first');
      return;
    }
    if (isLoading) return;

    ensureSession();
    addMessage({ role: 'user', content: prompt });
    const promptWithFlags = deepAudit ? `${prompt}\n[deep-audit]` : prompt;
    setLoading(true, deepAudit ? 'Running Deep Audit (Nemesis + Pashov)...' : 'Connecting to agent...');
    await sendMessageToSecuro(promptWithFlags, paymentAddress);
  }, [isWalletReady, isLoading, ensureSession, addMessage, setLoading, sendMessageToSecuro, paymentAddress]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!isWalletReady) {
      toast.error('Please connect a wallet first');
      return;
    }

    const userMessage = input.trim();
    ensureSession();

    const messageWithFlags = deepAudit ? `${userMessage}\n[deep-audit]` : userMessage;
    addMessage({ role: 'user', content: userMessage });
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    setLoading(true, deepAudit ? 'Running Deep Audit (Nemesis + Pashov)...' : 'Connecting to agent...');
    await sendMessageToSecuro(messageWithFlags, paymentAddress);
  }, [input, isLoading, isWalletReady, ensureSession, addMessage, setLoading, sendMessageToSecuro, paymentAddress]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
      <div className="flex flex-col bg-white h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] min-h-0 flex-1">
        <div className="flex-1 p-4">
          <MessageSkeleton isUser={false} />
          <MessageSkeleton isUser={true} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] min-h-0 flex-1 pt-3 sm:pt-4">
      {/* Messages area */}
      <div className={`flex-1 p-3 pb-24 md:pb-6 sm:p-4 md:p-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${messages.length === 0 ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <div className="max-w-4xl mx-auto w-full h-full">
          {messages.length === 0 ? (
            /* Empty state — prompt cards */
            <div className="flex flex-col items-center justify-center h-full">
              <div className="text-center mb-8">
                <p className="text-[10px] text-black/40 font-bold uppercase tracking-[0.3em] mb-3" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                  SMART CONTRACT AUDIT
                </p>
                <h2 className="text-xl sm:text-2xl font-black text-black tracking-tight uppercase leading-none" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                  AUDIT YOUR CONTRACTS
                </h2>
                <div className="w-12 h-[2px] bg-[#e5e7eb] mx-auto mt-4" />
                <p className="text-xs text-black/40 mt-3" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                  AI-powered security analysis, vulnerability detection & gas optimization
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
                {SECURITY_PROMPTS.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePromptClick(p.label)}
                    disabled={isLoading || !isWalletReady}
                    className="group relative bg-white border border-[#e5e7eb] rounded-[12px] p-3 text-left disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:border-[#d1d5db] hover:shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
                  >
                    <h3 className="text-[11px] font-black uppercase tracking-tight text-black leading-tight" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                      {p.label}
                    </h3>
                    <p className="text-[9px] text-black/40 mt-1 leading-snug" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                      {p.description}
                    </p>
                    <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-1 group-hover:translate-x-0">
                      <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>

              {!isWalletReady && (
                <div className="mt-6 inline-flex items-center gap-2 py-2 px-4 border border-amber-300 bg-amber-50 rounded-[8px]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full bg-amber-500 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 bg-amber-500" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                    Connect wallet to start
                  </span>
                </div>
              )}
            </div>
          ) : (
            <>
              {messages.map((message) => {
                // Hide param_request and x402_payment_required panels (auto-handled)
                const action = (message.metadata as { action?: { type: string } })?.action;
                if (action?.type === 'param_request' || action?.type === 'x402_payment_required') {
                  return null;
                }

                // Show auto-payment indicator on result messages
                const autoPayment = (message.metadata as { autoPayment?: { txHash: string; amount: string } })?.autoPayment;

                return (
                  <div key={message.id}>
                    <MessageBubble message={message} />
                    {autoPayment && (
                      <div className="flex items-center gap-1.5 ml-7 -mt-2 mb-4">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        <span className="font-mono text-[9px] text-[#6b7280]">
                          Paid ${autoPayment.amount} USDC
                        </span>
                        <a
                          href={`https://basescan.org/tx/${autoPayment.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[9px] text-[#6b7280] hover:text-[#3a3a3a] underline"
                        >
                          tx
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {isLoading && (
            <div className="flex items-start gap-3 mb-6">
              <div className="flex-1 bg-white border border-[#e5e7eb] rounded-[12px] p-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#1a1a1a] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-[#1a1a1a] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-[#1a1a1a] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="font-mono text-xs ml-2 opacity-60">{loadingMessage}</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 md:sticky md:bottom-0 bg-white px-4 pt-4 pb-5 sm:px-8 sm:pt-5 sm:pb-6 border-t border-black/5 z-40 shrink-0">
        {redirect ? (
          <div className="max-w-4xl mx-auto mb-3">
            <AgentRedirectPrompt
              data={redirect}
              onDismiss={dismissRedirect}
              addLocalMessage={addLocalMessage}
            />
          </div>
        ) : clarification ? (
          <div className="max-w-4xl mx-auto mb-3">
            <AgentClarificationPrompt
              data={clarification}
              accentColor="#f59e0b"
              onSelect={(_id, label) => {
                addMessage({ role: 'user', content: label });
                setInput('');
                setLoading(true, 'Connecting to agent...');
                sendMessageToSecuro(label, paymentAddress);
              }}
              onCustomSubmit={(text) => {
                addMessage({ role: 'user', content: text });
                setInput('');
                setLoading(true, 'Connecting to agent...');
                sendMessageToSecuro(text, paymentAddress);
              }}
              onSkip={dismissClarification}
            />
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto mb-3">
          <div className="relative">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={!isWalletReady ? 'Connect wallet to start...' : 'Ask about risks or paste a contract'}
                disabled={!isWalletReady || isLoading}
                rows={1}
                className="w-full min-h-[48px] max-h-[150px] resize-none bg-transparent pl-4 pr-14 py-3.5 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed rounded-t-2xl"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overflowY: 'auto', lineHeight: '1.5' }}
              />
              {/* Bottom action bar */}
              <div className="flex items-center justify-between px-3 pb-2 rounded-b-2xl">
                {/* Left — model selector + deep audit toggle */}
                <div className="flex items-center gap-2">
                  <ChatModelSelector />
                  <button
                    type="button"
                    onClick={() => setDeepAudit(v => !v)}
                    title={deepAudit ? 'Deep Audit ON: Nemesis + Pashov (~2-3 min)' : 'Enable Deep Audit (Nemesis + Pashov AI passes)'}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider border transition-all duration-150 ${deepAudit ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'}`}
                    style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    Deep
                  </button>
                </div>
                {/* Right — send button */}
                <button
                  type="submit"
                  disabled={!isWalletReady || !input.trim() || isLoading}
                  className="w-9 h-9 rounded-full bg-gray-900 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-gray-800 transition-all duration-200 flex items-center justify-center shadow-sm"
                  title={!isWalletReady ? 'Connect wallet first' : 'Send message'}
                >
                  {isLoading ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
