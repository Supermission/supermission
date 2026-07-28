'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { useWalletData } from '@/lib/hooks/dashboard/useWalletData';
import { ArrowDownUp, Loader2, ArrowRightLeft } from 'lucide-react';
import { useDefiStore } from '@/lib/store/defi';
import { useLifiSwap, type SwapParams } from '@/lib/hooks/use-uniswap-swap';
import { TokenSelector } from './TokenSelector';
import { SlippageSettings } from './SlippageSettings';
import { SwapConfirmation } from './SwapConfirmation';
import { CHAIN_NAMES } from '@/lib/uniswap/types';
import type { NormalizedQuoteResponse, TokenInfo } from '@/lib/uniswap/types';
import { getChainIcon } from '@/components/dashboard/shared/ChainIcons';
import { TokenIconWithChain } from '@/components/dashboard/shared/TokenIcon';

const SUPPORTED_CHAINS: { id: number; name: string }[] = [
  { id: 8453, name: 'Base' },
  { id: 1, name: 'Ethereum' },
  { id: 137, name: 'Polygon' },
];

export function SwapPanel() {
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const {
    activeChainId, setActiveChainId,
    toChainId, setToChainId,
    crossChainMode, setCrossChainMode,
    tokenIn, tokenOut, amountIn,
    setTokenIn, setTokenOut, setAmountIn,
    swapTokens,
    slippageMode, customSlippageBps,
    lastQuote, setLastQuote,
  } = useDefiStore();

  const { fetchQuote, executeSwap, progress, isSwapping, reset } = useLifiSwap();

  const [showTokenSelector, setShowTokenSelector] = useState<'in' | 'out' | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [showSlippage, setShowSlippage] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Use shared wallet data hook (React Query deduplicates across components)
  const { data: walletDataResult } = useWalletData(address as `0x${string}` | undefined);
  const userBalances = useMemo(() => {
    if (!walletDataResult?.tokens) return {};
    const map: Record<string, string> = {};
    for (const t of walletDataResult.tokens) {
      if (t.chainId === activeChainId) {
        map[t.address.toLowerCase()] = t.balance;
      }
    }
    return map;
  }, [walletDataResult, activeChainId]);

  // Get balance for the selected "You Pay" token
  const tokenInBalance = useMemo(() => {
    if (!tokenIn || !userBalances) return null;
    const bal = userBalances[tokenIn.address.toLowerCase()];
    if (!bal) return '0';
    return bal;
  }, [tokenIn, userBalances]);

  const tokenInBalanceNum = tokenInBalance ? parseFloat(tokenInBalance) : 0;
  const isInsufficientBalance = tokenIn && amountIn && parseFloat(amountIn) > 0 && tokenInBalanceNum < parseFloat(amountIn);

  // Auto-fetch quote when inputs change (with debounce)
  useEffect(() => {
    if (!tokenIn || !tokenOut || !amountIn || !address || parseFloat(amountIn) <= 0) {
      setLastQuote(null);
      setQuoteError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsFetchingQuote(true);
      setQuoteError(null);
      const slippage = slippageMode === 'custom' ? customSlippageBps : 50;
      const effectiveToChainId = crossChainMode ? toChainId : activeChainId;
      const result = await fetchQuote({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn,
        decimalsIn: tokenIn.decimals,
        decimalsOut: tokenOut.decimals,
        chainId: activeChainId,
        toChainId: effectiveToChainId !== activeChainId ? effectiveToChainId : undefined,
        slippageBps: slippage,
      });
      if (result) {
        setLastQuote(result);
      } else {
        setQuoteError('No route found for this swap');
      }
      setIsFetchingQuote(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [tokenIn, tokenOut, amountIn, activeChainId, toChainId, crossChainMode, address, slippageMode, customSlippageBps, fetchQuote, setLastQuote]);

  const handleTokenSelect = useCallback((token: TokenInfo) => {
    if (showTokenSelector === 'in') {
      setTokenIn(token);
    } else {
      setTokenOut(token);
    }
    setShowTokenSelector(null);
  }, [showTokenSelector, setTokenIn, setTokenOut]);

  const handleSwapClick = () => {
    if (!lastQuote || !lastQuote.ok) return;
    setShowConfirmation(true);
  };

  const handleConfirmSwap = async () => {
    if (!lastQuote || !tokenIn || !tokenOut) return;
    const slippage = slippageMode === 'custom' ? customSlippageBps : 50;
    const effectiveToChainId = crossChainMode ? toChainId : activeChainId;
    const params: SwapParams = {
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      amountIn,
      decimalsIn: tokenIn.decimals,
      decimalsOut: tokenOut.decimals,
      chainId: activeChainId,
      toChainId: effectiveToChainId !== activeChainId ? effectiveToChainId : undefined,
      slippageBps: slippage,
    };
    await executeSwap(params, lastQuote);
  };

  const handleCloseConfirmation = () => {
    setShowConfirmation(false);
    if (progress.step === 'completed') {
      reset();
      setAmountIn('');
      setLastQuote(null);
      // Refresh portfolio data
      queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
      window.dispatchEvent(new Event('trade-completed'));
    }
  };

  const handleSourceChainChange = (chainId: number) => {
    setActiveChainId(chainId);
    setTokenIn(null);
    if (!crossChainMode) {
      setTokenOut(null);
    }
    setAmountIn('');
    setLastQuote(null);
  };

  const handleDestChainChange = (chainId: number) => {
    setToChainId(chainId);
    setTokenOut(null);
    setLastQuote(null);
  };

  // The chain ID used for the "out" token selector
  const outChainId = crossChainMode ? toChainId : activeChainId;

  return (
    <div className="max-w-lg mx-auto">
      <div className="border border-[#e5e7eb] bg-white rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
          <span className="text-sm font-bold tracking-wider text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Swap</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCrossChainMode(!crossChainMode)}
              className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                crossChainMode ? 'text-black font-bold' : 'text-black/40 hover:text-black'
              }`}
            >
              <ArrowRightLeft size={10} />
              Cross-chain
            </button>
            <button
              onClick={() => setShowSlippage(!showSlippage)}
              className="font-mono text-[10px] uppercase tracking-wider text-black/40 hover:text-black transition-colors"
            >
              {slippageMode === 'auto' ? 'Auto' : `${customSlippageBps}bps`} Slippage
            </button>
          </div>
        </div>

        {/* Slippage dropdown */}
        {showSlippage && (
          <div className="border-b border-[#e5e7eb]">
            <SlippageSettings />
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* Chain selector(s) */}
          {!crossChainMode ? (
            /* Single chain selector */
            <div className="flex gap-1 flex-wrap">
              {SUPPORTED_CHAINS.map(({ id, name }) => (
                <button
                  key={id}
                  onClick={() => handleSourceChainChange(id)}
                  className={`flex-1 min-w-[70px] py-1.5 font-mono text-[10px] font-bold uppercase rounded-[6px] border transition-colors flex items-center justify-center gap-1 ${
                    activeChainId === id
                      ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border-transparent'
                      : 'border-[#e5e7eb] text-[#6b7280] hover:bg-[#f7f7f7] hover:text-[#3a3a3a]'
                  }`}
                >
                  {getChainIcon(name, 12)}
                  {name}
                </button>
              ))}
            </div>
          ) : (
            /* Cross-chain: From Chain + To Chain selectors */
            <div className="space-y-2">
              <div>
                <span className="text-[10px] uppercase text-[#6b7280] font-bold mb-1 block" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  From Chain
                </span>
                <div className="flex gap-1 flex-wrap">
                  {SUPPORTED_CHAINS.map(({ id, name }) => (
                    <button
                      key={id}
                      onClick={() => handleSourceChainChange(id)}
                      className={`flex-1 min-w-[70px] py-1.5 font-mono text-[10px] font-bold uppercase rounded-[6px] border transition-colors flex items-center justify-center gap-1 ${
                        activeChainId === id
                          ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border-transparent'
                          : 'border-[#e5e7eb] text-[#6b7280] hover:bg-[#f7f7f7] hover:text-[#3a3a3a]'
                      }`}
                    >
                      {getChainIcon(name, 12)}
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase text-[#6b7280] font-bold mb-1 block" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  To Chain
                </span>
                <div className="flex gap-1 flex-wrap">
                  {SUPPORTED_CHAINS.map(({ id, name }) => (
                    <button
                      key={id}
                      onClick={() => handleDestChainChange(id)}
                      className={`flex-1 min-w-[70px] py-1.5 font-mono text-[10px] font-bold uppercase rounded-[6px] border transition-colors flex items-center justify-center gap-1 ${
                        toChainId === id
                          ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border-transparent'
                          : 'border-[#e5e7eb] text-[#6b7280] hover:bg-[#f7f7f7] hover:text-[#3a3a3a]'
                      }`}
                    >
                      {getChainIcon(name, 12)}
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Token In */}
          <div className={`p-3 border rounded-[12px] space-y-2 ${isInsufficientBalance ? 'border-red-300 bg-red-50/30' : 'border-[#e5e7eb]'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-[#6b7280] font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>You Pay</span>
              <div className="flex items-center gap-2">
                {crossChainMode && (
                  <span className="font-mono text-[10px] text-black/30 uppercase">{CHAIN_NAMES[activeChainId] || `Chain ${activeChainId}`}</span>
                )}
                {tokenIn && tokenInBalance !== null && (
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[10px] text-[#6b7280]">
                      Bal: {tokenInBalanceNum > 0 ? (tokenInBalanceNum < 0.001 ? '<0.001' : tokenInBalanceNum.toFixed(tokenInBalanceNum < 1 ? 4 : 2)) : '0'}
                    </span>
                    {tokenInBalanceNum > 0 && (
                      <button
                        onClick={() => setAmountIn(tokenInBalance!)}
                        className="px-1.5 py-0.5 bg-[#1a1a1a] text-white text-[8px] font-bold uppercase rounded-[4px] hover:opacity-80 transition-opacity"
                        style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                      >
                        Max
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={amountIn}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^[0-9]*\.?[0-9]*$/.test(val)) setAmountIn(val);
                }}
                placeholder="0.00"
                className="flex-1 font-mono text-2xl font-bold bg-transparent outline-none min-w-0"
              />
              <button
                onClick={() => setShowTokenSelector('in')}
                className="px-3 py-2 border border-[#e5e7eb] rounded-[8px] font-mono text-xs font-bold uppercase hover:bg-[#f7f7f7] transition-colors flex-shrink-0 flex items-center gap-1.5"
              >
                {tokenIn && (
                  <TokenIconWithChain symbol={tokenIn.symbol} chainId={tokenIn.chainId} address={tokenIn.address} logoURI={tokenIn.logoURI} size={16} badgeSize={7} />
                )}
                {tokenIn ? tokenIn.symbol : 'Select'}
              </button>
            </div>
            {/* Insufficient balance warning */}
            {isInsufficientBalance && (
              <p className="font-mono text-[10px] text-red-600">
                Insufficient {tokenIn?.symbol} balance
              </p>
            )}
            {/* Zero balance notice */}
            {tokenIn && tokenInBalanceNum === 0 && !amountIn && (
              <p className="font-mono text-[10px] text-[#a1a1aa]">
                You don&apos;t have any {tokenIn.symbol} on {CHAIN_NAMES[activeChainId]}
              </p>
            )}
          </div>

          {/* Swap direction toggle */}
          <div className="flex justify-center -my-1 relative z-10">
            <button
              onClick={!crossChainMode ? swapTokens : undefined}
              disabled={crossChainMode}
              className={`w-10 h-10 bg-white border border-[#e5e7eb] rounded-full flex items-center justify-center transition-colors shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] ${
                crossChainMode ? 'cursor-not-allowed opacity-50' : 'hover:bg-[#f7f7f7]'
              }`}
            >
              <ArrowDownUp size={16} />
            </button>
          </div>

          {/* Token Out */}
          <div className="p-3 border border-[#e5e7eb] rounded-[12px] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-[#6b7280] font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>You Receive</span>
              <div className="flex items-center gap-2">
                {crossChainMode && (
                  <span className="font-mono text-[10px] text-black/30 uppercase">{CHAIN_NAMES[toChainId] || `Chain ${toChainId}`}</span>
                )}
                {isFetchingQuote && (
                  <Loader2 size={12} className="animate-spin text-black/30" />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1 font-mono text-2xl font-bold text-black/50 min-w-0 truncate">
                {lastQuote?.amountOutFormatted || lastQuote?.amountOut || '0.00'}
              </span>
              <button
                onClick={() => setShowTokenSelector('out')}
                className="px-3 py-2 border border-[#e5e7eb] rounded-[8px] font-mono text-xs font-bold uppercase hover:bg-[#f7f7f7] transition-colors flex-shrink-0 flex items-center gap-1.5"
              >
                {tokenOut && (
                  <TokenIconWithChain symbol={tokenOut.symbol} chainId={tokenOut.chainId} address={tokenOut.address} logoURI={tokenOut.logoURI} size={16} badgeSize={7} />
                )}
                {tokenOut ? tokenOut.symbol : 'Select'}
              </button>
            </div>
          </div>

          {/* Quote details */}
          {lastQuote && lastQuote.ok && (
            <div className="p-2 bg-black/5 space-y-1">
              {crossChainMode && toChainId !== activeChainId && (
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-black/40">Route</span>
                  <span className="font-mono text-[10px] text-black/60">
                    {CHAIN_NAMES[activeChainId] || activeChainId} → {CHAIN_NAMES[toChainId] || toChainId}
                  </span>
                </div>
              )}
              {lastQuote.priceImpact !== undefined && (
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-black/40">Price Impact</span>
                  <span className={`font-mono text-[10px] font-bold ${
                    lastQuote.priceImpact > 3 ? 'text-red-600' : 'text-black/60'
                  }`}>
                    {lastQuote.priceImpact.toFixed(2)}%
                  </span>
                </div>
              )}
              {lastQuote.gasEstimateUSD && (
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-black/40">Est. Gas</span>
                  <span className="font-mono text-[10px] text-black/60">${lastQuote.gasEstimateUSD}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-black/40">via</span>
                <span className="font-mono text-[10px] text-black/60 uppercase">{lastQuote.source}</span>
              </div>
              {lastQuote.route && (
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-black/40">Bridge</span>
                  <span className="font-mono text-[10px] text-black/60">{lastQuote.route}</span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {quoteError && (
            <p className="font-mono text-xs text-red-600 text-center">{quoteError}</p>
          )}

          {/* CTA */}
          {!isConnected ? (
            <div className="p-3 bg-black/5 text-center">
              <p className="font-mono text-xs text-black/50">Connect wallet to swap</p>
            </div>
          ) : (
            <button
              onClick={handleSwapClick}
              disabled={!lastQuote?.ok || isFetchingQuote || isSwapping || !amountIn || parseFloat(amountIn) <= 0 || !!isInsufficientBalance}
              className="w-full py-3.5 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] font-mono text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isFetchingQuote ? 'Getting Quote...' : !tokenIn || !tokenOut ? 'Select Tokens' : !amountIn ? 'Enter Amount' : isInsufficientBalance ? `Insufficient ${tokenIn.symbol}` : crossChainMode && toChainId !== activeChainId ? 'Cross-Chain Swap' : 'Swap'}
            </button>
          )}
        </div>
      </div>

      {/* Token selector modal */}
      {showTokenSelector && (
        <TokenSelector
          onSelect={handleTokenSelect}
          onClose={() => setShowTokenSelector(null)}
          selectedAddress={showTokenSelector === 'in' ? tokenOut?.address : tokenIn?.address}
          userBalances={showTokenSelector === 'in' ? userBalances : undefined}
          chainIdOverride={showTokenSelector === 'out' && crossChainMode ? toChainId : undefined}
        />
      )}

      {/* Swap confirmation modal */}
      {showConfirmation && lastQuote && tokenIn && tokenOut && (
        <SwapConfirmation
          quote={lastQuote}
          params={{
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            amountIn,
            decimalsIn: tokenIn.decimals,
            decimalsOut: tokenOut.decimals,
            chainId: activeChainId,
            toChainId: crossChainMode && toChainId !== activeChainId ? toChainId : undefined,
            slippageBps: slippageMode === 'custom' ? customSlippageBps : 50,
          }}
          tokenInSymbol={tokenIn.symbol}
          tokenOutSymbol={tokenOut.symbol}
          onConfirm={handleConfirmSwap}
          onClose={handleCloseConfirmation}
          swapProgress={progress}
          isSwapping={isSwapping}
        />
      )}
    </div>
  );
}
