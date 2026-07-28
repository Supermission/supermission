'use client';

/**
 * PredictionMarketChat
 *
 * Full-screen AI assistant chat for the prediction-market agent.
 * Renders the new prediction_market_grid (horizontal card row) and
 * prediction_market_allocation (batch trade confirmation) action types.
 * Falls back to legacy prediction_market_result for old messages.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useUIStore } from '@/lib/store/ui';
import { toast } from 'sonner';
import { useChatStore } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useOracleSender } from '@/lib/hooks/use-oracle-sender';
import { useChatAutoScroll } from '@/lib/hooks/use-chat-auto-scroll';
import { useSessionDraft } from '@/lib/hooks/use-session-draft';
import { useChatUrlSync } from '@/lib/hooks/use-chat-url-sync';
import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageSkeleton } from '@/components/chat/message-skeleton';
import { OracleLoadingSkeleton } from '@/components/chat/oracle-loading-skeleton';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { ArrowDown } from 'lucide-react';
import { useTextSelectionQuote, AskOracleTooltip } from '@/components/chat/ask-oracle-tooltip';
import { X, CornerDownLeft } from 'lucide-react';
import { AgentClarificationPrompt } from '@/components/chat/agent-clarification-prompt';
import { useActiveClarification } from '@/lib/hooks/use-active-clarification';
import { AgentRedirectPrompt } from '@/components/chat/agent-redirect-prompt';
import { useActiveRedirect } from '@/lib/hooks/use-active-redirect';
import { usePendingRedirectStore } from '@/lib/store/pending-redirect';
import { TradeConfirmCard } from './oracle/TradeConfirmCard';
import { SellConfirmCard } from './oracle/SellConfirmCard';
import type { MarketCatalogItem } from '@/lib/types/market';

const AGENT_ID = 'prediction-market';

interface PredictionMarketChatProps {
  onMarketClick?: (market: MarketCatalogItem) => void;
  onMarketTextClick?: (questionText: string) => void;
}

export function PredictionMarketChat({ onMarketClick, onMarketTextClick }: PredictionMarketChatProps) {
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
    addLocalMessage,
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
      addLocalMessage: state.addLocalMessage,
      setLoading: state.setLoading,
      createNewSession: state.createNewSession,
      switchSession: state.switchSession,
      updateSessionWallet: state.updateSessionWallet,
      hydrateFromSupabase: state.hydrateFromSupabase,
      truncateMessagesFrom: state.truncateMessagesFrom,
    }))
  );

  const { paymentAddress, isReady: isWalletReady } = usePaymentWallet();
  const { sendMessageToOracle, stopGeneration } = useOracleSender();
  const { clarification, dismiss: dismissClarification } = useActiveClarification();
  const { redirect, dismiss: dismissRedirect } = useActiveRedirect('oracle');
  const peekPendingRedirect = usePendingRedirectStore((s) => s.peekPendingRedirect);
  const consumePendingRedirect = usePendingRedirectStore((s) => s.consumePendingRedirect);

  const messages = currentSessionId && sessions[currentSessionId]
    && sessions[currentSessionId].selectedAgentId === AGENT_ID
    ? sessions[currentSessionId].messages
    : [];

  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { input, setInput, clearDraft } = useSessionDraft(currentSessionId);
  // Quote context from text selection or row "Ask Oracle" button
  const [quoteContext, setQuoteContext] = useState('');
  const { quotedText, clearQuote } = useTextSelectionQuote({ containerRef: messagesAreaRef, enabled: mounted });

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

  // Sync text-selection quote into quote context bar
  useEffect(() => {
    if (quotedText) setQuoteContext(quotedText);
  }, [quotedText]);

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

  // Restore latest ORACLE session on entry when available; do not auto-create an empty one.
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

  // Consume pending redirect — auto-send the original message from another agent
  const pendingConsumed = useRef(false);
  useEffect(() => {
    if (!mounted || !isWalletReady || pendingConsumed.current) return;
    const peeked = peekPendingRedirect();
    if (!peeked || (peeked.agent !== AGENT_ID && peeked.agent !== 'oracle')) return;
    const pending = consumePendingRedirect();
    if (pending) {
      ensureAgentSession();
      pendingConsumed.current = true;
      addMessage({ role: 'user', content: pending.message });
      setLoading(true, 'ORACLE is thinking...');
      sendMessageToOracle(pending.message, paymentAddress);
    }
  }, [mounted, isWalletReady, peekPendingRedirect, consumePendingRedirect, ensureAgentSession, addMessage, setLoading, sendMessageToOracle, paymentAddress]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!isWalletReady) {
      toast.error('Please connect a wallet first');
      return;
    }

    // Prepend quote context if present so Oracle has the reference
    const userText = input.trim();
    const fullMessage = quoteContext
      ? `Re: "${quoteContext.length > 200 ? quoteContext.slice(0, 200) + '...' : quoteContext}"\n\n${userText}`
      : userText;

    ensureAgentSession();
    addMessage({ role: 'user', content: fullMessage });
    clearDraft();
    setQuoteContext('');
    clearQuote();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    setLoading(true, 'ORACLE is thinking...');
    await sendMessageToOracle(fullMessage, paymentAddress);
  }, [input, isLoading, isWalletReady, ensureAgentSession, addMessage, clearDraft, setLoading, sendMessageToOracle, paymentAddress, quoteContext, clearQuote]);

  const handleRetry = useCallback(async (messageIndex: number) => {
    const prevMessages = messages.slice(0, messageIndex);
    const lastUserMsg = [...prevMessages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg || isLoading) return;
    ensureAgentSession();
    addMessage({ role: 'user', content: lastUserMsg.content });
    setLoading(true, 'ORACLE is thinking...');
    await sendMessageToOracle(lastUserMsg.content, paymentAddress);
  }, [messages, isLoading, ensureAgentSession, addMessage, setLoading, sendMessageToOracle, paymentAddress]);

  const handleEdit = useCallback(async (messageIndex: number, newContent: string) => {
    if (!currentSessionId || isLoading) return;
    truncateMessagesFrom(currentSessionId, messageIndex);
    ensureAgentSession();
    addMessage({ role: 'user', content: newContent });
    setLoading(true, 'ORACLE is thinking...');
    await sendMessageToOracle(newContent, paymentAddress);
  }, [currentSessionId, isLoading, truncateMessagesFrom, ensureAgentSession, addMessage, setLoading, sendMessageToOracle, paymentAddress]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Enter inserts a newline so users can compose multi-line prompts.
    // Cmd/Ctrl+Enter sends.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }, [handleSubmit]);

  // "Ask Oracle" handler — sets the quote context bar above the input
  const handleAskOracle = useCallback((text: string) => {
    if (!text.trim()) return;
    setQuoteContext(text.trim());
    // Focus the input so user can type their follow-up
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  // Tap market cell → open the market detail panel directly (one-tap flow).
  const handleMarketCellClick = useCallback((questionText: string) => {
    onMarketTextClick?.(questionText);
  }, [onMarketTextClick]);

  const handleDismissQuote = useCallback(() => {
    setQuoteContext('');
    clearQuote();
  }, [clearQuote]);

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
      <div className="flex flex-col flex-1 min-w-0 pt-0 sm:pt-2">
      {/* Messages area — key forces remount on session switch for fade-in */}
      <div ref={scrollContainerRef} key={currentSessionId} className={`flex-1 px-0 py-0 pb-40 md:p-6 md:pb-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] animate-[fadeIn_0.25s_ease-out] ${messages.length === 0 ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <div className="max-w-4xl mx-auto w-full h-full">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 md:px-0">
              {/* Hero */}
              <div className="text-center mb-6">
                <h2 className="text-[2.25rem] md:text-[1.75rem] font-bold text-[#1a1a1a] tracking-tight leading-[1.1]" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                  Hey, I&apos;m <span className="text-[#6366f1]">Oracle.</span>
                </h2>
                <p className="text-[15px] md:text-sm text-[#9ca3af] mt-2.5 max-w-xs mx-auto leading-relaxed" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                  Your prediction market intelligence. I track 10,000+ markets so you don&apos;t have to.
                </p>
              </div>

              {/* Suggested prompts */}
              {isWalletReady && (
                <div className="w-full max-w-lg">
                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      'Show my positions',
                      'Mispriced markets',
                      'Top volume markets',
                      'Sell my losing position',
                      'Analyze Trump tariff market',
                      'Best opportunities right now',
                    ].map((text) => (
                      <button
                        key={text}
                        onClick={() => {
                          const input = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="markets"]') || document.querySelector<HTMLTextAreaElement>('textarea');
                          if (input) {
                            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                            nativeSetter?.call(input, text);
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.focus();
                          }
                        }}
                        className="px-3.5 py-1.5 text-[11px] font-medium text-[#6b7280] bg-[#f5f3f0] hover:bg-[#ece8e3] hover:text-[#1a1a1a] border border-[#e8e4df] rounded-full transition-all duration-200"
                        style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!isWalletReady && (
                <div className="mt-6 inline-flex items-center gap-2.5 py-3 px-5 border border-amber-300 bg-amber-50 rounded-xl">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full bg-amber-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 bg-amber-500" />
                  </span>
                  <span className="text-sm font-semibold text-amber-700" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                    Connect wallet to start
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div ref={messagesAreaRef} className="px-4 md:px-0 py-4 md:py-0 mb-4">
              <AskOracleTooltip containerRef={messagesAreaRef} onAskOracle={handleAskOracle} />
              {messages.map((message, idx) => {
                const action = (message.metadata as { action?: { type: string; data?: unknown } })?.action;

                // ORACLE positions — render as text/table in chat, no separate card
                if (action?.type === 'oracle_positions') {
                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      onRetry={() => handleRetry(idx)}
                      showActions={message.role === 'assistant'}
                      onTableCellClick={handleMarketCellClick}

                    />
                  );
                }

                // ORACLE trade confirmation
                if (action?.type === 'oracle_trade_confirm') {
                  const tradeData = action.data as any;
                  const msgIsHistory = !!(message.metadata as any)?.isHistory;
                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      onRetry={() => handleRetry(idx)}
                      showActions={message.role === 'assistant'}
                      onTableCellClick={handleMarketCellClick}

                    >
                      {tradeData?.market && (
                        <div className="mt-3 pt-3 border-t border-[#e5e7eb]">
                          <TradeConfirmCard trade={tradeData} isHistory={msgIsHistory} />
                        </div>
                      )}
                    </MessageBubble>
                  );
                }

                // ORACLE trade confirmation (batch — multiple buys)
                if (action?.type === 'oracle_trade_confirm_batch') {
                  const batchData = action.data as any;
                  const trades = batchData?.trades || [];
                  const msgIsHistory = !!(message.metadata as any)?.isHistory;
                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      onRetry={() => handleRetry(idx)}
                      showActions={message.role === 'assistant'}
                      onTableCellClick={handleMarketCellClick}

                    >
                      {trades.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[#e5e7eb] space-y-2">
                          {trades.map((t: any, i: number) => (
                            <TradeConfirmCard key={`${message.id}-trade-${i}`} trade={t} isHistory={msgIsHistory} />
                          ))}
                        </div>
                      )}
                    </MessageBubble>
                  );
                }

                // ORACLE sell confirmation (single)
                if (action?.type === 'oracle_sell_confirm') {
                  const sellData = action.data as any;
                  const msgIsHistory = !!(message.metadata as any)?.isHistory;
                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      onRetry={() => handleRetry(idx)}
                      showActions={message.role === 'assistant'}
                      onTableCellClick={handleMarketCellClick}

                    >
                      {sellData?.market && (
                        <div className="mt-3 pt-3 border-t border-[#e5e7eb]">
                          <SellConfirmCard trade={sellData} isHistory={msgIsHistory} />
                        </div>
                      )}
                    </MessageBubble>
                  );
                }

                // ORACLE sell confirmation (batch — multiple positions)
                if (action?.type === 'oracle_sell_confirm_batch') {
                  const batchData = action.data as any;
                  const sells = batchData?.sells || [];
                  const msgIsHistory = !!(message.metadata as any)?.isHistory;
                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      onRetry={() => handleRetry(idx)}
                      showActions={message.role === 'assistant'}
                      onTableCellClick={handleMarketCellClick}

                    >
                      {sells.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[#e5e7eb] space-y-2">
                          {sells.map((s: any, i: number) => (
                            <SellConfirmCard key={`${message.id}-sell-${i}`} trade={s} isHistory={msgIsHistory} />
                          ))}
                        </div>
                      )}
                    </MessageBubble>
                  );
                }

                // Skip rendering completely empty messages (no text, no action)
                if (!message.content && !action) return null;

                // All other messages
                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onRetry={message.role === 'assistant' ? () => handleRetry(idx) : undefined}
                    onEdit={message.role === 'user' ? (newContent) => handleEdit(idx, newContent) : undefined}
                    showActions={message.role === 'assistant'}
                    onTableCellClick={message.role === 'assistant' ? handleMarketCellClick : undefined}

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
        {redirect ? (
          <div className="max-w-4xl mx-auto">
            <AgentRedirectPrompt
              data={redirect}
              onDismiss={dismissRedirect}
              addLocalMessage={addLocalMessage}
            />
          </div>
        ) : clarification ? (
          <div className="max-w-4xl mx-auto">
            <AgentClarificationPrompt
              data={clarification}
              accentColor="#6366f1"
              onSelect={(_id, label) => {
                ensureAgentSession();
                addMessage({ role: 'user', content: label });
                clearDraft();
                setLoading(true, 'ORACLE is thinking...');
                sendMessageToOracle(label, paymentAddress);
              }}
              onCustomSubmit={(text) => {
                ensureAgentSession();
                addMessage({ role: 'user', content: text });
                clearDraft();
                setLoading(true, 'ORACLE is thinking...');
                sendMessageToOracle(text, paymentAddress);
              }}
              onSkip={dismissClarification}
            />
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative">
            {/* Quote context bar — ChatGPT-style docked above input */}
            {quoteContext && (
              <div className="mb-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] rounded-xl border border-[#333] shadow-sm">
                  <CornerDownLeft className="w-4 h-4 text-[#9ca3af] shrink-0" />
                  <span
                    className="flex-1 text-[12px] text-[#e5e5e5] truncate font-mono"
                    title={quoteContext}
                  >
                    &ldquo;{quoteContext.length > 80 ? quoteContext.slice(0, 80) + '...' : quoteContext}&rdquo;
                  </span>
                  <button
                    type="button"
                    onClick={handleDismissQuote}
                    className="p-0.5 rounded-md text-[#9ca3af] hover:text-white hover:bg-white/10 transition-colors shrink-0"
                    title="Dismiss quote"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
            <div className="agent-chat-input-wrapper bg-gradient-to-b from-[#f8f8f8] to-[#f0f0f0] rounded-[14px] md:rounded-2xl border border-[#e0e0e0] shadow-sm hover:shadow-md hover:border-[#c5c5c5] transition-all duration-200">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={!isWalletReady ? 'Connect wallet to start...' : 'Ask about markets...'}
                disabled={!isWalletReady || isLoading}
                rows={1}
                className="w-full min-h-[40px] md:min-h-[48px] max-h-[100px] md:max-h-[150px] resize-none bg-transparent pl-3 pr-12 md:pl-4 md:pr-14 py-2.5 md:py-3.5 text-sm md:text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed rounded-t-[14px] md:rounded-t-2xl"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overflowY: 'auto', lineHeight: '1.5' }}
              />
              <div className="flex items-center justify-between px-3 pb-2 md:px-3 md:pb-2 rounded-b-[14px] md:rounded-b-2xl">
                <div className="flex items-center gap-1.5 md:gap-2">
                  <span className="text-[9px] md:text-[10px] font-semibold text-[#6b7280] tracking-wider" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>ORACLE</span>
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
        )}
      </div>
      </div>
    </div>
  );
}
