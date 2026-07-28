'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Pencil, ArrowRight } from 'lucide-react';
import type { AgentClarificationData } from '@/lib/types/clarification';

interface AgentClarificationPromptProps {
  data: AgentClarificationData;
  accentColor: string;
  onSelect: (optionId: string, label: string) => void;
  onCustomSubmit: (text: string) => void;
  onSkip: () => void;
}

export function AgentClarificationPrompt({
  data,
  accentColor,
  onSelect,
  onCustomSubmit,
  onSkip,
}: AgentClarificationPromptProps) {
  const { question, options, allowCustom, allowSkip, step, totalSteps } = data;
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLTextAreaElement>(null);

  // Total focusable items: options + custom (if enabled)
  const totalItems = options.length + (allowCustom ? 1 : 0);

  // Focus custom input when entering custom mode
  useEffect(() => {
    if (customMode) {
      customInputRef.current?.focus();
    }
  }, [customMode]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (customMode) {
        if (e.key === 'Escape') {
          setCustomMode(false);
          setCustomText('');
        }
        if (e.key === 'Enter' && !e.shiftKey && customText.trim()) {
          e.preventDefault();
          onCustomSubmit(customText.trim());
        }
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + totalItems) % totalItems);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % totalItems);
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex < options.length) {
            const opt = options[focusedIndex];
            onSelect(opt.id, opt.label);
          } else if (allowCustom) {
            setCustomMode(true);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onSkip();
          break;
      }
    },
    [customMode, customText, focusedIndex, onCustomSubmit, onSelect, onSkip, options, totalItems, allowCustom]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      ref={containerRef}
      className="w-full bg-white rounded-[14px] md:rounded-2xl border border-[#e0e0e0] shadow-md animate-in slide-in-from-bottom-4 fade-in duration-200"
      style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-5 pt-3 md:pt-4 pb-1.5 md:pb-2">
        <h3 className="text-[13px] md:text-[15px] font-semibold text-[#1a1a1a] tracking-tight leading-snug flex-1 pr-3">
          {question}
        </h3>
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {/* Step indicator */}
          {totalSteps && totalSteps > 1 && step && (
            <div className="flex items-center gap-1 md:gap-1.5 text-[10px] md:text-[11px] text-[#9ca3af] font-medium">
              <ChevronLeft className="w-3 h-3 md:w-3.5 md:h-3.5" />
              <span>{step} of {totalSteps}</span>
              <ChevronRight className="w-3 h-3 md:w-3.5 md:h-3.5" />
            </div>
          )}
          {/* Close */}
          <button
            onClick={onSkip}
            className="p-1 rounded-lg text-[#9ca3af] hover:text-[#1a1a1a] hover:bg-[#f5f3f0] transition-all duration-150"
          >
            <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
        </div>
      </div>

      {/* Options */}
      <div className="px-2 md:px-3 pb-1 md:pb-1.5 space-y-1">
        {options.map((opt, idx) => {
          const isFocused = focusedIndex === idx && !customMode;
          return (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id, opt.label)}
              onMouseEnter={() => setFocusedIndex(idx)}
              className={`w-full flex items-center gap-2.5 md:gap-3 px-2.5 md:px-3 py-2 md:py-2.5 rounded-xl border transition-all duration-150 text-left group ${
                isFocused
                  ? 'bg-[#f5f3f0] border-[#d1d5db] shadow-sm'
                  : 'bg-white border-[#e5e7eb] hover:bg-[#f5f3f0] hover:border-[#d1d5db]'
              }`}
            >
              {/* Number badge */}
            

              {/* Label + description */}
              <div className="flex-1 min-w-0">
                <span className="text-[12px] md:text-[13px] font-medium text-[#1a1a1a] leading-tight">
                  {opt.label}
                </span>
                {opt.description && (
                  <span className="hidden md:inline text-[13px] text-[#9ca3af] ml-1.5">
                    &mdash; {opt.description}
                  </span>
                )}
              </div>

              {/* Arrow — hidden on mobile */}
              <ArrowRight
                className={`hidden md:block w-4 h-4 shrink-0 transition-all duration-150 ${
                  isFocused ? 'text-[#1a1a1a] opacity-100 translate-x-0' : 'text-[#9ca3af] opacity-0 -translate-x-1'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Bottom row: Something else + Skip */}
      {(allowCustom || allowSkip) && (
        <div className="px-2 md:px-3 pb-2.5 md:pb-3 pt-0.5">
          <div className="border-t border-[#e5e7eb] pt-2 flex items-center justify-between">
            {allowCustom && !customMode && (
              <button
                onClick={() => {
                  setFocusedIndex(options.length);
                  setCustomMode(true);
                }}
                onMouseEnter={() => setFocusedIndex(options.length)}
                className={`flex items-center gap-2 md:gap-2.5 px-2 md:px-3 py-2 rounded-xl transition-all duration-150 ${
                  focusedIndex === options.length && !customMode
                    ? 'bg-[#f5f3f0]'
                    : 'hover:bg-[#f5f3f0]'
                }`}
              >
                <span className="w-6 h-6 md:w-7 md:h-7 rounded-lg bg-[#f0f0f0] flex items-center justify-center shrink-0">
                  <Pencil className="w-3 h-3 md:w-3.5 md:h-3.5 text-[#9ca3af]" />
                </span>
                <span className="text-[12px] md:text-[13px] text-[#9ca3af] font-medium">Something else</span>
              </button>
            )}

            {/* Inline custom input */}
            {allowCustom && customMode && (
              <div className="flex-1 flex items-center gap-2">
                <span className="w-6 h-6 md:w-7 md:h-7 rounded-lg bg-[#f0f0f0] flex items-center justify-center shrink-0">
                  <Pencil className="w-3 h-3 md:w-3.5 md:h-3.5 text-[#9ca3af]" />
                </span>
                <textarea
                  ref={customInputRef}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && customText.trim()) {
                      e.preventDefault();
                      onCustomSubmit(customText.trim());
                    }
                    if (e.key === 'Escape') {
                      setCustomMode(false);
                      setCustomText('');
                    }
                  }}
                  placeholder="Type your answer..."
                  rows={1}
                  className="flex-1 text-[12px] md:text-[13px] font-medium text-[#1a1a1a] placeholder:text-[#c5c5c5] bg-transparent border-none outline-none resize-none py-2"
                  style={{ lineHeight: '1.4' }}
                />
                <button
                  onClick={() => {
                    if (customText.trim()) onCustomSubmit(customText.trim());
                  }}
                  disabled={!customText.trim()}
                  className="w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center transition-all duration-150 disabled:opacity-30"
                  style={{ backgroundColor: customText.trim() ? accentColor : '#e5e7eb' }}
                >
                  <ArrowRight className="w-3 h-3 md:w-3.5 md:h-3.5 text-white" />
                </button>
              </div>
            )}

            {!allowCustom && <div />}

            {allowSkip && (
              <button
                onClick={onSkip}
                className="text-[12px] md:text-[13px] font-medium text-[#9ca3af] hover:text-[#1a1a1a] px-2 md:px-3 py-2 rounded-lg hover:bg-[#f5f3f0] transition-all duration-150"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
