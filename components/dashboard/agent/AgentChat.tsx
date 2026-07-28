'use client';

/**
 * AgentChat — Unified AI Agent Hub
 *
 * Single chat interface that combines:
 *   1. DeFi execution (GOAT SDK — balances, transfers, swaps)
 *   2. Token Due Diligence (X402 agent)
 *   3. DeFi Yield Scanner (X402 agent)
 *   4. Wallet Intelligence (X402 agent)
 *
 * DeFi execution uses /api/agent with streaming.
 * The three analysis agents use /api/agent/chat via chatStore + MessageBubble
 * so X402 payment panels, result panels, etc. all render inline.
 *
 * Features:
 *   - Conversational param extraction (agents ask follow-ups)
 *   - Per-agent session persistence (switch agents without losing history)
 *   - Auto-payment via embedded wallet (no payment panel for dashboard agents)
 */

import { useMultiWallet } from '@/lib/contexts/MultiWalletContext';
import { useUIStore } from '@/lib/store/ui';
import { Loader2, AlertCircle, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useChatStore } from '@/lib/store/chat';
import { useShallow } from 'zustand/react/shallow';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useMessageSender } from '@/lib/hooks/use-message-sender';
import { useAutoPayment } from '@/lib/hooks/use-auto-payment';
import { MessageBubble } from '@/components/chat/message-bubble';
import { ChatModelSelector } from '@/components/chat/chat-model-selector';

/* ─── Types ─── */
interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: { toolCallId: string; toolName: string; state: 'call' | 'result' | 'error'; result?: any }[];
}

type AgentRoute = 'defi' | 'token-due-diligence' | 'defi-yield' | 'wallet-intelligence';

interface AgentInfo {
  id: AgentRoute;
  label: string;
  shortLabel: string;
  icon: string;
  seed: string;
  color: string;
  dotColor: string;
  quickPrompts: string[];
  description: string;
}

const AGENTS: AgentInfo[] = [
  {
    id: 'token-due-diligence',
    label: 'Token Analysis',
    shortLabel: 'Token',
    icon: 'TA',
    seed: 'tokendd',
    color: 'text-emerald-600/60',
    dotColor: 'bg-emerald-400',
    description: 'Deep token research & risk scoring',
    quickPrompts: ['Analyze ETH on Base', 'Is this token safe?', 'Token due diligence report'],
  },
  {
    id: 'defi-yield',
    label: 'DeFi Agent',
    shortLabel: 'DeFi',
    icon: 'DA',
    seed: 'defiagent',
    color: 'text-amber-600/60',
    dotColor: 'bg-amber-400',
    description: 'Swap, yield, and DeFi execution',
    quickPrompts: ['Swap 100 USDC to ETH', 'Best yields on Base', 'My DeFi positions'],
  },
  {
    id: 'wallet-intelligence',
    label: 'Wallet Intelligence',
    shortLabel: 'Wallet',
    icon: 'WI',
    seed: 'walletintelligence',
    color: 'text-violet-600/60',
    dotColor: 'bg-violet-400',
    description: 'Portfolio risk & wallet analysis',
    quickPrompts: ['Analyze my wallet', 'Portfolio risk scan', 'Wallet intelligence report'],
  },
  {
    id: 'defi',
    label: 'DeFi Execution',
    shortLabel: 'DeFi',
    icon: 'DE',
    seed: 'defiexec',
    color: 'text-black/40',
    dotColor: 'bg-white',
    description: 'Execute swaps, transfers & more',
    quickPrompts: ['Check my USDC balance', 'What tokens do I have?', 'Transfer 1 USDC'],
  },
];

const AGENT_MAP = Object.fromEntries(AGENTS.map(a => [a.id, a])) as Record<AgentRoute, AgentInfo>;


