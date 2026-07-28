'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/shared/Skeleton';

interface MessageSkeletonProps {
  isUser?: boolean;
}

export const MessageSkeleton = React.memo(function MessageSkeleton({ isUser = false }: MessageSkeletonProps) {
  return (
    <div className={cn('flex w-full mb-4', isUser ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[90%] md:max-w-[75%] w-full">
        <div className="px-4 py-3 border border-[#e5e7eb] bg-white rounded-[12px] dark:border-white/[0.08] dark:bg-white/[0.02]">
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            {!isUser && <Skeleton className="h-3 w-4/6" />}
          </div>
        </div>
        {/* Timestamp skeleton */}
        <div className="mt-1 px-1">
          <Skeleton className="h-2 w-12" />
        </div>
      </div>
    </div>
  );
});
