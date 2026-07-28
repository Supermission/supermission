'use client';

import React, { useState, useCallback, useRef } from 'react';
import { TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PredictionMarketGridProps {
  markets: any[];
  onSelectionConfirm: (selectedIds: string[], markets: any[]) => void;
  disabled?: boolean;
}

const VISIBLE_COUNT = 5;

export function PredictionMarketGrid({ markets, onSelectionConfirm, disabled }: PredictionMarketGridProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleSelection = useCallback((conditionId: string) => {
    if (disabled) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(conditionId)) {
        next.delete(conditionId);
      } else {
        next.add(conditionId);
      }
      return next;
    });
  }, [disabled]);

  const handleConfirm = useCallback(() => {
    const ids = Array.from(selectedIds);
    const selected = markets.filter(m => selectedIds.has(m.condition_id));
    onSelectionConfirm(ids, selected);
  }, [selectedIds, markets, onSelectionConfirm]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const container = scrollRef.current;
    if (!container) return;
    // Scroll by ~5 cards worth
    const cardWidth = container.firstElementChild?.getBoundingClientRect().width || 160;
    const scrollAmount = cardWidth * VISIBLE_COUNT + 8 * (VISIBLE_COUNT - 1); // cards + gaps
    container.scrollBy({ left: direction === 'right' ? scrollAmount : -scrollAmount, behavior: 'smooth' });
  }, []);

  if (!markets || markets.length === 0) return null;

  return (
    <div className="w-full space-y-2">
      {/* Horizontal scrollable row with nav arrows */}
      <div className="relative group/scroll">
        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white border border-[#e5e7eb] shadow-md flex items-center justify-center text-[#3a3a3a] hover:bg-[#f3f4f6] transition-all opacity-0 group-hover/scroll:opacity-100 -ml-1"
          aria-label="Scroll left"
        >
          <ChevronLeft size={14} />
        </button>

        {/* Cards row */}
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide scroll-smooth"
        >
          {markets.map((market, idx) => {
            const conditionId = market.condition_id;
            const isSelected = selectedIds.has(conditionId);
            const question = market.question || market.market_question || 'Market';
            const sentiment = market.ai_sentiment?.toLowerCase();
            const isBullish = sentiment === 'bullish';
            const confidence = market.signal_confidence || market.ai_confidence || 0;

            return (
              <button
                key={conditionId || idx}
                onClick={() => toggleSelection(conditionId)}
                disabled={disabled}
                className={cn(
                  'relative flex-shrink-0 flex flex-col justify-between p-2.5 rounded-[10px] border-2 text-left transition-all duration-200',
                  'w-[140px] h-[90px]',
                  isSelected
                    ? 'bg-[#1a1a1a] text-white border-[#1a1a1a] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.15)]'
                    : 'bg-white text-[#3a3a3a] border-[#e5e7eb] hover:border-[#1a1a1a] hover:shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)]',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                {/* Index badge */}
                <span className={cn(
                  'absolute top-1.5 right-2 text-[8px] font-mono font-bold',
                  isSelected ? 'text-white/40' : 'text-[#9ca3af]'
                )}>
                  #{idx + 1}
                </span>

                {/* Question */}
                <span className={cn(
                  'text-[10px] font-semibold leading-tight line-clamp-2 pr-4 font-bricolage',
                  isSelected ? 'text-white' : 'text-[#3a3a3a]'
                )}>
                  {question}
                </span>

                {/* Bottom row: sentiment badge + confidence */}
                <div className="flex items-center justify-between mt-1">
                  <span className={cn(
                    'inline-flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded-[3px]',
                    isBullish
                      ? isSelected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
                      : isSelected ? 'bg-red-500/20 text-red-300' : 'bg-red-50 text-red-700'
                  )}>
                    {isBullish ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                    {isBullish ? 'BULL' : 'BEAR'}
                  </span>
                  <span className={cn(
                    'text-[8px] font-mono font-bold',
                    isSelected ? 'text-white/50' : 'text-[#9ca3af]'
                  )}>
                    {confidence}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white border border-[#e5e7eb] shadow-md flex items-center justify-center text-[#3a3a3a] hover:bg-[#f3f4f6] transition-all opacity-0 group-hover/scroll:opacity-100 -mr-1"
          aria-label="Scroll right"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-mono text-[#6b7280]">
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Tap to select'} · {markets.length} markets
        </span>
        <button
          onClick={handleConfirm}
          disabled={selectedIds.size === 0 || disabled}
          className={cn(
            'px-4 py-2 rounded-[8px] text-[12px] font-bold font-bricolage transition-all duration-200',
            selectedIds.size > 0
              ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white hover:from-[#2a2a2a] hover:to-[#4b4b4b] shadow-sm'
              : 'bg-[#f3f4f6] text-[#9ca3af] cursor-not-allowed'
          )}
        >
          Invest in Selected
        </button>
      </div>
    </div>
  );
}
