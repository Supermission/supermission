'use client';

import dynamic from 'next/dynamic';
import { LoadingState } from '@/components/dashboard/shared/LoadingState';

const DashboardTerminal = dynamic(
  () => import('@/components/dashboard/DashboardTerminal'),
  {
    ssr: false,
    loading: () => <LoadingState />
  }
);

export default function DashboardClient() {
  return <DashboardTerminal />;
}
