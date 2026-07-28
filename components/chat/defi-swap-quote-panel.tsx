'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useDefiStore } from '@/lib/store/defi';

interface SwapQuote {
  type: 'swap' | 'bridge';
  source: string;
  tokenIn: string;
  tokenOut: string;
  fromSymbol: string;
  toSymbol: string;
  fromDecimals: number;
  toDecimals: number;
  fromName: string;
  toName: string;
  amountIn: string;
  amountInFormatted: string;
  amountOut: string;
  amountOutFormatted: string;
  priceImpact?: string;
  gasEstimateUSD?: string;
  route: string;
  chainId: number;
  toChainId: number;
  fromChainName: string;
  toChainName: string;
  spender?: string;
  methodParameters?: {
    calldata: string;
    value: string;
    to: string;
  };
}

interface DefiSwapQuoteData {
  quote?: SwapQuote;
  tokenPrice?: {
    symbol: string;
    chain: string;
    priceUSD: string;
  };
  tokens?: Array<{ symbol: string; name: string; address: string }>;
  chains?: Array<{ chainId: number; name: string }>;
  suggestions?: string[];
}

interface DefiSwapQuotePanelProps {
  data: DefiSwapQuoteData;
}

export function DefiSwapQuotePanel({ data }: DefiSwapQuotePanelProps) {
  if (data.quote) {
    return <QuoteCard quote={data.quote} />;
  }

  if (data.tokenPrice) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-[#f8f9fa] to-white border border-[#e5e7eb] rounded-xl p-4 max-w-sm"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wider">Token Price</div>
            <div className="text-lg font-bold text-black mt-1">{data.tokenPrice.symbol}</div>
            <div className="text-[11px] text-[#9ca3af]">{data.tokenPrice.chain}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-black">${data.tokenPrice.priceUSD}</div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (data.tokens && data.tokens.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-[#e5e7eb] rounded-xl p-4 max-w-md"
      >
        <div className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wider mb-3">Available Tokens</div>
        <div className="flex flex-wrap gap-1.5">
          {data.tokens.map((t) => (
            <span
              key={t.address}
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#f3f4f6] text-[#374151] border border-[#e5e7eb]"
              title={`${t.name} (${t.address.slice(0, 8)}...)`}
            >
              {t.symbol}
            </span>
          ))}
        </div>
      </motion.div>
    );
  }

  if (data.chains && data.chains.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-[#e5e7eb] rounded-xl p-4 max-w-md"
      >
        <div className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wider mb-3">Supported Chains</div>
        <div className="grid grid-cols-2 gap-2">
          {data.chains.map((c) => (
            <div
              key={c.chainId}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#f9fafb] border border-[#f3f4f6]"
            >
              <div className="w-5 h-5 rounded-full bg-[#e5e7eb] flex items-center justify-center text-[9px] font-bold text-[#6b7280]">
                {c.name.charAt(0)}
              </div>
              <div>
                <div className="text-[12px] font-medium text-black">{c.name}</div>
                <div className="text-[10px] text-[#9ca3af]">Chain {c.chainId}</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  if (data.suggestions && data.suggestions.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap gap-2 mt-1"
      >
        {data.suggestions.map((s, i) => (
          <span
            key={i}
            className="inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-medium bg-[#f3f4f6] text-[#374151] border border-[#e5e7eb] cursor-default"
          >
            {s}
          </span>
        ))}
      </motion.div>
    );
  }

  return null;
}

function QuoteCard({ quote }: { quote: SwapQuote }) {
  const router = useRouter();
  const {
    setActiveChainId, setToChainId, setCrossChainMode,
    setTokenIn, setTokenOut, setAmountIn, setActiveSubTab,
  } = useDefiStore();

  const isBridge = quote.type === 'bridge';

  const handleOpenSwap = () => {
    // Pre-fill defi store with quote data
    const isCrossChain = quote.chainId !== quote.toChainId;

    setActiveChainId(quote.chainId);
    if (isCrossChain) {
      setCrossChainMode(true);
      setToChainId(quote.toChainId);
    } else {
      setCrossChainMode(false);
    }

    // Set tokens as TokenInfo objects
    setTokenIn({
      address: quote.tokenIn,
      chainId: quote.chainId,
      decimals: quote.fromDecimals || 18,
      symbol: quote.fromSymbol,
      name: quote.fromName || quote.fromSymbol,
    });
    setTokenOut({
      address: quote.tokenOut,
      chainId: quote.toChainId,
      decimals: quote.toDecimals || 18,
      symbol: quote.toSymbol,
      name: quote.toName || quote.toSymbol,
    });

    // Set amount (formatted, not raw)
    setAmountIn(quote.amountInFormatted);

    // Ensure swap sub-tab is active
    setActiveSubTab('swap');

    // Navigate to dashboard with defi tab
    router.push('/dashboard?tab=defi');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-[#fafbfc] to-white border border-[#e5e7eb] rounded-xl overflow-hidden max-w-sm"
    >
      {/* Header */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-[#1a1a1a] to-[#2d2d2d] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isBridge ? 'bg-purple-400' : 'bg-emerald-400'}`} />
          <span className="text-[11px] font-semibold text-white uppercase tracking-wider">
            {isBridge ? 'Bridge Quote' : 'Swap Quote'}
          </span>
        </div>
        <span className="text-[10px] text-white/60">via {quote.route?.split(' -> ')[1] || quote.source || 'LI.FI'}</span>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* From */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#f3f4f6] border border-[#e5e7eb] flex items-center justify-center text-[10px] font-bold text-[#6b7280]">
              {quote.fromSymbol?.slice(0, 3)}
            </div>
            <div>
              <div className="text-[13px] font-semibold text-black">{quote.amountInFormatted} {quote.fromSymbol}</div>
              <div className="text-[10px] text-[#9ca3af]">{quote.fromChainName}</div>
            </div>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center">
          <svg className="w-4 h-4 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>

        {/* To */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#f0fdf4] border border-[#bbf7d0] flex items-center justify-center text-[10px] font-bold text-emerald-700">
              {quote.toSymbol?.slice(0, 3)}
            </div>
            <div>
              <div className="text-[13px] font-semibold text-emerald-700">{quote.amountOutFormatted} {quote.toSymbol}</div>
              <div className="text-[10px] text-[#9ca3af]">{quote.toChainName}</div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="pt-2 border-t border-[#f3f4f6] space-y-1">
          {quote.gasEstimateUSD && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#9ca3af]">Gas estimate</span>
              <span className="text-[#374151] font-medium">~${quote.gasEstimateUSD}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#9ca3af]">Route</span>
            <span className="text-[#374151] font-medium truncate max-w-[180px]">{quote.route}</span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleOpenSwap}
          className="w-full mt-2 px-4 py-2.5 rounded-lg text-[12px] font-semibold text-white bg-gradient-to-r from-[#1a1a1a] to-[#333] hover:from-[#333] hover:to-[#444] transition-all shadow-sm"
        >
          {isBridge ? 'Execute Bridge in DeFi Tab' : 'Execute Swap in DeFi Tab'}
        </button>
      </div>
    </motion.div>
  );
}
