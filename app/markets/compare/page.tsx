import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ComparisonViewClient } from './ComparisonViewClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Compare Markets | Prediction Market Terminal',
  description: 'Side-by-side comparison of prediction market prices, volume, and liquidity.',
};

export default function CompareMarketsPage() {
  return (
    <Suspense fallback={null}>
      <ComparisonViewClient />
    </Suspense>
  );
}
