'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Skeleton — the single shared loading primitive for the whole app.
 *
 * ONE consistent look everywhere: rounded, calm pulse, theme-aware.
 * Light default (`bg-[#eceef1]`), dark via `dark:bg-white/[0.06]` so it reads
 * correctly inside the `.dark` theme scopes (defai / markets / perps).
 *
 * Compose page-level loaders out of <Skeleton>, <SkeletonText> and
 * <SkeletonCard> so every skeleton shares the exact same shimmer, color and
 * radius. Do not reintroduce ad-hoc `bg-gray-200` / `animate-pulse` blocks.
 */

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-[6px] bg-[#eceef1] dark:bg-white/[0.06]',
        className
      )}
      {...props}
    />
  );
}

interface SkeletonTextProps {
  /** Number of lines to render. */
  lines?: number;
  className?: string;
  lineClassName?: string;
}

/**
 * SkeletonText — a stack of text lines with a naturally shorter last line.
 */
export function SkeletonText({ lines = 3, className, lineClassName }: SkeletonTextProps) {
  const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-3/4', 'w-2/3', 'w-1/2'];
  return (
    <div className={cn('space-y-2.5', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-3',
            // Last line is shorter for a natural paragraph rag.
            i === lines - 1 ? 'w-1/2' : widths[Math.min(i, widths.length - 2)],
            lineClassName
          )}
        />
      ))}
    </div>
  );
}

interface SkeletonCardProps {
  className?: string;
  /** Number of body text lines. */
  lines?: number;
  children?: React.ReactNode;
}

/**
 * SkeletonCard — a bordered card shell containing a title bar + text lines,
 * matching the app's card visual language. Pass `children` to override the body.
 */
export function SkeletonCard({ className, lines = 3, children }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'rounded-[16px] border border-[#e5e7eb] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]',
        'dark:border-white/[0.08] dark:bg-white/[0.02] dark:shadow-none',
        className
      )}
    >
      {children ?? (
        <>
          <Skeleton className="mb-4 h-6 w-32" />
          <SkeletonText lines={lines} />
        </>
      )}
    </div>
  );
}
