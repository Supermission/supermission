'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton, SkeletonCard } from '@/components/shared/Skeleton';

interface GridSkeletonProps {
  /** Number of cards in the grid. */
  cards?: number;
  /** Responsive grid column classes. */
  gridClassName?: string;
  className?: string;
}

/**
 * GridSkeleton — a page header row (title + tab/filter bar) above a responsive
 * card grid. Used by the dashboard and agents route loaders. Built entirely on
 * the shared <Skeleton> primitive so shimmer/color/radius match every other
 * loader.
 */
export function GridSkeleton({
  cards = 6,
  gridClassName = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  className,
}: GridSkeletonProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header row: title + tab / filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7eb] pb-4 dark:border-white/[0.08]">
        <Skeleton className="h-7 w-40" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24" />
          ))}
        </div>
      </div>

      {/* Card grid */}
      <div className={cn('grid gap-6', gridClassName)}>
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
