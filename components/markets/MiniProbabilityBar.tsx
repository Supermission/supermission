'use client';

import { motion } from 'framer-motion';

const FONT = "var(--font-bricolage, 'Bricolage Grotesque', sans-serif)";

interface MiniProbabilityBarProps {
  yesPercent: number;
  noPercent: number;
  yesLabel?: string;
  noLabel?: string;
}

export function MiniProbabilityBar({ yesPercent, noPercent, yesLabel = 'Yes', noLabel = 'No' }: MiniProbabilityBarProps) {
  return (
    <div className="space-y-2">
      {/* Yes bar */}
      <div className="flex items-center gap-2.5">
        <span
          className="text-[12px] font-bold text-emerald-600 tabular-nums w-[52px] text-right flex-shrink-0"
          style={{ fontFamily: FONT }}
        >
          {yesPercent.toFixed(2)}%
        </span>
        <div className="flex-1 h-[8px] bg-[#f1f3f4] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-emerald-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(yesPercent, 1)}%` }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <span className="text-[11px] font-semibold text-[#9ca3af] w-10 truncate flex-shrink-0" style={{ fontFamily: FONT }}>
          {yesLabel}
        </span>
      </div>

      {/* No bar */}
      <div className="flex items-center gap-2.5">
        <span
          className="text-[12px] font-bold text-rose-500 tabular-nums w-[52px] text-right flex-shrink-0"
          style={{ fontFamily: FONT }}
        >
          {noPercent.toFixed(2)}%
        </span>
        <div className="flex-1 h-[8px] bg-[#f1f3f4] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-rose-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(noPercent, 1)}%` }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
          />
        </div>
        <span className="text-[11px] font-semibold text-[#9ca3af] w-10 truncate flex-shrink-0" style={{ fontFamily: FONT }}>
          {noLabel}
        </span>
      </div>
    </div>
  );
}
