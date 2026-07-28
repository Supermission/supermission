import { MissionCard } from '@/lib/utils/dashboard/types';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

interface MissionCardProps {
  card: MissionCard;
  statusColor: 'yellow' | 'green';
}

function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Generate a unique hash for each card using multiple data points
function generateDisplayHash(id: string, title: string, timestamp: number): string {
  const chars = '0123456789abcdef';
  const seed = `${id}-${title}-${timestamp}`;
  let hash = '0x';

  // Simple hash function that produces varied results
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const combined = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');

  for (let i = 0; i < 10; i++) {
    hash += combined[i] || chars[i];
  }

  return hash;
}

const X402_TX_HASH = '0x6539595391b5f06986327b3d37c21bdcb3574014b5b5be9ace70b8216eee15bc';

export function MissionCardComponent({ card, statusColor }: MissionCardProps) {
  const isExecuting = statusColor === 'yellow';
  const isClickable = !card.isInlineDisplay;
  const [copied, setCopied] = useState(false);

  const typeLabel = {
    prediction_market: 'PRED',
    token_analysis: 'DD',
    image_generation: 'IMG',
    audit: 'AUDIT',
    defi_yield: 'DEFI',
    wallet_intelligence: 'WI',
    other: 'TASK',
  }[card.type];

  const displayHash = useMemo(
    () => generateDisplayHash(card.id, card.title, card.createdAt.getTime()),
    [card.id, card.title, card.createdAt]
  );

  const handleCopyTxHash = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(X402_TX_HASH);
      setCopied(true);
      toast.success('Transaction hash copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div
      onClick={isClickable ? card.onClick : undefined}
      className={`bg-white border border-black ${
        isClickable ? 'hover:bg-black/[0.02] cursor-pointer' : ''
      } transition-colors`}
    >
      <div className="p-3">
        {/* Header: Type + Status */}
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[9px] font-bold tracking-widest text-black/30 uppercase">
            {typeLabel}
          </span>
          <div className="flex items-center gap-1.5">
            {isExecuting && (
              <span className="w-1.5 h-1.5 bg-black rounded-full animate-pulse" />
            )}
            <span className={`font-mono text-[9px] font-bold tracking-widest uppercase ${
              isExecuting ? 'text-black' : 'text-black/30'
            }`}>
              {isExecuting ? 'LIVE' : 'DONE'}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="font-sans font-black text-sm leading-snug uppercase tracking-tight text-black line-clamp-2 mb-3">
          {card.title}
        </h3>

        {/* Info Rows */}
        <div className="space-y-1.5">
          {/* Amount + Spender */}
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="font-bold text-black">{card.amount}</span>
            {card.clientAddress && (
              <span className="text-black/40">{formatAddress(card.clientAddress)}</span>
            )}
          </div>

          {/* x402 Transaction */}
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-black/40 uppercase tracking-widest">x402</span>
            <button
              onClick={handleCopyTxHash}
              className="flex items-center gap-1 text-black/60 hover:text-black transition-colors group"
              title="Copy transaction hash"
            >
              <span>{displayHash}</span>
              {copied ? (
                <svg
                  className="w-3 h-3 text-emerald-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg
                  className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/5 font-mono text-[9px] tracking-widest text-black/25 uppercase">
          <span>
            {card.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {card.missionNumber && <span>#{card.missionNumber}</span>}
        </div>
      </div>
    </div>
  );
}