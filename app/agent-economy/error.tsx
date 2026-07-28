// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/analytics/posthog';

const fontStyle = { fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" } as const;

export default function AgentEconomyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError('AgentEconomy', error);
  }, [error]);

  return (
    <div className="flex flex-col items-start justify-center min-h-[60vh] gap-6" style={fontStyle}>
      <div className="text-[13px] text-[#6b7280]">
        Error
      </div>
      <h1 className="text-3xl font-bold text-[#3a3a3a]">
        Something went wrong
      </h1>
      <p className="text-[14px] text-[#48484b] max-w-md leading-relaxed">
        {error.message || 'An unexpected error occurred. The rest of the platform is unaffected.'}
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[14px] font-medium rounded-[8px] hover:opacity-90 transition-opacity"
          style={fontStyle}
        >
          Try again
        </button>
        <a
          href="/agent-economy"
          className="px-5 py-2.5 border border-[#e7e9eb] text-[14px] font-medium text-[#3a3a3a] rounded-[8px] hover:bg-[#f1f3f4] transition-colors"
          style={fontStyle}
        >
          Back to overview
        </a>
      </div>
      {error.digest && (
        <p className="text-[12px] text-[#6b7280]">
          Ref: {error.digest}
        </p>
      )}
    </div>
  );
}
