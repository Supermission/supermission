'use client';

import { usePolymarketCash } from '@/lib/hooks/use-polymarket-cash';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

interface Props {
  /** Optional className for layout */
  className?: string;
  /** Optional shorter label, e.g. for tight inline placement */
  short?: boolean;
}

/**
 * Inline "Available: $X.XX" pill rendered next to Polymarket trade-amount
 * inputs. Reflects spendable Polygon USDC only — open positions (shares) are
 * not counted as cash.
 */
export function PolymarketAvailable({ className = '', short = false }: Props) {
  const { cash, isLoading } = usePolymarketCash();

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] ${className}`}
      style={{ fontFamily: FONT }}
      title="Polygon pUSD available to spend on Polymarket. Open positions are not counted as cash."
    >
      <span className="text-[#9ca3af]">{short ? 'Avail' : 'Available'}</span>
      <span className="font-semibold tabular-nums text-[#1a1a1a]">
        {isLoading ? '…' : `$${cash.toFixed(2)}`}
      </span>
    </span>
  );
}
