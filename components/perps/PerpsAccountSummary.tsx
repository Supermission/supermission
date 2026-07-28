'use client';

import { useHLAccount } from '@/lib/hyperliquid/hooks';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

export function PerpsAccountSummary() {
  const { equity, availableMargin, marginUsed, totalPnl } = useHLAccount();

  // Don't show if no account data
  if (equity === 0 && marginUsed === 0) return null;

  const usedPct = equity > 0 ? (marginUsed / equity) * 100 : 0;
  const isPnlPositive = totalPnl >= 0;

  return (
    <div className="border-b border-[#e5e7eb] bg-[#fafafa]">
      <div className="flex items-center gap-1.5 px-3 sm:px-4 md:px-6 h-[40px] overflow-x-auto">
        <span className="text-[11px] text-[#9ca3af] flex-shrink-0" style={{ fontFamily: FONT }}>
          Equity
        </span>
        <span className="text-[12px] text-[#1a1a1a] font-semibold tabular-nums flex-shrink-0" style={{ fontFamily: FONT }}>
          ${equity.toFixed(2)}
        </span>

        <span className="text-[#d1d5db] mx-0.5 flex-shrink-0">·</span>

        <span className="text-[11px] text-[#9ca3af] flex-shrink-0" style={{ fontFamily: FONT }}>
          Available
        </span>
        <span className="text-[12px] text-[#1a1a1a] font-semibold tabular-nums flex-shrink-0" style={{ fontFamily: FONT }}>
          ${availableMargin.toFixed(2)}
        </span>

        <span className="text-[#d1d5db] mx-0.5 flex-shrink-0">·</span>

        <span className="text-[11px] text-[#9ca3af] flex-shrink-0" style={{ fontFamily: FONT }}>
          Used
        </span>
        <span className="text-[12px] text-[#1a1a1a] font-semibold tabular-nums flex-shrink-0" style={{ fontFamily: FONT }}>
          {usedPct.toFixed(1)}%
        </span>

        <span className="text-[#d1d5db] mx-0.5 flex-shrink-0">·</span>

        <span className="text-[11px] text-[#9ca3af] flex-shrink-0" style={{ fontFamily: FONT }}>
          uPnL
        </span>
        <span
          className={`text-[12px] font-semibold tabular-nums flex-shrink-0 ${
            isPnlPositive ? 'text-emerald-600' : 'text-rose-500'
          }`}
          style={{ fontFamily: FONT }}
        >
          {isPnlPositive ? '+' : '-'}${Math.abs(totalPnl).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
