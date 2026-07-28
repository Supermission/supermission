import { Metadata } from 'next';
import { Suspense } from 'react';
import PerpsClient from './PerpsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Perpetual Markets | SUPERMISSION',
  description:
    'Trade perpetual futures on Hyperliquid with AI-powered analysis, real-time order books, and up to 50x leverage.',
  openGraph: {
    title: 'Perpetual Markets | SUPERMISSION',
    description:
      'Live perpetual futures terminal with real-time Hyperliquid data, AI signals, and autonomous trading.',
    url: 'https://supermission.fun/perps',
  },
  alternates: {
    canonical: 'https://supermission.fun/perps',
  },
};

export default function PerpsPage() {
  return (
    <Suspense fallback={null}>
      <PerpsClient />
    </Suspense>
  );
}
