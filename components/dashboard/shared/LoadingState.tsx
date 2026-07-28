'use client';

import { Skeleton, SkeletonCard } from '@/components/shared/Skeleton';

/**
 * LoadingState — generic "nav + card grid" loading surface used as an in-page
 * fallback by the dashboard/roro/defai clients. Built on the shared <Skeleton>
 * primitive so it matches every other skeleton's shimmer/color/radius.
 *
 * Note: the route-level loaders (app/.../loading.tsx) use the layout-specific
 * ChatSkeleton / GridSkeleton instead of this.
 */
export function LoadingState() {
  return (
    <div className="space-y-6">
      {/* Navigation skeleton */}
      <div className="flex gap-4 border-b border-[#e5e7eb] pb-4 dark:border-white/[0.08]">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

export function CardLoadingSkeleton() {
  return <SkeletonCard />;
}
