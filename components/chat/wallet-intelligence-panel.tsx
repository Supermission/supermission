'use client';

import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatUSD(value: number) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  if (value < 0.01 && value > 0) return '<$0.01';
  return `$${value.toFixed(2)}`;
}

function formatBalance(val: string | number, maxDecimals: number = 4) {
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return '0';
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toFixed(maxDecimals);
}

function riskLabel(score: number): { text: string; cls: string } {
  if (score >= 75) return { text: 'LOW RISK', cls: 'text-green-600' };
  if (score >= 50) return { text: 'MEDIUM', cls: 'text-amber-600' };
  return { text: 'HIGH RISK', cls: 'text-red-600' };
}

function walletTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    whale: 'WHALE',
    institutional: 'INSTITUTIONAL',
    trader: 'ACTIVE TRADER',
    defi_power_user: 'DEFI POWER USER',
    nft_collector: 'NFT COLLECTOR',
    casual: 'CASUAL USER',
    dormant: 'DORMANT',
    new: 'NEW WALLET',
  };
  return labels[type] || type.replace(/_/g, ' ').toUpperCase();
}

function priorityColor(p: string) {
  if (p === 'high') return 'border-l-red-600';
  if (p === 'medium') return 'border-l-amber-500';
  return 'border-l-[#e5e7eb]';
}

type SectionKey = 'portfolio' | 'holdings' | 'portfolioAnalysis' | 'aiProfile' | 'chains' | 'security' | 'recommendations' | 'warnings';

function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#f7f7f7] transition-colors border-b border-[#e5e7eb]"
    >
      <span className="text-[10px] font-bold text-[#3a3a3a]/50 tracking-widest uppercase">{label}</span>
      <ChevronDown
        size={14}
        className="text-[#3a3a3a]/30 transition-transform duration-200"
        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
      />
    </button>
  );
}

