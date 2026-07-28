'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDefiStore } from '@/lib/store/defi';
import { useCreatePool } from '@/lib/hooks/use-create-pool';
import { TokenSelector } from './TokenSelector';
import { PoolConfiguration } from './PoolConfiguration';
import type { TokenInfo, SupportedChainId } from '@/lib/uniswap/types';

interface CreatePoolModalProps {
  onClose: () => void;
}

export function CreatePoolModal({ onClose }: CreatePoolModalProps) {
  const activeChainId = useDefiStore((s) => s.activeChainId);
  const { create, progress, isCreating } = useCreatePool();

  const [token0, setToken0] = useState<TokenInfo | null>(null);
  const [token1, setToken1] = useState<TokenInfo | null>(null);
  const [selectedFee, setSelectedFee] = useState(3000);
  const [tickSpacing, setTickSpacing] = useState(60);
  const [hookAddress, setHookAddress] = useState('');
  const [initialPrice, setInitialPrice] = useState('1');
  const [showTokenSelector, setShowTokenSelector] = useState<'token0' | 'token1' | null>(null);

  const handleTokenSelect = (token: TokenInfo) => {
    if (showTokenSelector === 'token0') setToken0(token);
    else setToken1(token);
    setShowTokenSelector(null);
  };

  const handleCreate = async () => {
    if (!token0 || !token1) return;
    try {
      await create({
        token0: token0.address,
        token1: token1.address,
        fee: selectedFee,
        tickSpacing,
        hookAddress: hookAddress || undefined,
        initialPrice,
        chainId: activeChainId,
      });
    } catch {
      // Error handled by hook
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={!isCreating ? onClose : undefined}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-lg bg-white border border-[#e5e7eb] rounded-[12px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] rounded-t-[12px]">
            <span className="text-sm font-bold uppercase tracking-wider text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Create Pool</span>
            {!isCreating && (
              <button onClick={onClose} className="hover:bg-[#f7f7f7] p-1 transition-colors rounded-[8px]">
                <X size={16} />
              </button>
            )}
          </div>

          <div className="p-4 space-y-4">
            {/* Token pair */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase text-[#6b7280] font-bold mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Token 0</p>
                <button
                  onClick={() => setShowTokenSelector('token0')}
                  className="w-full py-2.5 border border-[#e5e7eb] rounded-[8px] text-xs font-bold uppercase hover:bg-[#f7f7f7] transition-colors"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  {token0 ? token0.symbol : 'Select Token'}
                </button>
              </div>
              <div>
                <p className="text-[10px] uppercase text-[#6b7280] font-bold mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Token 1</p>
                <button
                  onClick={() => setShowTokenSelector('token1')}
                  className="w-full py-2.5 border border-[#e5e7eb] rounded-[8px] text-xs font-bold uppercase hover:bg-[#f7f7f7] transition-colors"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  {token1 ? token1.symbol : 'Select Token'}
                </button>
              </div>
            </div>

            {/* Fee tier + hook */}
            <PoolConfiguration
              selectedFee={selectedFee}
              onFeeChange={(fee, ts) => { setSelectedFee(fee); setTickSpacing(ts); }}
              hookAddress={hookAddress}
              onHookAddressChange={setHookAddress}
            />

            {/* Initial price */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#6b7280] font-bold mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                Initial Price ({token1?.symbol || 'Token1'} per {token0?.symbol || 'Token0'})
              </p>
              <input
                type="text"
                inputMode="decimal"
                value={initialPrice}
                onChange={(e) => /^[0-9]*\.?[0-9]*$/.test(e.target.value) && setInitialPrice(e.target.value)}
                placeholder="1.0"
                className="w-full px-3 py-2 border border-[#e5e7eb] rounded-[8px] font-mono text-sm font-bold focus:outline-none"
              />
            </div>

            {/* Status */}
            {progress.step !== 'idle' && (
              <div className={`p-3 border rounded-[8px] ${
                progress.step === 'failed' ? 'bg-red-50 border-red-200' :
                progress.step === 'completed' ? 'bg-green-50 border-green-200' :
                'bg-neutral-50 border-[#e5e7eb]'
              }`}>
                <p className="text-xs" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{progress.message}</p>
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={!token0 || !token1 || isCreating || !initialPrice}
              className="w-full py-3.5 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              {isCreating ? 'Creating...' : 'Create Pool'}
            </button>
          </div>
        </motion.div>

        {showTokenSelector && (
          <TokenSelector
            onSelect={handleTokenSelect}
            onClose={() => setShowTokenSelector(null)}
            selectedAddress={showTokenSelector === 'token0' ? token1?.address : token0?.address}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
