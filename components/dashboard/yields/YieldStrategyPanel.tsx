'use client';

import { useState, useEffect } from 'react';
import { Address } from 'viem';
import { useWalletData } from '@/lib/hooks/dashboard/useWalletData';
import { YieldStrategy } from '@/lib/minimax/analyzers';
import { Loader2, TrendingUp, Shield, ExternalLink } from 'lucide-react';
import { InvestModal } from './InvestModal';
import { SupportedProtocol } from '@/lib/hooks/use-defi-invest';

// Maps AI-generated protocol names to typed protocol keys
function detectProtocol(protocolName: string): SupportedProtocol | null {
  const name = protocolName.toLowerCase();
  if (name.includes('aave')) return 'aave-v3';
  if (name.includes('compound')) return 'compound-iii';
  return null;
}

// Parse dollar amount from action text like "Supply 500 USDC" or "Deposit $600 USDC"
function parseAmountFromAction(action: string): string {
  const match = action.match(/\$?([\d,]+(?:\.\d+)?)\s*USDC/i);
  if (match) return match[1].replace(/,/g, '');
  return '';
}

interface YieldStrategyPanelProps {
  address: Address | undefined;
  onDepositSuccess?: () => void;
}

export function YieldStrategyPanel({ address, onDepositSuccess }: YieldStrategyPanelProps) {
  const [strategy, setStrategy] = useState<YieldStrategy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Use shared wallet data hook (React Query deduplicates across components)
  const { data: walletDataResult } = useWalletData(address);
  const portfolioData = walletDataResult || null;
  const [yieldPools, setYieldPools] = useState<any[]>([]);
  const [riskTolerance, setRiskTolerance] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');
  const [investingRec, setInvestingRec] = useState<{
    protocol: SupportedProtocol;
    protocolLabel: string;
    apyDisplay: string;
    suggestedAmount: string;
  } | null>(null);

  // Fetch yield opportunities only (portfolio comes from shared hook)
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetch('/api/dashboard/yields/list?limit=10&sortBy=apy&sortOrder=desc')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled && data) setYieldPools(data.pools || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [address]);

  const handleGenerateStrategy = async () => {
    if (!address || !portfolioData) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/dashboard/yields/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioData,
          yieldPools,
          riskTolerance
        })
      });

      if (!response.ok) {
        throw new Error('Strategy generation failed');
      }

      const data = await response.json();
      setStrategy(data.data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate strategy');
    } finally {
      setLoading(false);
    }
  };

  if (!address) {
    return (
      <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
        <h3 className="text-sm font-bold uppercase mb-4" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Custom Yield Strategy
        </h3>
        <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Connect wallet to generate personalized yield strategies
        </p>
      </div>
    );
  }

  const totalPortfolioValue = portfolioData?.summary?.totalPortfolioUSD || 0;
  const hasCapital = totalPortfolioValue >= 50; // Minimum viable for DeFi (gas fees)

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-600 bg-green-50 border-green-600';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-600';
      case 'high': return 'text-red-600 bg-red-50 border-red-600';
      default: return 'text-gray-600 bg-gray-50 border-gray-600';
    }
  };

  return (
    <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Custom Yield Strategy
        </h3>
      </div>

      {/* Loading portfolio data */}
      {!strategy && !portfolioData && (
        <div className="flex items-center justify-center py-6 gap-2">
          <Loader2 size={14} className="animate-spin text-[#6b7280]" />
          <p className="font-mono text-xs text-[#6b7280]">Loading portfolio...</p>
        </div>
      )}

      {/* No Capital State */}
      {!strategy && portfolioData && !hasCapital && (
        <div className="border border-[#e5e7eb] rounded-[12px] bg-gray-50 p-6 text-center">
          <Shield size={24} className="mx-auto mb-3 text-[#6b7280]" />
          <p className="text-sm font-bold mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Insufficient Capital</p>
          <p className="text-xs text-[#6b7280] leading-relaxed" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            {totalPortfolioValue > 0
              ? `Your portfolio is $${totalPortfolioValue.toFixed(2)}. A minimum of ~$50 is needed for yield strategies to be viable after gas fees.`
              : 'Fund your wallet with tokens to generate a personalized yield strategy.'}
          </p>
        </div>
      )}

      {/* Risk Tolerance Selector */}
      {!strategy && hasCapital && (
        <div className="mb-4">
          <label className="block text-xs font-bold uppercase mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            Risk Tolerance
          </label>
          <div className="flex gap-2">
            {['conservative', 'balanced', 'aggressive'].map((risk) => (
              <button
                key={risk}
                onClick={() => setRiskTolerance(risk as any)}
                className={`flex-1 py-2 border rounded-[8px] text-xs font-bold uppercase transition-colors ${
                  riskTolerance === risk
                    ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border-[#1a1a1a]'
                    : 'bg-white text-black border-[#e5e7eb] hover:bg-[#f7f7f7]'
                }`}
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                {risk}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Generate Button */}
      {!strategy && hasCapital && (
        <button
          onClick={handleGenerateStrategy}
          disabled={loading || !portfolioData}
          className="w-full py-3 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] text-xs font-bold uppercase hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Generating...
            </>
          ) : (
            'Generate Strategy'
          )}
        </button>
      )}

      {/* Error State */}
      {error && (
        <div className="border border-red-300 rounded-[12px] bg-red-50 p-4 mt-4">
          <p className="font-mono text-xs text-red-900">{error}</p>
          <button
            onClick={handleGenerateStrategy}
            className="mt-2 px-3 py-1 bg-red-600 text-white text-xs font-bold uppercase rounded-[8px] hover:opacity-90 transition-colors"
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Strategy Results */}
      {strategy && (
        <div className="space-y-4">
          {/* Strategy Header */}
          <div className="border border-[#e5e7eb] rounded-[12px] p-4">
            <h4 className="text-lg font-bold mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{strategy.strategy}</h4>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <p className="text-xs uppercase text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Expected APY</p>
                <p className="font-mono text-2xl font-bold text-green-600">
                  {strategy.expectedAPY.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Risk Level</p>
                <span className={`inline-block px-3 py-1 border rounded-[8px] text-xs font-bold uppercase ${getRiskColor(strategy.riskLevel)}`} style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  {strategy.riskLevel}
                </span>
              </div>
            </div>
          </div>

          {/* Estimated Return */}
          <div className="border border-green-200 rounded-[12px] bg-green-50 p-4">
            <p className="text-xs uppercase mb-1 text-green-900" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Estimated Annual Return</p>
            <p className="font-mono text-lg font-bold text-green-900">{strategy.estimatedReturn}</p>
          </div>

          {/* Recommendations */}
          {strategy.recommendations.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase mb-3" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Recommended Actions</h4>
              <div className="space-y-3">
                {strategy.recommendations.map((rec, i) => (
                  <div key={i} className="border border-[#e5e7eb] rounded-[12px] p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h5 className="text-sm font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{rec.protocol}</h5>
                      <span className={`inline-block px-2 py-1 border rounded-[8px] text-xs font-bold uppercase ${getRiskColor(rec.risk)}`} style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                        {rec.risk}
                      </span>
                    </div>
                    <p className="font-mono text-xs mb-2">{rec.action}</p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#e5e7eb]">
                      <div>
                        <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>APY</p>
                        <p className="font-mono text-lg font-bold text-green-600">{rec.apy.toFixed(2)}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#6b7280] mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Reason</p>
                        <p className="font-mono text-xs">{rec.reason}</p>
                      </div>
                    </div>
                    {/* Invest button */}
                    <div className="mt-3 pt-3 border-t border-[#e5e7eb]">
                      {detectProtocol(rec.protocol) ? (
                        <button
                          onClick={() => setInvestingRec({
                            protocol: detectProtocol(rec.protocol)!,
                            protocolLabel: rec.protocol,
                            apyDisplay: `${rec.apy.toFixed(2)}%`,
                            suggestedAmount: parseAmountFromAction(rec.action),
                          })}
                          className="w-full py-2 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] text-xs font-bold uppercase hover:opacity-90 transition-colors"
                          style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                        >
                          Invest Now
                        </button>
                      ) : (
                        <div className="w-full py-2 border border-[#e5e7eb] rounded-[8px] text-xs font-bold uppercase text-center text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                          Coming Soon
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Implementation Steps */}
          {strategy.implementation.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase mb-3" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Implementation Guide</h4>
              <ol className="space-y-2">
                {strategy.implementation.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-full font-mono text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <p className="font-mono text-xs pt-0.5">{step.replace(/^\d+[\.\)]\s*/, '')}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Generate New Button */}
          <button
            onClick={() => setStrategy(null)}
            className="w-full py-2 border border-[#e5e7eb] rounded-[8px] text-xs font-bold uppercase hover:bg-[#f7f7f7] transition-colors"
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
          >
            Generate New Strategy
          </button>
        </div>
      )}

      {/* Invest Modal */}
      {investingRec && (
        <InvestModal
          {...investingRec}
          onClose={() => setInvestingRec(null)}
          onSuccess={() => {
            setInvestingRec(null);
            onDepositSuccess?.();
          }}
        />
      )}
    </div>
  );
}