export function WalletIntelligencePanel({ data }: { data: any }) {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [expandedChain, setExpandedChain] = useState<string | null>(null);
  const [showAllRecs, setShowAllRecs] = useState(false);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    portfolio: true,
    holdings: false,
    portfolioAnalysis: false,
    aiProfile: false,
    chains: false,
    security: false,
    recommendations: false,
    warnings: false,
  });

  const toggleSection = (key: SectionKey) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // Extract response data - handle multiple nesting levels
  const raw = data || {};
  const inner = raw.data || raw;
  const walletData = inner.data || inner;
  const analysisData = walletData.walletAddress ? walletData
    : walletData.data?.walletAddress ? walletData.data
    : null;

  if (!analysisData?.walletAddress || !analysisData?.summary) {
    return (
      <div className="bg-white border border-[#e5e7eb] p-6 rounded-[16px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)]">
        <div className="text-xs text-[#3a3a3a]/60">WALLET INTELLIGENCE</div>
        <p className="text-sm text-red-600 mt-2">Analysis failed, no data returned</p>
      </div>
    );
  }

  const {
    walletAddress,
    socialIdentity,
    summary,
    chains = [],
    portfolioAnalysis,
    riskAnalysis,
    behaviorAnalysis,
    aiProfile,
  } = analysisData;

  const copyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const risk = riskLabel(summary.overallRiskScore || 0);
  const wType = aiProfile?.walletType || behaviorAnalysis?.walletType;
  const activityLevel = aiProfile?.activityLevel || behaviorAnalysis?.activityLevel;

  // Aggregate tokens across chains
  const allTokens = chains.flatMap((c: any) => (c.tokenBalances || []).map((t: any) => ({ ...t, chain: c.chainName })));
  const topTokens = allTokens
    .filter((t: any) => t.balanceUSD > 0)
    .sort((a: any, b: any) => b.balanceUSD - a.balanceUSD)
    .slice(0, 8);

  const recommendations = aiProfile?.recommendations || [];
  const visibleRecs = showAllRecs ? recommendations : recommendations.slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="bg-white border border-[#e5e7eb] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)] rounded-[16px] overflow-hidden"
    >
      {/* --- HEADER --- */}
      <div className="bg-white text-[#3a3a3a] px-5 py-4 border-b border-[#e5e7eb]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold text-[#3a3a3a]/50">
              Wallet Intelligence
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={copyAddress}
                className="font-mono text-sm font-bold text-[#3a3a3a] hover:text-[#3a3a3a]/80 transition-colors flex items-center gap-1.5 group"
              >
                {socialIdentity?.ens || shortAddr(walletAddress)}
                {copiedAddress ? (
                  <Check size={12} className="text-green-400" />
                ) : (
                  <Copy size={12} className="opacity-0 group-hover:opacity-60 transition-opacity" />
                )}
              </button>
              {socialIdentity?.ens && (
                <span className="font-mono text-[10px] text-[#3a3a3a]/40">{shortAddr(walletAddress)}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {wType && (
              <span className="text-[9px] font-bold px-2 py-0.5 border border-[#e5e7eb] text-[#3a3a3a]/90 rounded-[6px]">
                {walletTypeLabel(wType)}
              </span>
            )}
            {activityLevel && (
              <span className="text-[9px] text-[#3a3a3a]/40">
                {activityLevel.replace(/_/g, ' ')} activity
              </span>
            )}
          </div>
        </div>
      </div>

      {/* --- PORTFOLIO VALUE + KEY METRICS --- */}
      <SectionHeader label="Portfolio Overview" open={openSections.portfolio} onToggle={() => toggleSection('portfolio')} />
      <AnimatePresence initial={false}>
        {openSections.portfolio && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e5e7eb]">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[10px] text-[#3a3a3a]/40">Total Portfolio</div>
                  <div className="font-mono text-2xl font-bold text-[#3a3a3a] tracking-tight mt-0.5">
                    {formatUSD(summary.totalPortfolioUSD || 0)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-mono text-sm font-bold ${risk.cls}`}>{risk.text}</div>
                  <div className="font-mono text-[10px] text-[#3a3a3a]/40 mt-0.5">{summary.overallRiskScore}/100</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {[
                  { label: 'Chains', value: summary.totalChainsActive },
                  { label: 'Tokens', value: summary.totalTokens },
                  { label: 'NFTs', value: summary.totalNFTs },
                  { label: 'DeFi', value: summary.totalDeFiPositions || 0 },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center gap-1.5 px-2.5 py-1 border border-[#e5e7eb]/60 bg-[#f8fafc] rounded-[6px]">
                    <span className="text-[9px] text-[#3a3a3a]/40">{stat.label}</span>
                    <span className="font-mono text-xs font-bold text-[#3a3a3a]">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- TOP HOLDINGS --- */}
      {topTokens.length > 0 && (
        <>
          <SectionHeader label="Top Holdings" open={openSections.holdings} onToggle={() => toggleSection('holdings')} />
          <AnimatePresence initial={false}>
            {openSections.holdings && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e5e7eb]">
                  <div className="space-y-0">
                    {topTokens.map((token: any, idx: number) => (
                      <div key={`${token.symbol}-${idx}`} className="flex items-center justify-between py-2 border-b border-[#e5e7eb]/40 last:border-0">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 bg-[#3a3a3a] rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="font-mono text-[8px] font-bold text-white">{(token.symbol || '?').slice(0, 2)}</span>
                          </div>
                          <div>
                            <div className="font-mono text-xs font-bold text-[#3a3a3a]">{token.symbol}</div>
                            <div className="text-[9px] text-[#3a3a3a]/30">{token.chain}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xs font-bold text-[#3a3a3a]">{token.balanceUSD > 0 ? formatUSD(token.balanceUSD) : '-'}</div>
                          <div className="font-mono text-[9px] text-[#3a3a3a]/30">{formatBalance(token.balanceFormatted)} {token.symbol}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* --- PORTFOLIO ANALYSIS --- */}
      {portfolioAnalysis && (
        <>
          <SectionHeader label="Portfolio Analysis" open={openSections.portfolioAnalysis} onToggle={() => toggleSection('portfolioAnalysis')} />
          <AnimatePresence initial={false}>
            {openSections.portfolioAnalysis && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e5e7eb]">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[9px] text-[#3a3a3a]/40">Diversification</div>
                      <div className="font-mono text-lg font-bold text-[#3a3a3a] mt-0.5">{portfolioAnalysis.diversificationScore}<span className="text-xs text-[#3a3a3a]/30">/100</span></div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#3a3a3a]/40">Concentration</div>
                      <div className={`font-mono text-sm font-bold mt-1 ${portfolioAnalysis.concentrationRisk === 'high' ? 'text-red-600' : portfolioAnalysis.concentrationRisk === 'medium' ? 'text-amber-600' : 'text-green-600'}`}>{portfolioAnalysis.concentrationRisk}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#3a3a3a]/40">Stablecoins</div>
                      <div className="font-mono text-lg font-bold text-[#3a3a3a] mt-0.5">{((portfolioAnalysis.stablecoinRatio || 0) * 100).toFixed(0)}<span className="text-xs text-[#3a3a3a]/30">%</span></div>
                    </div>
                  </div>
                  {portfolioAnalysis.chainDistribution?.length > 0 && (
                    <div className="mt-4">
                      <div className="flex h-2 w-full overflow-hidden bg-[#f8fafc] rounded-full">
                        {portfolioAnalysis.chainDistribution.map((cd: any, idx: number) => {
                          const fills = ['bg-[#3a3a3a]', 'bg-[#3a3a3a]/40', 'bg-[#3a3a3a]/20', 'bg-[#3a3a3a]/10'];
                          return <div key={idx} className={fills[idx % fills.length]} style={{ width: `${Math.max(cd.percentageOfPortfolio, 2)}%` }} title={`${cd.chain}: ${cd.percentageOfPortfolio.toFixed(1)}%`} />;
                        })}
                      </div>
                      <div className="flex gap-3 mt-1.5">
                        {portfolioAnalysis.chainDistribution.map((cd: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-[#3a3a3a]' : idx === 1 ? 'bg-[#3a3a3a]/40' : 'bg-[#3a3a3a]/20'}`} />
                            <span className="text-[9px] text-[#3a3a3a]/50">{cd.chain} {cd.percentageOfPortfolio.toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* --- AI PROFILE --- */}
      {(aiProfile?.profile?.summary || (!aiProfile && behaviorAnalysis)) && (
        <>
          <SectionHeader label="AI Analysis" open={openSections.aiProfile} onToggle={() => toggleSection('aiProfile')} />
          <AnimatePresence initial={false}>
            {openSections.aiProfile && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e5e7eb]">
                  {aiProfile?.profile?.summary && (
                    <>
                      <p className="text-[12px] leading-[1.7] text-[#3a3a3a]/80">{aiProfile.profile.summary}</p>
                      {aiProfile.profile.characteristics?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {aiProfile.profile.characteristics.map((trait: string, idx: number) => (
                            <span key={idx} className="px-2 py-0.5 bg-[#f8fafc] border border-[#e5e7eb]/60 text-[9px] text-[#3a3a3a]/60 rounded-[6px]">{trait}</span>
                          ))}
                        </div>
                      )}
                      {aiProfile.profile.notablePatterns?.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {aiProfile.profile.notablePatterns.map((p: string, idx: number) => (
                            <div key={idx} className="flex items-start gap-2">
                              <span className="text-[9px] text-[#3a3a3a]/20 mt-0.5">{'>'}</span>
                              <span className="text-[10px] text-[#3a3a3a]/60 leading-relaxed">{p}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {!aiProfile && behaviorAnalysis && (
                    <div className="flex flex-wrap gap-1.5">
                      {behaviorAnalysis.isWhale && <span className="px-2 py-0.5 border border-[#e5e7eb]/60 text-[9px] text-[#3a3a3a]/60 rounded-[6px]">Whale</span>}
                      {behaviorAnalysis.isDefiUser && <span className="px-2 py-0.5 border border-[#e5e7eb]/60 text-[9px] text-[#3a3a3a]/60 rounded-[6px]">DeFi User</span>}
                      {behaviorAnalysis.isNFTCollector && <span className="px-2 py-0.5 border border-[#e5e7eb]/60 text-[9px] text-[#3a3a3a]/60 rounded-[6px]">NFT Collector</span>}
                      {behaviorAnalysis.isTrader && <span className="px-2 py-0.5 border border-[#e5e7eb]/60 text-[9px] text-[#3a3a3a]/60 rounded-[6px]">Trader</span>}
                      {behaviorAnalysis.crossChainActivity && <span className="px-2 py-0.5 border border-[#e5e7eb]/60 text-[9px] text-[#3a3a3a]/60 rounded-[6px]">Multi-Chain</span>}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* --- CHAIN BREAKDOWN --- */}
      <SectionHeader label="Chain Breakdown" open={openSections.chains} onToggle={() => toggleSection('chains')} />
      <AnimatePresence initial={false}>
        {openSections.chains && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
      <div className="border-b border-[#e5e7eb]">
        <div>
        {chains.map((chain: any) => {
          const isExpanded = expandedChain === chain.chainName;
          const nativeSymbol =
            chain.chainName === 'Polygon' ? 'POL' :
            chain.chainName === 'BNB Smart Chain' ? 'BNB' :
            'ETH';

          const chainInitial =
            chain.chainName === 'Base' ? 'B' :
            chain.chainName === 'Polygon' ? 'P' :
            chain.chainName === 'Ethereum' ? 'E' :
            chain.chainName === 'Arbitrum' ? 'A' :
            chain.chainName === 'BNB Smart Chain' ? 'BSC' :
            chain.chainName?.[0];
          const tokenCount = chain.tokenBalances?.length || 0;
          const nftCount = chain.nftCollections?.length || 0;
          const defiCount = chain.defiPositions?.length || 0;

          return (
            <div key={chain.chainId} className="border-t border-[#e5e7eb]/40">
              <button
                onClick={() => setExpandedChain(isExpanded ? null : chain.chainName)}
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#f7f7f7] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-[#3a3a3a] rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="font-mono text-[9px] font-bold text-white">
                      {chainInitial}
                    </span>
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-[#3a3a3a]">{chain.chainName}</div>
                    <div className="font-mono text-[10px] text-[#3a3a3a]/40">{formatUSD(chain.totalValueUSD)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tokenCount > 0 && (
                    <span className="text-[9px] text-[#3a3a3a]/40">{tokenCount} tokens</span>
                  )}
                  {nftCount > 0 && (
                    <span className="text-[9px] text-[#3a3a3a]/40">{nftCount} NFTs</span>
                  )}
                  {isExpanded ? <ChevronUp size={14} className="text-[#3a3a3a]/30" /> : <ChevronDown size={14} className="text-[#3a3a3a]/30" />}
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-4 space-y-4">
                      {/* Native + Tx count */}
                      <div className="flex gap-3">
                        <div className="flex-1 p-3 bg-[#f8fafc] border border-[#e5e7eb]/40 rounded-[8px]">
                          <div className="text-[9px] text-[#3a3a3a]/40">Native</div>
                          <div className="font-mono text-sm font-bold text-[#3a3a3a] mt-1">
                            {formatBalance(chain.nativeBalanceFormatted)} {nativeSymbol}
                          </div>
                          <div className="font-mono text-[10px] text-[#3a3a3a]/40">{formatUSD(chain.nativeBalanceUSD)}</div>
                        </div>
                        <div className="flex-1 p-3 bg-[#f8fafc] border border-[#e5e7eb]/40 rounded-[8px]">
                          <div className="text-[9px] text-[#3a3a3a]/40">Transactions</div>
                          <div className="font-mono text-sm font-bold text-[#3a3a3a] mt-1">
                            {(chain.transactionCount || 0).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Tokens */}
                      {tokenCount > 0 && (
                        <div>
                          <div className="text-[9px] text-[#3a3a3a]/40 mb-2">
                            ERC-20 Tokens ({tokenCount})
                          </div>
                          <div className="space-y-0">
                            {chain.tokenBalances.slice(0, 12).map((token: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between py-1.5 border-b border-[#e5e7eb]/40 last:border-0"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 bg-[#f8fafc] border border-[#e5e7eb]/40 rounded-full flex items-center justify-center">
                                    <span className="font-mono text-[7px] font-bold text-[#3a3a3a]/50">
                                      {(token.symbol || '?').slice(0, 2)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-mono text-[11px] font-bold text-[#3a3a3a]">{token.symbol}</span>
                                    <span className="text-[9px] text-[#3a3a3a]/30 ml-1.5">{token.name}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-mono text-[11px] font-bold text-[#3a3a3a]">
                                    {token.balanceUSD > 0 ? formatUSD(token.balanceUSD) : '-'}
                                  </div>
                                  <div className="font-mono text-[8px] text-[#3a3a3a]/30">
                                    {formatBalance(token.balanceFormatted)}
                                  </div>
                                </div>
                              </div>
                            ))}
                            {tokenCount > 12 && (
                              <div className="text-[9px] text-[#3a3a3a]/30 pt-2">
                                +{tokenCount - 12} more tokens
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* NFTs */}
                      {nftCount > 0 && (
                        <div>
                          <div className="text-[9px] text-[#3a3a3a]/40 mb-2">
                            NFT Collections ({nftCount})
                          </div>
                          {chain.nftCollections.slice(0, 5).map((nft: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between py-1.5 border-b border-[#e5e7eb]/40 last:border-0">
                              <span className="text-[11px] font-bold text-[#3a3a3a]">{nft.name}</span>
                              <span className="font-mono text-[10px] text-[#3a3a3a]/40">{nft.tokenCount} owned</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* DeFi */}
                      {defiCount > 0 && (
                        <div>
                          <div className="text-[9px] text-[#3a3a3a]/40 mb-2">
                            DeFi Positions ({defiCount})
                          </div>
                          {chain.defiPositions.map((pos: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between py-1.5 border-b border-[#e5e7eb]/40 last:border-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-[#3a3a3a]">{pos.protocol}</span>
                                <span className="text-[9px] text-[#3a3a3a]/30">{pos.type}</span>
                              </div>
                              <span className="font-mono text-[10px] text-[#3a3a3a]/60">{pos.amount} {pos.asset}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Empty state */}
                      {tokenCount === 0 && nftCount === 0 && defiCount === 0 && (
                        <div className="text-[10px] text-[#3a3a3a]/30 text-center py-2">
                          Only native balance on this chain
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- SECURITY --- */}
      {riskAnalysis && (
        <>
          <SectionHeader label="Security" open={openSections.security} onToggle={() => toggleSection('security')} />
          <AnimatePresence initial={false}>
            {openSections.security && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e5e7eb]">
                  <div className="flex gap-4">
                    <div>
                      <div className="text-[9px] text-[#3a3a3a]/40">Scam Tokens</div>
                      <div className="font-mono text-sm font-bold text-[#3a3a3a] mt-0.5">{riskAnalysis.scamTokensDetected}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#3a3a3a]/40">Bad Approvals</div>
                      <div className="font-mono text-sm font-bold text-[#3a3a3a] mt-0.5">{riskAnalysis.dangerousApprovals}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#3a3a3a]/40">Phishing</div>
                      <div className="font-mono text-sm font-bold text-[#3a3a3a] mt-0.5">{riskAnalysis.phishingRisk}</div>
                    </div>
                  </div>
                  {riskAnalysis.warnings?.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {riskAnalysis.warnings.map((w: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="text-[9px] text-red-500 mt-0.5">!</span>
                          <span className="text-[10px] text-[#3a3a3a]/60 leading-relaxed">{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* --- RECOMMENDATIONS --- */}
      {recommendations.length > 0 && (
        <>
          <SectionHeader label={`Recommendations (${recommendations.length})`} open={openSections.recommendations} onToggle={() => toggleSection('recommendations')} />
          <AnimatePresence initial={false}>
            {openSections.recommendations && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e5e7eb]">
                  <div className="space-y-2">
                    {visibleRecs.map((rec: any, idx: number) => (
                      <div key={idx} className={`pl-3 py-2 pr-3 border-l-2 ${priorityColor(rec.priority)} bg-[#f8fafc] rounded-r-[8px]`}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[8px] font-bold text-[#3a3a3a]/40">{rec.category}</span>
                          <span className="text-[8px] text-[#3a3a3a]/25">{rec.priority}</span>
                        </div>
                        <div className="text-[11px] font-bold text-[#3a3a3a]">{rec.action}</div>
                        {rec.reason && <div className="text-[10px] text-[#3a3a3a]/40 mt-0.5">{rec.reason}</div>}
                      </div>
                    ))}
                  </div>
                  {recommendations.length > 3 && (
                    <button onClick={() => setShowAllRecs(!showAllRecs)} className="text-[10px] text-[#3a3a3a]/40 hover:text-[#3a3a3a] transition-colors mt-2">
                      {showAllRecs ? 'Show less' : `+${recommendations.length - 3} more`}
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* --- WARNINGS --- */}
      {aiProfile?.warnings?.length > 0 && (
        <>
          <SectionHeader label="Warnings" open={openSections.warnings} onToggle={() => toggleSection('warnings')} />
          <AnimatePresence initial={false}>
            {openSections.warnings && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e5e7eb] bg-red-50/30">
                  <div className="space-y-1.5">
                    {aiProfile.warnings.map((w: string, idx: number) => (
                      <div key={idx} className="text-[11px] text-red-700/70 leading-relaxed">{w}</div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* --- FOOTER --- */}
      <div className="px-5 py-2.5 flex items-center justify-between">
        <span className="text-[9px] text-[#3a3a3a]/20">
          {chains.length} chain{chains.length !== 1 ? 's' : ''} analyzed
        </span>
        <a
          href={`https://basescan.org/address/${walletAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] text-[#3a3a3a]/30 hover:text-[#3a3a3a] transition-colors flex items-center gap-1"
        >
          Explorer <ExternalLink size={9} />
        </a>
      </div>
    </motion.div>
  );
}
