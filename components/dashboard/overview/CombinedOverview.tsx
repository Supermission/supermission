'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWalletData } from '@/lib/hooks/dashboard/useWalletData';
import { useMarketOverview } from '@/lib/hooks/dashboard/useMarketOverview';
import { useBatchSparklines } from '@/lib/hooks/dashboard/useBatchSparklines';
import { Address, isAddress } from 'viem';
import { useMultiWallet } from '@/lib/contexts/MultiWalletContext';
import { CardLoadingSkeleton } from '../shared/LoadingState';
import { getChainIcon } from '../shared/ChainIcons';
import { Sparkline } from '../shared/Sparkline';
import { TokenDetailPanel } from '../wallet/TokenDetailPanel';
import { TokenIconWithChain } from '../shared/TokenIcon';
import { getHLBalance } from '@/lib/hyperliquid/deposit';
import { STABLECOIN_SYMBOLS as REGISTRY_STABLE_SYMBOLS } from '@/lib/tokens/registry';
import {
  TrendingUp,
  TrendingDown,
  Copy,
  ExternalLink,
  Plus,
  X,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Shield,
} from 'lucide-react';
import type { WalletAnalysis } from '@/lib/minimax/analyzers';
import { PositionsPanel } from '../defi/PositionsPanel';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

// Maps token symbols to CoinDesk sparkline symbols (deduplicates wrapped variants)
const SYMBOL_MAP: Record<string, string> = {
  'USDC': 'USDC', 'USDC.e': 'USDC', 'USDbC': 'USDC',
  'USDT': 'USDT', 'DAI': 'DAI', 'ETH': 'ETH',
  'WETH': 'ETH', 'WBTC': 'BTC', 'MATIC': 'MATIC', 'POL': 'MATIC',
  'WMATIC': 'MATIC', 'BNB': 'BNB',
  'cbETH': 'ETH', 'wstETH': 'ETH', 'rETH': 'ETH',
  'LINK': 'LINK', 'AAVE': 'AAVE', 'UNI': 'UNI',
  'BRETT': 'BRETT', 'AERO': 'AERO',
};

// Registry stablecoin symbols (USDC, USDC.e, pUSD, USDbC, USDG, USDT, DAI) plus
// symbol-only classifications not modeled as tokens (BUSD/TUSD/FRAX).
const STABLECOIN_SYMBOLS = new Set([...REGISTRY_STABLE_SYMBOLS, 'BUSD', 'TUSD', 'FRAX']);

const CHAIN_DOT_COLORS: Record<number, string> = {
  8453: '#0052FF',
  137: '#8247E5',
  1: '#627EEA',
  42161: '#28A0F0',
};

interface CombinedOverviewProps {
  address: Address | undefined;
}

