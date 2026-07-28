import { PolymarketPosition } from '@/lib/hooks/dashboard/usePolymarketPositions';
import { ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';

interface PositionCardProps {
  position: PolymarketPosition;
  onSell: (position: PolymarketPosition) => void;
}

export function PositionCard({ position, onSell }: PositionCardProps) {
  const outcomeUpper = position.outcome?.toUpperCase();
  const isYes = outcomeUpper === 'YES';
  const isNo = outcomeUpper === 'NO';
  const isCustomOutcome = !isYes && !isNo;

  // Calculate current price in cents
  const avgPriceCents = Math.round(position.avgPrice * 100);
  const currentPriceCents = Math.round(position.curPrice * 100);

  // Format P&L
  const isProfitable = position.cashPnl >= 0;

  return (
    <div className="border border-neutral-300 bg-white hover:shadow-md transition-all group">
      <div className="px-4 py-3 flex items-center gap-4">
        {/* Left: Market Question & Outcome */}
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {/* Outcome Badge */}
          <div className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md ${
            isYes ? 'bg-emerald-100 text-emerald-700'
              : isNo ? 'bg-rose-100 text-rose-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {isYes ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : isNo ? (
              <TrendingDown className="h-3.5 w-3.5" />
            ) : null}
            <span className="font-bold text-xs uppercase">{position.outcome}</span>
          </div>

          {/* Market Title */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate group-hover:text-violet-600 transition-colors">
              {position.title}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {position.size.toFixed(1)} shares
            </p>
          </div>
        </div>

        {/* Middle: Price Stats */}
        <div className="flex items-center gap-6 flex-shrink-0">
          {/* AVG */}
          <div className="text-center">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">AVG</div>
            <div className="font-bold text-sm">{avgPriceCents}¢</div>
          </div>

          {/* Arrow Separator */}
          <div className="text-neutral-300">→</div>

          {/* Current Price */}
          <div className="text-center">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Current</div>
            <div className={`font-bold text-sm ${
              currentPriceCents > avgPriceCents ? 'text-emerald-600' :
              currentPriceCents < avgPriceCents ? 'text-red-600' : ''
            }`}>
              {currentPriceCents}¢
            </div>
          </div>
        </div>

        {/* Right: Value & P&L */}
        <div className="flex items-center gap-6 flex-shrink-0">
          {/* Current Value */}
          <div className="text-center min-w-[80px]">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Value</div>
            <div className="font-bold text-sm">${position.currentValue.toFixed(2)}</div>
          </div>

          {/* P&L */}
          <div className={`text-center min-w-[100px] px-3 py-2 rounded ${
            isProfitable ? 'bg-emerald-50' : 'bg-rose-50'
          }`}>
            <div className="text-[10px] uppercase tracking-wider mb-0.5 ${
              isProfitable ? 'text-emerald-700' : 'text-red-700'
            }">P&L</div>
            <div className={`font-bold text-sm ${
              isProfitable ? 'text-emerald-600' : 'text-red-600'
            }`}>
              {isProfitable ? '+' : ''}${position.cashPnl.toFixed(2)}
            </div>
            <div className={`text-[10px] font-medium ${
              isProfitable ? 'text-emerald-600' : 'text-red-600'
            }`}>
              {isProfitable ? '+' : ''}{position.percentPnl.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Sell Button */}
          <button
            onClick={() => onSell(position)}
            className="px-5 py-2 bg-black text-white font-mono text-[10px] uppercase tracking-wider hover:bg-neutral-800 transition-colors border border-black"
          >
            SELL
          </button>

          {/* External Link */}
          <a
            href={`https://polymarket.com/event/${position.eventSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-9 w-9 rounded border border-neutral-300 hover:bg-neutral-100 hover:border-neutral-400 transition-colors"
            title="View on Polymarket"
          >
            <ExternalLink className="h-4 w-4 text-neutral-600" />
          </a>
        </div>
      </div>
    </div>
  );
}