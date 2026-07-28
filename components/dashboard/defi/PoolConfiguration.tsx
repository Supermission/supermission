'use client';

import { FEE_TIERS } from '@/lib/uniswap/pool-creator';

interface PoolConfigurationProps {
  selectedFee: number;
  onFeeChange: (fee: number, tickSpacing: number) => void;
  hookAddress: string;
  onHookAddressChange: (address: string) => void;
}

export function PoolConfiguration({
  selectedFee,
  onFeeChange,
  hookAddress,
  onHookAddressChange,
}: PoolConfigurationProps) {
  return (
    <div className="space-y-4">
      {/* Fee tier selection */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#6b7280] font-bold mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Fee Tier
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FEE_TIERS.map((tier) => (
            <button
              key={tier.fee}
              onClick={() => onFeeChange(tier.fee, tier.tickSpacing)}
              className={`p-3 border rounded-[8px] text-left transition-colors ${
                selectedFee === tier.fee
                  ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border-transparent'
                  : 'border-[#e5e7eb] hover:bg-[#f7f7f7]'
              }`}
            >
              <span className="text-sm font-bold block" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{tier.label}</span>
              <span className={`text-[10px] ${
                selectedFee === tier.fee ? 'text-white/60' : 'text-[#6b7280]'
              }`} style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                {tier.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Hook address (optional) */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#6b7280] font-bold mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Hook Address (Optional)
        </p>
        <p className="text-[9px] text-[#6b7280] mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Attach a v4 hook to this pool for custom behavior
        </p>
        <input
          type="text"
          value={hookAddress}
          onChange={(e) => onHookAddressChange(e.target.value)}
          placeholder="0x... (leave empty for no hook)"
          className="w-full px-3 py-2 border border-[#e5e7eb] rounded-[8px] font-mono text-xs focus:outline-none focus:border-[#3a3a3a]"
        />
      </div>
    </div>
  );
}
