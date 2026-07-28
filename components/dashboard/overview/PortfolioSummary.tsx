'use client';

import { useWalletOverview } from '@/lib/hooks/dashboard/useWalletOverview';
import { Address } from 'viem';
import { CardLoadingSkeleton } from '../shared/LoadingState';
import { TrendingUp, TrendingDown, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';

interface PortfolioSummaryProps {
  address: Address | undefined;
}

export function PortfolioSummary({ address }: PortfolioSummaryProps) {
  const { data, isLoading, error } = useWalletOverview(address);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getExplorerUrl = (addr: string) => {
    return `https://basescan.org/address/${addr}`;
  };

  if (isLoading) {
    return <CardLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="border border-red-300 rounded-[12px] bg-red-50 p-6">
        <h3 className="text-sm font-bold text-red-900 uppercase mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Failed to Load
        </h3>
        <p className="text-xs text-red-700 font-mono">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { summary } = data;
  const isPositiveChange = summary.change24h >= 0;

  return (
    <div className="border border-[#e5e7eb] rounded-[16px] p-6 bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      <h3 className="text-sm font-bold uppercase mb-4" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
        Portfolio Summary
      </h3>

      <div className="space-y-4">
        {/* Wallet Address */}
        {address && (
          <div className="pb-4 border-b border-[#e5e7eb]">
            <p className="text-xs text-[#6b7280] mb-2 uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Wallet</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold">
                {address.slice(0, 6)}...{address.slice(-4)}
              </span>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-[#f7f7f7] transition-colors"
                title="Copy address"
              >
                <Copy size={12} className="text-[#6b7280]" />
              </button>
              <a
                href={getExplorerUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-[#f7f7f7] transition-colors"
                title="View on explorer"
              >
                <ExternalLink size={12} className="text-[#6b7280]" />
              </a>
              {copied && (
                <span className="text-xs font-mono text-green-600">Copied!</span>
              )}
            </div>
          </div>
        )}

        {/* Total Value */}
        <div>
          <p className="text-xs text-[#6b7280] mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>TOTAL VALUE</p>
          <p className="text-3xl font-mono font-bold">
            ${summary.totalPortfolioUSD.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </p>
          {summary.change24h !== 0 && (
            <div className={`flex items-center gap-1 mt-1 ${isPositiveChange ? 'text-green-600' : 'text-red-600'}`}>
              {isPositiveChange ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span className="text-xs font-mono font-bold">
                {isPositiveChange ? '+' : ''}{summary.change24h.toFixed(2)}% (24h)
              </span>
            </div>
          )}
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#e5e7eb]">
          <div>
            <p className="text-xs text-[#6b7280] mb-1 uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Holdings</p>
            <p className="text-xl font-mono font-bold">{summary.holdingsCount}</p>
          </div>
          <div>
            <p className="text-xs text-[#6b7280] mb-1 uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Chains</p>
            <p className="text-xl font-mono font-bold">{summary.chainCount}</p>
          </div>
        </div>

        {/* Top Holdings Preview */}
        {data.topHoldings.length > 0 && (
          <div className="pt-4 border-t border-[#e5e7eb]">
            <p className="text-xs text-[#6b7280] mb-3 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              Top Holdings
            </p>
            <div className="space-y-2">
              {data.topHoldings.slice(0, 3).map((holding, i) => (
                <div key={i} className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold">{holding.symbol}</span>
                  <span className="text-[#6b7280]">
                    ${holding.balanceUSD.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
