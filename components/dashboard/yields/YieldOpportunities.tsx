'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { useMultiWallet } from '@/lib/contexts/MultiWalletContext';
import { useWalletData } from '@/lib/hooks/dashboard/useWalletData';
import type { Address } from 'viem';
import { TokenIcon } from '@/components/dashboard/shared/TokenIcon';
import { getChainIcon } from '@/components/dashboard/shared/ChainIcons';
import { AddLiquidityModal } from '@/components/dashboard/defi/AddLiquidityModal';
import type { PoolInfo } from '@/lib/uniswap/pool-manager';
import { CHAIN_NAMES, type SupportedChainId } from '@/lib/uniswap/types';
import type { YieldStrategy } from '@/lib/minimax/analyzers';

const CHAIN_IDS: SupportedChainId[] = [8453, 1, 137];

export interface YieldOpportunitiesProps {
  onDepositSuccess?: () => void;
}

export function YieldOpportunities({ onDepositSuccess }: YieldOpportunitiesProps) {
  const { activeWallet } = useMultiWallet();
  const { data: walletDataResult } = useWalletData(activeWallet as Address | undefined);

  // Chain filter
  const [activeChainId, setActiveChainId] = useState<SupportedChainId>(8453);

  // Pool data (Uniswap)
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accordion
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Compact strategy
  const [strategy, setStrategy] = useState<YieldStrategy | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);

  // Add liquidity modal
  const [selectedPool, setSelectedPool] = useState<PoolInfo | null>(null);

  // Fetch Uniswap pools
  useEffect(() => {
    let cancelled = false;
    const fetchPools = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/defi/pools?chainId=${activeChainId}&first=10`);
        const data = await res.json();
        if (cancelled) return;
        if (data.ok) {
          setPools(data.pools);
        } else {
          setError(data.error || 'Failed to fetch pools');
        }
      } catch {
        if (!cancelled) setError('Failed to fetch pools');
      }
      if (!cancelled) setIsLoading(false);
    };
    fetchPools();
    return () => { cancelled = true; };
  }, [activeChainId]);

  // Generate AI strategy
  const handleGenerateStrategy = async () => {
    if (!activeWallet) return;
    setStrategyLoading(true);
    try {
      const res = await fetch('/api/dashboard/yields/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioData: walletDataResult || null,
          yieldPools: pools.map(p => ({
            symbol: `${p.token0.symbol}-${p.token1.symbol}`,
            apy: p.estimatedAPR,
            tvlUsd: p.tvlUSD,
            project: 'Uniswap V3',
            chain: CHAIN_NAMES[activeChainId],
          })),
          riskTolerance: 'balanced',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setStrategy(data.data);
      }
    } catch { /* ignore */ }
    setStrategyLoading(false);
  };

  const maxApr = pools.length > 0 ? Math.max(...pools.map(p => p.estimatedAPR)) : 100;

  return (
    <div className="space-y-3">
      <div className="border border-[#e5e7eb] bg-white rounded-[16px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.04)]">
        <div className="px-4 pt-4 pb-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold uppercase tracking-wider text-[#1a1a1a]"
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                Top Yield Opportunities
              </span>
              {pools.length > 0 && (
                <span className="px-1.5 py-0.5 bg-[#f1f3f4] rounded-[4px] font-mono text-[10px] text-[#6b7280]">
                  {pools.length}
                </span>
              )}
            </div>
            {activeWallet && (
              <button
                onClick={handleGenerateStrategy}
                disabled={strategyLoading || pools.length === 0}
                className="px-3 py-1.5 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[10px] font-bold uppercase rounded-[6px] hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                {strategyLoading && <Loader2 size={10} className="animate-spin" />}
                {strategyLoading ? 'Generating...' : 'AI Strategy'}
              </button>
            )}
          </div>

          {/* Strategy result (compact inline) */}
          {strategy && (
            <div className="mb-3 p-2.5 bg-neutral-50 border border-[#e5e7eb] rounded-[8px]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase text-[#3a3a3a]"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  {strategy.strategy}
                </span>
                <button onClick={() => setStrategy(null)} className="text-[10px] text-[#6b7280] hover:text-[#3a3a3a]">&times;</button>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-[#6b7280]">APY <span className="font-mono font-bold text-green-600">{strategy.expectedAPY.toFixed(1)}%</span></span>
                <span className="text-[#e5e7eb]">|</span>
                <span className="text-[#6b7280]">Risk <span className="font-mono font-bold">{strategy.riskLevel}</span></span>
                <span className="text-[#e5e7eb]">|</span>
                <span className="text-[#6b7280]">Return <span className="font-mono font-bold">{strategy.estimatedReturn}</span></span>
              </div>
              {strategy.recommendations.length > 0 && (
                <div className="space-y-0.5 pt-1.5 mt-1.5 border-t border-[#e5e7eb]">
                  {strategy.recommendations.slice(0, 2).map((rec, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span className="font-mono text-[#3a3a3a]">{rec.protocol}: {rec.action.slice(0, 40)}</span>
                      <span className="font-mono font-bold text-green-600">{rec.apy.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chain filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {CHAIN_IDS.map((id) => {
              const active = activeChainId === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveChainId(id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wide border transition-all duration-150 ${
                    active
                      ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                      : 'bg-white text-[#6b7280] border-[#e5e7eb] hover:border-[#c9cbcf] hover:text-[#3a3a3a]'
                  }`}
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  {getChainIcon(CHAIN_NAMES[id], 10)}
                  {CHAIN_NAMES[id]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 border-t border-[#f1f3f4]">
            <Loader2 size={14} className="animate-spin text-[#6b7280]" />
            <span
              className="text-xs text-[#6b7280] font-bold uppercase tracking-wide"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              Fetching yields...
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-[10px]">
            <AlertCircle size={12} className="text-red-500 flex-shrink-0" />
            <p className="font-mono text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Pool list (accordion) */}
        {!isLoading && pools.length > 0 && (
          <div className="border-t border-[#f1f3f4]">
            {pools.map((pool, index) => {
              const isOpen = expandedIndex === index;
              const apr = pool.estimatedAPR;
              const aprColor = apr > 20 ? 'text-green-600' : apr > 5 ? 'text-blue-600' : 'text-[#3a3a3a]';

              return (
                <div
                  key={pool.id}
                  className={`border-b border-[#f1f3f4] last:border-b-0 transition-colors ${
                    isOpen ? 'bg-[#fafbfc]' : 'hover:bg-[#fafbfc]'
                  }`}
                >
                  {/* Row header */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedIndex(isOpen ? null : index)}
                  >
                    {/* Rank */}
                    <span className="w-5 text-center font-mono text-[10px] font-bold text-[#c9cbcf] flex-shrink-0">
                      {index + 1}
                    </span>

                    {/* Token icons */}
                    <div className="relative flex-shrink-0" style={{ width: 32, height: 20 }}>
                      <div className="absolute left-0 top-0 z-[1]">
                        <TokenIcon symbol={pool.token0.symbol} chainId={activeChainId} address={pool.token0.id} size={20} />
                      </div>
                      <div className="absolute left-[12px] top-0 z-0 rounded-full shadow-[-1px_0_0_1px_white]">
                        <TokenIcon symbol={pool.token1.symbol} chainId={activeChainId} address={pool.token1.id} size={20} />
                      </div>
                    </div>

                    {/* Pair name */}
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-[13px] font-bold text-[#1a1a1a] truncate"
                        style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                      >
                        {pool.token0.symbol}/{pool.token1.symbol}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[10px] text-[#6b7280]">
                          {(parseInt(pool.feeTier) / 10000).toFixed(2)}% fee
                        </span>
                        <span className="text-[#d4d4d8]">&middot;</span>
                        <span className="font-mono text-[10px] text-[#6b7280]">Uniswap V3</span>
                      </div>
                    </div>

                    {/* APR + bar */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0 min-w-[70px]">
                      <span className={`font-mono text-sm font-bold ${aprColor}`}>
                        {apr.toFixed(1)}%
                      </span>
                      <ApyBar apy={apr} max={maxApr} />
                    </div>

                    {/* Chevron */}
                    <ChevronDown
                      size={14}
                      className={`text-[#a1a1aa] flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Expanded detail panel */}
                  <div
                    className={`overflow-hidden transition-all duration-200 ${
                      isOpen ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                    style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
                  >
                    <div className="px-4 pb-3 pt-0">
                      <div className="ml-8 border border-[#e5e7eb] rounded-[10px] bg-white overflow-hidden">
                        {/* Stats row */}
                        <div className="grid grid-cols-2 divide-x divide-[#e5e7eb] border-b border-[#e5e7eb]">
                          <div className="px-3 py-2">
                            <p className="text-[9px] uppercase tracking-wide text-[#a1a1aa] font-bold mb-0.5"
                               style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                              TVL
                            </p>
                            <p className="font-mono text-xs font-bold text-[#3a3a3a]">${formatCompact(pool.tvlUSD)}</p>
                          </div>
                          <div className="px-3 py-2">
                            <p className="text-[9px] uppercase tracking-wide text-[#a1a1aa] font-bold mb-0.5"
                               style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                              Volume 24h
                            </p>
                            <p className="font-mono text-xs font-bold text-[#3a3a3a]">${formatCompact(pool.volumeUSD)}</p>
                          </div>
                        </div>

                        {/* Action row */}
                        <div className="px-3 py-2.5 flex items-center justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedPool(pool); }}
                            className="px-3 py-1.5 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[10px] font-bold uppercase rounded-[6px] hover:opacity-90 transition-opacity"
                            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                          >
                            Add Liquidity
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && pools.length === 0 && (
          <div className="flex flex-col items-center py-10 border-t border-[#f1f3f4]">
            <AlertCircle size={20} className="text-[#d4d4d8] mb-2" />
            <p
              className="text-xs font-bold uppercase text-[#a1a1aa]"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              No opportunities found
            </p>
          </div>
        )}
      </div>

      {/* Add Liquidity Modal */}
      {selectedPool && (
        <AddLiquidityModal
          pool={selectedPool}
          chainId={activeChainId}
          onClose={() => {
            setSelectedPool(null);
            onDepositSuccess?.();
          }}
        />
      )}
    </div>
  );
}

function ApyBar({ apy, max }: { apy: number; max: number }) {
  const pct = Math.min((apy / Math.max(max, 1)) * 100, 100);
  const color = apy > 20 ? '#16a34a' : apy > 8 ? '#2563eb' : '#6b7280';
  return (
    <div className="flex items-center gap-2 min-w-[60px]">
      <div className="flex-1 h-1 bg-[#f1f3f4] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function formatCompact(value: number): string {
  if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return value.toFixed(0);
}
