'use client';

import { Recommendation, RiskLevel, TokenDueDiligenceResponse } from '@/lib/new-agents/tokenDueDiligence/types';
import React, { useState } from 'react';
import Image from 'next/image';
import { shortAddress } from '@/components/ui/contract-address';

function getChainSlug(chain: string): string {
  const chainMap: Record<string, string> = {
    'base_mainnet': 'base',
    'ethereum_mainnet': 'ethereum',
    'ethereum': 'ethereum',
    'eth_mainnet': 'ethereum',
    'eth': 'ethereum',
    'polygon_mainnet': 'polygon',
    'polygon': 'polygon',
    'arbitrum_mainnet': 'arbitrum',
    'arbitrum': 'arbitrum',
    'optimism_mainnet': 'optimism',
    'optimism': 'optimism',
    'bsc_mainnet': 'bsc',
    'bsc': 'bsc',
    'avalanche_mainnet': 'avalanche',
    'avalanche': 'avalanche',
    'solana_mainnet': 'solana',
    'solana': 'solana',
  };

  const normalized = chain.toLowerCase();
  return chainMap[normalized] || normalized.replace('_mainnet', '');
}

function getExplorerUrl(chain: string, address: string): string {
  const explorers: Record<string, string> = {
    'ethereum': 'https://etherscan.io/token/',
    'eth': 'https://etherscan.io/token/',
    'base': 'https://basescan.org/token/',
    'polygon': 'https://polygonscan.com/token/',
    'arbitrum': 'https://arbiscan.io/token/',
    'optimism': 'https://optimistic.etherscan.io/token/',
    'bsc': 'https://bscscan.com/token/',
    'avalanche': 'https://snowtrace.io/token/',
    'solana': 'https://solscan.io/token/',
  };
  const baseUrl = explorers[chain.toLowerCase()] || 'https://etherscan.io/token/';
  return `${baseUrl}${address}`;
}

