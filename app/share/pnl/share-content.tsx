'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { PnLPositionCard } from '@/components/share/pnl-position-card';

/** Mock cards for preview mode (no query params) */
const PREVIEWS = [
  { market: 'Will Trump win the 2026 midterm elections?', position: 'YES', entryPrice: 32, currentPrice: 78, pnlPercent: 143.75, pnlDollar: 1150, date: 'Mar 28, 2026', backgroundImage: '/pnl-backgrounds/mountain-valley.jpg' },
  { market: 'ETH above $5,000 by April 2026?', position: 'YES', entryPrice: 65, currentPrice: 22, pnlPercent: -66.15, pnlDollar: -430, date: 'Mar 15, 2026', backgroundImage: '/pnl-backgrounds/earth-glow.jpg' },
  { market: 'Will Bitcoin crash below $50K in Q2?', position: 'NO', entryPrice: 28, currentPrice: 72, pnlPercent: 157.14, pnlDollar: 785.7, date: 'Mar 30, 2026', backgroundImage: '/pnl-backgrounds/lake-cabin.jpg' },
  { market: 'IPL 2026: CSK vs MI — Chennai Super Kings to win?', position: 'CSK', entryPrice: 45, currentPrice: 88, pnlPercent: 95.56, pnlDollar: 286.67, date: 'Apr 1, 2026', backgroundImage: '/pnl-backgrounds/leaf-warrior.jpg' },
];

function ShareContentInner() {
  const searchParams = useSearchParams();
  const market = searchParams.get('market');

  if (market) {
    const position = searchParams.get('pos') || 'YES';
    const entryPrice = Number(searchParams.get('entry') || 50);
    const currentPrice = Number(searchParams.get('current') || 50);
    const pnlPercent = Number(searchParams.get('pnl') || 0);
    const date = searchParams.get('date') || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const bg = searchParams.get('bg') || undefined;

    return (
      <SingleCardView
        market={market}
        position={position}
        entryPrice={entryPrice}
        currentPrice={currentPrice}
        pnlPercent={pnlPercent}
        date={date}
        bg={bg}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', gap: 32, padding: '48px 20px' }}>
      {PREVIEWS.map((p, i) => (
        <PnLPositionCard key={i} {...p} invested={0} pnlDollar={p.pnlDollar} />
      ))}
    </div>
  );
}

function SingleCardView({ market, position, entryPrice, currentPrice, pnlPercent, date, bg }: {
  market: string; position: string; entryPrice: number; currentPrice: number; pnlPercent: number; date: string; bg?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'done'>('idle');
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyImage = useCallback(async () => {
    if (!cardRef.current || copyState === 'copying') return;
    setCopyState('copying');
    try {
      const blob = await toBlob(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#0C0C0E',
      });
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setCopyState('done');
        setTimeout(() => setCopyState('idle'), 2000);
      } else {
        setCopyState('idle');
      }
    } catch {
      setCopyState('idle');
    }
  }, [copyState]);

  const handleShareOnX = useCallback(() => {
    const isProfit = pnlPercent >= 0;
    const sign = isProfit ? '+' : '-';
    const pctStr = `${sign}${Math.abs(pnlPercent).toFixed(2)}%`;
    const text = `${pctStr} on "${market}"\n\nTrade prediction markets on @missiondotfun`;
    const params = new URLSearchParams({ text });
    window.open(`https://twitter.com/intent/tweet?${params.toString()}`, '_blank');
  }, [pnlPercent, market]);

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '10px 22px', background: 'rgba(255,255,255,0.12)', color: '#fff',
    fontSize: 13, fontWeight: 600, borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)',
    cursor: 'pointer', fontFamily: 'var(--font-bricolage), sans-serif',
    textDecoration: 'none', backdropFilter: 'blur(12px)',
    transition: 'all 0.15s ease',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '48px 20px' }}>
      <PnLPositionCard
        ref={cardRef}
        market={market}
        position={position}
        entryPrice={entryPrice}
        currentPrice={currentPrice}
        invested={0}
        pnlPercent={pnlPercent}
        pnlDollar={0}
        date={date}
        backgroundImage={bg}
      />

      {/* Share actions */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={handleShareOnX}
          style={{ ...btnStyle, background: '#fff', color: '#000', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          Share on X
        </button>
        <button
          onClick={handleCopyImage}
          disabled={copyState === 'copying'}
          style={{ ...btnStyle, opacity: copyState === 'copying' ? 0.5 : 1 }}
        >
          {copyState === 'done' ? 'Copied!' : copyState === 'copying' ? 'Copying...' : 'Copy image'}
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(window.location.href);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
          }}
          style={btnStyle}
        >
          {linkCopied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}

export default function ShareContent() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#000' }} />}>
      <ShareContentInner />
    </Suspense>
  );
}
