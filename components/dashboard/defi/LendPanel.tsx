'use client';

import { useState, useCallback } from 'react';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import dynamic from 'next/dynamic';

const DeFiPositions = dynamic(
  () => import('../yields/DeFiPositions').then((mod) => ({ default: mod.DeFiPositions })),
  { loading: () => <LoadingSkeleton /> }
);
const YieldOpportunities = dynamic(
  () => import('../yields/YieldOpportunities').then((mod) => ({ default: mod.YieldOpportunities })),
  { loading: () => <LoadingSkeleton /> }
);

function LoadingSkeleton() {
  return (
    <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-gray-200 rounded w-1/4" />
        <div className="h-3 bg-gray-200 rounded w-full" />
        <div className="h-3 bg-gray-200 rounded w-5/6" />
      </div>
    </div>
  );
}

export function LendPanel() {
  const [positionsKey, setPositionsKey] = useState(0);
  const handleDepositSuccess = useCallback(() => setPositionsKey((k) => k + 1), []);

  return (
    <div className="space-y-6">
      <ErrorBoundary feature="DeFi Positions">
        <DeFiPositions key={positionsKey} />
      </ErrorBoundary>
      <ErrorBoundary feature="Yield Opportunities">
        <YieldOpportunities onDepositSuccess={handleDepositSuccess} />
      </ErrorBoundary>
    </div>
  );
}
