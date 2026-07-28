'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, BarChart3, DollarSign } from 'lucide-react';
import { WORKER_API } from '@/lib/config/worker';
import type { MarketSignal as Signal } from '@/lib/types/market';

interface SignalPanelProps {
  conditionId: string;
  sourceArticleUrls?: string[];
  /** Fallback AI data from market_catalog (always available, doesn't expire) */
  marketAI?: {
    ai_sentiment: string | null;
    ai_confidence: number | null;
    ai_summary: string | null;
    favourite_outcome: string | null;
  };
}

/**
 * Full analysis panel shown in MarketDetailPanel for AI signals.
 */
export function SignalPanel({ conditionId, sourceArticleUrls, marketAI }: SignalPanelProps) {
  const { data: liveSignals } = useQuery<Signal[]>({
    queryKey: ['signals', conditionId],
    queryFn: async () => {
      const res = await fetch(`${WORKER_API}/v1/markets/${conditionId}/signals`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.signals || [];
    },
    staleTime: 60_000,
  });

  // Build fallback from market_catalog AI data (available immediately, no fetch)
  const fallbackSignal = useMemo<Signal | null>(() => {
    if (!marketAI?.ai_sentiment || !marketAI?.favourite_outcome) return null;
    return {
      id: `${conditionId}_sentiment_fallback`,
      condition_id: conditionId,
      signal_type: 'sentiment',
      signal_value: {
        sentiment: marketAI.ai_sentiment,
        favourite_outcome: marketAI.favourite_outcome,
        reasoning: marketAI.ai_summary,
      },
      confidence: marketAI.ai_confidence ?? 0,
      source: 'news_match',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    };
  }, [conditionId, marketAI?.ai_sentiment, marketAI?.favourite_outcome, marketAI?.ai_summary, marketAI?.ai_confidence]);

  // Use live signals if available, otherwise fall back to market_catalog data
  const displaySignals = (liveSignals && liveSignals.length > 0) ? liveSignals : (fallbackSignal ? [fallbackSignal] : []);

  if (displaySignals.length === 0) return null;

  const urls = sourceArticleUrls?.filter(Boolean) ?? [];

  return (
    <div className="pb-5 border-b border-[#e5e7eb]" data-signal-panel>
      <span data-market-detail-section-label className="block text-[10px] font-bold text-[#9ca3af] mb-3 uppercase tracking-wider">Signals</span>
      <div className="border border-[#e5e7eb] rounded-[12px] overflow-hidden">
        <div className="divide-y divide-[#e5e7eb]">
          {displaySignals.map(signal => (
            <SignalRow key={signal.id} signal={signal} />
          ))}
          {urls.length > 0 && <SourceArticles urls={urls} />}
        </div>
      </div>
    </div>
  );
}


function SignalRow({ signal }: { signal: Signal }) {
  const { signal_type, signal_value } = signal;

  switch (signal_type) {
    case 'sentiment':
      return <SentimentSignal value={signal_value} />;
    case 'momentum':
      return <MomentumSignal value={signal_value} />;
    case 'spot_price':
      return <SpotPriceSignal value={signal_value} />;
    default:
      return null;
  }
}

type SignalValue = Record<string, unknown>;

function SentimentSignal({ value }: { value: SignalValue }) {
  const sentiment = typeof value.sentiment === 'string' ? value.sentiment : '';
  const favouriteOutcome = typeof value.favourite_outcome === 'string' ? value.favourite_outcome : '';
  const reasoning = typeof value.reasoning === 'string' ? value.reasoning : '';
  const isBullish = sentiment === 'bullish';

  return (
    <div className="p-3 space-y-2">
      {/* Hero: AI Pick */}
      {favouriteOutcome && (
        <div className="flex items-center gap-2">
          {isBullish ? (
            <TrendingUp size={14} className="text-green-700" />
          ) : (
            <TrendingDown size={14} className="text-red-700" />
          )}
          <span className={`text-[11px] font-mono font-bold ${
            isBullish ? 'text-green-700' : 'text-red-700'
          }`}>
            AI PICK: {favouriteOutcome}
          </span>
        </div>
      )}

      {/* Reasoning — bullet points */}
      {reasoning && (
        <ul className="space-y-1.5 pl-1">
          {reasoning
            .split(/(?<=[.!?])\s+/)
            .filter((s: string) => s.trim().length > 0)
            .slice(0, 6)
            .map((point: string, i: number) => (
              <li key={i} data-market-signal-subtext className="flex items-start gap-2 text-[11px] text-[#6b7280] leading-relaxed">
                <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-[#9ca3af] flex-shrink-0" />
                <span>{point.trim().replace(/\.$/, '')}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function MomentumSignal({ value }: { value: SignalValue }) {
  const direction = typeof value.direction === 'string' ? value.direction : '';
  const priceChange24h = Number(value.price_change_24h ?? 0);
  const alignsWithSentiment = Boolean(value.aligns_with_sentiment);
  const isBullish = direction === 'bullish';

  return (
    <div className="p-3 space-y-1">
      <div className="flex items-center gap-2">
        <BarChart3 size={14} className={isBullish ? 'text-green-700' : 'text-red-700'} />
        <span className="text-[10px] font-mono font-bold text-black">
          Momentum: {direction.toUpperCase()}
        </span>
      </div>

      <div data-market-signal-subtext className="flex items-center gap-3 text-[10px] font-mono text-[#6b7280]">
        <span>24H: {priceChange24h > 0 ? '+' : ''}{(priceChange24h * 100).toFixed(1)}%</span>
        {alignsWithSentiment && (
          <span className="text-green-700">ALIGNS WITH AI</span>
        )}
      </div>
    </div>
  );
}

function SpotPriceSignal({ value }: { value: SignalValue }) {
  const price = value.spot_price != null ? Number(value.spot_price).toLocaleString(undefined, { maximumFractionDigits: 2 }) : null;
  const change = value.change_24h_pct != null ? Number(value.change_24h_pct) : null;
  const symbol = typeof value.symbol === 'string' ? value.symbol : '';
  const threshold = value.threshold != null ? Number(value.threshold) : null;
  const distancePct = value.distance_pct != null ? Number(value.distance_pct) : null;

  return (
    <div className="p-3 space-y-1">
      <div className="flex items-center gap-2">
        <DollarSign size={14} className="text-cyan-600" />
        <span className="text-[10px] font-mono font-bold text-cyan-700">
          {symbol} {price ? `$${price}` : ''}
        </span>
      </div>

      {change != null && (
        <p className={`text-[10px] font-mono leading-tight ${change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          24h: {change >= 0 ? '+' : ''}{change.toFixed(1)}%
        </p>
      )}

      {threshold != null && distancePct != null && (
        <p data-market-signal-subtext className="text-[10px] text-zinc-500 leading-tight">
          Threshold ${threshold.toLocaleString()} ({Math.abs(distancePct).toFixed(1)}% {distancePct >= 0 ? 'above' : 'below'})
        </p>
      )}
    </div>
  );
}

/* ─── Collapsible source articles ─── */

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    // Shorten known domains
    if (hostname.includes('reddit.com')) return 'Reddit';
    if (hostname.includes('bbc.co.uk') || hostname.includes('bbc.com')) return 'BBC';
    if (hostname.includes('cnn.com')) return 'CNN';
    if (hostname.includes('nytimes.com')) return 'NYT';
    if (hostname.includes('theguardian.com')) return 'Guardian';
    if (hostname.includes('aljazeera.com')) return 'Al Jazeera';
    if (hostname.includes('reuters.com')) return 'Reuters';
    if (hostname.includes('bloomberg.com')) return 'Bloomberg';
    if (hostname.includes('espn.com')) return 'ESPN';
    if (hostname.includes('wired.com')) return 'Wired';
    if (hostname.includes('france24.com')) return 'France 24';
    // Fallback: capitalize first part
    const parts = hostname.split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  } catch {
    return 'Source';
  }
}

function SourceArticles({ urls }: { urls: string[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[#f7f7f7]"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          className={`text-black/30 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        >
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[10px] font-mono font-bold text-[#9ca3af]">
          Sources
        </span>
        <span className="text-[9px] font-mono font-bold text-black/20 tabular-nums">
          {urls.length}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          {urls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=16`}
                alt=""
                width={14}
                height={14}
                className="rounded-sm flex-shrink-0"
              />
              <span className="text-[10px] font-mono font-semibold text-black/50 group-hover:text-black transition-colors truncate">
                {extractDomain(url)}
              </span>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" className="text-black/15 group-hover:text-black/40 transition-colors flex-shrink-0">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
