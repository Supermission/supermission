import { GridSkeleton } from '@/components/shared/GridSkeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="container mx-auto px-4 pt-20 pb-4 sm:pt-24">
        <GridSkeleton />
      </div>
    </div>
  );
}
