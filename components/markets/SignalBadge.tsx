'use client';

import { TrendingUp, TrendingDown, AlertTriangle, Zap } from 'lucide-react';

interface SignalBadgeProps {
  sentiment?: string | null;
  confidence?: number | null;
  favouriteOutcome?: string | null;
  compact?: boolean;
}

/**
 * Small badge displayed on MarketCard showing AI signal.
 * Examples: [AI Pick: Yes] or [AI Pick: India]
 */
export function SignalBadge({ sentiment, confidence, favouriteOutcome, compact = false }: SignalBadgeProps) {
  if (!sentiment && !favouriteOutcome) return null;

  const isBullish = sentiment === 'bullish';
  const isBearish = sentiment === 'bearish';

  const Icon = isBullish ? TrendingUp : isBearish ? TrendingDown : Zap;
  const color = isBullish
    ? 'text-green-700 border-green-300 bg-green-50'
    : isBearish
    ? 'text-red-700 border-red-300 bg-red-50'
    : 'text-[#9ca3af] border-[#e5e7eb] bg-[#f8fafc]';

  const label = favouriteOutcome ? `AI Pick: ${favouriteOutcome}` : sentiment?.toUpperCase() || '';

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-[7px] font-bold px-1 py-0.5 border rounded ${color}`}>
        <Icon size={8} />
        {favouriteOutcome || sentiment?.toUpperCase().slice(0, 4)}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 border rounded ${color}`}>
      <Icon size={9} />
      {label}
    </span>
  );
}

interface RiskBadgeProps {
  warning: string;
}

/**
 * Badge showing risk warning.
 */
export function RiskBadge({ warning }: RiskBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 border rounded text-amber-700 border-amber-300 bg-amber-50">
      <AlertTriangle size={9} />
      RISK
    </span>
  );
}
