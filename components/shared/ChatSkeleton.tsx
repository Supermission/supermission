'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/shared/Skeleton';
import { MessageSkeleton } from '@/components/chat/message-skeleton';

interface ChatSkeletonProps {
  className?: string;
}

/**
 * ChatSkeleton — a single-column chat surface: a scrollable stack of
 * assistant/user message bubbles above a fixed bottom composer bar. Used by the
 * chat route loaders (/chat, /defai) so the fallback matches the real chat
 * shape instead of a card grid. Theme-aware via the shared <Skeleton> primitive.
 */
export function ChatSkeleton({ className }: ChatSkeletonProps) {
  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      {/* Message stream */}
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <MessageSkeleton />
          <MessageSkeleton isUser />
          <MessageSkeleton />
        </div>
      </div>

      {/* Bottom composer bar */}
      <div className="w-full pb-6 pt-2">
        <div className="mx-auto w-full max-w-3xl px-4">
          <div className="flex items-center gap-3 rounded-[16px] border border-[#e5e7eb] bg-white p-3 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] dark:border-white/[0.08] dark:bg-white/[0.02] dark:shadow-none">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-9 shrink-0 rounded-[10px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
