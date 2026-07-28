// components/chat/message-bubble.tsx
'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import { type Message, type MessageAttachment } from '@/lib/store/chat';
import { cn } from '@/lib/utils';
import { Copy, Check, RotateCcw, ExternalLink, Pencil } from 'lucide-react';
import { AgentRecommendationPanel } from './agent-recommendation-panel';
import { MissionModePanel } from './mission-mode-panel';
import { MissionDeployedSuccess } from './mission-deployed-success';
import { ContractAuditResultPanel } from './contract-audit-result-panel';
import dynamic from 'next/dynamic';

const MorphoDepositInline = dynamic(() => import('./morpho-deposit-inline').then(m => ({ default: m.MorphoDepositInline })), { ssr: false });
const SwapExecuteInline = dynamic(() => import('./swap-execute-inline').then(m => ({ default: m.SwapExecuteInline })), { ssr: false });
const BatchBuyExecuteInline = dynamic(() => import('./batch-buy-execute-inline').then(m => ({ default: m.BatchBuyExecuteInline })), { ssr: false });
const BatchYieldExecuteInline = dynamic(() => import('./batch-yield-execute-inline').then(m => ({ default: m.BatchYieldExecuteInline })), { ssr: false });
const TransferExecuteInline = dynamic(() => import('./transfer-execute-inline').then(m => ({ default: m.TransferExecuteInline })), { ssr: false });
const RoroOrderExecuteInline = dynamic(() => import('./roro-order-execute-inline').then(m => ({ default: m.RoroOrderExecuteInline })), { ssr: false });
const DefiDepositInline = dynamic(() => import('./defi-deposit-inline').then(m => ({ default: m.DefiDepositInline })), { ssr: false });
const UniswapLPInline = dynamic(() => import('./uniswap-lp-inline').then(m => ({ default: m.UniswapLPInline })), { ssr: false });
const UniswapLPExecuteInline = dynamic(() => import('./uniswap-lp-inline').then(m => ({ default: m.UniswapLPExecuteInline })), { ssr: false });
const UniswapLPRemoveInline = dynamic(() => import('./uniswap-lp-remove-inline').then(m => ({ default: m.UniswapLPRemoveInline })), { ssr: false });
import LazyMarkdown from './lazy-markdown';
import { AnimatedMarkdown } from './animated-markdown';
const ParamRequestPanel = dynamic(() => import('./param-request-panel').then(m => ({ default: m.ParamRequestPanel })), { ssr: false });
const X402PaymentPanel = dynamic(() => import('./x402-payment-panel').then(m => ({ default: m.X402PaymentPanel })), { ssr: false });
import { ContractAuditResponse } from '@/lib/new-agents/contractAudit/types';
import { ImageGenResponse } from '@/lib/new-agents/imageGeneration/types';
import { PredictionMarketPanel } from '../prediction-markets/prediction-market-panel';
import { PredictionMarketGrid } from '../prediction-markets/prediction-market-grid';
import { AllocationConfirmPanel } from '../prediction-markets/allocation-confirm-panel';
import { ImageGenResultPanel } from './image-gen-result-panel';
import { VariationActionCard, StyleActionCard, QualityActionCard } from './image-action-cards';
import { usePredictionMarketTrade } from '@/lib/hooks/use-prediction-market-trade';
import { useBatchTradeExecution } from '@/lib/hooks/use-batch-trade-execution';
import { useChatStore } from '@/lib/store/chat';
import { useMessageSender } from '@/lib/hooks/use-message-sender';
import { useShallow } from 'zustand/react/shallow';
import { PlatformShowcasePanel } from './platform-showcase-panel';
import { PlatformAgent } from '@/lib/ai/platform-knowledge';
import { ImageModificationPanel } from './image-modification-panel';
import { getDataUrl } from '@/lib/utils/image-utils';
import { PriceChartPanel } from './price-chart-panel';

// Track which messages have already completed their typing animation
// so re-mounts (tab switch, navigation) don't replay them.
// Cleared on full refresh — but that's fine since Supabase-loaded messages
// don't have typingAnimate.
const completedAnimations = new Set<string>();

interface MessageBubbleProps {
  message: Message;
  onRetry?: () => void;
  /** When provided on a user message, enables inline edit-and-resubmit. */
  onEdit?: (newContent: string) => void;
  showActions?: boolean;
  children?: React.ReactNode;
  /** When provided, first-column table cells become clickable — calls back with the cell text */
  onTableCellClick?: (text: string) => void;
}

type ContractAuditResultAction = {
  type: 'contract_audit_result';
  data: ContractAuditResponse;
};

type ImageGenResultAction = {
  type: 'image_gen_result';
  data: ImageGenResponse;
};

