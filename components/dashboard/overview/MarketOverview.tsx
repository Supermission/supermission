'use client';

import { useMarketOverview } from '@/lib/hooks/dashboard/useMarketOverview';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Address } from 'viem';

interface MarketOverviewProps {
  address: Address;
}

function PriceChange({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-xs font-bold ${
      isPositive ? 'text-green-600' : 'text-red-600'
    }`}>
      {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {isPositive ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

export function MarketOverview({ address }: MarketOverviewProps) {
  const { data, isLoading, error } = useMarketOverview();

  if (error) {
    return null; // Silently hide on error
  }

  return (
    <div className="border border-[#e5e7eb] rounded-[16px] p-6 bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      <h3 className="text-xs font-bold uppercase text-[#6b7280] mb-4 tracking-wider" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
        Market Overview
      </h3>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-12 mb-2" />
              <div className="h-5 bg-gray-200 rounded w-24 mb-1" />
              <div className="h-3 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* BTC */}
          {data.btc && (
            <div className="p-3 border border-[#e5e7eb] rounded-[12px]">
              <p className="text-[10px] font-bold text-[#6b7280] uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>BTC</p>
              <p className="font-mono text-lg font-bold">
                ${data.btc.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </p>
              <PriceChange value={data.btc.change24hPct} />
            </div>
          )}

          {/* ETH */}
          {data.eth && (
            <div className="p-3 border border-[#e5e7eb] rounded-[12px]">
              <p className="text-[10px] font-bold text-[#6b7280] uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>ETH</p>
              <p className="font-mono text-lg font-bold">
                ${data.eth.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </p>
              <PriceChange value={data.eth.change24hPct} />
            </div>
          )}

          {/* Top Gainer */}
          {data.topGainers.length > 0 && (
            <div className="p-3 border border-green-200 rounded-[12px] bg-green-50/50">
              <p className="text-[10px] font-bold text-green-600/60 uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Top Gainer</p>
              <p className="font-mono text-sm font-bold">{data.topGainers[0].symbol}</p>
              <PriceChange value={data.topGainers[0].change24hPct} />
            </div>
          )}

          {/* Top Loser */}
          {data.topLosers.length > 0 && (
            <div className="p-3 border border-red-200 rounded-[12px] bg-red-50/50">
              <p className="text-[10px] font-bold text-red-600/60 uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Top Loser</p>
              <p className="font-mono text-sm font-bold">{data.topLosers[0].symbol}</p>
              <PriceChange value={data.topLosers[0].change24hPct} />
            </div>
          )}

          {/* If no gainers/losers, show placeholders */}
          {data.topGainers.length === 0 && (
            <div className="p-3 border border-[#e5e7eb] rounded-[12px]">
              <p className="text-[10px] font-bold text-[#6b7280] uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Top Gainer</p>
              <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Connect wallet</p>
            </div>
          )}
          {data.topLosers.length === 0 && (
            <div className="p-3 border border-[#e5e7eb] rounded-[12px]">
              <p className="text-[10px] font-bold text-[#6b7280] uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Top Loser</p>
              <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Connect wallet</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
