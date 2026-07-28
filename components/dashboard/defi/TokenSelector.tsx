'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import type { TokenInfo } from '@/lib/uniswap/types';
import { useDefiStore } from '@/lib/store/defi';
import { TokenIconWithChain } from '@/components/dashboard/shared/TokenIcon';

interface TokenSelectorProps {
  onSelect: (token: TokenInfo) => void;
  onClose: () => void;
  selectedAddress?: string;
  userBalances?: Record<string, string>; // address (lowercase) -> formatted balance
  chainIdOverride?: number; // for cross-chain: fetch tokens from a different chain
}

const POPULAR_SYMBOLS = ['USDC', 'WETH', 'DAI', 'USDT', 'cbBTC'];

export function TokenSelector({ onSelect, onClose, selectedAddress, userBalances, chainIdOverride }: TokenSelectorProps) {
  const [query, setQuery] = useState('');
  const activeChainId = useDefiStore((s) => s.activeChainId);
  const tokenLists = useDefiStore((s) => s.tokenLists);
  const setTokenList = useDefiStore((s) => s.setTokenList);
  const [isLoading, setIsLoading] = useState(false);

  const effectiveChainId = chainIdOverride ?? activeChainId;
  const tokens = tokenLists[effectiveChainId] || [];

  useEffect(() => {
    if (tokens.length > 0) return;
    setIsLoading(true);
    fetch(`/api/defi/tokens?chainId=${effectiveChainId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.tokens) {
          setTokenList(effectiveChainId, data.tokens);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [effectiveChainId, tokens.length, setTokenList]);

  // Filter by search query
  const filtered = useMemo(() => {
    if (!query) return tokens;
    const q = query.toLowerCase();
    if (q.startsWith('0x') && q.length > 5) {
      return tokens.filter((t) => t.address.toLowerCase().includes(q));
    }
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q)
    );
  }, [tokens, query]);

  // Sort: tokens with balance first (descending by balance), then rest alphabetically
  const sorted = useMemo(() => {
    if (!userBalances || Object.keys(userBalances).length === 0) return filtered;
    const withBal: TokenInfo[] = [];
    const withoutBal: TokenInfo[] = [];
    for (const t of filtered) {
      const bal = userBalances[t.address.toLowerCase()];
      if (bal && parseFloat(bal) > 0) {
        withBal.push(t);
      } else {
        withoutBal.push(t);
      }
    }
    // Sort tokens with balance by balance descending
    withBal.sort((a, b) => {
      const balA = parseFloat(userBalances[a.address.toLowerCase()] || '0');
      const balB = parseFloat(userBalances[b.address.toLowerCase()] || '0');
      return balB - balA;
    });
    return [...withBal, ...withoutBal];
  }, [filtered, userBalances]);

  const popular = useMemo(
    () => tokens.filter((t) => POPULAR_SYMBOLS.includes(t.symbol)),
    [tokens]
  );

  // Check if any tokens have balance (for section headers)
  const hasAnyBalance = useMemo(() => {
    if (!userBalances) return false;
    return sorted.some(t => {
      const bal = userBalances[t.address.toLowerCase()];
      return bal && parseFloat(bal) > 0;
    });
  }, [sorted, userBalances]);

  // Index of first token without balance (for section divider)
  const firstNonBalanceIdx = useMemo(() => {
    if (!userBalances || !hasAnyBalance) return -1;
    return sorted.findIndex(t => {
      const bal = userBalances[t.address.toLowerCase()];
      return !bal || parseFloat(bal) <= 0;
    });
  }, [sorted, userBalances, hasAnyBalance]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white border border-[#e5e7eb] rounded-[12px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
          <span className="text-sm font-bold uppercase tracking-wider text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Select Token</span>
          <button onClick={onClose} className="hover:bg-[#f7f7f7] p-1 transition-colors rounded-[8px]">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[#e5e7eb]">
          <div className="flex items-center gap-2 px-3 py-2 border border-[#e5e7eb] rounded-[8px]">
            <Search size={14} className="text-[#6b7280]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, symbol, or address"
              className="flex-1 text-sm outline-none bg-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Popular tokens */}
        {!query && popular.length > 0 && (
          <div className="px-4 py-2 border-b border-[#e5e7eb]">
            <p className="text-[10px] uppercase tracking-wider text-[#6b7280] mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Popular</p>
            <div className="flex flex-wrap gap-1.5">
              {popular.map((t) => {
                const bal = userBalances?.[t.address.toLowerCase()];
                const hasBal = bal && parseFloat(bal) > 0;
                return (
                  <button
                    key={t.address}
                    onClick={() => onSelect(t)}
                    disabled={t.address.toLowerCase() === selectedAddress?.toLowerCase()}
                    className={`px-3 py-1.5 border border-[#e5e7eb] rounded-[8px] font-mono text-xs font-bold transition-colors flex items-center gap-1.5 ${
                      t.address.toLowerCase() === selectedAddress?.toLowerCase()
                        ? 'bg-black/10 text-[#6b7280] cursor-not-allowed'
                        : 'hover:bg-[#f7f7f7]'
                    }`}
                  >
                    {t.symbol}
                    {hasBal && (
                      <span className="text-[9px] font-normal text-[#6b7280]">{parseFloat(bal!).toFixed(bal!.includes('.') && parseFloat(bal!) < 1 ? 4 : 2)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Token list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-4 h-4 border-2 border-[#e5e7eb] border-t-black rounded-full animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>No tokens found</p>
            </div>
          ) : (
            sorted.map((token, index) => {
              const isSelected = token.address.toLowerCase() === selectedAddress?.toLowerCase();
              const bal = userBalances?.[token.address.toLowerCase()];
              const hasBal = bal && parseFloat(bal) > 0;

              // Section headers
              const showYourTokensHeader = hasAnyBalance && index === 0 && !query;
              const showAllTokensHeader = firstNonBalanceIdx > 0 && index === firstNonBalanceIdx && !query;

              return (
                <div key={token.address}>
                  {showYourTokensHeader && (
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-[10px] uppercase tracking-wider text-[#6b7280] font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Your Tokens</p>
                    </div>
                  )}
                  {showAllTokensHeader && (
                    <div className="px-4 pt-3 pb-1 border-t border-[#e5e7eb]">
                      <p className="text-[10px] uppercase tracking-wider text-[#6b7280] font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>All Tokens</p>
                    </div>
                  )}
                  <button
                    onClick={() => !isSelected && onSelect(token)}
                    disabled={isSelected}
                    className={`w-full flex items-center gap-3 px-4 py-3 border-b border-[#e5e7eb]/50 transition-colors text-left ${
                      isSelected ? 'bg-black/5 cursor-not-allowed' : 'hover:bg-[#f7f7f7]'
                    }`}
                  >
                    <TokenIconWithChain symbol={token.symbol} chainId={token.chainId} address={token.address} logoURI={token.logoURI} size={32} badgeSize={14} />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm font-bold truncate">{token.symbol}</p>
                      <p className="text-[10px] text-[#6b7280] truncate">{token.name}</p>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      {hasBal ? (
                        <>
                          <span className="font-mono text-xs font-bold">{parseFloat(bal!).toFixed(bal!.includes('.') && parseFloat(bal!) < 1 ? 4 : 2)}</span>
                          <span className="text-[9px] text-[#6b7280] uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Available</span>
                        </>
                      ) : bal !== undefined ? (
                        <span className="text-[10px] text-[#a1a1aa]">0</span>
                      ) : null}
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
