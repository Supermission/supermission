'use client';

import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PoolInfo } from '@/lib/uniswap/pool-manager';
import { suggestLPRange, type RangeSuggestion } from '@/lib/uniswap/range-optimizer';
import type { SupportedChainId } from '@/lib/uniswap/types';

interface AddLiquidityModalProps {
  pool: PoolInfo;
  chainId: SupportedChainId;
  onClose: () => void;
}

export function AddLiquidityModal({ pool, chainId, onClose }: AddLiquidityModalProps) {
  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [riskLevel, setRiskLevel] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [suggestion, setSuggestion] = useState<RangeSuggestion | null>(null);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);

  useEffect(() => {
    const loadSuggestion = async () => {
      setIsLoadingSuggestion(true);
      try {
        const result = await suggestLPRange({
          token0: pool.token0.id,
          token1: pool.token1.id,
          chainId,
          riskLevel,
          currentPrice: parseFloat(pool.token0Price || '1'),
        });
        setSuggestion(result);
      } catch {
        setSuggestion(null);
      } finally {
        setIsLoadingSuggestion(false);
      }
    };
    loadSuggestion();
  }, [pool, chainId, riskLevel]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-md bg-white border border-[#e5e7eb] rounded-[12px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] rounded-t-[12px]">
            <span className="text-sm font-bold uppercase tracking-wider text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              Add Liquidity: {pool.token0.symbol}/{pool.token1.symbol}
            </span>
            <button onClick={onClose} className="hover:bg-[#f7f7f7] p-1 transition-colors rounded-[8px]">
              <X size={16} />
            </button>
          </div>

          <div className="p-3 space-y-3">
            {/* Pool info — single row */}
            <div className="flex items-center gap-3 text-[10px] px-2 py-1.5 bg-neutral-50 border border-[#e5e7eb] rounded-[8px]">
              <span className="text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Fee <span className="font-mono font-bold text-[#3a3a3a]">{(parseInt(pool.feeTier) / 10000).toFixed(2)}%</span></span>
              <span className="text-[#e5e7eb]">|</span>
              <span className="text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>TVL <span className="font-mono font-bold text-[#3a3a3a]">${(pool.tvlUSD / 1e6).toFixed(1)}M</span></span>
              <span className="text-[#e5e7eb]">|</span>
              <span className="text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>APR <span className="font-mono font-bold text-[#3a3a3a]">{pool.estimatedAPR.toFixed(1)}%</span></span>
            </div>

            {/* AI Range Suggestion */}
            <div className="border border-[#e5e7eb] rounded-[8px] p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>AI-Suggested Range</span>

              <div className="flex gap-1 mt-2 mb-2">
                {(['conservative', 'moderate', 'aggressive'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setRiskLevel(level)}
                    className={`flex-1 py-1 text-[10px] font-bold uppercase border transition-colors rounded-[6px] ${
                      riskLevel === level
                        ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border-transparent'
                        : 'border-[#e5e7eb] text-[#6b7280] hover:bg-[#f7f7f7]'
                    }`}
                    style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                  >
                    {level}
                  </button>
                ))}
              </div>

              {isLoadingSuggestion ? (
                <div className="flex items-center justify-center py-2">
                  <Loader2 size={14} className="animate-spin text-[#6b7280]" />
                </div>
              ) : suggestion ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Lower</span>
                    <span className="font-mono font-bold">{suggestion.lowerPrice}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Upper</span>
                    <span className="font-mono font-bold">{suggestion.upperPrice}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>IL Risk</span>
                    <span className={`font-mono font-bold ${
                      suggestion.ilRisk === 'high' ? 'text-red-600' :
                      suggestion.ilRisk === 'medium' ? 'text-amber-600' : 'text-green-600'
                    }`}>{suggestion.ilRisk}</span>
                  </div>
                  {suggestion.rationale && (
                    <p className="text-[10px] text-[#6b7280] pt-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{suggestion.rationale}</p>
                  )}
                </div>
              ) : null}
            </div>

            {/* Token amounts — side by side */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#6b7280] font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  {pool.token0.symbol}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount0}
                  onChange={(e) => /^[0-9]*\.?[0-9]*$/.test(e.target.value) && setAmount0(e.target.value)}
                  placeholder="0.00"
                  className="w-full mt-1 px-2.5 py-1.5 border border-[#e5e7eb] rounded-[8px] font-mono text-sm font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#6b7280] font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  {pool.token1.symbol}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount1}
                  onChange={(e) => /^[0-9]*\.?[0-9]*$/.test(e.target.value) && setAmount1(e.target.value)}
                  placeholder="0.00"
                  className="w-full mt-1 px-2.5 py-1.5 border border-[#e5e7eb] rounded-[8px] font-mono text-sm font-bold focus:outline-none"
                />
              </div>
            </div>

            {/* CTA + fee note */}
            <div>
              <button
                disabled={!amount0 || !amount1 || parseFloat(amount0) <= 0 || parseFloat(amount1) <= 0}
                className="w-full py-2.5 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                Add Liquidity
              </button>
              <p className="text-[10px] text-[#6b7280] text-center mt-1.5" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                Service fee: $0.25 USDC
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