function formatNumber(num?: number): string {
  if (num === undefined || Number.isNaN(num)) return '-';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

function formatSupply(num?: number): string {
  if (num === undefined || Number.isNaN(num)) return '-';
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(0);
}

function formatPrice(num?: number): string {
  if (num === undefined || Number.isNaN(num)) return '-';
  if (num >= 1) return `$${num.toFixed(2)}`;
  if (num >= 0.01) return `$${num.toFixed(4)}`;
  return `$${num.toFixed(6)}`;
}

function getRiskStyle(level?: RiskLevel | string) {
  switch (level) {
    case 'LOW': return 'bg-green-700 text-white';
    case 'MEDIUM': return 'bg-amber-600 text-white';
    case 'HIGH': return 'bg-red-700 text-white';
    default: return 'bg-[#e5e7eb] text-[#3a3a3a]';
  }
}

function getRecStyle(rec?: Recommendation) {
  switch (rec) {
    case 'BUY': return 'bg-green-700 text-white';
    case 'HOLD': return 'bg-amber-600 text-white';
    case 'SELL':
    case 'AVOID': return 'bg-red-700 text-white';
    default: return 'bg-[#e5e7eb] text-white';
  }
}

type Tab = 'overview' | 'market' | 'security' | 'details' | 'chart';

export function TokenDDResultPanel({ data }: { data: TokenDueDiligenceResponse | null }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);
  if (!data || !data.token) return null;

  const chainSlug = getChainSlug(data.token.chain);
  const url = `https://dexscreener.com/${chainSlug}/${data.token.address}?embed=1&theme=light&trades=0&info=0`

  const handleAddressClick = (e: React.MouseEvent) => {
    if (e.altKey) {
      window.open(getExplorerUrl(data.token.chain, data.token.address), '_blank');
    } else {
      navigator.clipboard.writeText(data.token.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const { token, verdict, price, tokenomics, holders, liquidity, security, risk, lastUpdated } = data;

  return (
    <div className="max-w-sm bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden font-sans">

      {/* Header */}
      <div className="p-3 border-b border-[#e5e7eb] bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#f8fafc] border border-[#e5e7eb] rounded-[8px] flex items-center justify-center overflow-hidden">
            {token.logo ? (
              <Image src={token.logo} width={40} height={40} className="w-full h-full object-cover" alt="" unoptimized />
            ) : (
              <span className="font-mono font-bold text-sm text-[#3a3a3a]">{token.symbol?.charAt(0)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#3a3a3a] tracking-tight text-sm">{token.name}</span>
              <span className="font-mono text-xs text-black/50 font-bold">{token.symbol}</span>
              {token.verified && (
                <svg className="w-3.5 h-3.5 text-green-700" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="font-mono text-[10px] text-black/50 font-bold mt-0.5 flex items-center gap-1.5">
              <span>{token.chain}</span>
              <span>·</span>
              <button
                onClick={handleAddressClick}
                className="flex items-center gap-1 hover:text-black transition-colors cursor-pointer"
                title="Click to copy, Alt+click for explorer"
              >
                <span>{shortAddress(token.address)}</span>
                {copied ? (
                  <svg className="w-3 h-3 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {price ? (
            <div className="text-right">
              <div className="font-mono font-bold text-[#3a3a3a] tracking-tight text-sm">{formatPrice(price.current)}</div>
              {price.percentChange?.["24h"] !== undefined && (
                <div className={`font-mono text-[10px] font-bold ${price.percentChange["24h"] >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {price.percentChange["24h"] >= 0 ? '+' : ''}{price.percentChange["24h"].toFixed(2)}%
                </div>
              )}
            </div>
          ) : (
            <div className="text-right">
              <span className="font-mono text-[10px] text-black/30 font-bold">No price data</span>
            </div>
          )}
        </div>
      </div>

      {/* Verdict Banner */}
      <div className="border-b border-[#e5e7eb] bg-[#f8fafc] p-3 flex items-center gap-3">
        <RiskSpeedometer score={Math.round(verdict.confidence * 100)} size={60} />
        <div className="flex-1">
          <span className={`inline-block px-2 py-0.5 rounded-[6px] text-[10px] font-bold ${
            verdict.overall === 'LOW' ? 'bg-green-700 text-white' : verdict.overall === 'MEDIUM' ? 'bg-amber-600 text-white' : 'bg-red-700 text-white'
          }`}>
            {verdict.overall} RISK
          </span>
        </div>
        {(token.website || token.socials) && (
          <div className="flex items-center gap-2">
            {token.website && (
              <a href={token.website} target="_blank" rel="noopener noreferrer" className="text-black/40 hover:text-black transition-colors" title="Website">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </a>
            )}
            {token.socials?.twitter && (
              <a href={token.socials.twitter} target="_blank" rel="noopener noreferrer" className="text-black/40 hover:text-black transition-colors" title="X (Twitter)">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            )}
            {token.socials?.telegram && (
              <a href={token.socials.telegram} target="_blank" rel="noopener noreferrer" className="text-black/40 hover:text-black transition-colors" title="Telegram">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              </a>
            )}
            {token.socials?.discord && (
              <a href={token.socials.discord} target="_blank" rel="noopener noreferrer" className="text-black/40 hover:text-black transition-colors" title="Discord">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                </svg>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#e5e7eb] bg-white">
        {(['overview', 'market', 'security', 'details', 'chart'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-[10px] font-bold transition-all border-r border-[#e5e7eb] last:border-r-0 ${
              activeTab === tab
                ? 'bg-[#3a3a3a] text-white'
                : 'text-black/50 hover:text-[#3a3a3a] hover:bg-[#f7f7f7]'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-3">

        {activeTab === 'overview' && (
          <div className="space-y-3">
            {verdict.summary && (
              <p className="text-[11px] text-black/70 leading-snug">{verdict.summary}</p>
            )}

            {price ? (
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Market Cap" value={formatNumber(price.marketCap)} />
                <Stat label="Volume 24h" value={formatNumber(price.volume24h)} />
                <Stat label="Holders" value={holders?.count?.toLocaleString() || '-'} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Holders" value={holders?.count?.toLocaleString() || '-'} />
                <Stat label="Liquidity" value={formatNumber(liquidity?.totalUsd)} />
              </div>
            )}

            {risk && (
              <div className="grid grid-cols-2 gap-1.5">
                <MiniRow label="Scam Risk" badge={risk.scamRisk} />
                <MiniRow label="Rug Pull" badge={risk.rugRisk} />
                <MiniRow label="Liquidity Risk" badge={risk.liquidityRisk} />
                <MiniRow label="Manipulation" badge={risk.manipulationRisk} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between py-2 px-3 border border-[#e5e7eb] rounded-[8px] bg-white">
                <span className="text-[10px] text-black/60 font-bold">Short</span>
                <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-[4px] ${getRecStyle(verdict.recommendation.trade)}`}>
                  {verdict.recommendation.trade}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 border border-[#e5e7eb] rounded-[8px] bg-white">
                <span className="text-[10px] text-black/60 font-bold">Long</span>
                <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-[4px] ${getRecStyle(verdict.recommendation.invest)}`}>
                  {verdict.recommendation.invest}
                </span>
              </div>
            </div>

            {verdict.keyFactors.length > 0 && (
              <div className="rounded-[8px] overflow-hidden">
                <div className="px-3 py-1.5 bg-white border-b border-[#e5e7eb]">
                  <span className="text-[10px] font-bold text-[#3a3a3a]">Key Factors</span>
                </div>
                <div className="border border-[#e5e7eb] border-t-0 p-2 space-y-1 rounded-b-[8px]">
                  {verdict.keyFactors.slice(0, 3).map((f, i) => (
                    <p key={i} className="text-[11px] text-black/70 leading-snug">
                      • {f}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'market' && (
          <div className="space-y-3">
            {price ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Price" value={formatPrice(price.current)} />
                  <Stat label="FDV" value={formatNumber(price.fdv)} />
                  <Stat label="Market Cap" value={formatNumber(price.marketCap)} />
                  <Stat label="24h Volume" value={formatNumber(price.volume24h)} />
                </div>

                <div className="rounded-[8px] overflow-hidden">
                  <div className="px-3 py-1.5 bg-white border-b border-[#e5e7eb]">
                    <span className="text-[10px] font-bold text-[#3a3a3a]">Price Change</span>
                  </div>
                  <div className="grid grid-cols-4 border border-[#e5e7eb] border-t-0 rounded-b-[8px]">
                    <ChangeCell label="1h" value={price.percentChange?.["1h"]} />
                    <ChangeCell label="24h" value={price.percentChange?.["24h"]} />
                    <ChangeCell label="7d" value={price.percentChange?.["7d"]} />
                    <ChangeCell label="30d" value={price.percentChange?.["30d"]} />
                  </div>
                </div>
              </>
            ) : (
              <div className="border border-[#e5e7eb] bg-[#f8fafc] rounded-[8px] p-4 text-center">
                <span className="text-[10px] text-black/40 font-bold">Price data unavailable for this token</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Stat label="Liquidity" value={formatNumber(liquidity?.totalUsd)} />
              <Stat label="DEXs" value={liquidity?.dexCount?.toString() || '-'} />
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          security ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border border-[#e5e7eb] rounded-[8px] bg-white">
                <span className="text-[10px] text-black/60 font-bold">Security Score</span>
                <span className={`font-mono text-2xl font-black tracking-tight ${
                  security.securityScore >= 80 ? 'text-green-700' : security.securityScore >= 50 ? 'text-amber-600' : 'text-red-700'
                }`}>{security.securityScore}<span className="text-sm text-black/30 font-bold">/100</span></span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Check label="Honeypot" safe={!security.isHoneypot} />
                <Check label="Mintable" safe={!security.canMint} />
                <Check label="Pausable" safe={!security.canPauseTransfers} />
                <Check label="Owner Change" safe={!security.canChangeOwnership} />
                <Check label="Hidden Owner" safe={!security.hiddenOwner} />
                <Check label="Open Source" safe={security.openSource} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className={`p-3 text-center border border-[#e5e7eb] rounded-[8px] ${(security.buyTaxPercent ?? 0) > 10 ? 'bg-red-50' : 'bg-white'}`}>
                  <div className="text-[10px] text-black/60 font-bold">Buy Tax</div>
                  <div className={`font-mono text-xl font-black tracking-tight mt-1 ${(security.buyTaxPercent ?? 0) > 10 ? 'text-red-700' : 'text-[#3a3a3a]'}`}>
                    {security.buyTaxPercent ?? 0}%
                  </div>
                </div>
                <div className={`p-3 text-center border border-[#e5e7eb] rounded-[8px] ${(security.sellTaxPercent ?? 0) > 10 ? 'bg-red-50' : 'bg-white'}`}>
                  <div className="text-[10px] text-black/60 font-bold">Sell Tax</div>
                  <div className={`font-mono text-xl font-black tracking-tight mt-1 ${(security.sellTaxPercent ?? 0) > 10 ? 'text-red-700' : 'text-[#3a3a3a]'}`}>
                    {security.sellTaxPercent ?? 0}%
                  </div>
                </div>
              </div>

              {security.proxyContract && (
                <div className="text-[10px] text-amber-700 font-bold bg-amber-100 border border-amber-600 rounded-[8px] py-2 px-3 text-center">
                  Proxy contract -- upgradeable
                </div>
              )}
            </div>
          ) : (
            <div className="border border-[#e5e7eb] bg-[#f8fafc] rounded-[8px] p-4 text-center">
              <span className="text-[10px] text-black/40 font-bold">Security data unavailable for this token</span>
            </div>
          )
        )}

        {activeTab === 'details' && (
          <div className="space-y-3">
            {token.description && (
              <div className="rounded-[8px] overflow-hidden">
                <div className="px-3 py-1.5 bg-white border-b border-[#e5e7eb]">
                  <span className="text-[10px] font-bold text-[#3a3a3a]">About</span>
                </div>
                <div className="border border-[#e5e7eb] border-t-0 p-2 rounded-b-[8px]">
                  <p className="text-[11px] text-black/70 leading-snug">{token.description}</p>
                </div>
              </div>
            )}

            <div className="rounded-[8px] overflow-hidden">
              <div className="px-3 py-1.5 bg-white border-b border-[#e5e7eb]">
                <span className="text-[10px] font-bold text-[#3a3a3a]">Tokenomics</span>
              </div>
              <div className="border border-[#e5e7eb] border-t-0 p-2 space-y-2 rounded-b-[8px]">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Total Supply" value={formatSupply(tokenomics?.totalSupply)} />
                  <Stat label="Circulating" value={formatSupply(tokenomics?.circulatingSupply ?? 0)} />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <MiniRow label="Mintable" badge={tokenomics?.isMintable ? 'Yes' : 'No'} variant={tokenomics?.isMintable ? 'danger' : 'success'} />
                  <MiniRow label="Inflation" badge={tokenomics?.inflationRisk} />
                </div>
              </div>
            </div>

            <div className="rounded-[8px] overflow-hidden">
              <div className="px-3 py-1.5 bg-white border-b border-[#e5e7eb]">
                <span className="text-[10px] font-bold text-[#3a3a3a]">Holder Distribution</span>
              </div>
              <div className="border border-[#e5e7eb] border-t-0 p-2 space-y-2 rounded-b-[8px]">
                <BarRow label="Top 10" value={holders?.top10Percent} />
                <BarRow label="Top 50" value={holders?.top50Percent} />
                {holders?.creatorPercent > 0 && <BarRow label="Creator" value={holders?.creatorPercent} />}
              </div>
            </div>
          </div>
        )}

       {activeTab === 'chart' && (
          <div className="h-[400px] border border-[#e5e7eb] rounded-[8px] overflow-hidden bg-white">
            <iframe
              src={url}
              className="w-full h-full border-0"
              title="Token Chart"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#e5e7eb] flex justify-between items-center bg-[#f8fafc]">
        <span className="text-[9px] text-black/50 font-bold">Due Diligence Report</span>
        <span className="font-mono text-[9px] text-black/50 font-bold">{new Date(lastUpdated).toLocaleString()}</span>
      </div>
    </div>
  );
}

// === Small Components ===

function RiskSpeedometer({ score, size = 100 }: { score: number; size?: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const scale = size / 100;
  const strokeWidth = 6 * scale;
  const radius = (size - strokeWidth) / 2;
  const centerX = size / 2;
  const centerY = size / 2 + 4 * scale;

  const startAngle = 180;
  const scoreAngle = 180 - (clampedScore / 100) * 180;

  const polarToCartesian = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: centerX + radius * Math.cos(rad),
      y: centerY - radius * Math.sin(rad),
    };
  };

  const createArc = (startAng: number, endAng: number) => {
    const start = polarToCartesian(startAng);
    const end = polarToCartesian(endAng);
    const largeArcFlag = Math.abs(endAng - startAng) > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  };

  const ticks = [0, 25, 50, 75, 100];
  const tickLength = 3 * scale;
  const innerRadius = radius - strokeWidth / 2 - 2 * scale;
  const outerRadius = innerRadius - tickLength;

  const getScoreColor = () => {
    if (clampedScore >= 70) return '#b91c1c'; // red-700
    if (clampedScore >= 40) return '#d97706'; // amber-600
    return '#15803d'; // green-700
  };

  const scoreColor = getScoreColor();

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 16 * scale} viewBox={`0 0 ${size} ${size / 2 + 16 * scale}`}>
        {/* Background arc */}
        <path
          d={createArc(startAngle, 0)}
          fill="none"
          stroke="#e5e7eb"
          strokeOpacity={1}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Score arc */}
        {clampedScore > 0 && (
          <path
            d={createArc(startAngle, scoreAngle)}
            fill="none"
            stroke={scoreColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}

        {/* Tick marks */}
        {ticks.map((tick) => {
          const angle = 180 - (tick / 100) * 180;
          const inner = {
            x: centerX + innerRadius * Math.cos((angle * Math.PI) / 180),
            y: centerY - innerRadius * Math.sin((angle * Math.PI) / 180),
          };
          const outer = {
            x: centerX + outerRadius * Math.cos((angle * Math.PI) / 180),
            y: centerY - outerRadius * Math.sin((angle * Math.PI) / 180),
          };

          return (
            <line
              key={tick}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#e5e7eb"
              strokeOpacity={1}
              strokeWidth={1}
            />
          );
        })}

        {/* Needle */}
        {(() => {
          const needleAngle = 180 - (clampedScore / 100) * 180;
          const needleLength = radius - 10 * scale;
          const needleEnd = {
            x: centerX + needleLength * Math.cos((needleAngle * Math.PI) / 180),
            y: centerY - needleLength * Math.sin((needleAngle * Math.PI) / 180),
          };
          return (
            <>
              <line
                x1={centerX}
                y1={centerY}
                x2={needleEnd.x}
                y2={needleEnd.y}
                stroke={scoreColor}
                strokeWidth={2 * scale}
                strokeLinecap="round"
              />
              <circle cx={centerX} cy={centerY} r={3 * scale} fill={scoreColor} />
            </>
          );
        })()}

        {/* Score text */}
        <text
          x={centerX}
          y={centerY + 10 * scale}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-[#3a3a3a]"
          style={{ fontSize: `${12 * scale}px`, fontWeight: 700, fontFamily: 'monospace' }}
        >
          {Math.round(clampedScore)}
        </text>
      </svg>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#e5e7eb] rounded-[8px] bg-white p-2">
      <div className="text-[9px] text-black/50 font-bold">{label}</div>
      <div className="font-mono font-bold text-[#3a3a3a] tracking-tight mt-0.5 text-sm">{value}</div>
    </div>
  );
}

function MiniRow({ label, badge, variant }: { label: string; badge?: string; variant?: 'success' | 'danger' | 'neutral' }) {
  let style = getRiskStyle(badge);
  if (variant === 'success') style = 'bg-green-700 text-white';
  if (variant === 'danger') style = 'bg-red-700 text-white';
  if (variant === 'neutral') style = 'bg-[#e5e7eb] text-[#3a3a3a]';

  return (
    <div className="flex items-center justify-between py-1.5 px-2 border border-[#e5e7eb] rounded-[8px] bg-white">
      <span className="text-[10px] text-black/60 font-bold">{label}</span>
      <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-[4px] ${style}`}>{badge || '-'}</span>
    </div>
  );
}

function ChangeCell({ label, value }: { label: string; value?: number }) {
  if (value === undefined) return (
    <div className="p-2 text-center border-r border-[#e5e7eb] last:border-r-0 bg-white">
      <div className="text-[9px] text-black/50 font-bold">{label}</div>
      <div className="font-mono text-[10px] text-black/30 font-bold mt-0.5">-</div>
    </div>
  );
  const positive = value >= 0;
  return (
    <div className="p-2 text-center border-r border-[#e5e7eb] last:border-r-0 bg-white">
      <div className="text-[9px] text-black/50 font-bold">{label}</div>
      <div className={`font-mono text-[11px] font-bold tracking-tight mt-0.5 ${positive ? 'text-green-700' : 'text-red-700'}`}>
        {positive ? '+' : ''}{value.toFixed(1)}%
      </div>
    </div>
  );
}

function Check({ label, safe }: { label: string; safe: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 px-2 border border-[#e5e7eb] rounded-[8px] ${safe ? 'bg-green-50' : 'bg-red-50'}`}>
      <span className="text-[10px] text-black/70 font-bold">{label}</span>
      <div className={`w-5 h-5 flex items-center justify-center rounded-full ${safe ? 'bg-green-700' : 'bg-red-700'}`}>
        <span className="text-white font-mono text-[9px] font-bold">{safe ? '✓' : '✗'}</span>
      </div>
    </div>
  );
}

function BarRow({ label, value }: { label: string; value?: number }) {
  const v = value ?? 0;
  const color = v > 50 ? 'bg-red-700' : v > 30 ? 'bg-amber-600' : 'bg-green-700';
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-black/60 font-bold w-12">{label}</span>
      <div className="flex-1 h-2 bg-[#f8fafc] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(v, 100)}%` }} />
      </div>
      <span className="font-mono text-[10px] font-bold text-[#3a3a3a] tracking-tight w-10 text-right">{v}%</span>
    </div>
  );
}
