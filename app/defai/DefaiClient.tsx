'use client';

import dynamic from 'next/dynamic';
import { LoadingState } from '@/components/dashboard/shared/LoadingState';

const DelphiChat = dynamic(
  () => import('@/components/dashboard/DelphiChat'),
  { ssr: false, loading: () => <LoadingState /> }
);

export default function DefaiClient() {
  return <DelphiChat />;
}
