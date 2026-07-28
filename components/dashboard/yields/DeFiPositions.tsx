'use client';

import { useState } from 'react';
import { useDefiPositions, DeFiPosition } from '@/lib/hooks/use-defi-positions';
import { WithdrawModal } from './WithdrawModal';
import { Loader2 } from 'lucide-react';

interface DeFiPositionsProps {
  onWithdrawSuccess?: () => void;
}

export function DeFiPositions({ onWithdrawSuccess }: DeFiPositionsProps) {
  const { positions, isLoading, refetch } = useDefiPositions();
  const [withdrawing, setWithdrawing] = useState<DeFiPosition | null>(null);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
        <h3 className="text-sm font-bold uppercase mb-4" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Your DeFi Positions</h3>
        <div className="animate-pulse space-y-3">
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  // No positions — render nothing
  if (positions.length === 0) return null;

  return (
    <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      <h3 className="text-sm font-bold uppercase mb-4" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Your DeFi Positions</h3>
      <div className="space-y-3">
        {positions.map((pos) => (
          <div
            key={pos.protocol}
            className="flex items-center justify-between p-3 border border-[#e5e7eb] rounded-[12px] bg-neutral-50"
          >
            <div>
              <p className="font-mono text-sm font-bold">{pos.label}</p>
              <p className="font-mono text-xs text-neutral-500">USDC on Base</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold">${pos.balanceFormatted} USDC</span>
              <button
                onClick={() => setWithdrawing(pos)}
                className="px-3 py-1.5 bg-orange-600 text-white text-xs font-bold uppercase rounded-[8px] hover:opacity-90 transition-colors shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]"
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                Withdraw
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Withdraw Modal */}
      {withdrawing && (
        <WithdrawModal
          position={withdrawing}
          onClose={() => setWithdrawing(null)}
          onSuccess={() => {
            setWithdrawing(null);
            refetch();
            onWithdrawSuccess?.();
          }}
        />
      )}
    </div>
  );
}
