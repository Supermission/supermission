'use client';

import dynamic from 'next/dynamic';
import type { CandleInterval } from '@/lib/hyperliquid/constants';

const PerpsChartInner = dynamic(() => import('./PerpsChartInner'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 min-h-[360px] bg-[#fafafa] rounded-[14px] border border-black/[0.08] flex items-center justify-center">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 border-2 border-black/20 border-t-black/60 rounded-full animate-spin" />
        <span
          className="text-[10px] font-semibold text-black/30 tracking-wider uppercase"
          style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
        >
          Loading chart
        </span>
      </div>
    </div>
  ),
});

interface PerpsChartProps {
  coin: string;
  externalInterval?: CandleInterval;
  onIntervalChange?: (interval: CandleInterval) => void;
  hideIntervalBar?: boolean;
}

export default function PerpsChart({ coin, externalInterval, onIntervalChange, hideIntervalBar }: PerpsChartProps) {
  return <PerpsChartInner coin={coin} externalInterval={externalInterval} onIntervalChange={onIntervalChange} hideIntervalBar={hideIntervalBar} />;
}
