'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useDefiStore } from '@/lib/store/defi';
import { useUniswapPositions } from '@/lib/hooks/use-uniswap-positions';
import { PositionCard } from './PositionCard';
import { RemoveLiquidityModal } from './RemoveLiquidityModal';
import type { UserLPPosition } from '@/lib/uniswap/pool-manager';
import { useAccount } from 'wagmi';

export function PositionsPanel() {
  const { isConnected } = useAccount();
  const activeChainId = useDefiStore((s) => s.activeChainId);
  const { positions, isLoading, error, refetch } = useUniswapPositions(activeChainId);
  const [removingPosition, setRemovingPosition] = useState<UserLPPosition | null>(null);

  if (!isConnected) {
    return (
      <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-8 text-center">
        <p className="text-sm font-bold uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Connect Wallet</p>
        <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Connect your wallet to view LP positions</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-[#6b7280]" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-8 text-center">
        <p className="text-xs text-red-600" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{error}</p>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-8 text-center">
        <p className="text-sm font-bold uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>No Positions</p>
        <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          You have no active LP positions. Browse the Pools tab to add liquidity.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {positions.map((pos) => (
          <PositionCard
            key={pos.id}
            position={pos}
            onRemove={setRemovingPosition}
          />
        ))}
      </div>

      {removingPosition && (
        <RemoveLiquidityModal
          position={removingPosition}
          onClose={() => setRemovingPosition(null)}
          onSuccess={() => {
            setRemovingPosition(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
