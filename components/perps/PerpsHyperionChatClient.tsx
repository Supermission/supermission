'use client';

import dynamic from 'next/dynamic';

const PerpsHyperionChat = dynamic(
  () => import('@/components/perps/PerpsHyperionChat').then(mod => ({ default: mod.PerpsHyperionChat })),
  { ssr: false }
);

export function PerpsHyperionChatClient() {
  return <PerpsHyperionChat />;
}
