'use client';

import { useState, useRef } from 'react';
import { Address } from 'viem';
import { WalletAnalysis } from '@/lib/minimax/analyzers';
import { useWalletData } from '@/lib/hooks/dashboard/useWalletData';
import { Loader2, AlertTriangle, Shield, TrendingUp } from 'lucide-react';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

interface WalletAnalysisCardProps {
  address: Address | undefined;
}

export function WalletAnalysisCard({ address }: WalletAnalysisCardProps) {
  const [analysis, setAnalysis] = useState<WalletAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevAddress = useRef(address);

  const { data: walletData } = useWalletData(address);

  // Reset state when address changes — no effect needed
  if (prevAddress.current !== address) {
    prevAddress.current = address;
    setAnalysis(null);
    setError(null);
  }

  const handleAnalyze = async () => {
    if (!address || !walletData) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/dashboard/wallet/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          portfolioData: walletData
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMsg = errorData.error || errorData.details || 'Wallet analysis failed';
        throw new Error(errorMsg);
      }

      const data = await response.json();
      setAnalysis(data.data);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to analyze wallet';
      if (errorMsg.includes('MINIMAX_API_KEY')) {
        setError('AI analysis unavailable: Missing MINIMAX_API_KEY environment variable');
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!address) {
    return (
      <div className="border border-[#e5e7eb] bg-white rounded-[16px] p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
        <h3 className="text-sm font-semibold text-[#1a1a1a] mb-2" style={{ fontFamily: FONT }}>
          Wallet Analysis
        </h3>
        <p className="text-xs text-[#a1a1aa]" style={{ fontFamily: FONT }}>
          Connect a wallet to see analysis
        </p>
      </div>
    );
  }

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'Excellent': return 'text-green-600 bg-green-50 border-green-200';
      case 'Good': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'Fair': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'Poor': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-[#6b7280] bg-[#fafafa] border-[#e5e7eb]';
    }
  };

  const getRiskColor = (risk: number) => {
    if (risk < 30) return 'text-green-600';
    if (risk < 60) return 'text-yellow-600';
    return 'text-red-500';
  };

  const getConcentrationColor = (risk: string) => {
    switch (risk) {
      case 'Low': return 'text-green-600';
      case 'Medium': return 'text-yellow-600';
      case 'High': return 'text-red-500';
      default: return 'text-[#6b7280]';
    }
  };

  return (
    <div className="border border-[#e5e7eb] bg-white rounded-[16px] p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1a1a1a]" style={{ fontFamily: FONT }}>
          Wallet Analysis
        </h3>
        {!analysis && (
          <button
            onClick={handleAnalyze}
            disabled={loading || !walletData}
            className="px-4 py-2 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ fontFamily: FONT }}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze Wallet'
            )}
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="border border-red-200 bg-red-50 rounded-[12px] p-4 mb-4">
          <p className="text-xs text-red-700" style={{ fontFamily: FONT }}>{error}</p>
          <button
            onClick={handleAnalyze}
            className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-[8px] text-[11px] font-medium hover:bg-red-700 transition-colors"
            style={{ fontFamily: FONT }}
          >
            Retry
          </button>
        </div>
      )}

      {/* No Analysis State */}
      {!analysis && !loading && !error && (
        <p className="text-xs text-[#a1a1aa]" style={{ fontFamily: FONT }}>
          Click "Analyze Wallet" to get AI-powered portfolio risk assessment, diversification analysis, and optimization recommendations
        </p>
      )}

      {/* Analysis Results */}
      {analysis && (
        <div className="space-y-4">
          {/* Health & Profile */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`border rounded-[12px] p-4 ${getHealthColor(analysis.portfolioHealth)}`}>
              <p className="text-[10px] font-medium mb-1" style={{ fontFamily: FONT }}>Health</p>
              <p className="text-xl font-bold" style={{ fontFamily: FONT }}>{analysis.portfolioHealth}</p>
            </div>
            <div className="border border-[#e5e7eb] rounded-[12px] p-4">
              <p className="text-[10px] font-medium text-[#a1a1aa] mb-1" style={{ fontFamily: FONT }}>Profile</p>
              <p className="text-sm font-semibold text-[#1a1a1a]" style={{ fontFamily: FONT }}>{analysis.profile}</p>
            </div>
          </div>

          {/* Risk & Diversification */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-[#e5e7eb] rounded-[12px] p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className={getRiskColor(analysis.riskScore)} />
                <p className="text-[10px] font-medium text-[#a1a1aa]" style={{ fontFamily: FONT }}>Risk Score</p>
              </div>
              <p className={`text-2xl font-bold tabular-nums ${getRiskColor(analysis.riskScore)}`} style={{ fontFamily: FONT }}>
                {analysis.riskScore}/100
              </p>
            </div>
            <div className="border border-[#e5e7eb] rounded-[12px] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={14} className="text-blue-600" />
                <p className="text-[10px] font-medium text-[#a1a1aa]" style={{ fontFamily: FONT }}>Diversification</p>
              </div>
              <p className="text-2xl font-bold text-blue-600 tabular-nums" style={{ fontFamily: FONT }}>
                {analysis.diversificationScore}/100
              </p>
            </div>
          </div>

          {/* Concentration Risk */}
          <div className="border border-[#e5e7eb] rounded-[12px] p-4">
            <p className="text-[10px] font-medium text-[#a1a1aa] mb-1" style={{ fontFamily: FONT }}>Concentration Risk</p>
            <p className={`text-lg font-bold ${getConcentrationColor(analysis.concentrationRisk)}`} style={{ fontFamily: FONT }}>
              {analysis.concentrationRisk}
            </p>
          </div>

          {/* Summary */}
          <div className="border border-[#e5e7eb] rounded-[12px] p-4">
            <p className="text-xs text-[#48484b] leading-relaxed" style={{ fontFamily: FONT }}>{analysis.summary}</p>
          </div>

          {/* Recommendations */}
          {analysis.topRecommendations.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-[#1a1a1a] mb-2 flex items-center gap-2" style={{ fontFamily: FONT }}>
                <TrendingUp size={14} className="text-blue-600" />
                Top Recommendations
              </h4>
              <ul className="space-y-2">
                {analysis.topRecommendations.map((rec, i) => (
                  <li key={i} className="border border-[#e5e7eb] rounded-[8px] p-3">
                    <p className="text-xs text-[#48484b]" style={{ fontFamily: FONT }}>{rec}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Security Alerts */}
          {analysis.securityAlerts.length > 0 && !analysis.securityAlerts.includes('None') && (
            <div className="border border-red-200 bg-red-50 rounded-[12px] p-4">
              <h4 className="text-[11px] font-semibold text-red-800 mb-2 flex items-center gap-2" style={{ fontFamily: FONT }}>
                <AlertTriangle size={14} />
                Security Alerts
              </h4>
              <ul className="space-y-1">
                {analysis.securityAlerts.map((alert, i) => (
                  <li key={i} className="text-xs text-red-700 flex items-start gap-2" style={{ fontFamily: FONT }}>
                    <span className="mt-0.5 text-red-400">-</span>
                    <span>{alert}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Re-analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full py-2.5 border border-[#e5e7eb] rounded-[8px] text-[11px] font-medium text-[#6b7280] hover:bg-[#fafafa] hover:text-[#1a1a1a] transition-colors"
            style={{ fontFamily: FONT }}
          >
            Re-analyze
          </button>
        </div>
      )}
    </div>
  );
}
