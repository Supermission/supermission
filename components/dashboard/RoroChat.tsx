'use client';

/**
 * RoroChat
 *
 * Full-screen AI assistant chat for the RORO stocks & options agent (Robinhood).
 * Mirrors the DELPHI/ORACLE chat standard: session sidebar, centered empty
 * state, message actions, loading skeleton, scroll-to-bottom, docked composer.
 * RORO-specific: Robinhood connection banner + status.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { ArrowDown } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui';
import { useChatStore } from '@/lib/store/chat';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useRoroSender } from '@/lib/hooks/use-roro-sender';
import { useChatAutoScroll } from '@/lib/hooks/use-chat-auto-scroll';
import { useSessionDraft } from '@/lib/hooks/use-session-draft';
import { useChatUrlSync } from '@/lib/hooks/use-chat-url-sync';
import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageSkeleton } from '@/components/chat/message-skeleton';
import { OracleLoadingSkeleton } from '@/components/chat/oracle-loading-skeleton';
import { ChatSidebar } from '@/components/chat/chat-sidebar';

const AGENT_ID = 'roro';
const ACCENT = '#16a34a';
const FONT = 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)';

const SUGGESTIONS = [
  'My portfolio & buying power',
  'Bull vs bear on NVDA',
  "AAPL price + RSI",
  'Top movers today',
  'Buy 1 share of AAPL',
  'Options chain for TSLA',
];

export function RoroChat() {
  const [mounted, setMounted] = useState(false);
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
    useShallow((s) => ({
      currentSessionId: s.currentSessionId,
      sessions: s.sessions,
      isLoading: s.isLoading,
      loadingMessage: s.loadingMessage,
      isHydrated: s.isHydrated,
      addMessage: s.addMessage,
      setLoading: s.setLoading,
      createNewSession: s.createNewSession,
      switchSession: s.switchSession,
      updateSessionWallet: s.updateSessionWallet,
      hydrateFromSupabase: s.hydrateFromSupabase,
      truncateMessagesFrom: s.truncateMessagesFrom,
    }))
  );

  const { paymentAddress, isReady: isWalletReady } = usePaymentWallet();
  const { sendMessageToRoro, stopGeneration } = useRoroSender();

  const [connected, setConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { input, setInput, clearDraft } = useSessionDraft(currentSessionId);

  const messages = useMemo(() => {
    const s = currentSessionId ? sessions[currentSessionId] : null;
    return s?.selectedAgentId === AGENT_ID ? s.messages : [];
  }, [currentSessionId, sessions]);

  const lastMessageContent = messages.length > 0 ? messages[messages.length - 1].content : '';
  const { scrollContainerRef, messagesEndRef, isAtBottom, unreadCount, scrollToBottom } =
    useChatAutoScroll({ messages, sessionId: currentSessionId, streamingContent: lastMessageContent, isLoading });

  useEffect(() => { setMounted(true); }, []);
  useChatUrlSync({ agentId: AGENT_ID, ready: isHydrated || !paymentAddress });

  // Hydrate from Supabase when wallet is ready.
  useEffect(() => {
    if (paymentAddress && !isHydrated) hydrateFromSupabase(paymentAddress);
  }, [paymentAddress, isHydrated, hydrateFromSupabase]);

  // Restore latest RORO session on entry; don't auto-create an empty one.
  useEffect(() => {
    if (paymentAddress && !isHydrated) return;
    const cur = currentSessionId ? sessions[currentSessionId] : null;
    if (cur?.selectedAgentId === AGENT_ID) return;
    const existing = Object.values(sessions)
      .filter((s) => s.selectedAgentId === AGENT_ID)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0];
    if (existing) switchSession(existing.id);
  }, [currentSessionId, sessions, switchSession, isHydrated, paymentAddress]);

  const ensureAgentSession = useCallback(() => {
    const cur = currentSessionId ? sessions[currentSessionId] : null;
    if (cur?.selectedAgentId === AGENT_ID) return currentSessionId;
    const existing = Object.values(sessions)
      .filter((s) => s.selectedAgentId === AGENT_ID)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0];
    if (existing) { switchSession(existing.id); return existing.id; }
    return createNewSession(AGENT_ID, paymentAddress ?? undefined);
  }, [currentSessionId, sessions, switchSession, createNewSession, paymentAddress]);

  // Patch wallet onto session if it connects after session creation.
  useEffect(() => {
    if (paymentAddress && currentSessionId) {
      const s = sessions[currentSessionId];
      if (s?.selectedAgentId === AGENT_ID && !s.walletAddress) updateSessionWallet(paymentAddress);
    }
  }, [paymentAddress, currentSessionId, sessions, updateSessionWallet]);

  // Robinhood connection status.
  useEffect(() => {
    if (!paymentAddress) return;
    const check = () => fetch('/api/robinhood/status').then((r) => r.json()).then((d) => setConnected(!!d.connected)).catch(() => setConnected(false));
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [paymentAddress]);

  // Surface OAuth callback result (?rh=connected|error) once.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const rh = p.get('rh');
    if (rh === 'connected') { toast.success('Robinhood connected'); setConnected(true); }
    else if (rh === 'error') toast.error(`Robinhood connection failed: ${p.get('reason') || 'unknown'}`);
    if (rh) window.history.replaceState({}, '', '/roro');
  }, []);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch('/api/robinhood/connect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.authorizeUrl) throw new Error(data.error || 'Failed to start connection');
      window.location.href = data.authorizeUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start Robinhood connection');
      setConnecting(false);
    }
  }

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || isLoading) return;
    if (!isWalletReady) { toast.error('Connecting your wallet — one moment.'); return; }
    ensureAgentSession();
    addMessage({ role: 'user', content: msg });
    clearDraft();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true, 'RORO is thinking…');
    await sendMessageToRoro(msg, paymentAddress);
  }, [isLoading, isWalletReady, ensureAgentSession, addMessage, clearDraft, setLoading, sendMessageToRoro, paymentAddress]);

  const handleSubmit = useCallback((e: React.FormEvent) => { e.preventDefault(); send(input); }, [send, input]);

  const handleRetry = useCallback(async (messageIndex: number) => {
    const prev = messages.slice(0, messageIndex);
    const lastUser = [...prev].reverse().find((m) => m.role === 'user');
    if (!lastUser || isLoading) return;
    ensureAgentSession();
    setLoading(true, 'RORO is thinking…');
    await sendMessageToRoro(lastUser.content, paymentAddress);
  }, [messages, isLoading, ensureAgentSession, setLoading, sendMessageToRoro, paymentAddress]);

  const handleEdit = useCallback(async (messageIndex: number, newContent: string) => {
    if (!currentSessionId || isLoading) return;
    truncateMessagesFrom(currentSessionId, messageIndex);
    ensureAgentSession();
    addMessage({ role: 'user', content: newContent });
    setLoading(true, 'RORO is thinking…');
    await sendMessageToRoro(newContent, paymentAddress);
  }, [currentSessionId, isLoading, truncateMessagesFrom, ensureAgentSession, addMessage, setLoading, sendMessageToRoro, paymentAddress]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(e); }
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  // Auto-focus when loading ends.
  useEffect(() => { if (mounted && !isLoading) textareaRef.current?.focus(); }, [isLoading, mounted]);

  if (!mounted) {
    return (
      <div className="flex flex-col h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)] bg-white min-h-0 flex-1 pt-3 sm:pt-4">
        <div className="flex-1 p-4">
          <MessageSkeleton isUser={false} />
          <MessageSkeleton isUser={true} />
        </div>
      </div>
    );
  }

  return (
    <div data-agent-chat-scope className="flex h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)] min-h-0 flex-1 bg-white relative overflow-hidden">
      <ChatSidebar agentIdFilter={AGENT_ID} embedded isOpen={sidebarOpen} onToggle={setSidebarOpen} />
      <div className="flex flex-col flex-1 min-w-0 pt-3 sm:pt-4">
        {/* Slim connect banner (only when in a conversation and not connected) */}
        {connected === false && messages.length > 0 && (
          <div className="mx-auto mb-2 flex w-full max-w-4xl items-center justify-between gap-3 rounded-[12px] border border-[#dcfce7] bg-[#f0fdf4] px-3.5 py-2.5">
            <span className="text-[13px] text-[#166534]" style={{ fontFamily: FONT }}>
              Connect <b>Robinhood</b> to place orders and read your live portfolio.
            </span>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="shrink-0 rounded-[8px] px-3.5 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: ACCENT, fontFamily: FONT }}
            >
              {connecting ? 'Opening…' : 'Connect'}
            </button>
          </div>
        )}

        {/* Messages area */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 px-0 py-0 pb-40 md:p-6 md:pb-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${messages.length === 0 ? 'overflow-hidden' : 'overflow-y-auto'}`}
        >
          <div className="max-w-4xl mx-auto w-full h-full">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 md:px-0">
                <div className="text-center mb-7">
                  <img src="/avatars/roro.svg" alt="RORO" width={56} height={56} className="mx-auto mb-4 rounded-[14px] shadow-sm" />
                  <h2 className="text-[2rem] md:text-[1.75rem] font-bold text-[#1a1a1a] tracking-tight leading-none" style={{ fontFamily: FONT }}>
                    Hey, I&apos;m <span style={{ color: ACCENT }}>Roro.</span>
                  </h2>
                  <p className="text-[15px] md:text-sm text-[#9ca3af] mt-2" style={{ fontFamily: FONT }}>
                    Your stocks &amp; options desk. Research, analyze, and trade US equities.
                  </p>
                </div>

                {connected === false ? (
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 active:scale-[0.98] transition disabled:opacity-60"
                    style={{ background: ACCENT, fontFamily: FONT }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/tokens/chain-robinhood.png" alt="" width={18} height={18} className="rounded-[5px] flex-shrink-0" />
                    {connecting ? 'Opening Robinhood…' : 'Connect Robinhood to start'}
                  </button>
                ) : (
                  <div className="w-full max-w-lg">
                    <div className="flex flex-wrap justify-center gap-2">
                      {SUGGESTIONS.map((text) => (
                        <button
                          key={text}
                          onClick={() => send(text)}
                          className="px-3.5 py-1.5 text-[11px] font-medium text-[#166534] bg-[#f0fdf4] hover:bg-[#dcfce7] hover:text-[#14532d] border border-[#dcfce7] rounded-full transition-all duration-200"
                          style={{ fontFamily: FONT }}
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 md:px-0 py-4 md:py-0 mb-4">
                {messages.map((message, idx) => {
                  if (!message.content && !(message.metadata as { action?: unknown })?.action) return null;
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

        {/* Composer — fixed bottom on mobile, docked on desktop */}
        <div className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[85%] md:w-auto md:static md:translate-x-0 md:left-auto px-0 md:px-8 pt-0 md:pt-3 pb-0 md:pb-3 z-40 shrink-0">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            <div className="relative">
              <div className="agent-chat-input-wrapper bg-gradient-to-b from-[#f8f8f8] to-[#f0f0f0] rounded-[14px] md:rounded-2xl border border-[#e0e0e0] shadow-sm hover:shadow-md hover:border-[#c5c5c5] transition-all duration-200">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={!isWalletReady ? 'Connecting wallet…' : 'Ask about a stock, your portfolio, or place a trade…'}
                  disabled={!isWalletReady || isLoading}
                  rows={1}
                  className="w-full min-h-[40px] md:min-h-[48px] max-h-[100px] md:max-h-[150px] resize-none bg-transparent pl-3 pr-12 md:pl-4 md:pr-14 py-2.5 md:py-3.5 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed rounded-t-[14px] md:rounded-t-2xl"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overflowY: 'auto', lineHeight: '1.5' }}
                />
                <div className="flex items-center justify-between px-3 pb-2 rounded-b-[14px] md:rounded-b-2xl">
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <span className="text-[9px] md:text-[10px] font-semibold tracking-wider" style={{ color: ACCENT, fontFamily: FONT }}>RORO</span>
                    {connected === true && (
                      <span className="hidden md:inline text-[10px] text-[#9ca3af]" style={{ fontFamily: FONT }}>· Robinhood connected</span>
                    )}
                  </div>
                  {isLoading ? (
                    <button
                      type="button"
                      onClick={stopGeneration}
                      className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gray-900 text-white hover:bg-red-600 active:scale-90 transition-all duration-200 flex items-center justify-center shadow-sm"
                      title="Stop generating"
                    >
                      <svg className="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!isWalletReady || !input.trim()}
                      className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gray-900 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-gray-800 active:scale-90 transition-all duration-200 flex items-center justify-center shadow-sm"
                      title={!isWalletReady ? 'Connecting wallet…' : 'Send message'}
                    >
                      <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-[#9ca3af]" style={{ fontFamily: FONT }}>
              RORO places real brokerage orders. Not financial advice — you&apos;re responsible for every trade.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
