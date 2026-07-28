'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

/* ─────────────────────────────────────────────
 * Hook: detects text selection within a container
 * ───────────────────────────────────────────── */

interface UseTextSelectionQuoteOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
}

export function useTextSelectionQuote({ containerRef, enabled = true }: UseTextSelectionQuoteOptions) {
  const [quotedText, setQuotedText] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearQuote = useCallback(() => {
    setQuotedText('');
    window.getSelection()?.removeAllRanges();
  }, []);

  const checkSelection = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const text = selection.toString().trim();
    if (text.length < 3) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    setQuotedText(text);
  }, [containerRef]);

  // Desktop: mouseup
  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;
    const handleMouseUp = () => requestAnimationFrame(() => checkSelection());
    container.addEventListener('mouseup', handleMouseUp);
    return () => container.removeEventListener('mouseup', handleMouseUp);
  }, [containerRef, enabled, checkSelection]);

  // Mobile: selectionchange (long-press highlight)
  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;
    const handleSelectionChange = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => checkSelection(), 150);
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [containerRef, enabled, checkSelection]);

  // Clear when selection is lost
  useEffect(() => {
    if (!enabled || !quotedText) return;
    const handleMouseDown = () => {
      requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) setQuotedText('');
      });
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleMouseDown), 100);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleMouseDown); };
  }, [enabled, quotedText]);

  return { quotedText, clearQuote };
}

/* ─────────────────────────────────────────────
 * Component: floating "Ask Oracle" near the selection
 * ───────────────────────────────────────────── */

interface AskOracleTooltipProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onAskOracle: (selectedText: string) => void;
}

export function AskOracleTooltip({ containerRef, onAskOracle }: AskOracleTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState('');
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }, []);

  const hide = useCallback(() => { clearHideTimer(); setVisible(false); setSelectedText(''); }, [clearHideTimer]);

  const showTooltip = useCallback((text: string, rect: DOMRect) => {
    if (!text.trim() || text.trim().length < 3) { hide(); return; }
    clearHideTimer();
    const tooltipWidth = 130;
    let x = rect.left + rect.width / 2 - tooltipWidth / 2;
    const y = rect.top - 44;
    x = Math.max(8, Math.min(x, window.innerWidth - tooltipWidth - 8));
    setSelectedText(text.trim());
    setPosition({ x, y: Math.max(8, y) });
    setVisible(true);
  }, [hide, clearHideTimer]);

  // Desktop: mouseup
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleMouseUp = () => {
      requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return;
        const text = selection.toString();
        const range = selection.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) return;
        showTooltip(text, range.getBoundingClientRect());
      });
    };
    container.addEventListener('mouseup', handleMouseUp);
    return () => container.removeEventListener('mouseup', handleMouseUp);
  }, [containerRef, showTooltip]);

  // Mobile: selectionchange
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        clearHideTimer();
        hideTimer.current = setTimeout(() => hide(), 300);
        return;
      }
      const text = selection.toString();
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      showTooltip(text, range.getBoundingClientRect());
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [containerRef, showTooltip, hide, clearHideTimer]);

  // Hide on click outside
  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current?.contains(e.target as Node)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      hide();
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 100);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleClickOutside); };
  }, [visible, hide]);

  const handleClick = useCallback(() => {
    onAskOracle(selectedText);
    window.getSelection()?.removeAllRanges();
    hide();
  }, [selectedText, onAskOracle, hide]);

  if (!visible) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-[9999] animate-in fade-in zoom-in-95 duration-150"
      style={{ left: position.x, top: position.y, pointerEvents: 'auto' }}
    >
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#6366f1] text-white text-[11px] font-semibold rounded-lg shadow-lg border border-white/10 transition-all duration-150 hover:scale-105 active:scale-95 whitespace-nowrap"
        style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Ask Oracle
      </button>
    </div>,
    document.body
  );
}
