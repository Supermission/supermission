'use client';

import React from 'react';
import Image from 'next/image';
import { TypingAnimation } from '@/components/ui/typing-animation';

interface OracleLoadingSkeletonProps {
  statusMessage?: string;
}

export const OracleLoadingSkeleton = React.memo(function OracleLoadingSkeleton({
  statusMessage = 'Thinking...',
}: OracleLoadingSkeletonProps) {
  return (
    <div className="flex w-full mb-4 justify-start animate-in fade-in duration-300">
      <div className="max-w-[90%] md:max-w-[75%]">
        {/* AI indicator */}
        <div className="flex items-center gap-2 mb-2">
          <Image src="/new.png" alt="Supermission" width={20} height={20} className="w-5 h-5 rounded-[6px] object-contain dark:invert" />
          <span className="text-[11px] font-semibold text-[#6b7280] font-bricolage">Supermission</span>
        </div>

        {/* Clean, minimal thinking indicator — animated dot + status text, no placeholder card */}
        <div className="flex items-center gap-2.5">
          <span className="relative flex items-center justify-center w-4 h-4">
            <span className="absolute w-3.5 h-3.5 bg-[#1a1a1a] dark:bg-white rounded-full opacity-20 animate-ping" />
            <span className="w-2 h-2 bg-[#1a1a1a] dark:bg-white rounded-full" />
          </span>
          <TypingAnimation
            className="text-[13px] text-[#6b7280] font-bricolage"
            duration={30}
            showCursor={false}
            as="span"
          >
            {statusMessage}
          </TypingAnimation>
        </div>
      </div>
    </div>
  );
});