export function CombinedOverview({ address }: CombinedOverviewProps) {
  // walletData is the single source of truth — includes balances + 24h change
  const { data: walletData, isLoading: walletLoading, error: walletError } = useWalletData(address);
  useMarketOverview(); // pre-fetch for sub-components
  const { wallets, addWallet, setActiveWallet, removeWallet } = useMultiWallet();
  const [copied, setCopied] = useState(false);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysis, setAnalysis] = useState<WalletAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [positionsOpen, setPositionsOpen] = useState(false);
  const [chainsExpanded, setChainsExpanded] = useState(true);
  const [holdingsExpanded, setHoldingsExpanded] = useState(true);
  const [newAddress, setNewAddress] = useState('');

  // Hyperliquid (perps) balance — not included in the walletData API
  const [hlBalance, setHlBalance] = useState(0);
  useEffect(() => {
    if (!address) { setHlBalance(0); return; }
    let cancelled = false;
    getHLBalance(address).then(bal => { if (!cancelled) setHlBalance(bal); }).catch(() => {});
    const iv = setInterval(() => {
      getHLBalance(address).then(bal => { if (!cancelled) setHlBalance(bal); }).catch(() => {});
    }, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [address]);

  const sparklineSymbols = useMemo(() => {
    if (!walletData?.tokens) return [];
    return Array.from(new Set(
      walletData.tokens
        .map((t) => SYMBOL_MAP[t.symbol] || t.symbol)
        .filter((s) => s && !STABLECOIN_SYMBOLS.has(s))
    ));
  }, [walletData?.tokens]);

  const { data: sparklineData } = useBatchSparklines(sparklineSymbols);

  // Total token value from walletData (single source of truth for token holdings)
  const totalTokenValue = useMemo(() => {
    if (!walletData?.tokens) return 0;
    return walletData.tokens.reduce((s, t) => s + t.balanceUSD, 0);
  }, [walletData?.tokens]);

  // Use walletData as single source of truth for portfolio balance and counts.
  // overviewData and walletData are fetched from different APIs at different times,
  // so using overviewData for the total while showing walletData tokens caused mismatches.
  // hlBalance adds the Hyperliquid perps account balance (not included in the on-chain API).
  const portfolioUSD = (walletData?.summary.totalPortfolioUSD ?? 0) + hlBalance;
  const holdingsCount = walletData?.summary.totalTokenCount ?? 0;
  const chainCount = (walletData?.summary.totalChains ?? 0) + (hlBalance > 0 ? 1 : 0);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAnalyze = async () => {
    if (!address || !walletData) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisOpen(true);
    try {
      const res = await fetch('/api/dashboard/wallet/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, portfolioData: walletData }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.details || 'Analysis failed');
      }
      const data = await res.json();
      setAnalysis(data.data);
    } catch (err: unknown) {
      setAnalysisError(err instanceof Error ? err.message : 'Failed to analyze');
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Only block on walletData — overviewData is optional (provides 24h change only)
  const isLoading = walletLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <CardLoadingSkeleton />
        <CardLoadingSkeleton />
      </div>
    );
  }

  // Only show error if walletData fails — overviewData failure is non-critical (just loses 24h change)
  if (walletError) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-[16px] p-6">
        <h3 className="text-sm font-semibold text-red-900 mb-1" style={{ fontFamily: FONT }}>
          Failed to Load Portfolio
        </h3>
        <p className="text-xs text-red-600" style={{ fontFamily: FONT }}>
          {walletError instanceof Error ? walletError.message : 'Unknown error occurred'}
        </p>
      </div>
    );
  }

  if (!walletData) return null;

  const change24h = walletData?.summary?.change24h ?? 0;
  const isPositiveChange = change24h >= 0;

  return (
    <div className="space-y-4">
      {/* Portfolio Card */}
      <div className="border border-[#e5e7eb] bg-white rounded-[16px] overflow-hidden shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">

        {/* Wallet Switcher — shows all wallets as pills, click to switch, X to remove */}
        {address && (
          <div className="px-5 py-3 border-b border-[#f1f3f4]">
            <div className="flex items-center gap-2 flex-wrap">
              {wallets.map((w) => {
                const isActive = address.toLowerCase() === w.address.toLowerCase();
                return (
                  <button
                    key={w.address}
                    onClick={() => setActiveWallet(w.address)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[11px] font-medium transition-colors ${
                      isActive
                        ? 'bg-[#1a1a1a] text-white'
                        : 'border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f5f5f5] hover:text-[#1a1a1a]'
                    }`}
                    style={{ fontFamily: FONT }}
                  >
                    {w.label || w.address.slice(0, 6) + '...' + w.address.slice(-4)}
                    {/* Remove button for non-primary (watch-only) wallets */}
                    {!w.isPrimary && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); removeWallet(w.address); }}
                        className={`ml-0.5 p-0.5 rounded hover:bg-white/20 ${isActive ? 'text-white/60 hover:text-white' : 'text-[#a1a1aa] hover:text-red-500'}`}
                      >
                        <X size={10} />
                      </span>
                    )}
                  </button>
                );
              })}
              {/* LP Positions */}
              <button
                onClick={() => setPositionsOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 border border-[#e5e7eb] text-[#6b7280] rounded-[8px] text-[11px] font-medium hover:bg-[#f5f5f5] hover:text-[#1a1a1a] transition-colors"
                style={{ fontFamily: FONT }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></svg>
                LP Positions
              </button>
              {/* Spacer then the wallet address + copy + explorer for the active wallet */}
              <div className="ml-auto flex items-center gap-2">
                {address && (
                  <span className="text-[12px] font-mono text-[#6b7280]" title={address}>
                    {`${address.slice(0, 6)}...${address.slice(-4)}`}
                  </span>
                )}
                <button
                  onClick={handleCopy}
                  className="p-1 hover:bg-[#f5f5f5] rounded-md transition-colors"
                  title="Copy address"
                >
                  {copied ? (
                    <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <Copy size={13} className="text-[#a1a1aa]" />
                  )}
                </button>
                <a
                  href={`https://basescan.org/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 hover:bg-[#f5f5f5] rounded-md transition-colors"
                  title="View on explorer"
                >
                  <ExternalLink size={13} className="text-[#a1a1aa]" />
                </a>
              </div>
            </div>
            {/* Inline add wallet form */}
            {showAddWallet && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="0x... wallet address"
                  className="flex-1 px-3 py-2 border border-[#e5e7eb] rounded-[8px] text-xs focus:outline-none focus:border-[#6b7280] bg-white"
                  style={{ fontFamily: FONT }}
                />
                <button
                  onClick={() => {
                    if (isAddress(newAddress)) {
                      addWallet(newAddress as `0x${string}`);
                      setNewAddress('');
                      setShowAddWallet(false);
                    }
                  }}
                  className="px-4 py-2 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] text-[11px] font-medium hover:opacity-90 transition-opacity"
                  style={{ fontFamily: FONT }}
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowAddWallet(false); setNewAddress(''); }}
                  className="px-4 py-2 border border-[#e5e7eb] rounded-[8px] text-[11px] font-medium hover:bg-[#f5f5f5] transition-colors"
                  style={{ fontFamily: FONT }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Balance Section */}
        <div className="px-5 py-5">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium text-[#a1a1aa] mb-1" style={{ fontFamily: FONT }}>
                Total Portfolio
              </p>
              <div className="flex items-baseline gap-3">
                {/* portfolioUSD from walletData — matches the chain/token breakdown below */}
                <p className="text-4xl font-bold tracking-tight text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                  ${portfolioUSD.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                {/* 24h change from overviewData — only field not in walletData */}
                {change24h !== 0 && (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    isPositiveChange ? 'text-green-600' : 'text-red-500'
                  }`} style={{ fontFamily: FONT }}>
                    {isPositiveChange ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {isPositiveChange ? '+' : ''}{change24h.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>

            {/* Quick stats */}
            {/* All stats from walletData so they're consistent with portfolio total */}
            <div className="flex gap-2">
              {[
                { label: 'Holdings', value: String(holdingsCount) },
                { label: 'Chains', value: String(chainCount) },
              ].map((stat) => (
                <div key={stat.label} className="px-4 py-2 border border-[#e5e7eb] rounded-[10px] text-center min-w-[80px]">
                  <p className="text-[9px] font-medium text-[#a1a1aa] mb-0.5" style={{ fontFamily: FONT }}>{stat.label}</p>
                  <p className="text-sm font-semibold text-[#1a1a1a]" style={{ fontFamily: FONT }}>{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chain Balances */}
        {walletData && walletData.chains.length > 0 && (
          <div className="border-t border-[#f1f3f4] px-5 py-4">
            <button
              onClick={() => setChainsExpanded(!chainsExpanded)}
              className="flex items-center gap-1.5 mb-3 group"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2.5" strokeLinecap="round"
                className={`transition-transform duration-200 ${chainsExpanded ? 'rotate-90' : ''}`}>
                <path d="M9 18l6-6-6-6" />
              </svg>
              <span className="text-[10px] font-medium text-[#a1a1aa] group-hover:text-[#6b7280] transition-colors" style={{ fontFamily: FONT }}>Chains</span>
            </button>
            {chainsExpanded && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {walletData.chains.map((chain) => (
                <div
                  key={chain.chainId}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 bg-[#fafbfc] border border-[#e5e7eb] rounded-[10px] min-w-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {getChainIcon(chain.name, 18)}
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[#1a1a1a] truncate" style={{ fontFamily: FONT }}>{chain.name}</p>
                      <p className="text-[10px] text-[#a1a1aa] truncate" style={{ fontFamily: FONT }}>
                        {chain.nativeBalance.toFixed(4)} {chain.nativeSymbol}
                      </p>
                    </div>
                  </div>
                  <p className="text-[13px] font-semibold text-[#1a1a1a] tabular-nums sm:text-right" style={{ fontFamily: FONT }}>
                    ${chain.totalBalanceUSD.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              ))}
              {/* Hyperliquid — not an on-chain wallet, shown separately */}
              {hlBalance > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 bg-[#fafbfc] border border-[#e5e7eb] rounded-[10px] min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {getChainIcon('Hyperliquid', 18)}
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[#1a1a1a] truncate" style={{ fontFamily: FONT }}>Hyperliquid</p>
                      <p className="text-[10px] text-[#a1a1aa] truncate" style={{ fontFamily: FONT }}>
                        Perps Trading
                      </p>
                    </div>
                  </div>
                  <p className="text-[13px] font-semibold text-[#1a1a1a] tabular-nums sm:text-right" style={{ fontFamily: FONT }}>
                    ${hlBalance.toFixed(2)}
                  </p>
                </div>
              )}
            </div>}
          </div>
        )}

        {/* Token Holdings — grouped by chain, 2 per row, spam hidden */}
        {walletData && walletData.tokens.length > 0 && (() => {
          // Separate real tokens from spam
          const SPAM_PATTERNS = [/t\.me/i, /visit.*claim/i, /reward.*🎁/i, /airdrop/i];
          const isSpam = (t: typeof walletData.tokens[0]) =>
            t.balanceUSD <= 0.01 && (
              t.decimals === 0 ||
              SPAM_PATTERNS.some(p => p.test(t.symbol) || p.test(t.name)) ||
              t.symbol.length > 20
            );

          // Also hide tokens with $0 value and no known symbol (unpriced micro-tokens)
          const isHidden = (t: typeof walletData.tokens[0]) =>
            isSpam(t) || (t.balanceUSD <= 0 && t.priceUSD <= 0 && !STABLECOIN_SYMBOLS.has(t.symbol));

          const realTokens = walletData.tokens.filter(t => !isHidden(t));
          const spamTokens = walletData.tokens.filter(t => isHidden(t));

          // Group by chain
          const CHAIN_ORDER = [8453, 137, 1, 42161, 4663];
          const chainGroups = CHAIN_ORDER
            .map(id => ({ id, name: getChainName(id), tokens: realTokens.filter(t => t.chainId === id) }))
            .filter(g => g.tokens.length > 0);

          return (
            <div className="border-t border-[#f1f3f4] px-5 py-4">
              <button
                onClick={() => setHoldingsExpanded(!holdingsExpanded)}
                className="flex items-center gap-1.5 mb-4 group"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2.5" strokeLinecap="round"
                  className={`transition-transform duration-200 ${holdingsExpanded ? 'rotate-90' : ''}`}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <span className="text-[10px] font-medium text-[#a1a1aa] group-hover:text-[#6b7280] transition-colors" style={{ fontFamily: FONT }}>Holdings</span>
              </button>

              {holdingsExpanded && <>
              {chainGroups.map((group) => (
                <div key={group.id} className="mb-4 last:mb-0">
                  {/* Chain header */}
                  <div className="flex items-center gap-1.5 mb-2">
                    {getChainIcon(group.name, 12)}
                    <span className="text-[10px] font-semibold text-[#a1a1aa] uppercase tracking-wider" style={{ fontFamily: FONT }}>{group.name}</span>
                  </div>

                  {/* Tokens — 2 per row grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {group.tokens.map((token) => {
                      const tokenKey = `${token.chainId}-${token.address}`;
                      const pct = totalTokenValue > 0 ? (token.balanceUSD / totalTokenValue) * 100 : 0;
                      const isExpanded = expandedToken === tokenKey;
                      const cdSymbol = SYMBOL_MAP[token.symbol] || token.symbol;

                      return (
                        <div key={tokenKey}>
                          <button
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] transition-colors text-left active:bg-[#f5f5f5] ${
                              isExpanded ? 'bg-[#f5f5f5] border border-[#e5e7eb]' : 'hover:bg-[#fafbfc]'
                            }`}
                            onClick={() => setExpandedToken(isExpanded ? null : tokenKey)}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <TokenIconWithChain symbol={token.symbol} chainId={token.chainId} address={token.address} size={28} />
                              <div className="min-w-0">
                                <p className="text-[12px] font-semibold text-[#1a1a1a] truncate" style={{ fontFamily: FONT }}>{token.symbol}</p>
                                <p className="text-[9px] text-[#a1a1aa] tabular-nums" style={{ fontFamily: FONT }}>
                                  {parseFloat(token.balance).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                                </p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-2">
                              <p className="text-[12px] font-semibold text-[#1a1a1a] tabular-nums" style={{ fontFamily: FONT }}>
                                ${token.balanceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                              <p className="text-[9px] text-[#a1a1aa] tabular-nums" style={{ fontFamily: FONT }}>
                                {pct < 0.1 ? '<0.1' : pct.toFixed(1)}%
                              </p>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="mx-1 mb-1 border border-[#e5e7eb] rounded-[10px] overflow-hidden">
                              <TokenDetailPanel symbol={cdSymbol} currentPrice={token.priceUSD} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Hyperliquid holdings */}
              {hlBalance > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    {getChainIcon('Hyperliquid', 12)}
                    <span className="text-[10px] font-semibold text-[#a1a1aa] uppercase tracking-wider" style={{ fontFamily: FONT }}>Hyperliquid</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-[10px] hover:bg-[#fafbfc] transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <TokenIconWithChain symbol="USDC" chainId={0} size={28} />
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-[#1a1a1a]" style={{ fontFamily: FONT }}>USDC</p>
                          <p className="text-[9px] text-[#a1a1aa] tabular-nums" style={{ fontFamily: FONT }}>
                            {hlBalance.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-[12px] font-semibold text-[#1a1a1a] tabular-nums" style={{ fontFamily: FONT }}>
                          ${hlBalance.toFixed(2)}
                        </p>
                        <p className="text-[9px] text-[#a1a1aa] tabular-nums" style={{ fontFamily: FONT }}>
                          {totalTokenValue > 0 ? ((hlBalance / (totalTokenValue + hlBalance)) * 100).toFixed(1) : '0'}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Spam/hidden tokens */}
              {spamTokens.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#f1f3f4]">
                  <p className="text-[9px] text-[#d1d5db] font-medium" style={{ fontFamily: FONT }}>
                    {spamTokens.length} hidden token{spamTokens.length > 1 ? 's' : ''} (spam/scam)
                  </p>
                </div>
              )}
              </>}
            </div>
          );
        })()}

        {/* No tokens state */}
        {walletData && walletData.tokens.length === 0 && (
          <div className="border-t border-[#f1f3f4] px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[#1a1a1a] mb-1" style={{ fontFamily: FONT }}>No Token Holdings</p>
            <p className="text-[11px] text-[#a1a1aa]" style={{ fontFamily: FONT }}>Only native assets detected</p>
          </div>
        )}
      </div>

      {/* Wallet Analysis Modal */}
      {analysisOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!analysisLoading) setAnalysisOpen(false); }} />
          <div className="relative bg-white rounded-[16px] border border-black/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.12)] w-full max-w-[480px] max-h-[85vh] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            {/* Header */}
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-[#f0f0f0]">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
                <h2 className="text-[15px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>Portfolio Analysis</h2>
              </div>
              <button onClick={() => setAnalysisOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-[6px] hover:bg-[#f5f5f5] transition-colors text-[#9ca3af]">
                <X size={14} />
              </button>
            </div>

            <div className="px-5 py-4">
              {analysisLoading && (
                <div className="space-y-3 animate-pulse">
                  {/* Health + Profile skeleton */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-[10px] p-3 border border-[#e5e7eb]">
                      <div className="h-2 w-10 bg-[#e5e7eb] rounded mb-2" />
                      <div className="h-6 w-20 bg-[#e5e7eb] rounded" />
                    </div>
                    <div className="rounded-[10px] p-3 border border-[#e5e7eb]">
                      <div className="h-2 w-10 bg-[#e5e7eb] rounded mb-2" />
                      <div className="h-6 w-24 bg-[#e5e7eb] rounded" />
                    </div>
                  </div>
                  {/* Risk + Diversity skeleton */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-[10px] p-3 border border-[#e5e7eb]">
                      <div className="h-2 w-8 bg-[#e5e7eb] rounded mb-2" />
                      <div className="h-7 w-16 bg-[#e5e7eb] rounded" />
                    </div>
                    <div className="rounded-[10px] p-3 border border-[#e5e7eb]">
                      <div className="h-2 w-12 bg-[#e5e7eb] rounded mb-2" />
                      <div className="h-7 w-16 bg-[#e5e7eb] rounded" />
                    </div>
                  </div>
                  {/* Summary skeleton */}
                  <div className="rounded-[10px] p-3 border border-[#e5e7eb]">
                    <div className="h-2 w-full bg-[#e5e7eb] rounded mb-2" />
                    <div className="h-2 w-4/5 bg-[#e5e7eb] rounded mb-2" />
                    <div className="h-2 w-3/5 bg-[#e5e7eb] rounded" />
                  </div>
                  {/* Recommendations skeleton */}
                  <div className="space-y-1.5">
                    <div className="h-2 w-24 bg-[#e5e7eb] rounded mb-2" />
                    <div className="rounded-[8px] px-3 py-2.5 border border-[#e5e7eb]">
                      <div className="h-2 w-full bg-[#e5e7eb] rounded mb-1.5" />
                      <div className="h-2 w-2/3 bg-[#e5e7eb] rounded" />
                    </div>
                    <div className="rounded-[8px] px-3 py-2.5 border border-[#e5e7eb]">
                      <div className="h-2 w-full bg-[#e5e7eb] rounded mb-1.5" />
                      <div className="h-2 w-1/2 bg-[#e5e7eb] rounded" />
                    </div>
                  </div>
                </div>
              )}

              {analysisError && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center">
                    <AlertTriangle size={14} className="text-rose-500" />
                  </div>
                  <span className="text-[11px] text-rose-600 text-center" style={{ fontFamily: FONT }}>{analysisError}</span>
                  <button onClick={handleAnalyze} className="h-9 px-4 bg-[#1a1a1a] text-white text-[11px] font-bold rounded-[8px] hover:bg-[#333] transition-colors" style={{ fontFamily: FONT }}>
                    Retry
                  </button>
                </div>
              )}

              {analysis && !analysisLoading && (
                <div className="space-y-3">
                  {/* Health + Profile */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`rounded-[10px] p-3 border ${
                      analysis.portfolioHealth === 'Excellent' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                      analysis.portfolioHealth === 'Good' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                      analysis.portfolioHealth === 'Fair' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                      'bg-rose-50 border-rose-200 text-rose-700'
                    }`}>
                      <span className="text-[9px] font-bold uppercase tracking-wider block mb-0.5" style={{ fontFamily: FONT }}>Health</span>
                      <span className="text-[18px] font-bold" style={{ fontFamily: FONT }}>{analysis.portfolioHealth}</span>
                    </div>
                    <div className="rounded-[10px] p-3 border border-[#e5e7eb]">
                      <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-0.5" style={{ fontFamily: FONT }}>Profile</span>
                      <span className="text-[13px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>{analysis.profile}</span>
                    </div>
                  </div>

                  {/* Risk + Diversification */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-[10px] p-3 border border-[#e5e7eb]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle size={11} className={analysis.riskScore < 30 ? 'text-emerald-600' : analysis.riskScore < 60 ? 'text-amber-600' : 'text-rose-500'} />
                        <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider" style={{ fontFamily: FONT }}>Risk</span>
                      </div>
                      <span className={`text-[20px] font-bold tabular-nums ${analysis.riskScore < 30 ? 'text-emerald-600' : analysis.riskScore < 60 ? 'text-amber-600' : 'text-rose-500'}`} style={{ fontFamily: FONT }}>{analysis.riskScore}/100</span>
                    </div>
                    <div className="rounded-[10px] p-3 border border-[#e5e7eb]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Shield size={11} className="text-blue-600" />
                        <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider" style={{ fontFamily: FONT }}>Diversity</span>
                      </div>
                      <span className="text-[20px] font-bold text-blue-600 tabular-nums" style={{ fontFamily: FONT }}>{analysis.diversificationScore}/100</span>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="rounded-[10px] p-3 border border-[#e5e7eb]">
                    <p className="text-[11px] text-[#48484b] leading-relaxed" style={{ fontFamily: FONT }}>{analysis.summary}</p>
                  </div>

                  {/* Recommendations */}
                  {analysis.topRecommendations.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingUp size={11} className="text-blue-600" />
                        <span className="text-[10px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>Recommendations</span>
                      </div>
                      <div className="space-y-1.5">
                        {analysis.topRecommendations.map((rec, i) => (
                          <div key={i} className="rounded-[8px] px-3 py-2 border border-[#e5e7eb]">
                            <p className="text-[10px] text-[#48484b]" style={{ fontFamily: FONT }}>{rec}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Security Alerts */}
                  {analysis.securityAlerts.length > 0 && !analysis.securityAlerts.includes('None') && (
                    <div className="rounded-[10px] p-3 border border-rose-200 bg-rose-50">
                      <div className="flex items-center gap-1.5 mb-2">
                        <AlertTriangle size={11} className="text-rose-600" />
                        <span className="text-[10px] font-bold text-rose-700" style={{ fontFamily: FONT }}>Security Alerts</span>
                      </div>
                      {analysis.securityAlerts.map((alert, i) => (
                        <p key={i} className="text-[10px] text-rose-700 mb-0.5" style={{ fontFamily: FONT }}>- {alert}</p>
                      ))}
                    </div>
                  )}

                  {/* Re-analyze */}
                  <button
                    onClick={handleAnalyze}
                    disabled={analysisLoading}
                    className="w-full py-2.5 border border-[#e5e7eb] rounded-[8px] text-[11px] font-medium text-[#6b7280] hover:bg-[#fafafa] hover:text-[#1a1a1a] transition-colors"
                    style={{ fontFamily: FONT }}
                  >
                    Re-analyze
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DeFi Positions Modal */}
      {positionsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPositionsOpen(false)} />
          <div className="relative bg-white rounded-[16px] border border-black/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.12)] w-full max-w-[520px] max-h-[85vh] overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-[#f0f0f0]">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></svg>
                <h2 className="text-[15px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>DeFi Positions</h2>
              </div>
              <button onClick={() => setPositionsOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-[6px] hover:bg-[#f5f5f5] transition-colors text-[#9ca3af]">
                <X size={14} />
              </button>
            </div>
            <div className="p-5">
              <PositionsPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getChainName(chainId: number): string {
  const names: Record<number, string> = {
    8453: 'Base',
    137: 'Polygon',
    10: 'Optimism',
    1: 'Ethereum',
    42161: 'Arbitrum',
    4663: 'Robinhood',
  };
  return names[chainId] || `Chain ${chainId}`;
}

function getExplorerUrl(chainId: number, tokenAddress: string): string {
  const explorers: Record<number, string> = {
    8453: 'https://basescan.org',
    137: 'https://polygonscan.com',
    10: 'https://optimistic.etherscan.io',
    1: 'https://etherscan.io',
    42161: 'https://arbiscan.io',
  };
  const baseUrl = explorers[chainId] || 'https://basescan.org';
  return `${baseUrl}/token/${tokenAddress}`;
}
