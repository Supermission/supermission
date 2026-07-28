'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import LazyMarkdown from './lazy-markdown';

interface AnimatedMarkdownProps {
  content: string;
  /**
   * Milliseconds per character — legacy prop kept for API compat. With the
   * RAF-driven animator, this is used to derive the target reveal duration
   * (chars * speed), then clamped to a visual-sweet-spot range. Default 8ms.
   */
  speed?: number;
  /** Delay before typing starts (ms) */
  delay?: number;
  /** Class applied to the wrapper div */
  className?: string;
  /** Called when typing animation completes */
  onComplete?: () => void;
  /** Custom ReactMarkdown components override */
  markdownComponents?: Record<string, any>;
}

// Clamp total animation time so we don't spend 10+ seconds fake-typing a long
// response, but also don't flash instantly on short ones. RAF naturally caps
// the update rate at display refresh (~60fps), so markdown reparses are
// bounded regardless of how fast a machine could theoretically go.
const MIN_ANIM_MS = 300;
const MAX_ANIM_MS = 2500;

/**
 * Memoised ReactMarkdown wrapper — React.memo prevents a reparse when the
 * PARENT re-renders but the visible slice of content hasn't changed.
 * Combined with the RAF driver's frame-pacing, this caps markdown parses
 * at ~60/sec instead of the old ~125/sec setTimeout cadence.
 */
const MarkdownBody = memo(function MarkdownBody({
  text,
  components,
}: {
  text: string;
  components?: Record<string, any>;
}) {
  // Strip escaped asterisks once, upstream of ReactMarkdown.
  const cleaned = useMemo(() => text.replace(/\\(\*)/g, '$1'), [text]);
  return (
    <LazyMarkdown components={components}>
      {cleaned}
    </LazyMarkdown>
  );
});

/**
 * Progressively reveals markdown content. Internally uses requestAnimationFrame
 * to pace updates at the display refresh rate, and batches character reveals
 * proportional to content length so the total animation fits in a fixed
 * time budget. This avoids the old implementation's O(N²) reparse cost
 * (every setTimeout tick reparsed the full markdown AST).
 */
export function AnimatedMarkdown({
  content,
  speed = 8,
  delay = 0,
  className,
  onComplete,
  markdownComponents,
}: AnimatedMarkdownProps) {
  const [displayedLength, setDisplayedLength] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const totalChars = useMemo(() => Array.from(content).length, [content]);

  // Reset when content changes.
  useEffect(() => {
    setDisplayedLength(0);
    setIsComplete(false);
  }, [content]);

  // RAF-driven reveal.
  useEffect(() => {
    if (totalChars === 0) {
      setIsComplete(true);
      onCompleteRef.current?.();
      return;
    }

    // Total animation budget — scales with content but clamped.
    const budgetMs = Math.min(MAX_ANIM_MS, Math.max(MIN_ANIM_MS, totalChars * speed));

    let startTime = 0;
    let rafId = 0;
    let delayId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const step = (ts: number) => {
      if (cancelled) return;
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const progress = Math.min(1, elapsed / budgetMs);
      const nextLength = Math.floor(progress * totalChars);
      // Only call setState when the frame actually advances the reveal window.
      setDisplayedLength((prev) => (nextLength > prev ? nextLength : prev));
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setIsComplete(true);
        onCompleteRef.current?.();
      }
    };

    const start = () => {
      rafId = requestAnimationFrame(step);
    };

    if (delay > 0) {
      delayId = setTimeout(start, delay);
    } else {
      start();
    }

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (delayId) clearTimeout(delayId);
    };
  }, [content, speed, delay, totalChars]);

  const visibleText = useMemo(
    () => Array.from(content).slice(0, displayedLength).join(''),
    [content, displayedLength],
  );

  return (
    <div className={className}>
      <MarkdownBody text={visibleText} components={markdownComponents} />
      {!isComplete && (
        <span className="inline-block w-[2px] h-[1em] bg-[#3a3a3a] ml-[1px] align-middle animate-blink-cursor" />
      )}
    </div>
  );
}
