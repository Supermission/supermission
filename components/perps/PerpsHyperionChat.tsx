'use client';

/**
 * PerpsHyperionChat
 *
 * Full-screen AI assistant chat for the HYPERION perps trading agent.
 * Uses the same shared chat infrastructure as PredictionMarketChat / Oracle.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useUIStore } from '@/lib/store/ui';
import { toast } from 'sonner';
import { useChatStore } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useHyperionSender } from '@/lib/hooks/use-hyperion-sender';
import { useHLMarkets, useHLPositions, useHLAccount } from '@/lib/hyperliquid/hooks';
import {
  formatPrice,
  formatVolume,
  formatOI,
  formatFundingRate,
  pctChange,
  stripTrailingZeros,
} from '@/lib/hyperliquid/utils';
import { useChatAutoScroll } from '@/lib/hooks/use-chat-auto-scroll';
import { useSessionDraft } from '@/lib/hooks/use-session-draft';
import { useChatUrlSync } from '@/lib/hooks/use-chat-url-sync';
import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageSkeleton } from '@/components/chat/message-skeleton';
import { OracleLoadingSkeleton } from '@/components/chat/oracle-loading-skeleton';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { ArrowDown } from 'lucide-react';
import { AgentRedirectPrompt } from '@/components/chat/agent-redirect-prompt';
import { useActiveRedirect } from '@/lib/hooks/use-active-redirect';
import { usePendingRedirectStore } from '@/lib/store/pending-redirect';

const AGENT_ID = 'hyperion';

type HyperionMarketContext = {
  topMarkets: { coin: string; price: string; change24h: string; volume: string; funding: string; oi: string }[];
  userPositions: { coin: string; side: string; size: string; entry: string; mark: string; upnl: string; liq: string }[];
  accountSummary: { equity: string; availableMargin: string; marginUsed: string; totalUpnl: string };
};

/** Display-decimals for a Hyperliquid perp price: HL allows max (6 - szDecimals)
 *  decimals; we cap at 2 for prices >= $1 so big coins read cleanly. */
function priceDecimals(px: number, szDecimals: number): number {
  const maxDec = Math.max(0, 6 - szDecimals);
  return px >= 1 ? Math.min(maxDec, 2) : maxDec;
}

/** Build the live-market-data block HYPERION needs. Returns undefined when
 *  markets haven't loaded yet — never a half-empty object. */
function buildHyperionMarketContext(
  markets: ReturnType<typeof useHLMarkets>['markets'],
  positions: ReturnType<typeof useHLPositions>,
  account: ReturnType<typeof useHLAccount>,
): HyperionMarketContext | undefined {
  if (!markets || markets.length === 0) return undefined;

  const topMarkets = markets
    .filter((m) => m.marketType !== 'spot')
    .slice()
    .sort((a, b) => parseFloat(b.dayNtlVlm) - parseFloat(a.dayNtlVlm))
    .slice(0, 15)
    .map((m) => {
      const mid = parseFloat(m.midPx);
      const chg = pctChange(mid, parseFloat(m.prevDayPx));
      const oi = parseFloat(m.openInterest) * parseFloat(m.markPx);
      return {
        coin: m.coin,
        price: `$${formatPrice(mid, priceDecimals(mid, m.szDecimals))}`,
        change24h: `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`,
        volume: formatVolume(parseFloat(m.dayNtlVlm)),
        funding: `${formatFundingRate(m.funding)}/8h`,
        oi: formatOI(oi),
      };
    });

  const userPositions = positions.map((p) => {
    const coin = p.position.coin;
    const market = markets.find((m) => m.coin === coin);
    const szDec = market?.szDecimals ?? 4;
    const upnlSign = p.unrealizedPnl >= 0 ? '+' : '';
    return {
      coin,
      side: p.isLong ? 'LONG' : 'SHORT',
      size: stripTrailingZeros(Math.abs(p.size).toFixed(Math.max(szDec, 2))),
      entry: `$${formatPrice(p.entryPx, priceDecimals(p.entryPx, szDec))}`,
      mark: `$${formatPrice(p.markPx, priceDecimals(p.markPx, szDec))}`,
      upnl: `${upnlSign}$${Math.abs(p.unrealizedPnl).toFixed(2)} (${upnlSign}${p.pnlPct.toFixed(2)}%)`,
      liq: p.liqPx != null ? `$${formatPrice(p.liqPx, priceDecimals(p.liqPx, szDec))}` : '—',
    };
  });

  return {
    topMarkets,
    userPositions,
    accountSummary: {
      equity: `$${account.equity.toFixed(2)}`,
      availableMargin: `$${account.availableMargin.toFixed(2)}`,
      marginUsed: `$${account.marginUsed.toFixed(2)}`,
      totalUpnl: `${account.totalPnl >= 0 ? '+' : '-'}$${Math.abs(account.totalPnl).toFixed(2)}`,
    },
  };
}

