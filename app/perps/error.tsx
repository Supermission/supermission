'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/analytics/posthog';

export default function PerpsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError('Perps', error);
  }, [error]);

  return (
    <div className="min-h-dvh bg-[#fafafa] flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <p className="text-[13px] font-bold text-black/70 mb-2">
          Something went wrong
        </p>
        <p className="text-[11px] text-black/40 mb-6">
          {error.message || 'An unexpected error occurred loading perps.'}
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-xl text-[12px] font-bold text-white bg-black hover:bg-black/80 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