type ImageVariationAction = {
  type: 'image_variation_options';
  data: ImageGenResponse;
};

type ImageStyleAction = {
  type: 'image_style_options';
  data: ImageGenResponse;
};

type ImageQualityAction = {
  type: 'image_quality_options';
  data: ImageGenResponse;
};

type PlatformShowcaseAction = {
  type: 'platform_showcase';
  data: {
    agents: PlatformAgent[];
    intentType: string;
  };
};

type ImageModificationSetupAction = {
  type: 'image_modification_setup';
  data: {
    sourceImage: string;
    mimeType: string;
    suggestedPreset?: string;
    presets?: Array<{ id: string; name: string; description: string }>;
  };
};

type ChatAction =
  | ContractAuditResultAction
  | ImageGenResultAction
  | ImageVariationAction
  | ImageStyleAction
  | ImageQualityAction
  | PlatformShowcaseAction
  | ImageModificationSetupAction
  | {
    type: 'agent_clarification';
    data: { question: string };
  }
  | {
    type: 'agent_recommendation';
    data: unknown;
  }
  | {
    type: 'prediction_market_result';
    data: unknown;
  }
  | {
    type: 'prediction_market_grid';
    data: unknown;
  }
  | {
    type: 'prediction_market_allocation';
    data: unknown;
  }
  | {
    type: 'mission_mode_selection';
    data: unknown;
  }
  | {
    type: 'mission_deployed';
    data: unknown;
  }
  | {
    type: 'param_request';
    data: unknown;
  }
  | {
    type: 'x402_payment_required';
    data: unknown;
  }
  | {
    type: 'morpho_deposit_ready';
    data: {
      vaultAddress: string;
      vaultName: string;
      assetAddress: string;
      assetSymbol: string;
      assetDecimals: number;
      amount: string;
      apy: string | null;
      curator: string;
    };
  }
  | {
    type: 'swap_ready';
    data: any;
  }
  | {
    type: 'roro_order_ready';
    data: any;
  }
  | {
    type: 'transfer_ready';
    data: any;
  }
  | {
    type: 'defi_deposit_ready';
    data: any;
  }
  | {
    type: 'uniswap_lp_ready';
    data: any;
  }
  | {
    type: 'uniswap_lp_remove_ready';
    data: any;
  }
  | {
    type: 'uniswap_lp_collect_ready';
    data: any;
  }
  | { type: 'nansen_trending_result'; data: any }
  | { type: 'nansen_smart_money_result'; data: any }
  | { type: 'nansen_analysis_result'; data: any }
  | { type: 'batch_buy_plan_ready'; data: any }
  | { type: 'batch_buy_execution_ready'; data: any }
  | { type: 'uniswap_lp_execution_ready'; data: any }
  | { type: 'batch_yield_plan_ready'; data: any }
  | { type: 'batch_yield_execution_ready'; data: any }
  | { type: 'price_chart'; data: any };

// Error patterns that indicate a failed agent call
const ERROR_PATTERNS = [
  /ran into an issue/i,
  /taking longer than expected/i,
  /couldn't process that/i,
  /timed out/i,
  /try again/i,
  /temporarily unavailable/i,
  /service error/i,
];

