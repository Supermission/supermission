'use client';

import { useState, useEffect } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useDefiStore } from '@/lib/store/defi';
import type { PoolInfo } from '@/lib/uniswap/pool-manager';
import { PoolCard } from './PoolCard';
import { AddLiquidityModal } from './AddLiquidityModal';
import { CHAIN_NAMES, type SupportedChainId } from '@/lib/uniswap/types';
import { getChainIcon } from '@/components/dashboard/shared/ChainIcons';

export function PoolsPanel() {
  const activeChainId = useDefiStore((s) => s.activeChainId);
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPool, setSelectedPool] = useState<PoolInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchPools = async () => {
      setIsLoading(true);
      setError(null);
      // Retry once on 429 — server already retries against subgraph, so one client retry covers transient bursts
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`/api/defi/pools?chainId=${activeChainId}&first=20`);
          const data = await res.json();
          if (cancelled) return;
          if (data.ok) {
            setPools(data.pools);
            setIsLoading(false);
            return;
          }
          // If rate limited and first attempt, wait and retry
          if (res.status === 429 && attempt === 0) {
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          setError(data.error || 'Failed to fetch pools');
        } catch {
          if (cancelled) return;
          setError('Failed to fetch pools');
        }
        break;
      }
      setIsLoading(false);
    };
    fetchPools();
    return () => { cancelled = true; };
  }, [activeChainId]);

  const filtered = searchQuery
    ? pools.filter(
        (p) =>
          p.token0.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.token1.symbol.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : pools;

  return (
    <div>
      {/* Chain + Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 shrink-0">
          {([8453, 1, 137] as SupportedChainId[]).map((id) => (
            <button
              key={id}
              onClick={() => useDefiStore.getState().setActiveChainId(id)}
              className={`flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase border transition-colors rounded-[8px] ${
                activeChainId === id
                  ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border-transparent'
                  : 'border-[#e5e7eb] text-[#6b7280] hover:bg-[#f7f7f7]'
              }`}
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              {getChainIcon(CHAIN_NAMES[id], 12)}
              {CHAIN_NAMES[id]}
            </button>
          ))}
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 border border-[#e5e7eb] rounded-[8px]">
          <Search size={12} className="text-[#6b7280]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pools..."
            className="flex-1 text-xs outline-none bg-transparent"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-[#6b7280]" size={24} />
        </div>
      ) : error ? (
        <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-8 text-center">
          <p className="text-xs text-red-600" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-8 text-center">
          <p className="text-sm font-bold uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>No Pools Found</p>
          <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            {searchQuery ? 'Try a different search term' : `No pools available on ${CHAIN_NAMES[activeChainId]}`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((pool) => (
            <PoolCard
              key={pool.id}
              pool={pool}
              chainId={activeChainId}
              onAddLiquidity={setSelectedPool}
            />
          ))}
        </div>
      )}

      {/* Add Liquidity Modal */}
      {selectedPool && (
        <AddLiquidityModal
          pool={selectedPool}
          chainId={activeChainId}
          onClose={() => setSelectedPool(null)}
        />
      )}
    </div>
  );
}
