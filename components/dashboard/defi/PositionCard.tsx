'use client';

import type { UserLPPosition } from '@/lib/uniswap/pool-manager';

interface PositionCardProps {
  position: UserLPPosition;
  onRemove: (position: UserLPPosition) => void;
}

export function PositionCard({ position, onRemove }: PositionCardProps) {
  return (
    <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1">
            <div className="w-6 h-6 bg-black/10 rounded-full flex items-center justify-center border-2 border-white">
              <span className="font-mono text-[7px] font-bold">{position.pool.token0Symbol.slice(0, 2)}</span>
            </div>
            <div className="w-6 h-6 bg-black/10 rounded-full flex items-center justify-center border-2 border-white">
              <span className="font-mono text-[7px] font-bold">{position.pool.token1Symbol.slice(0, 2)}</span>
            </div>
          </div>
          <p className="text-sm font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            {position.pool.token0Symbol}/{position.pool.token1Symbol}
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 border rounded-[8px] ${
          position.inRange
            ? 'border-green-500 text-green-700 bg-green-50'
            : 'border-red-500 text-red-700 bg-red-50'
        }`} style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          {position.inRange ? 'In Range' : 'Out of Range'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <p className="text-[10px] text-[#6b7280] uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{position.pool.token0Symbol}</p>
          <p className="font-mono text-xs font-bold">{parseFloat(position.token0Amount).toFixed(4)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#6b7280] uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{position.pool.token1Symbol}</p>
          <p className="font-mono text-xs font-bold">{parseFloat(position.token1Amount).toFixed(4)}</p>
        </div>
      </div>

      {(parseFloat(position.feeToken0) > 0 || parseFloat(position.feeToken1) > 0) && (
        <div className="p-2 bg-green-50 border border-green-200 rounded-[8px] mb-3">
          <p className="text-[10px] text-green-700/60 uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Unclaimed Fees</p>
          <div className="flex gap-4 font-mono text-xs font-bold text-green-800">
            <span>{parseFloat(position.feeToken0).toFixed(4)} {position.pool.token0Symbol}</span>
            <span>{parseFloat(position.feeToken1).toFixed(4)} {position.pool.token1Symbol}</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onRemove(position)}
          className="flex-1 py-2 border border-[#e5e7eb] rounded-[8px] text-[10px] font-bold uppercase tracking-wider hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors"
          style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