export function PerpsHyperionChat() {
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
  const { sendMessageToHyperion, stopGeneration } = useHyperionSender();

  // Live Hyperliquid data — fed into every HYPERION message so the agent quotes
  // real prices instead of hallucinating. useHLMarkets() also kicks off the
  // price WS; positions/account read the store the perps layout keeps polling.
  const { markets: hlMarkets } = useHLMarkets();
  const hlPositions = useHLPositions();
  const hlAccount = useHLAccount();
  const marketContext = useMemo(
    () => buildHyperionMarketContext(hlMarkets, hlPositions, hlAccount),
    [hlMarkets, hlPositions, hlAccount],
  );
  const marketContextRef = useRef<HyperionMarketContext | undefined>(undefined);
  useEffect(() => { marketContextRef.current = marketContext; }, [marketContext]);
  const { redirect, dismiss: dismissRedirect } = useActiveRedirect('hyperion');
  const peekPendingRedirect = usePendingRedirectStore((s) => s.peekPendingRedirect);
  const consumePendingRedirect = usePendingRedirectStore((s) => s.consumePendingRedirect);

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

  // Restore latest HYPERION session on entry when available; do not auto-create an empty one.
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
    if (!peeked || peeked.agent !== AGENT_ID) return;
    const pending = consumePendingRedirect();
    if (pending) {
      ensureAgentSession();
      pendingConsumed.current = true;
      addMessage({ role: 'user', content: pending.message });
      setLoading(true, 'HYPERION is analyzing...');
      sendMessageToHyperion(pending.message, paymentAddress, marketContextRef.current);
    }
  }, [mounted, isWalletReady, peekPendingRedirect, consumePendingRedirect, ensureAgentSession, addMessage, setLoading, sendMessageToHyperion, paymentAddress]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!isWalletReady) {
      toast.error('Please connect a wallet first');
      return;
    }

    const userMessage = input.trim();

    ensureAgentSession();
    addMessage({ role: 'user', content: userMessage });
    clearDraft();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    setLoading(true, 'HYPERION is thinking...');
    await sendMessageToHyperion(userMessage, paymentAddress, marketContextRef.current);
  }, [input, isLoading, isWalletReady, ensureAgentSession, addMessage, clearDraft, setLoading, sendMessageToHyperion, paymentAddress]);

  const handleRetry = useCallback(async (messageIndex: number) => {
    const prevMessages = messages.slice(0, messageIndex);
    const lastUserMsg = [...prevMessages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg || isLoading) return;
    ensureAgentSession();
    addMessage({ role: 'user', content: lastUserMsg.content });
    setLoading(true, 'HYPERION is thinking...');
    await sendMessageToHyperion(lastUserMsg.content, paymentAddress, marketContextRef.current);
  }, [messages, isLoading, ensureAgentSession, addMessage, setLoading, sendMessageToHyperion, paymentAddress]);

  const handleEdit = useCallback(async (messageIndex: number, newContent: string) => {
    if (!currentSessionId || isLoading) return;
    truncateMessagesFrom(currentSessionId, messageIndex);
    ensureAgentSession();
    addMessage({ role: 'user', content: newContent });
    setLoading(true, 'HYPERION is thinking...');
    await sendMessageToHyperion(newContent, paymentAddress, marketContextRef.current);
  }, [currentSessionId, isLoading, truncateMessagesFrom, ensureAgentSession, addMessage, setLoading, sendMessageToHyperion, paymentAddress]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Enter inserts a newline so users can compose multi-line prompts.
    // Cmd/Ctrl+Enter sends.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }, [handleSubmit]);

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
                  Hey, I&apos;m <span className="text-[#6366f1]">Hyperion.</span>
                </h2>
                <p className="text-[15px] md:text-sm text-[#9ca3af] mt-2.5 max-w-xs mx-auto leading-relaxed" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                  Quantitative trading intelligence for Hyperliquid perpetual futures.
                </p>
              </div>

              {/* Suggested prompts */}
              {isWalletReady && (
                <div className="w-full max-w-lg">
                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      'What looks good right now?',
                      'Analyze BTC funding rates',
                      'Find the best short setup',
                      "How's my portfolio risk?",
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
            <div className="px-4 md:px-0 py-4 md:py-0 mb-4">
              {messages.map((message, idx) => {
                // Skip rendering completely empty messages (no text, no action)
                const action = (message.metadata as { action?: { type: string; data?: unknown } })?.action;
                if (!message.content && !action) return null;

                // All messages
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
        {redirect ? (
          <div className="max-w-4xl mx-auto">
            <AgentRedirectPrompt
              data={redirect}
              onDismiss={dismissRedirect}
              addLocalMessage={addLocalMessage}
            />
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative">
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
                  <span className="text-[9px] md:text-[10px] font-semibold text-[#6b7280] tracking-wider" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>HYPERION</span>
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
