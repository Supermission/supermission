'use client';

import type { PoolInfo } from '@/lib/uniswap/pool-manager';
import { TokenIcon } from '@/components/dashboard/shared/TokenIcon';

interface PoolCardProps {
  pool: PoolInfo;
  chainId: number;
  onAddLiquidity: (pool: PoolInfo) => void;
}

export function PoolCard({ pool, chainId, onAddLiquidity }: PoolCardProps) {
  const aprColor = pool.estimatedAPR > 20
    ? 'border-green-500 text-green-700 bg-green-50'
    : pool.estimatedAPR > 5
      ? 'border-amber-500 text-amber-700 bg-amber-50'
      : 'border-[#e5e7eb] text-[#6b7280]';

  return (
    <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-5 hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] transition-shadow">
      {/* Token icons + pair name */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-shrink-0" style={{ width: 44, height: 28 }}>
          <div className="absolute left-0 top-0 z-[1]">
            <TokenIcon symbol={pool.token0.symbol} chainId={chainId} address={pool.token0.id} size={28} />
          </div>
          <div className="absolute left-[16px] top-0 z-0 rounded-full shadow-[-1px_0_0_1px_white]">
            <TokenIcon symbol={pool.token1.symbol} chainId={chainId} address={pool.token1.id} size={28} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            {pool.token0.symbol} / {pool.token1.symbol}
          </p>
        </div>
      </div>

      {/* Fee + APR row */}
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[10px] text-[#6b7280]">
          {(parseInt(pool.feeTier) / 10000).toFixed(2)}% fee
        </span>
        <span className={`font-mono text-[11px] font-bold px-2 py-0.5 border rounded-full ${aprColor}`}>
          {pool.estimatedAPR.toFixed(1)}% APR
        </span>
      </div>

      {/* TVL + Volume */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <p className="text-[10px] text-[#6b7280] uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>TVL</p>
          <p className="font-mono text-xs font-bold">${formatCompact(pool.tvlUSD)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#6b7280] uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Volume</p>
          <p className="font-mono text-xs font-bold">${formatCompact(pool.volumeUSD)}</p>
        </div>
      </div>

      <button
        onClick={() => onAddLiquidity(pool)}
        className="w-full py-2 border border-[#e5e7eb] rounded-[8px] text-[10px] font-bold uppercase tracking-wider hover:bg-[#f7f7f7] transition-colors"
        style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
      >
        Add Liquidity
      </button>
    </div>
  );
}

function formatCompact(value: number): string {
  if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return value.toFixed(0);
}
