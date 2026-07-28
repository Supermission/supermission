'use client';

import React, { useState, useMemo } from 'react';
import { useWalletData } from '@/lib/hooks/dashboard/useWalletData';
import { useBatchSparklines } from '@/lib/hooks/dashboard/useBatchSparklines';
import { Address } from 'viem';
import { CardLoadingSkeleton } from '../shared/LoadingState';
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { getChainIcon } from '../shared/ChainIcons';
import { Sparkline } from '../shared/Sparkline';
import { TokenDetailPanel } from './TokenDetailPanel';

// Map token symbols to CoinDesk symbols for sparkline lookups
const SYMBOL_MAP: Record<string, string> = {
  'USDC': 'USDC', 'USDC.e': 'USDC', 'USDbC': 'USDC',
  'USDT': 'USDT', 'DAI': 'DAI', 'ETH': 'ETH',
  'WETH': 'ETH', 'WBTC': 'BTC', 'MATIC': 'MATIC',
  'BNB': 'BNB', 'LINK': 'LINK', 'AAVE': 'AAVE', 'UNI': 'UNI',
};

interface WalletOverviewProps {
  address: Address | undefined;
}

export function WalletOverview({ address }: WalletOverviewProps) {
  const { data, isLoading, error } = useWalletData(address);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);

  // Collect unique symbols for sparkline batch fetch
  const sparklineSymbols = useMemo(() => {
    if (!data?.tokens) return [];
    return Array.from(new Set(
      data.tokens
        .map((t) => SYMBOL_MAP[t.symbol] || t.symbol)
        .filter(Boolean)
    ));
  }, [data?.tokens]);

  const { data: sparklineData } = useBatchSparklines(sparklineSymbols);

  if (isLoading) {
    return <CardLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="border border-red-300 rounded-[12px] bg-red-50 p-6">
        <h3 className="text-sm font-bold text-red-900 uppercase mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Failed to Load Wallet Data
        </h3>
        <p className="text-xs text-red-700 font-mono">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const toggleExpand = (key: string) => {
    setExpandedToken(expandedToken === key ? null : key);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-[#e5e7eb] rounded-[16px] p-4 bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
          <p className="text-xs text-[#6b7280] mb-1 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            Total Balance
          </p>
          <p className="text-2xl font-mono font-bold">
            ${data.summary.totalPortfolioUSD.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </p>
        </div>

        <div className="border border-[#e5e7eb] rounded-[16px] p-4 bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
          <p className="text-xs text-[#6b7280] mb-1 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            Token Holdings
          </p>
          <p className="text-2xl font-mono font-bold">{data.summary.totalTokenCount}</p>
          <p className="text-xs text-[#6b7280] font-mono mt-1">
            across {data.summary.totalChains} chains
          </p>
        </div>

        <div className="border border-[#e5e7eb] rounded-[16px] p-4 bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
          <p className="text-xs text-[#6b7280] mb-1 uppercase font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            Native Assets
          </p>
          <p className="text-2xl font-mono font-bold">
            ${data.summary.totalNativeUSD.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </p>
        </div>
      </div>

      {/* Chain Balances */}
      <div className="border border-[#e5e7eb] rounded-[16px] bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
        <div className="border-b border-[#e5e7eb] p-4">
          <h3 className="text-sm font-bold uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            Chain Balances
          </h3>
        </div>
        <div className="p-4 space-y-3">
          {data.chains.map((chain) => (
            <div
              key={chain.chainId}
              className="flex items-center justify-between p-3 border border-[#e5e7eb] rounded-[12px] hover:bg-[#f7f7f7] transition-colors"
            >
              <div className="flex items-center gap-3">
                {getChainIcon(chain.name, 24)}
                <div>
                  <p className="font-mono text-sm font-bold">{chain.name.toUpperCase()}</p>
                  <p className="text-xs text-[#6b7280] font-mono">
                    {chain.nativeBalance.toFixed(6)} {chain.nativeSymbol}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-bold">
                  ${chain.totalBalanceUSD.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </p>
                <p className="text-xs text-[#6b7280] font-mono">
                  {chain.tokenCount} {chain.tokenCount === 1 ? 'token' : 'tokens'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Token Holdings Table */}
      {data.tokens.length > 0 && (
        <div className="border border-[#e5e7eb] rounded-[16px] bg-white overflow-hidden shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
          <div className="border-b border-[#e5e7eb] p-4">
            <h3 className="text-sm font-bold uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              Token Holdings
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e5e7eb]">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    Token
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    Chain
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    Balance
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    Price
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    7D
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    Value
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.tokens.map((token, index) => {
                  const tokenKey = `${token.chainId}-${token.address}`;
                  const isExpanded = expandedToken === tokenKey;
                  const cdSymbol = SYMBOL_MAP[token.symbol] || token.symbol;
                  const sparkData = sparklineData?.get(cdSymbol);

                  return (
                    <React.Fragment key={tokenKey}>
                      <tr
                        className={`${
                          !isExpanded && index !== data.tokens.length - 1 ? 'border-b border-[#e5e7eb]' : ''
                        } ${isExpanded ? 'bg-[#f3f4f6]' : 'hover:bg-[#f7f7f7]'} active:bg-[#ebebeb] transition-colors cursor-pointer`}
                        onClick={() => toggleExpand(tokenKey)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronUp size={12} className="text-[#6b7280]" />
                            ) : (
                              <ChevronDown size={12} className="text-[#6b7280]" />
                            )}
                            <div>
                              <p className="font-mono text-sm font-bold">{token.symbol}</p>
                              <p className="text-xs text-[#6b7280] font-mono">{token.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {getChainIcon(getChainName(token.chainId), 16)}
                            <span className="font-mono text-xs">
                              {getChainName(token.chainId)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm">
                          {parseFloat(token.balance).toLocaleString('en-US', {
                            maximumFractionDigits: 6
                          })}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm">
                          ${token.priceUSD.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 6
                          })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {sparkData ? (
                            <Sparkline data={sparkData} />
                          ) : (
                            <span className="text-[10px] text-[#6b7280] font-mono">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-bold">
                          ${token.balanceUSD.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <a
                            href={getExplorerUrl(token.chainId, token.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#6b7280] hover:text-black transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={14} />
                          </a>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className={index !== data.tokens.length - 1 ? 'border-b border-[#e5e7eb]' : ''}>
                          <td colSpan={7}>
                            <TokenDetailPanel
                              symbol={cdSymbol}
                              currentPrice={token.priceUSD}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {data.tokens.length === 0 && (
        <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-12 text-center shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
          <h3 className="text-sm font-bold uppercase mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>No Token Holdings</h3>
          <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            This wallet only holds native assets ({data.chains.map(c => c.nativeSymbol).join(', ')})
          </p>
        </div>
      )}
    </div>
  );
}

// Helper: Get chain name by ID
function getChainName(chainId: number): string {
  const names: Record<number, string> = {
    8453: 'Base',
    137: 'Polygon',
    10: 'Optimism',
    1: 'Ethereum',
    42161: 'Arbitrum',
  };
  return names[chainId] || `Chain ${chainId}`;
}

// Helper: Get block explorer URL
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
