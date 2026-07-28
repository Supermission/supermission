'use client';

import { useRouter } from 'next/navigation';

export interface OraclePosition {
  condition_id: string;
  question: string;
  outcome: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  slug?: string;
}

interface PositionCardsProps {
  positions: OraclePosition[];
}

export function PositionCards({ positions }: PositionCardsProps) {
  const router = useRouter();

  if (!positions?.length) {
    return (
      <div className="border border-[#e5e7eb] rounded-[12px] p-4 text-center">
        <p className="font-mono text-xs text-[#6b7280]">No active positions</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-2">
      {positions.map((pos) => {
        const isPositive = pos.cashPnl >= 0;
        const pnlColor = isPositive ? 'text-emerald-600' : 'text-red-500';
        const pnlBg = isPositive ? 'bg-emerald-50' : 'bg-red-50';
        const arrow = isPositive ? '\u2191' : '\u2193';
        const sideBadgeBg =
          pos.outcome === 'Yes' || pos.outcome === 'YES'
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-red-100 text-red-700';

        return (
          <button
            key={pos.condition_id}
            onClick={() => {
              if (pos.slug) router.push(`/markets/${pos.slug}`);
            }}
            className="border border-[#e5e7eb] rounded-[12px] p-4 text-left hover:shadow-md transition-shadow bg-white cursor-pointer"
          >
            <p
              className="text-[13px] font-semibold text-[#3a3a3a] line-clamp-2 mb-2"
              style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
            >
              {pos.question}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sideBadgeBg}`}
              >
                {pos.outcome}
              </span>
              <span className="font-mono text-[11px] text-[#6b7280]">
                {pos.avgPrice.toFixed(2)} &rarr; {pos.curPrice.toFixed(2)}
              </span>
              <span className={`font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded ${pnlBg} ${pnlColor}`}>
                {arrow} ${Math.abs(pos.cashPnl).toFixed(2)} ({pos.percentPnl >= 0 ? '+' : ''}{pos.percentPnl.toFixed(1)}%)
              </span>
            </div>
            <p className="font-mono text-[10px] text-[#6b7280] mt-1">
              {pos.size.toFixed(2)} shares &middot; ${pos.currentValue.toFixed(2)} value
            </p>
          </button>
        );
      })}
    </div>
  );
}
