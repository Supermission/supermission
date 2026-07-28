'use client';

import { useState } from 'react';
import { TokenInfo } from '@/lib/hooks/dashboard/useTokenData';
import { SentimentAnalysis } from '@/lib/minimax/analyzers';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SentimentCardProps {
  tokenInfo: TokenInfo | null;
}

export function SentimentCard({ tokenInfo }: SentimentCardProps) {
  const [sentiment, setSentiment] = useState<SentimentAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!tokenInfo) {
    return null;
  }

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/dashboard/sentiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: tokenInfo.symbol,
          marketData: {
            priceUSD: tokenInfo.priceUSD,
            priceChange24h: tokenInfo.priceChange24h,
            marketCap: tokenInfo.marketCap,
            volume24h: tokenInfo.volume24h,
          }
        })
      });

      if (!response.ok) {
        throw new Error('Sentiment analysis failed');
      }

      const data = await response.json();
      setSentiment(data.data);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze sentiment');
    } finally {
      setLoading(false);
    }
  };

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'STRONG_BUY': return 'text-green-700 bg-green-100 border-green-700';
      case 'BUY': return 'text-green-600 bg-green-50 border-green-600';
      case 'NEUTRAL': return 'text-gray-600 bg-gray-50 border-gray-600';
      case 'SELL': return 'text-orange-600 bg-orange-50 border-orange-600';
      case 'STRONG_SELL': return 'text-red-700 bg-red-100 border-red-700';
      default: return 'text-gray-600 bg-gray-50 border-gray-600';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'rising': return <TrendingUp size={14} className="text-green-600" />;
      case 'falling': return <TrendingDown size={14} className="text-red-600" />;
      case 'stable': return <Minus size={14} className="text-gray-600" />;
      default: return null;
    }
  };

  const getSentimentBarColor = (score: number) => {
    if (score >= 70) return 'bg-green-600';
    if (score >= 50) return 'bg-blue-600';
    if (score >= 30) return 'bg-orange-600';
    return 'bg-red-600';
  };

  return (
    <div className="border border-[#e5e7eb] bg-white rounded-[16px] p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Sentiment Analysis
        </h3>
        {!sentiment && (
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
              'Analyze Sentiment'
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
      {!sentiment && !loading && !error && (
        <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Click "Analyze Sentiment" to get AI-powered market sentiment, trend analysis, and trading signals
        </p>
      )}

      {/* Sentiment Results */}
      {sentiment && (
        <div className="space-y-4">
          {/* Signal & Trend */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`border rounded-[12px] p-4 ${getSignalColor(sentiment.signal)}`}>
              <p className="text-xs uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Signal</p>
              <p className="font-mono text-xl font-bold">{sentiment.signal.replace('_', ' ')}</p>
              <p className="font-mono text-xs mt-1">Confidence: {sentiment.confidence}%</p>
            </div>
            <div className="border border-[#e5e7eb] rounded-[12px] p-4">
              <p className="text-xs uppercase mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Trend</p>
              <div className="flex items-center gap-2 mt-2">
                {getTrendIcon(sentiment.trend)}
                <p className="font-mono text-xl font-bold capitalize">{sentiment.trend}</p>
              </div>
              <p className="font-mono text-xs mt-1">Timeframe: {sentiment.timeframe}</p>
            </div>
          </div>

          {/* Overall Score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Overall Sentiment</p>
              <p className="font-mono text-xs font-bold">{sentiment.overallScore}/100</p>
            </div>
            <div className="w-full h-3 bg-gray-200 border border-[#e5e7eb] rounded-full relative overflow-hidden">
              <div
                className={`h-full ${getSentimentBarColor(sentiment.overallScore)} transition-all duration-500 rounded-full`}
                style={{ width: `${sentiment.overallScore}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="font-mono text-xs text-red-600">Bearish</span>
              <span className="font-mono text-xs text-green-600">Bullish</span>
            </div>
          </div>

          {/* Sentiment Factors */}
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-[#e5e7eb] rounded-[12px] p-3">
              <p className="text-xs uppercase mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Social</p>
              <p className="font-mono text-lg font-bold">{sentiment.factors.social}/100</p>
            </div>
            <div className="border border-[#e5e7eb] rounded-[12px] p-3">
              <p className="text-xs uppercase mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Market</p>
              <p className="font-mono text-lg font-bold">{sentiment.factors.market}/100</p>
            </div>
            <div className="border border-[#e5e7eb] rounded-[12px] p-3">
              <p className="text-xs uppercase mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Technical</p>
              <p className="font-mono text-lg font-bold">{sentiment.factors.technical}/100</p>
            </div>
          </div>

          {/* Reasoning */}
          <div className="border border-[#e5e7eb] bg-[#fafafa] rounded-[12px] p-4">
            <h4 className="text-xs font-bold uppercase mb-2 text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Analysis</h4>
            <p className="font-mono text-xs leading-relaxed">{sentiment.reasoning}</p>
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
