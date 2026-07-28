'use client';

import { useDefiStore } from '@/lib/store/defi';
import { AlertTriangle } from 'lucide-react';

export function SlippageSettings() {
  const slippageMode = useDefiStore((s) => s.slippageMode);
  const customSlippageBps = useDefiStore((s) => s.customSlippageBps);
  const setSlippageMode = useDefiStore((s) => s.setSlippageMode);
  const setCustomSlippageBps = useDefiStore((s) => s.setCustomSlippageBps);

  const isHighSlippage = slippageMode === 'custom' && customSlippageBps > 200;

  return (
    <div className="p-3 border border-[#e5e7eb] rounded-[8px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-[#6b7280] font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Slippage Tolerance
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSlippageMode('auto')}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase border transition-colors rounded-[8px] ${
              slippageMode === 'auto'
                ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border-transparent'
                : 'border-[#e5e7eb] text-[#6b7280] hover:bg-[#f7f7f7]'
            }`}
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
          >
            Auto
          </button>
          <button
            onClick={() => setSlippageMode('custom')}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase border transition-colors rounded-[8px] ${
              slippageMode === 'custom'
                ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border-transparent'
                : 'border-[#e5e7eb] text-[#6b7280] hover:bg-[#f7f7f7]'
            }`}
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
          >
            Custom
          </button>
        </div>
      </div>

      {slippageMode === 'custom' && (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={500}
              value={customSlippageBps}
              onChange={(e) => setCustomSlippageBps(Math.max(1, Math.min(500, Number(e.target.value) || 0)))}
              className="w-20 px-2 py-1.5 border border-[#e5e7eb] rounded-[8px] font-mono text-xs font-bold text-right focus:outline-none"
            />
            <span className="font-mono text-xs text-[#6b7280]">bps ({(customSlippageBps / 100).toFixed(2)}%)</span>
          </div>
          {isHighSlippage && (
            <div className="flex items-center gap-1.5 mt-2 text-amber-600">
              <AlertTriangle size={12} />
              <span className="text-[10px] font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>High slippage may result in unfavorable rates</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
