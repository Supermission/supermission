'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTokenData } from '@/lib/hooks/dashboard/useTokenData';
import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { TokenAnalysisPanel } from './TokenAnalysisPanel';
import { SentimentCard } from './SentimentCard';

const SUPPORTED_CHAINS = [
  { id: 8453, name: 'Base' },
  { id: 137, name: 'Polygon' },
  { id: 10, name: 'Optimism' },
  { id: 1, name: 'Ethereum' },
];

export function TokenList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState(8453);

  const { data: tokenInfo, isLoading, error } = useTokenData(activeQuery, selectedChain);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim().replace(/^\$/, '');
    if (q) {
      setActiveQuery(q);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <div className="border border-[#e5e7eb] bg-white rounded-[16px] p-4 sm:p-6 overflow-hidden shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
        <h3 className="text-sm font-bold text-[#3a3a3a] mb-4" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Token Search
        </h3>

        <form onSubmit={handleSearch} className="space-y-4">
          {/* Search Input */}
          <div>
            <label className="block text-xs text-[#6b7280] font-bold uppercase mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              Token Address or Symbol
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="0x... or $USDC"
                className="flex-1 min-w-0 px-4 py-3 border border-[#e5e7eb] rounded-[8px] font-mono text-sm focus:outline-none focus:border-[#6b7280]"
              />
              <button
                type="submit"
                disabled={!searchQuery.trim() || isLoading}
                className="px-6 py-3 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white font-mono text-sm font-bold uppercase rounded-[8px] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {isLoading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {/* Chain Selector */}
          <div>
            <label className="block text-xs text-[#6b7280] font-bold uppercase mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              Network
            </label>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_CHAINS.map((chain) => (
                <button
                  key={chain.id}
                  type="button"
                  onClick={() => setSelectedChain(chain.id)}
                  className={`px-4 py-2 font-mono text-xs font-bold uppercase rounded-[8px] border transition-colors ${
                    selectedChain === chain.id
                      ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border-transparent'
                      : 'bg-white text-[#6b7280] border-[#e5e7eb] hover:bg-[#f7f7f7]'
                  }`}
                >
                  {chain.name}
                </button>
              ))}
            </div>
          </div>
        </form>

        {/* Quick Search Examples */}
        <div className="mt-4 pt-4 border-t border-black/10">
          <p className="text-xs text-[#6b7280] mb-2 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            Quick Search:
          </p>
          <div className="flex flex-wrap gap-2">
            {['USDC', 'WETH', 'USDT', 'WBTC', 'LINK', 'UNI', 'AAVE', 'MATIC', 'OP', 'ARB'].map((symbol) => (
              <button
                key={symbol}
                onClick={() => {
                  setSearchQuery(symbol);
                  setActiveQuery(symbol);
                }}
                className="px-3 py-1 bg-white border border-[#e5e7eb] rounded-[6px] font-mono text-xs hover:border-[#6b7280] transition-colors"
              >
                ${symbol}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="border border-red-300 bg-red-50 rounded-[16px] p-6">
          <h3 className="text-sm font-bold text-red-900 mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            Token Not Found
          </h3>
          <p className="text-xs text-red-700 font-mono mb-2">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <p className="text-xs text-red-600 font-mono">
            Try searching by token address (0x...) or symbol ($USDC, $WETH, etc.)
          </p>
        </div>
      )}

      {/* Token Info Card */}
      {tokenInfo && !error && (
        <div className="border border-[#e5e7eb] bg-white rounded-[16px] overflow-hidden shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
          {/* Header */}
          <div className="border-b border-[#e5e7eb] p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                {tokenInfo.logo && (
                  <Image
                    src={tokenInfo.logo}
                    alt={tokenInfo.symbol}
                    width={48}
                    height={48}
                    className="w-12 h-12 border border-[#e5e7eb] rounded-[8px]"
                    unoptimized
                  />
                )}
                <div>
                  <h3 className="text-xl font-bold text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{tokenInfo.symbol}</h3>
                  <p className="text-sm text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{tokenInfo.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-block px-2 py-0.5 border border-[#e5e7eb] rounded-[4px] font-mono text-xs font-bold">
                      {tokenInfo.chainName}
                    </span>
                    <a
                      href={getExplorerUrl(tokenInfo.chainId, tokenInfo.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-black/40 hover:text-black text-xs font-mono"
                    >
                      View on Explorer
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Price Section */}
          <div className="p-6 border-b border-black/10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-[#6b7280] mb-1 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  Price
                </p>
                <div className="flex items-baseline gap-3">
                  <p className="text-3xl font-mono font-bold">
                    ${tokenInfo.priceUSD.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6
                    })}
                  </p>
                  {tokenInfo.priceChange24h !== 0 && (
                    <div
                      className={`flex items-center gap-1 ${
                        tokenInfo.priceChange24h >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {tokenInfo.priceChange24h >= 0 ? (
                        <TrendingUp size={16} />
                      ) : (
                        <TrendingDown size={16} />
                      )}
                      <span className="font-mono text-sm font-bold">
                        {tokenInfo.priceChange24h >= 0 ? '+' : ''}
                        {tokenInfo.priceChange24h.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {tokenInfo.marketCap && (
                  <div>
                    <p className="text-xs text-[#6b7280] mb-1 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                      Market Cap
                    </p>
                    <p className="text-lg font-mono font-bold">
                      ${formatLargeNumber(tokenInfo.marketCap)}
                    </p>
                  </div>
                )}
                {tokenInfo.volume24h && (
                  <div>
                    <p className="text-xs text-[#6b7280] mb-1 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                      Volume (24h)
                    </p>
                    <p className="text-lg font-mono font-bold">
                      ${formatLargeNumber(tokenInfo.volume24h)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="p-6 border-b border-black/10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-[#6b7280] mb-1 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  Decimals
                </p>
                <p className="text-sm font-mono">{tokenInfo.decimals}</p>
              </div>

              {tokenInfo.totalSupply && (
                <div>
                  <p className="text-xs text-[#6b7280] mb-1 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    Total Supply
                  </p>
                  <p className="text-sm font-mono">{formatLargeNumber(parseFloat(tokenInfo.totalSupply))}</p>
                </div>
              )}

              {tokenInfo.liquidity && (
                <div>
                  <p className="text-xs text-[#6b7280] mb-1 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    Liquidity
                  </p>
                  <p className="text-sm font-mono">${formatLargeNumber(tokenInfo.liquidity)}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-[#6b7280] mb-1 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  Contract
                </p>
                <p className="text-sm font-mono truncate" title={tokenInfo.address}>
                  {tokenInfo.address.slice(0, 6)}...{tokenInfo.address.slice(-4)}
                </p>
              </div>
            </div>
          </div>

          {/* DexScreener Chart Embed */}
          <div className="p-6">
            <p className="text-xs text-black/40 font-mono mb-3 uppercase font-bold">
              Price Chart
            </p>
            <div className="border border-[#e5e7eb] rounded-[12px] overflow-hidden" style={{ height: '400px' }}>
              <iframe
                src={`https://dexscreener.com/${getPlatformName(tokenInfo.chainId)}/${tokenInfo.address}?embed=1&theme=light&trades=0&info=0`}
                className="w-full h-full"
                title={`${tokenInfo.symbol} Chart`}
              />
            </div>
            <p className="text-xs text-[#6b7280] mt-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              Chart data provided by DexScreener
            </p>
          </div>
        </div>
      )}

      {/* Token Analysis Panel - Premium Features */}
      {tokenInfo && !error && (
        <TokenAnalysisPanel tokenInfo={tokenInfo} />
      )}

      {/* Sentiment Analysis - Premium Features */}
      {tokenInfo && !error && (
        <SentimentCard tokenInfo={tokenInfo} />
      )}

      {/* Empty State */}
      {!tokenInfo && !isLoading && !error && (
        <div className="border border-[#e5e7eb] bg-white rounded-[16px] p-12 text-center shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
          <h3 className="text-sm font-bold text-[#3a3a3a] mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Search for a Token</h3>
          <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            Enter a token address (0x...) or symbol ($USDC) to view details
          </p>
        </div>
      )}
    </div>
  );
}

// Helper: Format large numbers
function formatLargeNumber(num: number): string {
  if (num >= 1e9) {
    return `${(num / 1e9).toFixed(2)}B`;
  } else if (num >= 1e6) {
    return `${(num / 1e6).toFixed(2)}M`;
  } else if (num >= 1e3) {
    return `${(num / 1e3).toFixed(2)}K`;
  }
  return num.toFixed(2);
}

// Helper: Get block explorer URL
function getExplorerUrl(chainId: number, tokenAddress: string): string {
  const explorers: Record<number, string> = {
    8453: 'https://basescan.org',
    137: 'https://polygonscan.com',
    10: 'https://optimistic.etherscan.io',
    1: 'https://etherscan.io',
  };
  const baseUrl = explorers[chainId] || 'https://basescan.org';
  return `${baseUrl}/token/${tokenAddress}`;
}

// Helper: Get DexScreener platform name
function getPlatformName(chainId: number): string {
  const platforms: Record<number, string> = {
    8453: 'base',
    137: 'polygon',
    10: 'optimism',
    1: 'ethereum',
  };
  return platforms[chainId] || 'base';
}
