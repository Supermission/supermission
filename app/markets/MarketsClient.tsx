'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';

// Read dark mode synchronously from localStorage - works on client only
const getSnapshot = () => {
  try {
    return localStorage.getItem('sm:markets-dark-mode') === '1';
  } catch {
    return false;
  }
};
const getServerSnapshot = () => false;
const subscribe = () => () => {}; // No-op, we just need the initial read

/**
 * MarketTerminalLoading
 *
 * Skeleton loader that reads dark mode from localStorage synchronously
 * using useSyncExternalStore to prevent hydration mismatch.
 */
function MarketTerminalLoading() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className={`flex flex-1 flex-col transition-colors ${dark ? 'bg-[#121212] text-white' : 'bg-white text-[#1a1a1a]'}`}>
      <div className={`flex items-center gap-3 border-b px-4 py-3 ${dark ? 'border-white/[0.08]' : 'border-[#e5e7eb]'}`}>
        <div className={`h-5 w-32 animate-pulse rounded-[4px] ${dark ? 'bg-white/[0.12]' : 'bg-black/[0.08]'}`} />
        <div className="ml-auto flex gap-2">
          <div className={`h-7 w-20 animate-pulse rounded-[6px] ${dark ? 'bg-white/[0.08]' : 'bg-black/[0.06]'}`} />
          <div className={`h-7 w-20 animate-pulse rounded-[6px] ${dark ? 'bg-white/[0.08]' : 'bg-black/[0.06]'}`} />
          <div className={`h-7 w-20 animate-pulse rounded-[6px] ${dark ? 'bg-white/[0.08]' : 'bg-black/[0.06]'}`} />
        </div>
      </div>
      <div className="flex-1 p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className={`h-3 w-3 animate-spin rounded-full border-2 border-t-transparent ${dark ? 'border-white/20 border-t-white/70' : 'border-black/20 border-t-black/70'}`} />
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${dark ? 'text-white/62' : 'text-black/55'}`}>
            Loading markets
          </span>
          <div className={`h-px flex-1 ${dark ? 'bg-white/[0.08]' : 'bg-black/[0.08]'}`} />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={`animate-pulse rounded-[8px] border ${dark ? 'border-white/[0.12] bg-white/[0.045]' : 'border-black/[0.08] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}`}
            >
              <div className="p-4 pb-3">
                <div className={`mb-2 h-4 w-[85%] rounded-[4px] ${dark ? 'bg-white/[0.12]' : 'bg-black/[0.09]'}`} />
                <div className={`mb-3 h-4 w-[60%] rounded-[4px] ${dark ? 'bg-white/[0.1]' : 'bg-black/[0.07]'}`} />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`h-3 w-8 rounded-[4px] ${dark ? 'bg-white/[0.09]' : 'bg-black/[0.07]'}`} />
                    <div className={`h-[6px] flex-1 rounded-[4px] ${dark ? 'bg-white/[0.08]' : 'bg-black/[0.06]'}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`h-3 w-8 rounded-[4px] ${dark ? 'bg-white/[0.09]' : 'bg-black/[0.07]'}`} />
                    <div className={`h-[6px] flex-1 rounded-[4px] ${dark ? 'bg-white/[0.08]' : 'bg-black/[0.06]'}`} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 px-4 pb-4 pt-1">
                <div className={`h-9 flex-1 rounded-[6px] ${dark ? 'bg-emerald-400/14' : 'bg-emerald-100'}`} />
                <div className={`h-9 flex-1 rounded-[6px] ${dark ? 'bg-rose-400/14' : 'bg-rose-100'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const MarketTerminal = dynamic(
  () => import('@/components/markets/MarketTerminal').then(mod => ({ default: mod.MarketTerminal })),
  {
    ssr: false,
    loading: () => <MarketTerminalLoading />,
  }
);

export default function MarketsClient() {
  return <MarketTerminal />;
}
