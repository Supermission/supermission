'use client';

import { useState } from 'react';
import { useMultiWallet } from '@/lib/contexts/MultiWalletContext';
import { Plus, X, Copy } from 'lucide-react';
import { isAddress } from 'viem';

export function WalletSelector() {
  const { wallets, activeWallet, addWallet, removeWallet, setActiveWallet } = useMultiWallet();
  const [showAdd, setShowAdd] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleAdd = () => {
    if (!isAddress(newAddress)) {
      alert('Invalid Ethereum address');
      return;
    }

    addWallet(newAddress as `0x${string}`, newLabel || undefined);
    setNewAddress('');
    setNewLabel('');
    setShowAdd(false);
  };

  const copyAddress = (address: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  if (wallets.length === 0) return null;

  return (
    <div className="border border-[#e5e7eb] bg-white rounded-[12px] p-4 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      <h3 className="text-xs font-bold text-[#3a3a3a] uppercase mb-3" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Active Wallet</h3>

      {/* Wallet List */}
      <div className="space-y-2 mb-3">
        {wallets.map(wallet => (
          <div
            key={wallet.address}
            className={`border rounded-[8px] p-3 transition-colors ${
              activeWallet?.toLowerCase() === wallet.address.toLowerCase()
                ? 'border-[#3a3a3a] bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white'
                : 'border-[#e5e7eb] bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-xs font-bold">{wallet.label}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => copyAddress(wallet.address, e)}
                  className="p-1 hover:bg-white hover:bg-opacity-20 transition-colors rounded"
                  title="Copy address"
                >
                  <Copy size={12} />
                </button>
                {!wallet.isPrimary && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeWallet(wallet.address);
                    }}
                    className="p-1 hover:bg-red-600 transition-colors rounded"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
            <p className="font-mono text-xs break-all opacity-80">
              {wallet.address}
            </p>
            {copiedAddress === wallet.address && (
              <p className="font-mono text-xs mt-1 opacity-60">Copied!</p>
            )}
            {activeWallet?.toLowerCase() !== wallet.address.toLowerCase() && (
              <button
                onClick={() => setActiveWallet(wallet.address)}
                className="mt-2 px-3 py-1 border border-current rounded-[6px] font-mono text-xs font-bold uppercase hover:bg-white hover:text-black transition-colors"
              >
                Switch to this wallet
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Wallet Button */}
      {wallets.length < 3 && !showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-2 border border-[#e5e7eb] rounded-[8px] hover:bg-[#f7f7f7] text-[#3a3a3a] font-mono text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors"
        >
          <Plus size={14} />
          Add Wallet
        </button>
      )}

      {/* Add Wallet Form */}
      {showAdd && (
        <div className="space-y-2 pt-3 border-t border-[#e5e7eb]">
          <input
            type="text"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-3 py-2 border border-[#e5e7eb] rounded-[8px] font-mono text-xs focus:outline-none focus:border-[#6b7280]"
          />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-full px-3 py-2 border border-[#e5e7eb] rounded-[8px] font-mono text-xs focus:outline-none focus:border-[#6b7280]"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="flex-1 py-2 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] font-mono text-xs font-bold uppercase hover:opacity-90 transition-opacity"
            >
              Add
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="flex-1 py-2 border border-[#e5e7eb] rounded-[8px] font-mono text-xs font-bold uppercase hover:bg-[#f7f7f7] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
