'use client';

import { useMemo } from 'react';
import { useOrderBook } from '@/lib/hooks/use-orderbook';

interface SpreadIndicatorProps {
  tokenId: string;
}

export default function SpreadIndicator({ tokenId }: SpreadIndicatorProps) {
  const { spread, loading, error } = useOrderBook(tokenId);

  const { bps, colorClass, bgClass } = useMemo(() => {
    if (!spread || spread.bidPrice === 0 || spread.askPrice === 0) {
      return { bps: null, colorClass: 'text-[#9ca3af]', bgClass: 'bg-[#f8fafc]' };
    }

    const mid = (spread.bidPrice + spread.askPrice) / 2;
    const basisPoints = mid > 0 ? (spread.spread / mid) * 10000 : 0;

    if (basisPoints < 50) {
      return { bps: basisPoints, colorClass: 'text-emerald-700', bgClass: 'bg-emerald-50 border-emerald-200/50' };
    } else if (basisPoints <= 200) {
      return { bps: basisPoints, colorClass: 'text-amber-700', bgClass: 'bg-amber-50 border-amber-200/50' };
    } else {
      return { bps: basisPoints, colorClass: 'text-rose-600', bgClass: 'bg-rose-50 border-rose-200/50' };
    }
  }, [spread]);

  if (loading && !spread) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 border border-[#e5e7eb] bg-[#f7f7f7] rounded-md">
        <span className="h-3 w-14 bg-[#f8fafc] animate-pulse" />
      </span>
    );
  }

  if (error && !spread) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 border border-[#e5e7eb] text-black/30 text-[10px] font-mono rounded-md">
        Spread: --
      </span>
    );
  }

  if (bps === null) return null;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-[3px] border text-[10px] font-mono rounded-md ${colorClass} ${bgClass}`}>
      <span className="text-[#9ca3af] font-semibold">Spread:</span>
      <span className="font-bold tabular-nums">{bps.toFixed(1)} bps</span>
    </span>
  );
}