export function AgentChat() {
  const { activeWallet } = useMultiWallet();
  const setHideMobileNav = useUIStore((state) => state.setHideMobileNav);

  useEffect(() => {
    setHideMobileNav(true);
    return () => setHideMobileNav(false);
  }, [setHideMobileNav]);
  const [chainId] = useState(
    process.env.NEXT_PUBLIC_AGENT_EXECUTION_MODE === 'testnet' ? 84532 : 8453
  );

  const [activeRoute, setActiveRoute] = useState<AgentRoute | null>(null);
  const [agentSessionIds, setAgentSessionIds] = useState<Partial<Record<AgentRoute, string>>>({});

  const [defiMessages, setDefiMessages] = useState<LocalMessage[]>([]);
  const [defiInput, setDefiInput] = useState('');
  const [defiLoading, setDefiLoading] = useState(false);
  const [defiError, setDefiError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isLiveMode = process.env.NEXT_PUBLIC_ENABLE_AI_AGENT === 'true';
  const executionMode = process.env.NEXT_PUBLIC_AGENT_EXECUTION_MODE || 'simulated';

  const {
    currentSessionId,
    sessions,
    isLoading: chatLoading,
    loadingMessage,
    addMessage,
    setLoading,
    setSelectedAgent,
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
      setLoading: state.setLoading,
      setSelectedAgent: state.setSelectedAgent,
      createNewSession: state.createNewSession,
      getCurrentSession: state.getCurrentSession,
      switchSession: state.switchSession,
    }))
  );

  const { paymentAddress, isReady: isWalletReady } = usePaymentWallet();
  const { sendMessageToAgent } = useMessageSender();
  const { handleAutoPaymentIfNeeded, handleParamRequestAutoSubmit, isAutoPaymentAgent } = useAutoPayment();

  const chatMessages = currentSessionId && sessions[currentSessionId]
    ? sessions[currentSessionId].messages
    : [];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, [defiMessages.length, chatMessages.length, defiLoading, chatLoading]);

  useEffect(() => {
    if (activeRoute && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [activeRoute]);

  const switchToAgent = useCallback((route: AgentRoute) => {
    setActiveRoute(route);
    if (route === 'defi') return;
    const existingSessionId = agentSessionIds[route];
    if (existingSessionId && sessions[existingSessionId]) {
      switchSession(existingSessionId);
    } else {
      const newSessionId = createNewSession(route, paymentAddress ?? undefined);
      setAgentSessionIds(prev => ({ ...prev, [route]: newSessionId }));
    }
  }, [agentSessionIds, sessions, switchSession, createNewSession, paymentAddress, setSelectedAgent]);

  const ensureChatSession = useCallback((agentId: string) => {
    const session = getCurrentSession();
    if (!session) {
      const newId = createNewSession(agentId, paymentAddress ?? undefined);
      setAgentSessionIds(prev => ({ ...prev, [agentId]: newId }));
    } else if (session.selectedAgentId !== agentId) {
      setSelectedAgent(agentId);
    }
  }, [getCurrentSession, createNewSession, setSelectedAgent, paymentAddress]);

  useEffect(() => {
    if (!activeRoute || activeRoute === 'defi') return;
    if (!isAutoPaymentAgent(activeRoute)) return;
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;
    const action = (lastMsg.metadata as { action?: { type: string; data?: Record<string, unknown> } })?.action;
    if (!action) return;
    if (action.type === 'param_request') {
      handleParamRequestAutoSubmit(lastMsg.id, action.data as any);
    } else if (action.type === 'x402_payment_required') {
      const agentContext = (lastMsg.metadata as { agentContext?: Record<string, unknown> })?.agentContext;
      handleAutoPaymentIfNeeded(lastMsg.id, action, agentContext);
    }
  }, [chatMessages, activeRoute, handleAutoPaymentIfNeeded, handleParamRequestAutoSubmit, isAutoPaymentAgent]);

  const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading || !activeRoute) return;
    if (!isWalletReady) { toast.error('Please connect a wallet first'); return; }
    const msg = chatInput.trim();
    ensureChatSession(activeRoute);
    addMessage({ role: 'user', content: msg });
    setChatInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true, 'Connecting to agent...');
    await sendMessageToAgent(msg, paymentAddress);
  }, [chatInput, chatLoading, activeRoute, isWalletReady, ensureChatSession, addMessage, setLoading, sendMessageToAgent, paymentAddress]);

  const handleQuickPrompt = useCallback(async (prompt: string) => {
    if (!activeRoute || activeRoute === 'defi' || chatLoading) return;
    if (!isWalletReady) { toast.error('Please connect a wallet first'); return; }
    ensureChatSession(activeRoute);
    addMessage({ role: 'user', content: prompt });
    setLoading(true, 'Connecting to agent...');
    await sendMessageToAgent(prompt, paymentAddress);
  }, [activeRoute, chatLoading, isWalletReady, ensureChatSession, addMessage, setLoading, sendMessageToAgent, paymentAddress]);

  const handleDefiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!defiInput.trim() || !activeWallet) return;
    const userMessage: LocalMessage = { id: Date.now().toString(), role: 'user', content: defiInput };
    setDefiMessages(prev => [...prev, userMessage]);
    const currentInput = defiInput;
    setDefiInput('');
    setDefiLoading(true);
    setDefiError(null);

    if (!isLiveMode) {
      setTimeout(() => {
        setDefiMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `AI Agent Preview Mode\n\nYour request: "${currentInput}"\n\nTo enable real execution:\n1. Set NEXT_PUBLIC_ENABLE_AI_AGENT=true in .env.local\n2. Configure OPENROUTER_API_KEY\n3. For testnet: Set NEXT_PUBLIC_AGENT_EXECUTION_MODE=testnet\n\nCurrent mode: ${executionMode}\nChain: ${chainId === 84532 ? 'Base Sepolia (Testnet)' : 'Base'}`,
        }]);
        setDefiLoading(false);
      }, 1000);
      return;
    }

    try {
      abortControllerRef.current = new AbortController();
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...defiMessages, userMessage].map(m => ({ role: m.role, content: m.content })),
          walletAddress: activeWallet,
          chainId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response body');

      let content = '';
      const assistantId = (Date.now() + 1).toString();
      setDefiMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        content += decoder.decode(value);
        setDefiMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content } : m));
      }
      setDefiLoading(false);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setDefiError('Request cancelled');
      } else {
        setDefiError(err.message || 'Failed to communicate with agent');
        setDefiMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Error: ${err.message || 'Failed to process request'}\n\nPlease try again or contact support.`,
        }]);
      }
      setDefiLoading(false);
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setDefiLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter inserts a newline so users can compose multi-line prompts.
    // Cmd/Ctrl+Enter sends.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (activeRoute === 'defi') {
        handleDefiSubmit(e);
      } else {
        handleChatSubmit(e);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (activeRoute === 'defi') {
      setDefiInput(val);
    } else {
      setChatInput(val);
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleBack = useCallback(() => {
    setActiveRoute(null);
  }, []);

  const showEmptyState = !activeRoute;
  const isDefiActive = activeRoute === 'defi';
  const isChatActive = activeRoute && activeRoute !== 'defi';
  const walletReadyForActiveRoute = isDefiActive ? !!activeWallet : isWalletReady;
  const inputValue = isDefiActive ? defiInput : chatInput;
  const isAnyLoading = defiLoading || chatLoading;
  const activeAgent = activeRoute ? AGENT_MAP[activeRoute] : null;

  return (
    <div className="flex flex-col bg-white h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] min-h-0 flex-1 pt-3 sm:pt-4">
      {/* ── Lightweight nav bar (only when agent is active) ── */}
      {activeRoute && (
        <div className="px-4 pt-3 pb-2 bg-white shrink-0">
          <div className="max-w-4xl mx-auto flex items-center justify-center gap-1">
            <button
              onClick={handleBack}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 transition-all duration-200 mr-1"
              title="Back to all agents"
            >
              <ArrowLeft size={15} className="text-black/40" />
            </button>

            <div className="flex items-center bg-white rounded-xl border border-black/[0.06] p-1 shadow-sm">
              {AGENTS.map((agent) => {
                const isActive = activeRoute === agent.id;
                return (
                  <button
                    key={agent.id}
                    onClick={() => switchToAgent(agent.id)}
                    className={`px-4 py-1.5 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider transition-all duration-200 shrink-0 ${
                      isActive
                        ? 'bg-black text-white shadow-sm'
                        : 'text-black/30 hover:text-black/60 hover:bg-black/[0.03]'
                    }`}
                  >
                    {agent.shortLabel}
                  </button>
                );
              })}
            </div>

            {isAnyLoading && (
              <span className="font-mono text-[10px] text-black/30 ml-2 flex items-center gap-1.5 shrink-0">
                <Loader2 size={10} className="animate-spin" />
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Messages / Empty State ── */}
      <div className={`flex-1 p-3 pb-24 md:pb-6 sm:p-4 md:p-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${(showEmptyState || (isDefiActive && defiMessages.length === 0) || (isChatActive && chatMessages.length === 0)) ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {showEmptyState ? (
          /* Empty state — matches PredictionMarketChat layout exactly */
          <div className="max-w-4xl mx-auto w-full h-full">
            <div className="flex flex-col items-center justify-center h-full">
              <div className="text-center mb-8">
                <p className="text-[10px] text-black/40 font-bold uppercase tracking-[0.3em] mb-3" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                  AI AGENT HUB
                </p>
                <h2 className="text-xl sm:text-2xl font-black text-black tracking-tight uppercase leading-none" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                  SELECT AN AGENT TO BEGIN
                </h2>
                <div className="w-12 h-[2px] bg-[#e5e7eb] mx-auto mt-4" />
                <p className="text-xs text-black/40 mt-3" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                  AI-powered DeFi analysis, execution & intelligence
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
                {AGENTS.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => switchToAgent(agent.id)}
                    disabled={agent.id === 'defi' ? !activeWallet : !isWalletReady}
                    className="group relative bg-white border border-[#e5e7eb] rounded-[12px] p-3 text-left disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:border-[#d1d5db] hover:shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
                  >
                    <h3 className="text-[11px] font-black uppercase tracking-tight text-black leading-tight" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                      {agent.label}
                    </h3>
                    <p className="text-[9px] text-black/40 mt-1 leading-snug" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                      {agent.description}
                    </p>
                    <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-1 group-hover:translate-x-0">
                      <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>

              {!activeWallet && (
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
          </div>
        ) : isDefiActive ? (
          /* ── DeFi messages (local) ── */
          <div className="max-w-4xl mx-auto space-y-4 h-full">
            {defiMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-center mb-8">
                  <p className="text-[10px] text-black/40 font-bold uppercase tracking-[0.3em] mb-3" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                    DEFI EXECUTION
                  </p>
                  <h2 className="text-xl sm:text-2xl font-black text-black tracking-tight uppercase leading-none" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                    EXECUTE TRANSACTIONS
                  </h2>
                  <div className="w-12 h-[2px] bg-[#e5e7eb] mx-auto mt-4" />
                  <p className="text-xs text-black/40 mt-3" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                    Swaps, transfers & on-chain actions from chat
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-xl w-full">
                  {AGENT_MAP['defi'].quickPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setDefiInput(prompt)}
                      className="group relative bg-white border border-[#e5e7eb] rounded-[12px] p-3 text-left transition-all duration-200 hover:border-[#d1d5db] hover:shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
                    >
                      <h3 className="text-[11px] font-black uppercase tracking-tight text-black leading-tight" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                        {prompt}
                      </h3>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {defiMessages.map(msg => (
              <div key={msg.id} className={`flex w-full mb-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] md:max-w-[75%]">
                  {msg.role === 'user' ? (
                    <div className="flex items-center gap-2 mb-1.5 justify-end">
                      <span className="text-[11px] font-bold uppercase text-black" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>You</span>
                      <div className="w-5 h-5 border border-[#e5e7eb] rounded-[6px] bg-white flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-black" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 bg-[#1a1a1a] rounded-[6px] flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                      </div>
                      <span className="text-[11px] font-bold uppercase text-black/60 tracking-wider" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>Agent</span>
                    </div>
                  )}
                  <div className={`px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-black text-white border border-[#e5e7eb] rounded-[12px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)]'
                      : 'bg-white text-black border border-[#e5e7eb] rounded-[12px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)]'
                  }`}>
                    <p className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    {msg.toolInvocations?.map(tool => (
                      <div key={tool.toolCallId} className="flex items-start gap-2 p-2.5 mt-3 bg-black/5 border border-black/10">
                        {tool.state === 'result' ? <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" /> : tool.state === 'error' ? <XCircle size={14} className="text-red-600 shrink-0 mt-0.5" /> : <Loader2 size={14} className="animate-spin text-blue-600 shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                          <p className="font-mono font-bold text-[11px]">{tool.toolName}</p>
                          {tool.result && <p className="font-mono text-[10px] text-black/50 mt-1">{JSON.stringify(tool.result).slice(0, 100)}...</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {defiLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-4 flex items-center gap-2.5">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-[#1a1a1a] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-[#1a1a1a] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-[#1a1a1a] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="font-mono text-xs opacity-60">Processing...</span>
                  <button onClick={handleCancel} className="ml-2 text-[10px] px-2.5 py-1 bg-red-100 hover:bg-red-200 border border-red-300 rounded-md font-mono font-bold uppercase tracking-wider transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {defiError && (
              <div className="flex justify-start">
                <div className="bg-red-50 border border-red-300 p-3 rounded-lg">
                  <p className="font-mono text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle size={14} />
                    {defiError}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : isChatActive ? (
          /* ── Chat-based agent messages (chatStore) ── */
          <div className="max-w-4xl mx-auto w-full h-full">
            {chatMessages.length === 0 && activeAgent && (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-center mb-8">
                  <p className="text-[10px] text-black/40 font-bold uppercase tracking-[0.3em] mb-3" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                    {activeAgent.label.toUpperCase()}
                  </p>
                  <h2 className="text-xl sm:text-2xl font-black text-black tracking-tight uppercase leading-none" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                    {activeAgent.description.toUpperCase()}
                  </h2>
                  <div className="w-12 h-[2px] bg-[#e5e7eb] mx-auto mt-4" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-xl w-full">
                  {activeAgent.quickPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickPrompt(prompt)}
                      disabled={chatLoading || !isWalletReady}
                      className="group relative bg-white border border-[#e5e7eb] rounded-[12px] p-3 text-left disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:border-[#d1d5db] hover:shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
                    >
                      <h3 className="text-[11px] font-black uppercase tracking-tight text-black leading-tight" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>
                        {prompt}
                      </h3>
                      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-1 group-hover:translate-x-0">
                        <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.map(message => {
              // Hide x402_payment_required and param_request panels for auto-payment agents
              const action = (message.metadata as { action?: { type: string } })?.action;
              const isAutoHandled = activeRoute && isAutoPaymentAgent(activeRoute) &&
                (action?.type === 'x402_payment_required' || action?.type === 'param_request');

              if (isAutoHandled) {
                return null;
              }

              const autoPayment = (message.metadata as { autoPayment?: { txHash: string; amount: string } })?.autoPayment;

              return (
                <div key={message.id}>
                  <MessageBubble message={message} />
                  {autoPayment && (
                    <div className="flex items-center gap-1.5 ml-7 -mt-2 mb-4">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      <span className="font-mono text-[9px] text-black/40">
                        Paid ${autoPayment.amount} USDC
                      </span>
                      <a
                        href={`https://basescan.org/tx/${autoPayment.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[9px] text-black/30 hover:text-black/60 underline"
                      >
                        tx
                      </a>
                    </div>
                  )}
                </div>
              );
            })}

            {chatLoading && (
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
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div className="fixed bottom-0 left-0 right-0 md:sticky md:bottom-0 bg-white px-4 pt-4 pb-5 sm:px-8 sm:pt-5 sm:pb-6 border-t border-black/5 z-40 shrink-0">
        <form onSubmit={isDefiActive ? handleDefiSubmit : handleChatSubmit} className="max-w-4xl mx-auto mb-3">
          <div className="relative">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  !walletReadyForActiveRoute
                    ? 'Connect wallet to start...'
                    : !activeRoute
                    ? 'Select an agent above to begin...'
                    : isDefiActive
                    ? 'Ask me to check balances, transfer tokens...'
                    : 'Ask anything...'
                }
                disabled={!walletReadyForActiveRoute || isAnyLoading}
                rows={1}
                className="w-full min-h-[48px] max-h-[150px] resize-none bg-transparent pl-4 pr-14 py-3.5 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed rounded-t-2xl"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overflowY: 'auto', lineHeight: '1.5' }}
              />
              {/* Bottom action bar */}
              <div className="flex items-center justify-between px-3 pb-2 rounded-b-2xl">
                {/* Left — model selector + agent label + wallet address */}
                <div className="flex items-center gap-1.5">
                  <ChatModelSelector />
                  {activeRoute && activeAgent && (
                    <span className={`font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 ${activeAgent.color}`}>
                      {activeAgent.shortLabel}
                    </span>
                  )}
                  {activeWallet && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(activeWallet); toast.success('Address copied'); }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-200 hover:bg-black/5 transition-colors"
                      title="Copy address"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      <span className="font-mono text-[10px] text-black/40">{activeWallet.slice(0, 6)}...{activeWallet.slice(-4)}</span>
                    </button>
                  )}
                </div>
                {/* Right — send button */}
                <button
                  type="submit"
                  disabled={!walletReadyForActiveRoute || !inputValue.trim() || isAnyLoading}
                  className="w-9 h-9 rounded-full bg-gray-900 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-gray-800 transition-all duration-200 flex items-center justify-center shadow-sm"
                  title={!walletReadyForActiveRoute ? 'Connect wallet first' : 'Send message'}
                >
                  {isAnyLoading ? (
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

      </div>
    </div>
  );
}
