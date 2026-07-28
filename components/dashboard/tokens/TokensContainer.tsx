'use client';

import { useState } from 'react';
import { TokenList } from './TokenList';
import { TokenAnalysisPanel } from './TokenAnalysisPanel';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { useTokenData } from '@/lib/hooks/dashboard/useTokenData';

export function TokensContainer() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState(8453);

  const { data: tokenInfo } = useTokenData(activeQuery, selectedChain);

  return (
    <div className="space-y-6">
      <ErrorBoundary feature="Token Search">
        <TokenList />
      </ErrorBoundary>

      {/* Show analysis panel only when a token is loaded */}
      {tokenInfo && (
        <ErrorBoundary feature="Token Analysis">
          <TokenAnalysisPanel tokenInfo={tokenInfo} />
        </ErrorBoundary>
      )}
    </div>
  );
}
