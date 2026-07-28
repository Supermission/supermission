'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import { type ActiveRedirectData } from '@/lib/hooks/use-active-redirect';
import { usePendingRedirectStore } from '@/lib/store/pending-redirect';

interface AgentRedirectPromptProps {
  data: ActiveRedirectData;
  onDismiss: () => void;
  /** Called on "No" — adds a local assistant message without hitting the API */
  addLocalMessage: (msg: { role: 'assistant'; content: string }) => void;
}

export function AgentRedirectPrompt({ data, onDismiss, addLocalMessage }: AgentRedirectPromptProps) {
  const router = useRouter();
  const setPendingRedirect = usePendingRedirectStore((s) => s.setPendingRedirect);

  const handleYes = useCallback(() => {
    setPendingRedirect(data.originalMessage, data.targetAgent.id);
    router.push(data.targetAgent.path);
  }, [data, router, setPendingRedirect]);

  const handleNo = useCallback(() => {
    addLocalMessage({
      role: 'assistant',
      content: `No problem, staying right here. Let me know if you need anything else.`,
    });
    onDismiss();
  }, [addLocalMessage, onDismiss]);

  return (
    <div
      className="w-full bg-white rounded-[14px] md:rounded-2xl border border-[#e0e0e0] shadow-md animate-in slide-in-from-bottom-4 fade-in duration-200 overflow-hidden"
      style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
    >
      {/* Agent identity bar */}
      <div className="flex items-center justify-between px-3 md:px-5 pt-3 md:pt-4 pb-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] md:text-[11px] font-bold tracking-widest text-[#9ca3af] uppercase">Redirect</span>
          <span className="text-[10px] md:text-[11px] text-[#d1d5db]">/</span>
          <span className="text-[10px] md:text-[11px] font-bold tracking-widest text-[#1a1a1a] uppercase">{data.targetAgent.label}</span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded-lg text-[#9ca3af] hover:text-[#1a1a1a] hover:bg-[#f5f3f0] transition-all duration-150"
        >
          <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
        </button>
      </div>

      {/* Reason + description */}
      <div className="px-3 md:px-5 pt-2 pb-1.5">
        <p className="text-[13px] md:text-[15px] font-semibold text-[#1a1a1a] tracking-tight leading-snug">
          {data.reason}
        </p>
        <p className="text-[11px] md:text-[12px] text-[#9ca3af] mt-0.5">
          {data.targetAgent.description}
        </p>
      </div>

      {/* Original question preview */}
      {data.originalMessage && (
        <div className="mx-3 md:mx-5 mb-2 px-3 py-2 rounded-lg bg-[#f5f3f0] border border-[#e5e7eb]">
          <p className="text-[10px] md:text-[11px] font-medium text-[#9ca3af] mb-0.5">Your question</p>
          <p className="text-[12px] md:text-[13px] text-[#1a1a1a] leading-snug line-clamp-2">
            {data.originalMessage}
          </p>
        </div>
      )}

      {/* Yes / No buttons */}
      <div className="px-2 md:px-3 pb-2.5 md:pb-3 pt-1 flex items-center gap-2">
        <button
          onClick={handleYes}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#1a1a1a] text-white text-[12px] md:text-[13px] font-medium hover:bg-[#333] active:scale-[0.98] transition-all duration-150"
        >
          Yes, take me there
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleNo}
          className="flex-1 flex items-center justify-center px-3 py-2.5 rounded-xl border border-[#e5e7eb] bg-white text-[#6b7280] text-[12px] md:text-[13px] font-medium hover:bg-[#f5f3f0] hover:text-[#1a1a1a] hover:border-[#d1d5db] active:scale-[0.98] transition-all duration-150"
        >
          No, stay here
        </button>
      </div>
    </div>
  );
}
