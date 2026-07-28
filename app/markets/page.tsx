import { Metadata } from 'next';
import { Suspense } from 'react';
import MarketsClient from './MarketsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Prediction Markets | SUPERMISSION',
  description: 'AI-powered prediction market terminal. Trade on real-world outcomes with live Polymarket data, AI analysis, and autonomous agent execution on Base.',
  openGraph: {
    title: 'Prediction Markets | SUPERMISSION',
    description: 'Live prediction market terminal with AI analysis and autonomous trading on Base blockchain.',
    url: 'https://supermission.fun/markets',
  },
  alternates: {
    canonical: 'https://supermission.fun/markets',
  },
};

export default function MarketsPage() {
  return (
    <Suspense fallback={null}>
      <MarketsClient />
    </Suspense>
  );
}
