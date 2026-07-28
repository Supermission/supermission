'use client';

import { useState, useEffect, useRef } from 'react';
import { useTradeExecution } from '@/lib/hooks/use-trade-execution';
import { useUIStore } from '@/lib/store/ui';

interface TradeData {
  market: {
    condition_id: string;
    question: string;
    slug?: string;
    end_date?: string;
    volume?: number;
    liquidity?: number;
  };
  trade: {
    side: string;
    outcome: string;
    amount: number;
    price: number;
    tokenId: string;
    expectedShares: number;
  };
}

interface TradeConfirmCardProps {
  trade: TradeData;
  isHistory?: boolean;
}

/**
 * Auto-executing trade component — no visible card, no buttons.
 * The Oracle agent handles confirmation via text conversation.
 * This component auto-executes on mount and shows inline progress,
 * then renders a collapsible result section.
 */
export function TradeConfirmCard({ trade, isHistory }: TradeConfirmCardProps) {
  const { executeTrade, progress } = useTradeExecution();
  const setMarketTab = useUIStore((s) => s.setMarketTab);

  // Persistent execution guard — survives component remounts (e.g. loading historical sessions)
  const execKey = `trade-exec-${trade.market.condition_id}-${trade.trade.tokenId}`;
  const alreadyExecuted = isHistory || (typeof window !== 'undefined' && sessionStorage.getItem(execKey) === 'done');
  const [status, setStatus] = useState<'executing' | 'done' | 'failed'>(alreadyExecuted ? 'done' : 'executing');
  const [errorMsg, setErrorMsg] = useState('');
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Apply pulsating green border to parent message bubble during execution
  useEffect(() => {
    const bubble = containerRef.current?.closest('.chat-message-ai');
    if (!bubble) return;
    if (status === 'executing') {
      bubble.classList.add('trade-executing');
    } else {
      bubble.classList.remove('trade-executing');
    }
    return () => { bubble.classList.remove('trade-executing'); };
  }, [status]);

  // Auto-execute on mount — ONLY if not already executed in this browser session
  useEffect(() => {
    if (alreadyExecuted) return;
    // Mark as executed immediately to prevent double-fire
    sessionStorage.setItem(execKey, 'done');

    (async () => {
      try {
        const { response } = await executeTrade({
          tokenId: trade.trade.tokenId,
          price: trade.trade.price,
          size: String(trade.trade.amount),
          side: 'BUY',
          outcome: trade.trade.side,
          question: trade.market.question,
          marketId: trade.market.condition_id,
          marketSlug: trade.market.slug,
        });
        setStatus('done');
        // Dispatch with trade details so PortfolioView can create optimistic entries
        const fillPrice = Number(response?.averagePrice) || Number(response?.price) || trade.trade.price;
        const fillShares = Number(response?.filledSize) || (fillPrice > 0 ? trade.trade.amount / fillPrice : 0);
        window.dispatchEvent(new CustomEvent('trade-completed', {
          detail: {
            side: 'BUY',
            conditionId: trade.market.condition_id,
            tokenId: trade.trade.tokenId,
            outcome: trade.trade.side,
            price: fillPrice,
            shares: fillShares,
            amount: fillShares * fillPrice,
            question: trade.market.question,
            slug: trade.market.slug || '',
            endDate: trade.market.end_date || '',
            eventId: '',
          },
        }));
      } catch {
        setStatus('failed');
      }
    })();
  }, [executeTrade, trade, execKey, alreadyExecuted]);

  // Capture error message from progress
  const errorCaptured = useRef(false);
  useEffect(() => {
    if (status === 'failed' && progress.error && !errorCaptured.current) {
      errorCaptured.current = true;
      setErrorMsg(progress.error);
    }
  }, [status, progress.error]);

  const sideUpper = trade.trade.side?.toUpperCase();
  const sideColor = sideUpper === 'YES' ? '#10b981' : sideUpper === 'NO' ? '#ef4444' : '#3b82f6';

  return (
    <div ref={containerRef}>
      {/* Executing state — inline progress with step indicator */}
      {status === 'executing' && (
        <div className="flex items-center gap-2.5 px-1 py-2.5 my-1">
          <div className="relative flex items-center justify-center w-4 h-4">
            <div
              className="absolute inset-0 rounded-full animate-ping opacity-30"
              style={{ backgroundColor: sideColor }}
            />
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: sideColor }}
            />
          </div>
          <span className="text-[11px] font-mono text-[#4b5563] tracking-wide">
            {progress.message || `Buying ${trade.trade.side} on ${trade.market.question.slice(0, 40)}...`}
          </span>
        </div>
      )}

      {/* Done state — collapsible receipt */}
      {status === 'done' && (
        <div className="my-1.5">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 py-1 group cursor-pointer"
          >
            <div
              className="w-[5px] h-[5px] rounded-full"
              style={{ backgroundColor: sideColor }}
            />
            <span
              className="text-[11px] font-medium tracking-tight"
              style={{ color: sideColor, fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
            >
              Bought {trade.trade.expectedShares.toFixed(1)} {trade.trade.side}
            </span>
            <span className="text-[10px] text-[#b0b0b0] font-mono">&middot; ${trade.trade.amount.toFixed(2)}</span>
            <svg
              className="w-3 h-3 text-[#c0c0c0] group-hover:text-[#888] transition-all duration-300"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded && (
            <div className="trade-result-enter mt-1.5 ml-2.5">
              <div
                className="max-w-[240px] rounded-md overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${sideColor}06, ${sideColor}03)`,
                  border: `1px solid ${sideColor}18`,
                }}
              >
                {/* Compact receipt rows */}
                <div className="px-3 py-2.5 space-y-[6px]">
                  {[
                    ['Shares', `${trade.trade.expectedShares.toFixed(2)} ${trade.trade.side}`],
                    ['Entry', `${(trade.trade.price * 100).toFixed(1)}%`],
                    ['Cost', `$${trade.trade.amount.toFixed(2)}`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-[9.5px] font-mono text-[#aaa] uppercase tracking-[0.08em]">{label}</span>
                      <span className="text-[11px] font-mono text-[#3a3a3a]">{value}</span>
                    </div>
                  ))}

                  {/* Payout row with accent separator */}
                  <div
                    className="flex items-center justify-between pt-[6px] mt-[2px]"
                    style={{ borderTop: `1px dashed ${sideColor}20` }}
                  >
                    <span className="text-[9.5px] font-mono text-[#aaa] uppercase tracking-[0.08em]">Payout</span>
                    <span className="text-[11px] font-mono font-semibold" style={{ color: sideColor }}>
                      ${trade.trade.expectedShares.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Portfolio link — subtle bar */}
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('trade-completed'));
                    setMarketTab('portfolio');
                  }}
                  className="w-full py-1.5 text-[10px] font-semibold tracking-wide text-center transition-all duration-200 hover:brightness-95 active:scale-[0.99]"
                  style={{
                    fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)',
                    color: sideColor,
                    backgroundColor: `${sideColor}0a`,
                    borderTop: `1px solid ${sideColor}12`,
                  }}
                >
                  View in Portfolio &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Failed state — collapsible error */}
      {status === 'failed' && (
        <div className="my-1.5">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 py-1 group cursor-pointer"
          >
            <div className="w-[5px] h-[5px] rounded-full bg-rose-400" />
            <span
              className="text-[11px] font-medium tracking-tight text-rose-500"
              style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
            >
              Trade failed
            </span>
            <svg
              className="w-3 h-3 text-[#c0c0c0] group-hover:text-[#888] transition-all duration-300"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded && (
            <div className="trade-result-enter mt-1.5 ml-2.5">
              <div className="max-w-[240px] rounded-md border border-rose-100 bg-rose-50/40 px-3 py-2.5">
                <p className="text-[10.5px] font-mono text-rose-500 leading-relaxed">
                  {errorMsg || progress.error || 'Unknown error'}
                </p>
                <p className="text-[9.5px] font-mono text-[#bbb] mt-1.5">
                  Ask me to retry.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
