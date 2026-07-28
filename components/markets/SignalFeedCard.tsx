'use client';

import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import type { EnrichedSignal } from '@/lib/hooks/use-signal-feed';
import type { MarketCatalogItem } from '@/lib/types/market';
import { WORKER_API } from '@/lib/config/worker';
import { getMarketAssetTag, ASSET_TAG_STYLES } from '@/lib/types/market';

interface SignalFeedCardProps {
  signal: EnrichedSignal;
  index?: number;
  onMarketClick?: (market: MarketCatalogItem) => void;
  layout?: 'dealt' | 'grid';
  totalCards?: number;
  livePrices?: { yes: number; no: number };
}

const TYPE_STYLES: Record<string, { pill: string; topBg: string; icon: string }> = {
  sentiment: {
    pill: 'bg-purple-100 text-purple-700 border-purple-200',
    topBg: 'from-purple-50/80 to-transparent',
    icon: '\u2663',
  },
  momentum: {
    pill: 'bg-amber-100 text-amber-700 border-amber-200',
    topBg: 'from-amber-50/80 to-transparent',
    icon: '\u2191',
  },
  spot_price: {
    pill: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    topBg: 'from-cyan-50/80 to-transparent',
    icon: '$',
  },
};

const SignalFeedCard = memo(function SignalFeedCard({ signal, index = 0, onMarketClick, layout = 'grid', livePrices }: SignalFeedCardProps) {
  const router = useRouter();
  const [loadingTrade, setLoadingTrade] = useState(false);
  const style = TYPE_STYLES[signal.signal_type] || TYPE_STYLES.sentiment;
  const sv = signal.signal_value || {};

  const handleTrade = async () => {
    if (onMarketClick) {
      setLoadingTrade(true);
      try {
        const res = await fetch(`${WORKER_API}/v1/markets?ids=${signal.condition_id}`);
        const data = await res.json();
        const market = data.markets?.[0];
        if (market) {
          onMarketClick(market);
        } else {
          router.push(`/markets?id=${signal.condition_id}`);
        }
      } catch {
        router.push(`/markets?id=${signal.condition_id}`);
      } finally {
        setLoadingTrade(false);
      }
    } else {
      router.push(`/markets?id=${signal.condition_id}`);
    }
  };

  const isBullish = sv.sentiment === 'bullish' || sv.direction === 'bullish';
  const confidencePercent = Math.min(Math.max(signal.confidence || 0, 0), 100);
  const dealt = layout === 'dealt';
  const livePriceValue = typeof livePrices?.yes === 'number' ? livePrices.yes : signal.livePrice;
  const livePrice = (livePriceValue * 100).toFixed(1);
  const favouriteOutcome = sv.favourite_outcome ? String(sv.favourite_outcome) : null;
  const assetTag = getMarketAssetTag(signal.question);

  return (
    <motion.div
      data-signal-feed-card
      initial={dealt ? { opacity: 0, y: -50, scale: 0.94 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      whileHover={{
        y: -3,
        transition: { type: 'spring', stiffness: 400, damping: 28 },
      }}
      transition={dealt ? {
        delay: index * 0.06,
        type: 'spring',
        stiffness: 200,
        damping: 24,
      } : {
        delay: index * 0.04,
        duration: 0.35,
        ease: [0.16, 1, 0.3, 1],
      }}
      onClick={handleTrade}
      className="group relative bg-white rounded-[16px] flex flex-col cursor-pointer overflow-hidden"
      style={{
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03), 0 0 0 1px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.25s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03), 0 0 0 1px rgba(0,0,0,0.06)';
      }}
    >
      {/* ── Top section: colored gradient header ── */}
      <div className={`relative px-4 pt-4 pb-2.5 bg-gradient-to-b ${style.topBg}`}>
        {/* Meta row */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-[3px] rounded-full border ${style.pill}`}>
            {style.icon} {signal.signal_type}
          </span>
          <span className="text-[11px] text-[#8b8f96] font-medium">
            {signal.category}
          </span>
          {assetTag && (
            <span className={`text-[9px] font-semibold px-2 py-[3px] rounded-full ${ASSET_TAG_STYLES[assetTag] || 'text-[#9ca3af] bg-[#f8fafc]'}`}>
              {assetTag}
            </span>
          )}
          <div className="flex-1" />
        </div>

        {/* Question — the hero */}
        <h3
          className="text-[14px] font-semibold leading-[1.35] text-[#111] line-clamp-2 tracking-[-0.01em]"
          style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
        >
          {signal.question}
        </h3>
      </div>

      {/* ── Middle section: signal data ── */}
      <div className="px-4 py-2.5 flex-1">
        {/* Price + Confidence row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[18px] font-semibold text-[#111] tabular-nums tracking-tight"
              style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
            >
              {livePrice}¢
            </span>
            <span className="text-[9px] font-medium text-[#b0b4ba] uppercase tracking-wide">live</span>
          </div>
          <ConfidenceBars percent={confidencePercent} index={index} dealt={dealt} />
        </div>

        {/* Signal-specific content */}
        {signal.signal_type === 'sentiment' && <SentimentContent sv={sv} />}
        {signal.signal_type === 'momentum' && <MomentumContent sv={sv} />}
        {signal.signal_type === 'spot_price' && <SpotPriceContent sv={sv} />}
      </div>

      {/* ── Bottom section: CTA ── */}
      <div className="px-4 pb-4 pt-1">
        <button
          onClick={(e) => { e.stopPropagation(); handleTrade(); }}
          disabled={loadingTrade}
          className={`w-full py-2.5 text-[12px] font-semibold rounded-[10px] transition-all duration-200 active:scale-[0.98] disabled:opacity-50 tracking-wide ${
            isBullish
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-rose-500 text-white hover:bg-rose-600'
          }`}
          style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
        >
          {loadingTrade
            ? 'Loading...'
            : favouriteOutcome
              ? `Buy ${favouriteOutcome.toUpperCase()}`
              : isBullish ? 'Buy YES' : 'Buy NO'}
        </button>
      </div>
    </motion.div>
  );
});

export default SignalFeedCard;

/* ── Confidence Bars (status-page style) ── */
function ConfidenceBars({ percent, index, dealt }: { percent: number; index: number; dealt: boolean }) {
  const totalBars = 20;
  const filledBars = Math.round((percent / 100) * totalBars);
  const barColor = percent >= 80 ? '#10b981' : percent >= 60 ? '#3b82f6' : percent >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-end gap-[2px]">
        {Array.from({ length: totalBars }).map((_, i) => (
          <motion.div
            key={i}
            className="w-[2.5px] rounded-[1px]"
            style={{
              height: 14,
              backgroundColor: i < filledBars ? barColor : '#e5e7eb',
            }}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{
              delay: (dealt ? index * 0.06 : index * 0.04) + 0.3 + i * 0.015,
              duration: 0.2,
              ease: [0.16, 1, 0.3, 1],
            }}
          />
        ))}
      </div>
      <span className="text-[12px] font-semibold tabular-nums" style={{ color: barColor }}>
        {percent.toFixed(0)}%
      </span>
      <span className="text-[9px] text-[#a1a1aa] font-medium uppercase tracking-wider">Confidence</span>
    </div>
  );
}

/* ── AI Avatar ── */
function AiAvatar({ mood }: { mood: 'happy' | 'warn' | 'neutral' }) {
  const face = mood === 'happy' ? '\u005E\u203F\u005E' : mood === 'warn' ? '\u00B7_\u00B7' : '\u2022\u203F\u2022';
  const bgColor = mood === 'happy' ? 'bg-emerald-100' : mood === 'warn' ? 'bg-rose-100' : 'bg-purple-100';
  const textColor = mood === 'happy' ? 'text-emerald-700' : mood === 'warn' ? 'text-rose-600' : 'text-purple-700';
  return (
    <div className={`flex-shrink-0 w-8 h-8 rounded-full ${bgColor} flex items-center justify-center`}>
      <span className={`text-[10px] font-bold ${textColor} leading-none`}>{face}</span>
    </div>
  );
}

/* ── Speech Bubble wrapper ── */
function AiInsight({ mood, badge, text }: { mood: 'happy' | 'warn' | 'neutral'; badge: React.ReactNode; text?: string | null }) {
  return (
    <div className="flex items-start gap-2.5">
      <AiAvatar mood={mood} />
      <div className="flex-1 min-w-0">
        {/* Speech bubble */}
        <div className="relative bg-[#f7f7f8] rounded-[12px] rounded-tl-[4px] px-3.5 py-2.5">
          {/* Bubble notch */}
          <div className="absolute -left-[6px] top-[10px] w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[6px] border-r-[#f7f7f8]" />
          <div className="mb-1.5">{badge}</div>
          {text && (
            <p className="text-[12px] leading-[1.55] text-[#666] line-clamp-2">
              {text}
            </p>
          )}
        </div>
        <span className="text-[9px] text-[#c0c0c0] mt-1 ml-1 block font-medium">AI Analysis</span>
      </div>
    </div>
  );
}

/* ── Sentiment ── */
function SentimentContent({ sv }: { sv: Record<string, unknown> }) {
  const sentiment = String(sv.sentiment || 'neutral');
  const isBullish = sentiment === 'bullish';
  const isBearish = sentiment === 'bearish';
  const favouriteOutcome = sv.favourite_outcome ? String(sv.favourite_outcome) : null;

  const mood = isBullish ? 'happy' : isBearish ? 'warn' : 'neutral' as const;

  const badge = favouriteOutcome ? (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${
      isBullish ? 'text-emerald-700' : isBearish ? 'text-rose-600' : 'text-[#666]'
    }`}>
      {isBullish ? '\u2191' : isBearish ? '\u2193' : '\u2022'} AI Pick: <span className="font-bold">{favouriteOutcome}</span>
    </span>
  ) : (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${
      isBullish ? 'text-emerald-700' : isBearish ? 'text-rose-600' : 'text-[#666]'
    }`}>
      {isBullish ? '\u2191' : isBearish ? '\u2193' : '\u2022'} {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
    </span>
  );

  return <AiInsight mood={mood} badge={badge} text={sv.reasoning ? String(sv.reasoning) : null} />;
}

/* ── Momentum ── */
function MomentumContent({ sv }: { sv: Record<string, unknown> }) {
  const direction = String(sv.direction || 'neutral');
  const priceChange = typeof sv.price_change_24h === 'number' ? sv.price_change_24h : 0;
  const volume24h = typeof sv.volume_24h === 'number' ? sv.volume_24h : 0;
  const aligns = sv.aligns_with_sentiment === true;
  const isBullish = direction === 'bullish';

  const mood = isBullish ? 'happy' : 'warn' as const;

  const badge = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${
        isBullish ? 'text-emerald-700' : 'text-rose-600'
      }`}>
        {isBullish ? '\u2191' : '\u2193'} {direction.charAt(0).toUpperCase() + direction.slice(1)}
      </span>
      <span className={`text-[13px] font-semibold tabular-nums ${
        priceChange >= 0 ? 'text-emerald-600' : 'text-rose-500'
      }`}>
        {priceChange >= 0 ? '+' : ''}{(priceChange * 100).toFixed(1)}%
        <span className="text-[10px] font-medium text-[#b0b4ba] ml-0.5">24h</span>
      </span>
    </div>
  );

  const details: string[] = [];
  if (volume24h > 0) {
    details.push(`Volume: $${volume24h >= 1000 ? `${(volume24h / 1000).toFixed(1)}K` : volume24h.toFixed(0)}`);
  }
  if (aligns) details.push('Sentiment aligned.');

  return <AiInsight mood={mood} badge={badge} text={details.length > 0 ? details.join(' \u2022 ') : null} />;
}

/* ── Spot Price ── */
function SpotPriceContent({ sv }: { sv: Record<string, unknown> }) {
  const price = sv.spot_price != null ? Number(sv.spot_price).toLocaleString(undefined, { maximumFractionDigits: 2 }) : null;
  const change = sv.change_24h_pct != null ? Number(sv.change_24h_pct) : null;
  const symbol = sv.symbol ? String(sv.symbol) : '';
  const threshold = sv.threshold != null ? Number(sv.threshold).toLocaleString(undefined, { maximumFractionDigits: 2 }) : null;
  const distancePct = sv.distance_pct != null ? Number(sv.distance_pct) : null;

  const badge = (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-cyan-700">
      $ {symbol} {price ? `$${price}` : ''}
    </span>
  );

  let text = '';
  if (change != null) text += `24h: ${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
  if (threshold && distancePct != null) {
    text += `${text ? ' · ' : ''}Threshold $${threshold} (${Math.abs(distancePct).toFixed(1)}% ${distancePct >= 0 ? 'above' : 'below'})`;
  }

  return <AiInsight mood={change != null && change >= 0 ? 'happy' : 'warn'} badge={badge} text={text || null} />;
}
