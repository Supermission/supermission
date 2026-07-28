// components/chat/morpho-vault-result-panel.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, ChevronDown, ChevronUp, ExternalLink, Shield, Wallet } from 'lucide-react';
import { useMorphoDeposit } from '@/lib/hooks/use-morpho-deposit';
import { useMorphoWithdraw } from '@/lib/hooks/use-morpho-withdraw';
import { useAccount } from 'wagmi';
import type { MorphoVault } from '@/lib/morpho/types';

interface MorphoVaultResultPanelProps {
  data: {
    action?: string;
    vaults?: MorphoVault[];
    vault?: MorphoVault;
    txData?: {
      type: 'deposit' | 'withdraw';
      vaultAddress: string;
      vaultName: string;
      asset: string;
      amount?: string;
    };
    walletAddress?: string;
  };
}

function formatUsd(n?: number) {
  if (!n || !Number.isFinite(n)) return '-';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatApy(apy?: number) {
  if (apy == null || !Number.isFinite(apy)) return '-';
  const pct = apy * 100;
  if (pct >= 100) return `${Math.round(pct).toLocaleString()}%`;
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

function riskBadge(level?: string) {
  if (level === 'low') return { label: 'LOW RISK', cls: 'bg-green-700 text-white' };
  if (level === 'high') return { label: 'HIGH RISK', cls: 'bg-red-700 text-white' };
  return { label: 'MED RISK', cls: 'bg-amber-600 text-white' };
}

export function MorphoVaultResultPanel({ data }: MorphoVaultResultPanelProps) {
  const vaults = data.vaults || (data.vault ? [data.vault] : []);
  const [expandedVault, setExpandedVault] = useState<string | null>(
    data.txData?.vaultAddress || (vaults.length === 1 ? vaults[0]?.address : null)
  );
  const [depositAmount, setDepositAmount] = useState(data.txData?.amount || '');
  const { address: connectedAddress } = useAccount();

  const depositHook = useMorphoDeposit();
  const withdrawHook = useMorphoWithdraw();

  const handleDeposit = useCallback(async (vault: MorphoVault) => {
    if (!depositAmount || !connectedAddress) return;
    try {
      await depositHook.executeDeposit({
        vaultAddress: vault.address as `0x${string}`,
        assetAddress: vault.asset.address as `0x${string}`,
        assetDecimals: vault.asset.decimals,
        amount: depositAmount,
      });
    } catch (err) {
      console.error('[MorphoPanel] Deposit failed:', err);
    }
  }, [depositAmount, connectedAddress, depositHook]);

  const handleWithdraw = useCallback(async (vault: MorphoVault) => {
    if (!connectedAddress) return;
    try {
      await withdrawHook.executeWithdraw({
        vaultAddress: vault.address as `0x${string}`,
        assetDecimals: vault.asset.decimals,
      });
    } catch (err) {
      console.error('[MorphoPanel] Withdraw failed:', err);
    }
  }, [connectedAddress, withdrawHook]);

  if (vaults.length === 0) return null;

  return (
    <div className="bg-white border border-[#e5e7eb] p-5 rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      {/* Header */}
      <div className="border-b border-[#e5e7eb] pb-3 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-sans font-black tracking-tight text-lg text-[#3a3a3a]">
              Morpho Vaults
            </h2>
            <div className="text-[10px] text-[#3a3a3a]/50 mt-0.5">
              MetaMorpho · Base · ERC-4626
            </div>
          </div>
          <div className="flex gap-2">
            <div className="text-center border border-[#e5e7eb] bg-[#3a3a3a] px-3 py-1.5 rounded-[10px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)]">
              <div className="text-[9px] text-white/60">Vaults</div>
              <div className="font-sans font-black text-base text-white">{vaults.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Vault Cards */}
      <div className="space-y-3">
        {vaults.map((vault) => {
          const isExpanded = expandedVault === vault.address;
          const risk = riskBadge(vault.metadata?.riskLevel);

          return (
            <div
              key={vault.address}
              className={cn(
                'border rounded-[12px] transition-all duration-200 overflow-hidden',
                isExpanded
                  ? 'border-[#3a3a3a] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.08)]'
                  : 'border-[#e5e7eb] hover:border-[#3a3a3a]/30 hover:shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)]'
              )}
            >
              {/* Card Header */}
              <button
                onClick={() => setExpandedVault(isExpanded ? null : vault.address)}
                className="w-full p-4 text-left bg-white"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold text-[#3a3a3a] font-bricolage">
                        {vault.name}
                      </span>
                      <span className={cn('text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider', risk.cls)}>
                        {risk.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Shield size={10} className="text-[#9ca3af]" />
                      <span className="text-[10px] text-[#3a3a3a]/50">
                        Curated by <span className="text-[#3a3a3a]/70 font-semibold">{vault.curator}</span>
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 justify-end">
                      <TrendingUp size={12} className="text-green-700" />
                      <span className="text-[16px] font-black text-green-700 font-mono">
                        {formatApy(vault.apy?.net)}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#3a3a3a]/40 font-mono">
                      {formatUsd(vault.tvl)} TVL
                    </span>
                  </div>
                </div>

                {/* Reasons chips */}
                {vault.metadata?.reasons && vault.metadata.reasons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {vault.metadata.reasons.slice(0, 3).map((reason, i) => (
                      <span key={i} className="text-[9px] bg-[#f3f4f6] text-[#3a3a3a]/60 px-2 py-0.5 rounded-full border border-[#e5e7eb]">
                        {reason}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex justify-center mt-1.5">
                  {isExpanded ? (
                    <ChevronUp size={14} className="text-[#9ca3af]" />
                  ) : (
                    <ChevronDown size={14} className="text-[#9ca3af]" />
                  )}
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-[#e5e7eb] bg-[#fafbfc]">
                  {/* Allocation breakdown */}
                  {vault.allocations && vault.allocations.length > 0 && (
                    <div className="mt-3">
                      <span className="text-[10px] font-bold text-[#3a3a3a]/40 uppercase tracking-wider">
                        Market Allocations
                      </span>
                      <div className="mt-1.5 space-y-1">
                        {vault.allocations.slice(0, 5).map((alloc, i) => (
                          <div key={i} className="flex items-center justify-between text-[10px]">
                            <span className="text-[#3a3a3a]/60">
                              {alloc.collateralAsset.symbol}/{alloc.loanAsset.symbol}
                              {alloc.lltv > 0 && (
                                <span className="text-[#3a3a3a]/30 ml-1">
                                  LLTV {(alloc.lltv * 100).toFixed(0)}%
                                </span>
                              )}
                            </span>
                            <span className="text-[#3a3a3a]/50 font-mono">
                              {(alloc.allocationPercentage * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fee + Asset */}
                  <div className="flex items-center gap-4 text-[10px]">
                    {vault.fee != null && vault.fee > 0 && (
                      <div>
                        <span className="text-[#3a3a3a]/40">Performance Fee: </span>
                        <span className="text-[#3a3a3a]/60 font-mono">{(vault.fee * 100).toFixed(1)}%</span>
                      </div>
                    )}
                    <div>
                      <span className="text-[#3a3a3a]/40">Asset: </span>
                      <span className="text-[#3a3a3a]/60 font-mono font-semibold">{vault.asset.symbol}</span>
                    </div>
                  </div>

                  {/* Deposit / Withdraw Actions */}
                  {connectedAddress ? (
                    <div className="space-y-2 pt-2">
                      {/* Deposit */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder={`Amount in ${vault.asset.symbol}`}
                          className="flex-1 border border-[#e5e7eb] px-3 py-2 text-[12px] text-[#3a3a3a] rounded-[8px] font-mono focus:outline-none focus:shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] transition-shadow placeholder:text-[#9ca3af]"
                        />
                        <button
                          onClick={() => handleDeposit(vault)}
                          disabled={!depositAmount || depositHook.isDepositing}
                          className={cn(
                            'px-4 py-2 rounded-[8px] text-[11px] font-bold transition-all duration-200',
                            depositAmount && !depositHook.isDepositing
                              ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white hover:from-[#2a2a2a] hover:to-[#4b4b4b] shadow-sm'
                              : 'bg-[#f3f4f6] text-[#9ca3af] cursor-not-allowed'
                          )}
                        >
                          {depositHook.isDepositing ? depositHook.progress.message : 'Deposit'}
                        </button>
                      </div>

                      {/* Withdraw */}
                      <button
                        onClick={() => handleWithdraw(vault)}
                        disabled={withdrawHook.isWithdrawing}
                        className="w-full py-2 rounded-[8px] text-[11px] font-bold border border-[#e5e7eb] text-[#3a3a3a]/60 hover:bg-[#f3f4f6] hover:text-[#3a3a3a] transition-all"
                      >
                        {withdrawHook.isWithdrawing ? withdrawHook.progress.message : 'Withdraw All'}
                      </button>

                      {/* Progress: deposit */}
                      {(depositHook.progress.step === 'completed' || depositHook.progress.step === 'failed') && (
                        <div className={cn(
                          'text-[10px] px-3 py-1.5 rounded-[8px] border',
                          depositHook.progress.step === 'completed'
                            ? 'bg-green-50 text-green-800 border-green-200'
                            : 'bg-red-50 text-red-800 border-red-200'
                        )}>
                          {depositHook.progress.message}
                          {depositHook.progress.txHash && (
                            <a
                              href={`https://basescan.org/tx/${depositHook.progress.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 ml-1 underline"
                            >
                              View tx <ExternalLink size={8} />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Progress: withdraw */}
                      {(withdrawHook.progress.step === 'completed' || withdrawHook.progress.step === 'failed') && (
                        <div className={cn(
                          'text-[10px] px-3 py-1.5 rounded-[8px] border',
                          withdrawHook.progress.step === 'completed'
                            ? 'bg-green-50 text-green-800 border-green-200'
                            : 'bg-red-50 text-red-800 border-red-200'
                        )}>
                          {withdrawHook.progress.message}
                          {withdrawHook.progress.txHash && (
                            <a
                              href={`https://basescan.org/tx/${withdrawHook.progress.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 ml-1 underline"
                            >
                              View tx <ExternalLink size={8} />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[10px] text-[#3a3a3a]/40 pt-2 justify-center">
                      <Wallet size={10} />
                      <span>Connect your wallet to deposit or withdraw</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 px-1">
        <span className="text-[10px] font-mono text-[#9ca3af]">
          {vaults.length} vault{vaults.length !== 1 ? 's' : ''} · Morpho Protocol · Base
        </span>
        <a
          href="https://app.morpho.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[#9ca3af] hover:text-[#3a3a3a] flex items-center gap-0.5 transition-colors"
        >
          morpho.org <ExternalLink size={8} />
        </a>
      </div>
    </div>
  );
}
