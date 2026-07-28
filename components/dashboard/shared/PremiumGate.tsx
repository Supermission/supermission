'use client';

import { useState } from 'react';

interface PremiumGateProps {
  feature: string;
  price: string;
  preview: React.ReactNode;
  fullContent: React.ReactNode;
  isPremium: boolean;
  onUnlock: () => Promise<void>;
}

export function PremiumGate({
  feature,
  price,
  preview,
  fullContent,
  isPremium,
  onUnlock
}: PremiumGateProps) {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isPremium) {
    return <>{fullContent}</>;
  }

  const handleUnlock = async () => {
    setIsUnlocking(true);
    setError(null);

    try {
      await onUnlock();
    } catch (err: any) {
      console.error('[PremiumGate] Unlock failed:', err);
      setError(err.message || 'Payment failed');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="relative border border-[#e5e7eb] rounded-[16px] overflow-hidden bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      {/* Blurred preview */}
      <div className="blur-sm pointer-events-none">
        {preview}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-white/90 flex items-center justify-center p-6">
        <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-6 max-w-xs shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
          <h3 className="text-sm font-bold uppercase mb-4" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            {feature}
          </h3>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded-[8px]">
              <p className="text-xs font-mono text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleUnlock}
            disabled={isUnlocking}
            className="w-full px-4 py-3 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] text-xs font-bold uppercase hover:opacity-90 border border-[#e5e7eb] transition-colors disabled:opacity-50"
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
          >
            {isUnlocking ? 'Processing...' : `Unlock for ${price} USDC`}
          </button>
        </div>
      </div>
    </div>
  );
}
