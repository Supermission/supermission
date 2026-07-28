'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTradingStore } from '@/lib/store/trading';
import { ComparisonView } from '@/components/markets/ComparisonView';

export function ComparisonViewClient() {
  const searchParams = useSearchParams();
  const setActiveComparisonIds = useTradingStore((s) => s.setActiveComparisonIds);
  const initialized = useRef(false);

  // Hydrate comparison IDs from URL on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const idsParam = searchParams.get('ids');
    if (idsParam) {
      const ids = idsParam
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 4);

      if (ids.length > 0) {
        setActiveComparisonIds(ids);
      }
    }
  }, [searchParams, setActiveComparisonIds]);

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-lg font-mono font-bold text-zinc-100 tracking-tight">
            Market Comparison
          </h1>
          <p className="text-xs font-mono text-zinc-500 mt-1">
            Compare up to 4 prediction markets side by side
          </p>
        </div>

        <ComparisonView />
      </div>
    </div>
  );
}
