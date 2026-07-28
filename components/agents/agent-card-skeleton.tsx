'use client';

import React from 'react';
import { Skeleton } from '@/components/shared/Skeleton';

export const AgentCardSkeleton = React.memo(function AgentCardSkeleton() {
  return (
    <div className="border border-[#e5e7eb] p-4 bg-white rounded-lg dark:border-white/[0.08] dark:bg-white/[0.02]">
      {/* Line 1: Name + Availability + Score */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-6" />
          <Skeleton className="w-2 h-2 rounded-full" />
        </div>
      </div>

      {/* Line 2: Stats Bar */}
      <div className="mb-3">
        <Skeleton className="h-3 w-1/2" />
      </div>

      {/* Line 3: Capabilities */}
      <div className="flex items-center gap-1 flex-wrap mb-3 min-h-[20px]">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-14" />
      </div>

      {/* Line 4: Price */}
      <div className="mb-4">
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Divider */}
      <div className="border-t border-[#e5e7eb] dark:border-white/[0.08] mb-3" />

      {/* Address */}
      <div className="mb-3">
        <Skeleton className="h-2 w-12 mb-1" />
        <Skeleton className="h-7 w-full" />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Skeleton className="flex-1 h-8" />
        <Skeleton className="flex-1 h-8" />
      </div>
    </div>
  );
});
