'use client';

import { useState, useEffect } from 'react';
import { formatFundingRate, timeToNextFunding } from '@/lib/hyperliquid/utils';

interface PerpsFundingRatesProps {
  coin: string;
  funding: string;
}

export function PerpsFundingRates({ coin, funding }: PerpsFundingRatesProps) {
  const [countdown, setCountdown] = useState(timeToNextFunding());

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(timeToNextFunding());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const fundingNum = parseFloat(funding);
  const isPositive = fundingNum >= 0;

  return (
    <div className="border border-black/[0.08] rounded-[14px] bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <span
              className="text-[9px] text-[#9ca3af] uppercase tracking-wider font-medium block mb-0.5"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              {coin} Funding Rate
            </span>
            <span
              className={`text-[16px] font-bold tabular-nums ${
                isPositive ? 'text-emerald-600' : 'text-rose-500'
              }`}
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              {formatFundingRate(funding)}
            </span>
          </div>

          <div className="h-8 w-px bg-[#e5e7eb]" />

          <div>
            <span
              className="text-[9px] text-[#9ca3af] uppercase tracking-wider font-medium block mb-0.5"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              Next Funding
            </span>
            <span
              className="text-[14px] font-bold text-[#1a1a1a] tabular-nums"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              {countdown.hours}h {String(countdown.minutes).padStart(2, '0')}m{' '}
              {String(countdown.seconds).padStart(2, '0')}s
            </span>
          </div>
        </div>

        <span
          className="text-[9px] text-[#9ca3af] max-w-[140px] text-right leading-tight"
          style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
        >
          Positive = longs pay shorts
        </span>
      </div>
    </div>
  );
}
