import { GridSkeleton } from '@/components/shared/GridSkeleton';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <GridSkeleton />
    </div>
  );
}
