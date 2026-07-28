// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import { formatUSDC, formatAddress } from '@/lib/utils';

interface AgentWallet {
  id: string;
  agentName: string;
  accountAddress: string;
  balance: string;
  dailyLimit: string;
  spentToday: string;
  createdAt: string;
}

export default function WalletPage() {
  const { address, isConnected } = useAccount();
  const [wallets, setWallets] = useState<AgentWallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<AgentWallet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isConnected || !address) {
      setLoading(false);
      return;
    }

    async function fetchWallets() {
      try {
        const response = await fetch(`/api/agent-economy/wallet/list?owner=${address}`);
        const data = await response.json();

        if (data.success) {
          setWallets(data.wallets || []);
          if (data.wallets?.length > 0) {
            setSelectedWallet(data.wallets[0]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch wallets:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchWallets();
  }, [address, isConnected]);

  if (!isConnected) {
    return (
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="py-20 text-center bg-white border border-black/5"
        >
          <h2 className="font-sans text-xl font-black uppercase mb-2">Connect Wallet</h2>
          <p className="font-mono text-sm text-black/50">
            Connect your wallet to manage agent wallets
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <motion.div
            className="w-2 h-2 bg-black rounded-full"
            animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="font-mono text-xs tracking-[0.3em] text-black/50">WALLET</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="font-sans text-3xl sm:text-4xl font-black uppercase tracking-tight">
              Agent Wallets
            </h1>
            <p className="font-mono text-sm text-black/50 mt-2">
              Manage policy-enforced wallets for your agents
            </p>
          </div>

          <a
            href="/skill.md"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-3 bg-black text-white font-mono text-xs uppercase tracking-wider hover:bg-black/80 transition-colors inline-block"
          >
            Create Wallet ↗
          </a>
        </div>
      </motion.div>

      {/* Content */}
      {loading ? (
        <div className="py-20 text-center">
          <motion.div
            className="w-4 h-4 bg-black rounded-full mx-auto"
            animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
          <p className="font-mono text-xs text-black/40 mt-4">Loading wallets...</p>
        </div>
      ) : wallets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-20 text-center bg-white border border-black/5"
        >
          <p className="font-mono text-sm text-black/40 mb-2">No agent wallets found</p>
          <p className="font-mono text-[10px] text-black/25 mb-4">Agent wallets are created programmatically via API. See the docs to get started.</p>
          <a
            href="/skill.md"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-black font-mono text-xs uppercase hover:bg-black hover:text-white transition-colors inline-block"
          >
            Create your first wallet ↗
          </a>
        </motion.div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Wallet List */}
          <div className="lg:col-span-1 space-y-3">
            <div className="font-mono text-[10px] tracking-widest text-black/40 uppercase mb-2">
              Your Wallets
            </div>
            {wallets.map((wallet, i) => (
              <motion.button
                key={wallet.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setSelectedWallet(wallet)}
                className={`w-full text-left p-4 border transition-all duration-200 ${
                  selectedWallet?.id === wallet.id
                    ? 'bg-black text-white border-black'
                    : 'bg-white border-black/5 hover:border-black/20'
                }`}
              >
                <div className="font-sans text-sm font-black uppercase">{wallet.agentName}</div>
                <div className={`font-mono text-[10px] mt-1 ${
                  selectedWallet?.id === wallet.id ? 'text-white/60' : 'text-black/40'
                }`}>
                  {formatAddress(wallet.accountAddress)}
                </div>
              </motion.button>
            ))}
          </div>

          {/* Wallet Details */}
          {selectedWallet && (
            <motion.div
              key={selectedWallet.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="lg:col-span-2 bg-white border border-black/5 p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="font-sans text-xl font-black uppercase">{selectedWallet.agentName}</h2>
                  <p className="font-mono text-xs text-black/40 mt-1">{selectedWallet.accountAddress}</p>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(selectedWallet.accountAddress)}
                  className="px-3 py-1.5 border border-black/10 font-mono text-[10px] uppercase hover:border-black/30 transition-colors"
                >
                  Copy
                </button>
              </div>

              <div className="grid sm:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-black/[0.02] border border-black/5">
                  <div className="font-mono text-[10px] text-black/40 uppercase mb-1">Balance</div>
                  <div className="font-sans text-2xl font-black">
                    {formatUSDC(BigInt(selectedWallet.balance || '0'))}
                  </div>
                </div>
                <div className="p-4 bg-black/[0.02] border border-black/5">
                  <div className="font-mono text-[10px] text-black/40 uppercase mb-1">Daily Limit</div>
                  <div className="font-sans text-2xl font-black">
                    {formatUSDC(BigInt(selectedWallet.dailyLimit || '0'))}
                  </div>
                </div>
                <div className="p-4 bg-black/[0.02] border border-black/5">
                  <div className="font-mono text-[10px] text-black/40 uppercase mb-1">Spent Today</div>
                  <div className="font-sans text-2xl font-black">
                    {formatUSDC(BigInt(selectedWallet.spentToday || '0'))}
                  </div>
                </div>
              </div>

              {/* Spending Progress */}
              <div className="mb-6">
                <div className="flex items-center justify-between font-mono text-[10px] text-black/40 uppercase mb-2">
                  <span>Daily Spending</span>
                  <span>
                    {formatUSDC(BigInt(selectedWallet.spentToday || '0'))} / {formatUSDC(BigInt(selectedWallet.dailyLimit || '0'))}
                  </span>
                </div>
                <div className="h-2 bg-black/5 overflow-hidden">
                  <div
                    className="h-full bg-black transition-all duration-500"
                    style={{
                      width: `${
                        BigInt(selectedWallet.dailyLimit || '1') > 0n
                          ? Number((BigInt(selectedWallet.spentToday || '0') * 100n) / BigInt(selectedWallet.dailyLimit || '1'))
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
