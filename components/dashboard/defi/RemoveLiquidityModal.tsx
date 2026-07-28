'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UserLPPosition } from '@/lib/uniswap/pool-manager';

interface RemoveLiquidityModalProps {
  position: UserLPPosition;
  onClose: () => void;
  onSuccess: () => void;
}

const PERCENTAGE_PRESETS = [25, 50, 75, 100];

export function RemoveLiquidityModal({ position, onClose, onSuccess }: RemoveLiquidityModalProps) {
  const [percentage, setPercentage] = useState(100);

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
          className="w-full max-w-md bg-white border border-[#e5e7eb] rounded-[12px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] rounded-t-[12px]">
            <span className="text-sm font-bold uppercase tracking-wider text-red-600" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Remove Liquidity</span>
            <button onClick={onClose} className="hover:bg-[#f7f7f7] p-1 transition-colors rounded-[8px]">
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div className="p-3 bg-neutral-50 border border-[#e5e7eb] rounded-[8px]">
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                {position.pool.token0Symbol}/{position.pool.token1Symbol}
              </p>
              <p className="font-mono text-[10px] text-[#6b7280] mt-1">
                Range: {position.tickLower} to {position.tickUpper}
                {position.inRange ? ' (In Range)' : ' (Out of Range)'}
              </p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#6b7280] font-bold mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                Amount to Remove
              </p>
              <div className="flex gap-1">
                {PERCENTAGE_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPercentage(p)}
                    className={`flex-1 py-2 text-xs font-bold border transition-colors rounded-[8px] ${
                      percentage === p
                        ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border-transparent'
                        : 'border-[#e5e7eb] text-[#6b7280] hover:bg-[#f7f7f7]'
                    }`}
                    style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-[8px] space-y-1">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-red-700/60">{position.pool.token0Symbol}</span>
                <span className="font-bold text-red-800">
                  {((parseFloat(position.token0Amount) * percentage) / 100).toFixed(6)}
                </span>
              </div>
              <div className="flex justify-between font-mono text-xs">
                <span className="text-red-700/60">{position.pool.token1Symbol}</span>
                <span className="font-bold text-red-800">
                  {((parseFloat(position.token1Amount) * percentage) / 100).toFixed(6)}
                </span>
              </div>
            </div>

            <button
              className="w-full py-3.5 bg-red-600 text-white rounded-[8px] text-sm font-bold uppercase tracking-wider hover:bg-red-700 transition-all shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              Remove {percentage}% Liquidity
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