function isErrorMessage(content: string): boolean {
  return ERROR_PATTERNS.some(p => p.test(content));
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [content]);
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[10px] text-[#6b7280] dark:text-white/60 hover:text-[#1a1a1a] dark:hover:text-white transition-colors p-1 rounded-md !bg-transparent border-0"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

/** Clickable market cell with copy icon on hover */
function MarketCell({ text, children, onClick }: { text: string; children: React.ReactNode; onClick: (t: string) => void }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="group/cell inline-flex items-center gap-1">
      <span
        onClick={() => onClick(text)}
        className="cursor-pointer text-[#1a1a1a] hover:text-black underline decoration-dotted underline-offset-2 decoration-[#9ca3af] hover:decoration-black transition-colors"
      >
        {children}
      </span>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover/cell:opacity-100 transition-opacity p-0.5 rounded hover:bg-[#f0f0f0] flex-shrink-0"
        title="Copy market name"
      >
        {copied
          ? <Check className="w-3 h-3 text-emerald-600" />
          : <Copy className="w-3 h-3 text-[#9ca3af]" />}
      </button>
    </span>
  );
}

/** Detect block explorer URLs */
const EXPLORER_REGEX = /^https?:\/\/(basescan\.org|polygonscan\.com|etherscan\.io)/;

/** Build ReactMarkdown components with clickable first-column table cells */
function buildMarkdownComponents(onCellClick?: (text: string) => void) {
  // Track column index per row via a shared counter
  let colIndex = 0;

  const components: Record<string, any> = {
    // Style block-explorer links: blue text + small external-link icon
    a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode }) => {
      if (href && EXPLORER_REGEX.test(href)) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700 no-underline hover:underline"
            {...props}
          >
            {children}
            <ExternalLink className="w-3 h-3 flex-shrink-0 relative -top-[1px]" />
          </a>
        );
      }
      return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
    },
  };

  if (onCellClick) {
    components.tr = ({ children: rowChildren, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { children?: React.ReactNode }) => {
      colIndex = 0; // reset for each row
      return <tr {...props}>{rowChildren}</tr>;
    };
    components.td = ({ children: cellChildren, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { children?: React.ReactNode }) => {
      const currentCol = colIndex++;
      // Only first column
      if (currentCol !== 0) return <td {...props}>{cellChildren}</td>;
      // Extract text content from React children
      const extractText = (c: React.ReactNode): string => {
        if (typeof c === 'string') return c;
        if (typeof c === 'number') return String(c);
        if (Array.isArray(c)) return c.map(extractText).join('');
        if (c && typeof c === 'object' && 'props' in (c as any)) return extractText((c as any).props.children);
        return '';
      };
      const text = extractText(cellChildren).trim();
      // Make clickable if it looks like a market question (>10 chars or contains ?)
      if (text.length > 10 || text.includes('?')) {
        return (
          <td {...props}>
            <MarketCell text={text} onClick={onCellClick}>
              {cellChildren}
            </MarketCell>
          </td>
        );
      }
      return <td {...props}>{cellChildren}</td>;
    };
  }

  return components;
}

export const MessageBubble = React.memo(({ message, onRetry, onEdit, showActions, children, onTableCellClick }: MessageBubbleProps) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const tradeHook = usePredictionMarketTrade();
  const batchTradeHook = useBatchTradeExecution();
  const { sendMessageToAgent } = useMessageSender();
  const { addMessage, setLoading, getCurrentSession } = useChatStore(
    useShallow((state) => ({
      addMessage: state.addMessage,
      setLoading: state.setLoading,
      getCurrentSession: state.getCurrentSession,
    }))
  );
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

  const startEditing = useCallback(() => {
    setEditText(message.content);
    setIsEditing(true);
  }, [message.content]);

  const commitEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.content.trim()) {
      setIsEditing(false);
      return;
    }
    onEdit?.(trimmed);
    setIsEditing(false);
  }, [editText, message.content, onEdit]);

  const cancelEdit = useCallback(() => {
    setEditText(message.content);
    setIsEditing(false);
  }, [message.content]);

  // Check if this message has an action (new action-based flow)
  const action = (message.metadata as { action?: ChatAction })?.action;
  const [userPosition, setUserPosition] = useState<string | null>(null);

  // Grid selection handler — sends PM_INVEST message to backend for processing
  const handleGridSelectionConfirm = async (selectedIds: string[], _selectedMarkets: any[]) => {
    const ids = selectedIds.join(',');
    const msgContent = `[PM_INVEST: ${ids}]`;
    const walletAddress = getCurrentSession()?.walletAddress || null;

    addMessage({ role: 'user', content: msgContent });
    setLoading(true);
    await sendMessageToAgent(msgContent, walletAddress);
  };

  // Batch trade confirm handler
  const handleBatchTradeConfirm = () => {
    const allocData = action?.type === 'prediction_market_allocation' ? (action.data as any) : null;
    if (allocData?.allocations) {
      batchTradeHook.executeBatch(allocData.allocations);
    }
  };

  // Batch trade cancel handler
  const handleBatchTradeCancel = async () => {
    const msgContent = 'Cancel the allocation. Show me the markets again.';
    const walletAddress = getCurrentSession()?.walletAddress || null;

    addMessage({ role: 'user', content: msgContent });
    setLoading(true);
    await sendMessageToAgent(msgContent, walletAddress);
  };

  const handleTradeClick = (outcome: string, tokenId: string, price: number, question: string, side: 'BUY' | 'SELL' = 'BUY') => {
    const deals = action?.type === 'prediction_market_result' ? (action.data as any)?.deals : null;
    const marketQuestion = question || deals?.market_question || deals?.question || 'Prediction Market';
    const marketId = deals?.market_id;
    const endDate = deals?.end_date;
    const marketSlug = deals?.market_slug;

    tradeHook.handleTradeClick(outcome, tokenId, price, marketQuestion, side, marketId, endDate, marketSlug);
  };

  // Don't render system messages (they're shown as toasts now)
  if (isSystem) {
    return null;
  }

  // Handle action-based messages (AI with special UI)
  const isHistory = !!(message.metadata as any)?.isHistory;
  if (action && !isUser) {

    return (
      <div className="flex w-full mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300 justify-start">
        <div className="max-w-[90%] md:max-w-[75%] space-y-3">
          {/* AI indicator */}
          <div className="flex items-center gap-2 mb-1.5">
            <Image src="/new.png" alt="Supermission" className="w-5 h-5 rounded-[6px] object-contain dark:invert" width={20} height={20} />
            <span className="text-[11px] font-semibold text-[#6b7280] font-bricolage">Supermission</span>
          </div>
          {/* AI message */}
          <div className="chat-message-ai bg-white dark:bg-[#1c1c1c] border border-[#e5e7eb] dark:border-[#2a2a2a] px-4 py-3 rounded-[12px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)]">
            {message.metadata?.typingAnimate && !completedAnimations.has(message.id) ? (
              <AnimatedMarkdown
                content={message.content}
                speed={8}
                onComplete={() => completedAnimations.add(message.id)}
                className="text-[13px] leading-relaxed break-words overflow-x-auto prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-p:leading-relaxed prose-strong:font-bold prose-strong:text-black dark:prose-strong:text-white prose-em:italic prose-ul:my-3 prose-ul:list-disc prose-ul:pl-5 prose-ul:space-y-1.5 prose-ol:my-3 prose-ol:list-decimal prose-ol:pl-5 prose-ol:space-y-1.5 prose-li:my-0 prose-li:leading-relaxed prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-2 prose-h1:text-base prose-h2:text-sm prose-h3:text-xs overflow-x-auto text-black dark:text-[#e0e0e0]"
                markdownComponents={buildMarkdownComponents(onTableCellClick)}
              />
            ) : (
              <div className="text-[13px] leading-relaxed break-words overflow-x-auto prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-p:leading-relaxed prose-strong:font-bold prose-strong:text-black dark:prose-strong:text-white prose-em:italic prose-ul:my-3 prose-ul:list-disc prose-ul:pl-5 prose-ul:space-y-1.5 prose-ol:my-3 prose-ol:list-decimal prose-ol:pl-5 prose-ol:space-y-1.5 prose-li:my-0 prose-li:leading-relaxed prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-2 prose-h1:text-base prose-h2:text-sm prose-h3:text-xs overflow-x-auto text-black dark:text-[#e0e0e0]">
                <LazyMarkdown components={buildMarkdownComponents(onTableCellClick) as any}>{message.content.replace(/\\(\*)/g, '$1')}</LazyMarkdown>
              </div>
            )}

            {children}
          </div>

          {/* Action component */}
          {action.type === 'agent_recommendation' && action.data ? (
            <AgentRecommendationPanel messageId={message.id} data={action.data as never} />
          ) : null}

          {action.type === 'mission_mode_selection' && action.data ? (
            <MissionModePanel data={action.data as { originalMessage: string }} />
          ) : null}

          {action.type === 'mission_deployed' && action.data ? (
            <MissionDeployedSuccess data={action.data as never} />
          ) : null}

          {action.type === 'param_request' && action.data ? (
            <ParamRequestPanel data={action.data as any} />
          ) : null}

          {action.type === 'price_chart' && action.data?.candles ? (
            <PriceChartPanel data={action.data} />
          ) : null}

          {action.type === 'contract_audit_result' && action.data ? (
            <ContractAuditResultPanel
              data={action.data as ContractAuditResponse}
            />
          ) : null}

          {action.type === 'morpho_deposit_ready' && action.data ? (
            <MorphoDepositInline data={action.data} isHistory={isHistory} />
          ) : null}

          {action.type === 'swap_ready' && action.data ? (
            <SwapExecuteInline data={action.data} isHistory={isHistory} />
          ) : null}

          {action.type === 'roro_order_ready' && action.data ? (
            <RoroOrderExecuteInline data={action.data} isHistory={isHistory} />
          ) : null}

          {action.type === 'transfer_ready' && action.data ? (
            <TransferExecuteInline data={action.data} isHistory={isHistory} />
          ) : null}

          {action.type === 'defi_deposit_ready' && action.data ? (
            <DefiDepositInline data={action.data} isHistory={isHistory} />
          ) : null}

          {action.type === 'uniswap_lp_ready' && action.data ? (
            <UniswapLPInline data={action.data} isHistory={isHistory} />
          ) : null}

          {action.type === 'uniswap_lp_execution_ready' && action.data ? (
            <UniswapLPExecuteInline data={action.data} messageId={message.id} />
          ) : null}

          {action.type === 'uniswap_lp_remove_ready' && action.data ? (
            <UniswapLPRemoveInline data={action.data} mode="remove" isHistory={isHistory} />
          ) : null}

          {action.type === 'uniswap_lp_collect_ready' && action.data ? (
            <UniswapLPRemoveInline data={action.data} mode="collect" isHistory={isHistory} />
          ) : null}

          {action.type === 'image_gen_result' && action.data ? (
            <ImageGenResultPanel
              data={action.data as ImageGenResponse}
            />
          ) : null}

          {action.type === 'image_variation_options' && action.data ? (
            <VariationActionCard
              originalData={action.data as ImageGenResponse}
              onSubmit={() => { }}
              isLoading={false}
            />
          ) : null}

          {action.type === 'image_style_options' && action.data ? (
            <StyleActionCard
              originalData={action.data as ImageGenResponse}
              onSubmit={() => { }}
              isLoading={false}
            />
          ) : null}

          {action.type === 'image_quality_options' && action.data ? (
            <QualityActionCard
              originalData={action.data as ImageGenResponse}
              onSubmit={() => { }}
              isLoading={false}
            />
          ) : null}

          {/* New Prediction Market Grid (4-col selectable) */}
          {action.type === 'prediction_market_grid' && action.data ? (
            <PredictionMarketGrid
              markets={(action.data as any).markets}
              onSelectionConfirm={handleGridSelectionConfirm}
            />
          ) : null}

          {/* Allocation Confirmation Panel */}
          {action.type === 'prediction_market_allocation' && action.data ? (
            <AllocationConfirmPanel
              allocations={(action.data as any).allocations}
              totalBudget={(action.data as any).total_budget}
              reasoning={(action.data as any).reasoning}
              onConfirm={handleBatchTradeConfirm}
              onCancel={handleBatchTradeCancel}
              batchProgress={batchTradeHook.batchProgress}
            />
          ) : null}

          {/* Legacy PredictionMarketPanel for old messages */}
          {action.type === 'prediction_market_result' && action.data ? (
            <PredictionMarketPanel
              data={(action.data as any).deals}
              markets={(action.data as any).all_deals}
              offerCreatedAt={(action.data as any).offer_created_at}
              onTrade={handleTradeClick}
              onConfirmTrade={tradeHook.handleConfirmTrade}
              tradeProgress={tradeHook.progress}
              onResetTrade={tradeHook.reset}
              initialUserPosition={userPosition}
              onPositionChange={setUserPosition}
            />
          ) : null}

          {action.type === 'x402_payment_required' && action.data ? (
            <X402PaymentPanel
              data={{
                ...action.data as any,
                agentContext: (message.metadata as any)?.agentContext,
              }}
            />
          ) : null}

          {action.type === 'platform_showcase' && action.data ? (
            <PlatformShowcasePanel data={action.data as PlatformShowcaseAction['data']} />
          ) : null}

          {action.type === 'image_modification_setup' && action.data ? (
            <ImageModificationPanel data={action.data as ImageModificationSetupAction['data']} />
          ) : null}

          {/* Trending tokens data is already shown in the chat markdown table above — no duplicate card */}

          {action.type === 'nansen_smart_money_result' && action.data?.smartMoney && (
            <div className="mt-3 bg-[#fafbfc] border border-[#e5e7eb] rounded-xl p-4 text-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base font-bold text-[#1a1a1a]">Smart Money {action.data.smartMoney.view === 'holdings' ? 'Holdings' : 'Net Flows'}</span>
                {action.data.smartMoney.timeframe && <span className="text-xs text-[#6b7280] bg-white px-2 py-0.5 rounded-full border border-[#e5e7eb]">{action.data.smartMoney.timeframe}</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[#6b7280] border-b border-[#e5e7eb]">
                      <th className="pb-2 pr-3">#</th>
                      <th className="pb-2 pr-3">Token</th>
                      <th className="pb-2 pr-3">Chain</th>
                      {action.data.smartMoney.view === 'holdings' ? (
                        <>
                          <th className="pb-2 pr-3 text-right">Value Held</th>
                          <th className="pb-2 text-right">24h Change</th>
                        </>
                      ) : (
                        <>
                          <th className="pb-2 pr-3 text-right">Net Flow ({action.data.smartMoney.timeframe || '24h'})</th>
                          <th className="pb-2 text-right">Traders</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {action.data.smartMoney.data?.slice(0, 15).map((item: any, i: number) => (
                      <tr key={i} className="border-b border-[#f0f0f0] last:border-0">
                        <td className="py-1.5 pr-3 text-[#6b7280]">{i + 1}</td>
                        <td className="py-1.5 pr-3 font-medium text-[#1a1a1a]">{item.symbol}</td>
                        <td className="py-1.5 pr-3 text-[#6b7280] capitalize">{item.chain}</td>
                        {action.data.smartMoney.view === 'holdings' ? (
                          <>
                            <td className="py-1.5 pr-3 text-right font-mono">${item.valueHeld ? (item.valueHeld >= 1e6 ? `${(item.valueHeld / 1e6).toFixed(1)}M` : `${(item.valueHeld / 1e3).toFixed(0)}K`) : 'N/A'}</td>
                            <td className={`py-1.5 text-right font-mono ${item.change24h?.startsWith('+') ? 'text-emerald-600' : 'text-rose-500'}`}>{item.change24h || 'N/A'}</td>
                          </>
                        ) : (
                          <>
                            {(() => { const tf = action.data.smartMoney.timeframe || '24h'; const flow = (tf === '1h' ? item.netFlow1h : tf === '7d' ? item.netFlow7d : item.netFlow24h) ?? null; return (
                            <td className={`py-1.5 pr-3 text-right font-mono ${(flow || 0) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>${flow != null ? (Math.abs(flow) >= 1e6 ? `${(flow / 1e6).toFixed(1)}M` : `${(flow / 1e3).toFixed(0)}K`) : 'N/A'}</td>
                            ); })()}
                            <td className="py-1.5 text-right font-mono text-[#6b7280]">{item.traderCount || 'N/A'}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {action.type === 'nansen_analysis_result' && action.data?.nansenAnalysis && (() => {
            const a = action.data.nansenAnalysis;
            const t = a.token;
            return (
              <div className="mt-3 bg-[#fafbfc] border border-[#e5e7eb] rounded-xl p-4 text-sm space-y-3">
                <div className="flex items-center gap-3">
                  {t?.logo && <Image src={t.logo} alt="" className="w-8 h-8 rounded-full" width={32} height={32} unoptimized />}
                  <div>
                    <span className="text-base font-bold text-[#1a1a1a]">{t?.name || 'Token'}</span>
                    <span className="text-xs text-[#6b7280] ml-2">{t?.symbol} on {a.chain}</span>
                  </div>
                </div>
                {t && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Market Cap', val: t.marketCap ? `$${(t.marketCap / 1e6).toFixed(1)}M` : 'N/A' },
                      { label: 'Volume 24h', val: t.volume24h ? `$${(t.volume24h / 1e6).toFixed(1)}M` : 'N/A' },
                      { label: 'Liquidity', val: t.liquidity ? `$${(t.liquidity / 1e6).toFixed(1)}M` : 'N/A' },
                      { label: 'Holders', val: t.holders?.toLocaleString() || 'N/A' },
                    ].map((m) => (
                      <div key={m.label} className="bg-white border border-[#e5e7eb] rounded-lg p-2 text-center">
                        <p className="text-[10px] text-[#6b7280]">{m.label}</p>
                        <p className="text-sm font-bold text-[#1a1a1a] font-mono">{m.val}</p>
                      </div>
                    ))}
                  </div>
                )}
                {a.flows && (
                  <div>
                    <p className="text-xs font-bold text-[#1a1a1a] mb-1.5">Flow Intelligence (24h)</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { label: 'Smart Traders', flow: a.flows.smartTrader },
                        { label: 'Whales', flow: a.flows.whale },
                        { label: 'Exchanges', flow: a.flows.exchange },
                        { label: 'Public Figures', flow: a.flows.publicFigure },
                      ].filter((f) => f.flow?.netFlow != null).map((f) => (
                        <div key={f.label} className="flex items-center justify-between bg-white border border-[#e5e7eb] rounded-lg px-2.5 py-1.5">
                          <span className="text-[11px] text-[#6b7280]">{f.label}</span>
                          <span className={`text-[11px] font-mono font-medium ${(f.flow.netFlow || 0) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {(f.flow.netFlow || 0) >= 0 ? '+' : ''}${Math.abs(f.flow.netFlow) >= 1e6 ? `${(f.flow.netFlow / 1e6).toFixed(1)}M` : Math.abs(f.flow.netFlow) >= 1e3 ? `${(f.flow.netFlow / 1e3).toFixed(0)}K` : f.flow.netFlow?.toFixed(0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {action.type === 'batch_buy_execution_ready' && action.data ? (
            <BatchBuyExecuteInline data={action.data} messageId={message.id} isHistory={isHistory} />
          ) : null}

          {action.type === 'batch_yield_execution_ready' && action.data ? (
            <BatchYieldExecuteInline data={action.data} messageId={message.id} />
          ) : null}

          {/* Timestamp + feedback */}
          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] text-[#9ca3af] font-mono">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <div className="inline-flex items-center gap-1">
              <button
                onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
                className={cn(
                  'p-0.5 rounded transition-colors',
                  feedback === 'up' ? 'text-emerald-600' : 'text-[#c4c4c4] hover:text-[#6b7280]'
                )}
                title="Good response"
              >
                <svg className="w-3 h-3" fill={feedback === 'up' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" />
                </svg>
              </button>
              <button
                onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
                className={cn(
                  'p-0.5 rounded transition-colors',
                  feedback === 'down' ? 'text-red-500' : 'text-[#c4c4c4] hover:text-[#6b7280]'
                )}
                title="Poor response"
              >
                <svg className="w-3 h-3" fill={feedback === 'down' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex w-full mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div className={cn('max-w-[90%] md:max-w-[75%] group/bubble')}>
        {/* Sender indicator */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-1.5">
            <Image src="/new.png" alt="Supermission" className="w-5 h-5 rounded-[6px] object-contain dark:invert" width={20} height={20} />
            <span className="text-[11px] font-semibold text-[#6b7280] font-bricolage">Supermission</span>
          </div>
        )}
        {isUser && (
          <div className="flex items-center gap-2 mb-1.5 justify-end">
            <span className="text-[11px] font-semibold text-[#3a3a3a] font-bricolage">You</span>
            <div className="w-6 h-6 border border-[#e5e7eb] bg-white rounded-[6px] flex items-center justify-center">
              <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        )}
        {/* Message bubble */}
        <div className="relative">
          <div
            className={cn(
              'px-4 py-3 rounded-[12px] transition-all duration-200',
              isUser
                ? 'chat-message-user bg-gradient-to-b from-[#1a1a1a] to-[#2d2d2d] text-white border border-[#333] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.12)]'
                : 'chat-message-ai bg-white dark:bg-[#1c1c1c] text-[#3a3a3a] dark:text-[#e0e0e0] border border-[#e5e7eb] dark:border-[#2a2a2a] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)]'
            )}
          >
            {/* User-uploaded image attachments */}
            {isUser && message.attachments && message.attachments.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {message.attachments
                  .filter((a): a is MessageAttachment & { type: 'image' } => a.type === 'image')
                  .map((attachment, idx) => (
                    <div key={idx} className="relative">
                      <Image
                        src={getDataUrl(attachment.data, attachment.mimeType)}
                        alt={attachment.name}
                        className="max-w-[200px] max-h-[150px] object-cover border border-white/20 rounded-[8px]"
                        width={200}
                        height={150}
                        unoptimized
                      />
                      <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[8px] px-1 py-0.5 truncate max-w-[180px]">
                        {attachment.name}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Message content */}
            {isUser && isEditing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      commitEdit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEdit();
                    }
                  }}
                  autoFocus
                  rows={Math.min(8, Math.max(1, editText.split('\n').length))}
                  className="w-full min-w-[240px] bg-white/10 text-white placeholder:text-white/40 text-[13px] leading-relaxed rounded-[8px] border border-white/20 px-2.5 py-2 resize-y focus:outline-none focus:border-white/40"
                  style={{ fontFamily: 'inherit' }}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="h-7 px-3 text-[11px] font-semibold text-white/70 hover:text-white hover:bg-white/10 rounded-[6px] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={commitEdit}
                    disabled={!editText.trim() || editText.trim() === message.content.trim()}
                    className="h-7 px-3 text-[11px] font-semibold bg-white text-black hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-[6px] transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : !isUser && message.metadata?.typingAnimate && !completedAnimations.has(message.id) ? (
              <AnimatedMarkdown
                content={message.content}
                speed={8}
                onComplete={() => completedAnimations.add(message.id)}
                markdownComponents={buildMarkdownComponents(onTableCellClick)}
                className={cn(
                  'text-[13px] leading-relaxed break-words prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-p:leading-relaxed prose-strong:font-bold prose-em:italic prose-ul:my-3 prose-ul:list-disc prose-ul:pl-5 prose-ul:space-y-1.5 prose-ol:my-3 prose-ol:list-decimal prose-ol:pl-5 prose-ol:space-y-1.5 prose-li:my-0 prose-li:leading-relaxed prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-2 prose-h1:text-base prose-h2:text-sm prose-h3:text-xs prose-table:w-full prose-table:border-collapse prose-table:text-[12px] prose-table:my-3 [&_thead]:bg-[#f8fafc] dark:[&_thead]:bg-[#252525] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border-b [&_th]:border-[#e5e7eb] dark:[&_th]:border-[#3a3a3a] [&_th]:text-[#3a3a3a] dark:[&_th]:text-[#e0e0e0] [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-[#f0f0f0] dark:[&_td]:border-[#2a2a2a] [&_td]:text-[#48484b] dark:[&_td]:text-[#ccc] [&_tr:last-child]:border-0 [&_tbody_tr:hover]:bg-[#f9fafb] dark:[&_tbody_tr:hover]:bg-[#252525] prose-strong:text-black dark:prose-strong:text-white text-black dark:text-[#e0e0e0] prose-headings:text-black dark:prose-headings:text-white'
                )}
              />
            ) : (
              <div className={cn(
                'text-[13px] leading-relaxed break-words prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-p:leading-relaxed prose-strong:font-bold prose-em:italic prose-ul:my-3 prose-ul:list-disc prose-ul:pl-5 prose-ul:space-y-1.5 prose-ol:my-3 prose-ol:list-decimal prose-ol:pl-5 prose-ol:space-y-1.5 prose-li:my-0 prose-li:leading-relaxed prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-2 prose-h1:text-base prose-h2:text-sm prose-h3:text-xs prose-table:w-full prose-table:border-collapse prose-table:text-[12px] prose-table:my-3 [&_thead]:bg-[#f8fafc] dark:[&_thead]:bg-[#252525] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border-b [&_th]:border-[#e5e7eb] dark:[&_th]:border-[#3a3a3a] [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-[#f0f0f0] dark:[&_td]:border-[#2a2a2a] [&_tr:last-child]:border-0 [&_tbody_tr:hover]:bg-[#f9fafb] dark:[&_tbody_tr:hover]:bg-[#252525]',
                isUser ? 'prose-strong:text-white text-white prose-p:text-white prose-li:text-white prose-headings:text-white' : 'prose-strong:text-black dark:prose-strong:text-white text-black dark:text-[#e0e0e0] prose-headings:text-black dark:prose-headings:text-white [&_th]:text-[#3a3a3a] dark:[&_th]:text-[#e0e0e0] [&_td]:text-[#48484b] dark:[&_td]:text-[#ccc]'
              )}>
                <LazyMarkdown components={buildMarkdownComponents(onTableCellClick) as any}>{message.content.replace(/\\(\*)/g, '$1')}</LazyMarkdown>
              </div>
            )}

            {/* Transaction metadata */}
            {message.metadata?.txHash && (
              <div className={cn(
                'mt-3 pt-3 border-t',
                isUser ? 'border-white/30' : 'border-[#e5e7eb]'
              )}>
                <a
                  href={`https://basescan.org/tx/${message.metadata.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'text-[10px] font-medium hover:underline inline-flex items-center gap-1.5 transition-opacity',
                    isUser ? 'text-white/80 hover:text-white' : 'opacity-60 hover:opacity-100'
                  )}
                >
                  View transaction
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}

            {children}
          </div>
        </div>

        {/* Timestamp + actions row */}
        <div className={cn(
          'flex items-center gap-2 mt-1.5 px-1',
          isUser ? 'justify-end' : 'justify-start'
        )}>
          <span className="text-[10px] text-[#9ca3af] font-mono">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>

          {/* Edit action for user messages */}
          {isUser && onEdit && !isEditing && (
            <button
              onClick={startEditing}
              className="opacity-0 group-hover/bubble:opacity-100 focus:opacity-100 hover:opacity-100 inline-flex items-center gap-1 text-[10px] text-[#9ca3af] hover:text-[#1a1a1a] dark:hover:text-white p-1 rounded-md bg-transparent transition-opacity duration-150 delay-75"
              title="Edit message"
              aria-label="Edit message"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}

          {/* Copy + Retry actions for assistant messages */}
          {!isUser && showActions && (
            <div className="flex items-center gap-1">
              <CopyButton content={message.content} />
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center gap-1 text-[10px] text-[#6b7280] dark:text-white/60 hover:text-[#1a1a1a] dark:hover:text-white transition-colors p-1 rounded-md !bg-transparent border-0"
                  title="Retry"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Legacy retry on error messages */}
          {!isUser && !showActions && onRetry && isErrorMessage(message.content) && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1 text-[10px] text-[#6b7280] hover:text-[#1a1a1a] dark:hover:text-white transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          )}

        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Always re-render interactive panels (they need wallet state updates)
  const prevAction = (prevProps.message.metadata as { action?: { type: string } })?.action;
  const nextAction = (nextProps.message.metadata as { action?: { type: string } })?.action;

  const interactiveTypes = ['param_request', 'x402_payment_required', 'platform_showcase', 'prediction_market_result', 'prediction_market_grid', 'prediction_market_allocation', 'image_modification_setup', 'morpho_deposit_ready', 'swap_ready', 'transfer_ready', 'defi_deposit_ready', 'uniswap_lp_ready', 'uniswap_lp_remove_ready', 'uniswap_lp_collect_ready', 'uniswap_lp_execution_ready', 'batch_buy_execution_ready', 'batch_yield_execution_ready'];
  if (prevAction && interactiveTypes.includes(prevAction.type)) {
    return false; // Always re-render interactive panels
  }
  if (nextAction && interactiveTypes.includes(nextAction.type)) {
    return false;
  }

  // Compare id, content, and metadata so streaming updates propagate
  return prevProps.message.id === nextProps.message.id
    && prevProps.message.content === nextProps.message.content
    && prevProps.message.metadata === nextProps.message.metadata;
});