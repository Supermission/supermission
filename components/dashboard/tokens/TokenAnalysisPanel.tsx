'use client';

import { useState } from 'react';
import { TokenInfo } from '@/lib/hooks/dashboard/useTokenData';
import { TokenAnalysis } from '@/lib/minimax/analyzers';
import { Loader2, AlertTriangle, ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react';

interface TokenAnalysisPanelProps {
  tokenInfo: TokenInfo | null;
}

export function TokenAnalysisPanel({ tokenInfo }: TokenAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<TokenAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!tokenInfo) {
    return null;
  }

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/dashboard/tokens/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenAddress: tokenInfo.address,
          chainId: tokenInfo.chainId || 8453,
          tokenData: {
            symbol: tokenInfo.symbol,
            name: tokenInfo.name,
            priceUSD: tokenInfo.priceUSD,
            marketCap: tokenInfo.marketCap,
            volume24h: tokenInfo.volume24h,
            priceChange24h: tokenInfo.priceChange24h,
          }
        })
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const data = await response.json();
      setAnalysis(data.data);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze token');
    } finally {
      setLoading(false);
    }
  };

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'BUY': return 'text-green-600 bg-green-50 border-green-600';
      case 'HOLD': return 'text-blue-600 bg-blue-50 border-blue-600';
      case 'SELL': return 'text-orange-600 bg-orange-50 border-orange-600';
      case 'AVOID': return 'text-red-600 bg-red-50 border-red-600';
      default: return 'text-gray-600 bg-gray-50 border-gray-600';
    }
  };

  const getRiskColor = (risk: number) => {
    if (risk < 30) return 'text-green-600';
    if (risk < 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="border border-[#e5e7eb] bg-white rounded-[16px] p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Token Due Diligence
        </h3>
        {!analysis && (
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] font-mono text-xs font-bold uppercase hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              'Run Analysis'
            )}
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="border border-red-300 bg-red-50 rounded-[12px] p-4 mb-4">
          <p className="font-mono text-xs text-red-900">{error}</p>
          <button
            onClick={handleAnalyze}
            className="mt-2 px-3 py-1 bg-red-600 text-white rounded-[6px] font-mono text-xs font-bold uppercase hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* No Analysis State */}
      {!analysis && !loading && !error && (
        <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Click "Run Analysis" to get AI-powered risk assessment, security analysis, and investment recommendations
        </p>
      )}

      {/* Analysis Results */}
      {analysis && (
        <div className="space-y-4">
          {/* Verdict & Risk Score */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`border rounded-[12px] p-4 ${getVerdictColor(analysis.verdict)}`}>
              <p className="text-xs uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Verdict</p>
              <p className="font-mono text-2xl font-bold">{analysis.verdict}</p>
              <p className="font-mono text-xs mt-1">Confidence: {analysis.confidence}%</p>
            </div>
            <div className={`border border-[#e5e7eb] rounded-[12px] p-4 ${getRiskColor(analysis.riskScore)}`}>
              <p className="text-xs uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Risk Score</p>
              <p className="font-mono text-2xl font-bold">{analysis.riskScore}/100</p>
              <p className="font-mono text-xs mt-1">
                {analysis.riskScore < 30 ? 'Low Risk' : analysis.riskScore < 60 ? 'Medium Risk' : 'High Risk'}
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="border border-[#e5e7eb] rounded-[12px] p-4">
            <p className="font-mono text-xs leading-relaxed">{analysis.summary}</p>
          </div>

          {/* Strengths */}
          {analysis.strengths.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase mb-2 flex items-center gap-2 text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                <ShieldCheck size={14} className="text-green-600" />
                Strengths
              </h4>
              <ul className="space-y-1">
                {analysis.strengths.map((strength, i) => (
                  <li key={i} className="font-mono text-xs text-green-700 flex items-start gap-2">
                    <span>•</span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risks */}
          {analysis.risks.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase mb-2 flex items-center gap-2 text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                <AlertTriangle size={14} className="text-orange-600" />
                Risks
              </h4>
              <ul className="space-y-1">
                {analysis.risks.map((risk, i) => (
                  <li key={i} className="font-mono text-xs text-orange-700 flex items-start gap-2">
                    <span>•</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Security Issues */}
          {analysis.securityIssues.length > 0 && !analysis.securityIssues.every(s => s.toLowerCase().startsWith('none')) && (
            <div className="border border-red-300 bg-red-50 rounded-[12px] p-4">
              <h4 className="text-xs font-bold uppercase mb-2 text-red-900 flex items-center gap-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                <AlertTriangle size={14} />
                Security Issues
              </h4>
              <ul className="space-y-1">
                {analysis.securityIssues.map((issue, i) => (
                  <li key={i} className="font-mono text-xs text-red-900 flex items-start gap-2">
                    <span>⚠</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendation */}
          <div className="border border-[#e5e7eb] bg-[#fafafa] rounded-[12px] p-4">
            <h4 className="text-xs font-bold uppercase mb-2 text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Recommendation</h4>
            <p className="font-mono text-xs">{analysis.recommendation}</p>
          </div>

          {/* Re-analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full py-2 border border-[#e5e7eb] rounded-[8px] font-mono text-xs font-bold uppercase hover:bg-[#f7f7f7] text-[#3a3a3a] transition-colors"
          >
            Re-analyze
          </button>
        </div>
      )}
    </div>
  );
}
