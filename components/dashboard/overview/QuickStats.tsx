'use client';

import { useWalletOverview } from '@/lib/hooks/dashboard/useWalletOverview';
import { Address } from 'viem';
import { CardLoadingSkeleton } from '../shared/LoadingState';
import { getChainIcon } from '../shared/ChainIcons';

interface QuickStatsProps {
  address: Address | undefined;
}

export function QuickStats({ address }: QuickStatsProps) {
  const { data, isLoading, error } = useWalletOverview(address);

  if (isLoading) {
    return <CardLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="border border-red-300 rounded-[12px] bg-red-50 p-6">
        <h3 className="text-sm font-bold text-red-900 uppercase mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Failed to Load Stats
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

  return (
    <div className="border border-[#e5e7eb] rounded-[16px] p-6 bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      <h3 className="text-sm font-bold uppercase mb-4" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
        Quick Stats
      </h3>

      <div className="space-y-4">
        {/* Chain Distribution */}
        <div>
          <p className="text-xs text-[#6b7280] mb-3 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            Chain Distribution
          </p>
          <div className="space-y-2">
            {data.chains.map((chain) => (
              <div key={chain.chainId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getChainIcon(chain.name, 16)}
                  <span className="text-xs font-mono font-bold">{chain.name.toUpperCase()}</span>
                </div>
                <span className="text-xs font-mono text-[#6b7280]">
                  ${chain.balanceUSD.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Native Balances */}
        {data.nativeBalances.length > 0 && (
          <div className="pt-4 border-t border-[#e5e7eb]">
            <p className="text-xs text-[#6b7280] mb-3 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              Native Balances
            </p>
            <div className="space-y-2">
              {data.nativeBalances.map((balance) => (
                <div key={balance.chainId} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#6b7280]">{balance.name.toUpperCase()}</span>
                  <div className="text-right">
                    <p className="font-bold">
                      {balance.balance.toFixed(6)} {balance.name === 'Polygon' ? 'MATIC' : 'ETH'}
                    </p>
                    <p className="text-[#6b7280]">
                      ${balance.balanceUSD.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
