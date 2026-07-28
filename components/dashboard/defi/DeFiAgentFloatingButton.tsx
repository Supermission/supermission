'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * Floating chat button that navigates to the /defai DeFi agent page.
 */
export function DeFiAgentFloatingButton() {
  const router = useRouter();
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = () => {
    router.push('/defai');
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 md:bottom-8 md:right-8">
      {showTooltip && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[10px] uppercase tracking-wider whitespace-nowrap rounded-[8px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Ask the DeFi Agent
          <div className="absolute top-full right-4 w-2 h-2 bg-[#3b3b3b] rotate-45 -mt-1" />
        </div>
      )}
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="w-12 h-12 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white flex items-center justify-center rounded-[12px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] hover:opacity-90 transition-all"
      >
        <MessageSquare size={20} />
      </button>
    </div>
  );
}
