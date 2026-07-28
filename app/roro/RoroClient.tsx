'use client';

import dynamic from 'next/dynamic';
import { LoadingState } from '@/components/dashboard/shared/LoadingState';

const RoroChat = dynamic(
  () => import('@/components/dashboard/RoroChat').then((m) => ({ default: m.RoroChat })),
  { ssr: false, loading: () => <LoadingState /> }
);

export default function RoroClient() {
  return <RoroChat />;
}
