'use client';

/**
 * ChatSignalCards
 *
 * Given the full conversation messages, calls the AI chat-filter endpoint
 * to extract smart filters from the conversation context, then fetches
 * top 3 markets from market_catalog directly and renders them inline in the chat
 * using SignalFeedCard UI — with live, fresh prices that auto-refresh.
 */

import { useEffect, useMemo, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import type { EnrichedSignal } from '@/lib/hooks/use-signal-feed';
import type { MarketCatalogItem } from '@/lib/types/market';
import { useSSEPrices } from '@/lib/hooks/use-sse-prices';
import SignalFeedCard from './SignalFeedCard';

interface ChatMessage {
  role: string;
  content: string;
  metadata?: unknown;
}

interface ChatSignalCardsProps {
  /** All conversation messages — AI extracts filters from the full context */
  messages: ChatMessage[];
  onMarketClick?: (market: MarketCatalogItem) => void;
}

interface AiFilters {
  tags?: string[];
  minConfidence?: number;
  signalType?: string;
  search?: string;
  maxEndDate?: string;
  minVolume?: number;
  sentiment?: string;
  trending?: boolean;
  sortBy?: string;
}

function buildMarketUrl(filters: AiFilters, pageSize: number): string {
  const params = new URLSearchParams();
  // Use first tag as category (the API expects single category)
  if (filters.tags && filters.tags.length > 0) params.set('category', filters.tags[0]);
  if (filters.minConfidence) params.set('minConfidence', String(filters.minConfidence));
  if (filters.sentiment) params.set('sentiment', filters.sentiment);
  if (filters.trending) params.set('trending', 'true');
  if (filters.sortBy) params.set('sort', filters.sortBy);
  params.set('limit', String(pageSize));
  // Only return markets with AI signals
  params.set('withAiSignals', 'true');
  return `/api/markets?${params}`;
}

function parseMarkets(raw: any[]): EnrichedSignal[] {
  // Filter: only show markets that have AI signals (favourite_outcome OR ai_sentiment)
  // This matches what the Signals tab shows
  return raw
    .filter((m: any) => {
      const hasFavourite = m.favourite_outcome && m.favourite_outcome !== null;
      const hasSentiment = m.ai_sentiment && m.ai_sentiment !== null && m.ai_sentiment !== '';
      const hasConfidence = m.ai_confidence && Number(m.ai_confidence) > 0;

      // Must have at least one AI signal field
      return hasFavourite || hasSentiment || hasConfidence;
    })
    .map((m: any) => {
      const sentiment = (m.ai_sentiment || '').toLowerCase();
      const favourite = (m.favourite_outcome || '').toLowerCase();
      const confidence = Number(m.ai_confidence) || 50;

      // Determine sentiment from favourite_outcome or ai_sentiment
      let inferredSentiment = sentiment;
      if (!inferredSentiment && favourite === 'yes') inferredSentiment = 'bullish';
      if (!inferredSentiment && favourite === 'no') inferredSentiment = 'bearish';
      if (!inferredSentiment) inferredSentiment = 'neutral';

      return {
        id: `${m.condition_id}_sentiment_${Date.now()}`,
        condition_id: m.condition_id,
        signal_type: 'sentiment' as const,
        signal_value: { sentiment: inferredSentiment },
        confidence,
        source: 'market_catalog',
        expires_at: m.end_date,
        created_at: m.updated_at || new Date().toISOString(),
        question: m.question || 'Unknown Market',
        category: (m.categories && m.categories[0]) || 'Uncategorized',
        livePrice: (m.outcome_prices && m.outcome_prices[0]) ? Number(m.outcome_prices[0]) : 0.5,
      };
    });
}

export function ChatSignalCards({ messages, onMarketClick }: ChatSignalCardsProps) {
  const [signals, setSignals] = useState<EnrichedSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filtersRef = useRef<AiFilters>({});
  const abortRef = useRef<AbortController | null>(null);

  // Step 1: Call AI to extract filters from conversation, then fetch signals
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        // Use AI chat-filter to extract filters from conversation
        const filterRes = await fetch('/api/signals/chat-filter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messages
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        });

        if (!filterRes.ok) throw new Error('Filter extraction failed');
        const { filters } = await filterRes.json();
        filtersRef.current = filters || {};

        // Fetch markets with AI-extracted filters
        let marketUrl = buildMarketUrl(filtersRef.current, 15); // Fetch more to filter
        let marketRes = await fetch(marketUrl, { signal: controller.signal });
        if (!marketRes.ok) throw new Error('Failed to fetch markets');

        let data = await marketRes.json();
        if (controller.signal.aborted) return;

        // Parse and sort by confidence
        let parsed = parseMarkets(data?.markets || []);
        parsed.sort((a, b) => b.confidence - a.confidence);
        setSignals(parsed.slice(0, 3));
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setError(err.message || 'Failed to load signals');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Step 2: Auto-refresh prices every 60s (not every 15s) to reduce API calls
  useEffect(() => {
    if (signals.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const marketUrl = buildMarketUrl(filtersRef.current, 3);
        const res = await fetch(marketUrl);
        if (!res.ok) return;

        const data = await res.json();
        const parsed = parseMarkets(data?.markets || []);
        parsed.sort((a, b) => b.confidence - a.confidence);
        setSignals(parsed.slice(0, 3));
      } catch {
        // silent
      }
    }, 60_000); // 60 seconds instead of 15

    return () => clearInterval(interval);
  }, [signals.length]);

  if (loading) {
    return (
      <div className="space-y-2 my-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-white border border-[#e5e7eb] rounded-[8px] p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-3 w-12 bg-[#f8fafc]" />
              <div className="flex-1" />
              <div className="h-2.5 w-16 bg-[#f8fafc]" />
            </div>
            <div className="h-3.5 w-full bg-[#f8fafc] mb-1.5" />
            <div className="h-3.5 w-2/3 bg-[#f8fafc] mb-3" />
            <div className="h-7 w-20 bg-[#f8fafc] ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return null;
  }

  if (signals.length === 0) {
    return (
      <div className="my-2 bg-white border border-[#e5e7eb] rounded-[8px] p-4">
        <p className="text-[11px] text-[#9ca3af] text-center">
          No live signals found matching your request. Try a broader category like Crypto, Sports, or Politics.
        </p>
      </div>
    );
  }

  return <ChatSignalsList signals={signals} onMarketClick={onMarketClick} />;
}

function ChatSignalsList({
  signals,
  onMarketClick,
}: {
  signals: EnrichedSignal[];
  onMarketClick?: (market: MarketCatalogItem) => void;
}) {
  const conditionIds = useMemo(() => signals.map((s) => s.condition_id), [signals]);
  const { prices } = useSSEPrices(conditionIds);

  const liveSignals = useMemo(
    () =>
      signals.map((s) => {
        const p = prices[s.condition_id];
        return p ? { ...s, livePrice: p.yes } : s;
      }),
    [signals, prices],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-2 my-2"
    >
      {liveSignals.map((signal, i) => (
        <SignalFeedCard
          key={`${signal.condition_id}-${signal.signal_type}`}
          signal={signal}
          index={i}
          onMarketClick={onMarketClick}
        />
      ))}
    </motion.div>
  );
}
