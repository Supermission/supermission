'use client';

import { useState, useEffect, useRef } from 'react';
import { useTradeExecution } from '@/lib/hooks/use-trade-execution';
import { useUIStore } from '@/lib/store/ui';

interface SellData {
  market: {
    condition_id: string;
    question: string;
    slug?: string;
    end_date?: string;
  };
  sell: {
    outcome: string;
    size: number;
    tokenId: string;
    currentPrice: number;
    avgPrice: number;
    currentValue: number;
    costBasis: number;
    pnl: number;
    negativeRisk?: boolean;
  };
}

interface SellConfirmCardProps {
  trade: SellData;
  isHistory?: boolean;
}

/**
 * Auto-executing sell component — no visible card, no buttons.
 * The Oracle agent handles confirmation via text conversation.
 * This component auto-executes on mount and shows inline progress,
 * then renders a collapsible result section.
 */
export function SellConfirmCard({ trade, isHistory }: SellConfirmCardProps) {
  const { executeSell, progress } = useTradeExecution();
  const setMarketTab = useUIStore((s) => s.setMarketTab);

  // Persistent execution guard — survives component remounts (e.g. loading historical sessions)
  const execKey = `sell-exec-${trade.market.condition_id}-${trade.sell.tokenId}`;
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
        await executeSell({
          tokenId: trade.sell.tokenId,
          size: trade.sell.size,
          outcome: trade.sell.outcome,
          question: trade.market.question,
          marketId: trade.market.condition_id,
          negativeRisk: trade.sell.negativeRisk,
        });
        setStatus('done');
        window.dispatchEvent(new CustomEvent('trade-completed', {
          detail: {
            side: 'SELL',
            conditionId: trade.market.condition_id,
            tokenId: trade.sell.tokenId,
            outcome: trade.sell.outcome,
            price: trade.sell.currentPrice,
            shares: trade.sell.size,
            amount: trade.sell.currentValue,
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
  }, [executeSell, trade, execKey, alreadyExecuted]);

  // Capture error message from progress
  const errorCaptured = useRef(false);
  useEffect(() => {
    if (status === 'failed' && progress.error && !errorCaptured.current) {
      errorCaptured.current = true;
      setErrorMsg(progress.error);
    }
  }, [status, progress.error]);

  const pnlPositive = trade.sell.pnl >= 0;
  const pnlAmount = `${pnlPositive ? '+' : '-'}$${Math.abs(trade.sell.pnl).toFixed(2)}`;
  const accentColor = pnlPositive ? '#10b981' : '#ef4444';

  return (
    <div ref={containerRef}>
      {/* Executing state — inline progress with animated indicator */}
      {status === 'executing' && (
        <div className="flex items-center gap-2.5 px-1 py-2.5 my-1">
          <div className="relative flex items-center justify-center w-4 h-4">
            <div className="absolute inset-0 rounded-full animate-ping opacity-30 bg-amber-500" />
            <div className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
          <span className="text-[11px] font-mono text-[#4b5563] tracking-wide">
            {progress.message || `Selling ${trade.sell.outcome} on ${trade.market.question.slice(0, 40)}...`}
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
              style={{ backgroundColor: accentColor }}
            />
            <span
              className="text-[11px] font-medium tracking-tight"
              style={{ color: accentColor, fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
            >
              Sold {trade.sell.size.toFixed(1)} {trade.sell.outcome}
            </span>
            <span className="text-[10px] font-mono" style={{ color: accentColor, opacity: 0.7 }}>
              {pnlAmount}
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
              <div
                className="max-w-[240px] rounded-md overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${accentColor}06, ${accentColor}03)`,
                  border: `1px solid ${accentColor}18`,
                }}
              >
                {/* Compact receipt rows */}
                <div className="px-3 py-2.5 space-y-[6px]">
                  {[
                    ['Shares', `${trade.sell.size.toFixed(2)} ${trade.sell.outcome}`],
                    ['Exit', `${(trade.sell.currentPrice * 100).toFixed(1)}%`],
                    ['Entry', `${(trade.sell.avgPrice * 100).toFixed(1)}%`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-[9.5px] font-mono text-[#aaa] uppercase tracking-[0.08em]">{label}</span>
                      <span className="text-[11px] font-mono text-[#3a3a3a]">{value}</span>
                    </div>
                  ))}

                  {/* P&L row with accent separator */}
                  <div
                    className="flex items-center justify-between pt-[6px] mt-[2px]"
                    style={{ borderTop: `1px dashed ${accentColor}20` }}
                  >
                    <span className="text-[9.5px] font-mono text-[#aaa] uppercase tracking-[0.08em]">P&L</span>
                    <span className="text-[11px] font-mono font-semibold" style={{ color: accentColor }}>
                      {pnlAmount}
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
                    color: accentColor,
                    backgroundColor: `${accentColor}0a`,
                    borderTop: `1px solid ${accentColor}12`,
                  }}
                >
                  View Portfolio &rarr;
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
              Sell failed
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
