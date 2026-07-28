'use client';

import dynamic from 'next/dynamic';

const PerpsMarketGrid = dynamic(
  () =>
    import('@/components/perps/PerpsMarketGrid').then((mod) => ({
      default: mod.PerpsMarketGrid,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex flex-col">
        {/* Header skeleton */}
        <div className="perps-skeleton-border flex items-center gap-3 px-4 sm:px-6 md:px-8 py-3 border-b">
          <div className="perps-skeleton-bg h-5 w-32 rounded-[4px] animate-pulse" />
          <div className="flex gap-2 ml-auto">
            <div className="perps-skeleton-bg-light h-8 w-20 rounded-[8px] animate-pulse" />
            <div className="perps-skeleton-bg-light h-8 w-20 rounded-[8px] animate-pulse" />
            <div className="perps-skeleton-bg-light h-8 w-20 rounded-[8px] animate-pulse" />
          </div>
        </div>
        {/* Grid skeleton */}
        <div className="flex-1 px-4 sm:px-6 md:px-8 py-4 sm:py-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="perps-skeleton-spinner h-3 w-3 border-2 rounded-full animate-spin" />
            <span
              className="perps-skeleton-text text-[10px] font-semibold tracking-wider uppercase"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              Loading markets
            </span>
            <div className="perps-skeleton-line flex-1 h-px" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="perps-skeleton-card border rounded-[14px] p-4 animate-pulse"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="perps-skeleton-bg h-5 w-16 rounded-[4px]" />
                  <div className="perps-skeleton-bg-light h-4 w-10 rounded-[4px]" />
                </div>
                <div className="flex items-baseline justify-between mb-3">
                  <div className="perps-skeleton-bg h-6 w-28 rounded-[4px]" />
                  <div className="perps-skeleton-bg-light h-4 w-16 rounded-[4px]" />
                </div>
                <div className="perps-skeleton-line h-3 w-40 rounded-[4px] mb-2" />
                <div className="perps-skeleton-line h-3 w-36 rounded-[4px] mb-4" />
                <div className="flex gap-2">
                  <div className="flex-1 h-9 bg-emerald-100/60 rounded-[8px]" />
                  <div className="flex-1 h-9 bg-rose-100/60 rounded-[8px]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
);

export default function PerpsClient() {
  return <PerpsMarketGrid />;
}
