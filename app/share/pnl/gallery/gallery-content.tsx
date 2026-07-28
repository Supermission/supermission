'use client';

import { useCallback, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { PnLPositionCard, type PnLCardProps } from '@/components/share/pnl-position-card';

const FONT_BRICOLAGE = 'var(--font-bricolage), sans-serif';
const FONT_MONO = 'var(--font-jetbrains-mono), monospace';

const BACKGROUNDS = [
  { key: 'mountain-valley', path: '/pnl-backgrounds/mountain-valley.jpg' },
  { key: 'lake-cabin', path: '/pnl-backgrounds/lake-cabin.jpg' },
  { key: 'earth-glow', path: '/pnl-backgrounds/earth-glow.jpg' },
  { key: 'alpine-meadow', path: '/pnl-backgrounds/alpine-meadow.jpg' },
  { key: 'field-rest', path: '/pnl-backgrounds/field-rest.jpg' },
  { key: 'leaf-warrior', path: '/pnl-backgrounds/leaf-warrior.jpg' },
  { key: 'mountain-ride', path: '/pnl-backgrounds/mountain-ride.jpg' },
  { key: 'bridge-rain', path: '/pnl-backgrounds/bridge-rain.jpg' },
];

type Variant = {
  label: string;
  group: string;
  props: PnLCardProps;
};

const SAMPLE_DATE = 'Apr 12, 2026';

function makeVariants(): Variant[] {
  const variants: Variant[] = [];

  // Group 1: Every background × profit / loss baseline
  for (const bg of BACKGROUNDS) {
    variants.push({
      group: 'Backgrounds · profit',
      label: `${bg.key} · +87.5% profit`,
      props: {
        market: 'Will Bitcoin cross $100k by June 2026?',
        position: 'YES',
        entryPrice: 40,
        currentPrice: 75,
        invested: 100,
        pnlPercent: 87.5,
        pnlDollar: 87.5,
        date: SAMPLE_DATE,
        backgroundImage: bg.path,
      },
    });
    variants.push({
      group: 'Backgrounds · loss',
      label: `${bg.key} · -54.3% loss`,
      props: {
        market: 'ETH above $5,000 by April 2026?',
        position: 'NO',
        entryPrice: 65,
        currentPrice: 29.7,
        invested: 200,
        pnlPercent: -54.31,
        pnlDollar: -108.6,
        date: SAMPLE_DATE,
        backgroundImage: bg.path,
      },
    });
  }

  // Group 2: Magnitude edge cases
  variants.push({
    group: 'Magnitude edges',
    label: 'Tiny win · +1.8%',
    props: {
      market: 'Will the Fed cut rates in May?',
      position: 'YES',
      entryPrice: 48,
      currentPrice: 48.9,
      invested: 500,
      pnlPercent: 1.875,
      pnlDollar: 9.38,
      date: SAMPLE_DATE,
      backgroundImage: '/pnl-backgrounds/mountain-valley.jpg',
    },
  });
  variants.push({
    group: 'Magnitude edges',
    label: 'Tiny loss · -0.4%',
    props: {
      market: 'Polymarket volume > $500M this week?',
      position: 'NO',
      entryPrice: 52.2,
      currentPrice: 52,
      invested: 500,
      pnlPercent: -0.383,
      pnlDollar: -1.92,
      date: SAMPLE_DATE,
      backgroundImage: '/pnl-backgrounds/lake-cabin.jpg',
    },
  });
  variants.push({
    group: 'Magnitude edges',
    label: 'Huge win · +412%',
    props: {
      market: 'Trump win the 2026 midterms?',
      position: 'YES',
      entryPrice: 14,
      currentPrice: 72,
      invested: 250,
      pnlPercent: 414.28,
      pnlDollar: 1035.7,
      date: SAMPLE_DATE,
      backgroundImage: '/pnl-backgrounds/earth-glow.jpg',
    },
  });
  variants.push({
    group: 'Magnitude edges',
    label: 'Catastrophic loss · -92%',
    props: {
      market: 'Recession declared in Q2 2026?',
      position: 'YES',
      entryPrice: 88,
      currentPrice: 7,
      invested: 100,
      pnlPercent: -92.04,
      pnlDollar: -92.05,
      date: SAMPLE_DATE,
      backgroundImage: '/pnl-backgrounds/alpine-meadow.jpg',
    },
  });
  variants.push({
    group: 'Magnitude edges',
    label: 'Zero · break-even',
    props: {
      market: 'BTC dominance above 50% this week?',
      position: 'NO',
      entryPrice: 50,
      currentPrice: 50,
      invested: 100,
      pnlPercent: 0,
      pnlDollar: 0,
      date: SAMPLE_DATE,
      backgroundImage: '/pnl-backgrounds/field-rest.jpg',
    },
  });

  // Group 3: Non-YES/NO outcomes (sports, multi-outcome)
  variants.push({
    group: 'Custom outcomes',
    label: 'IPL · SRH win',
    props: {
      market: 'IPL 2026 · SRH vs RR — SRH to win',
      position: 'SRH',
      entryPrice: 38,
      currentPrice: 94,
      invested: 50,
      pnlPercent: 147.37,
      pnlDollar: 73.68,
      date: SAMPLE_DATE,
      backgroundImage: '/pnl-backgrounds/leaf-warrior.jpg',
    },
  });
  variants.push({
    group: 'Custom outcomes',
    label: 'IPL · CSK loss',
    props: {
      market: 'IPL 2026 · CSK vs MI — CSK to win',
      position: 'CSK',
      entryPrice: 62,
      currentPrice: 12,
      invested: 80,
      pnlPercent: -80.65,
      pnlDollar: -64.52,
      date: SAMPLE_DATE,
      backgroundImage: '/pnl-backgrounds/mountain-ride.jpg',
    },
  });
  variants.push({
    group: 'Custom outcomes',
    label: 'Long outcome name · abbreviated',
    props: {
      market: 'Oscars 2026 · Best Picture winner',
      position: 'A Complete Unknown',
      entryPrice: 18,
      currentPrice: 44,
      invested: 150,
      pnlPercent: 144.44,
      pnlDollar: 216.66,
      date: SAMPLE_DATE,
      backgroundImage: '/pnl-backgrounds/bridge-rain.jpg',
    },
  });

  // Group 4: Title length edges
  variants.push({
    group: 'Title length',
    label: 'Very long market title',
    props: {
      market:
        'Will the Federal Reserve cut interest rates by at least 50bps before the end of Q2 2026?',
      position: 'YES',
      entryPrice: 28,
      currentPrice: 61,
      invested: 300,
      pnlPercent: 117.86,
      pnlDollar: 353.57,
      date: SAMPLE_DATE,
      backgroundImage: '/pnl-backgrounds/earth-glow.jpg',
    },
  });
  variants.push({
    group: 'Title length',
    label: 'Short title',
    props: {
      market: 'Trump wins?',
      position: 'YES',
      entryPrice: 54,
      currentPrice: 73,
      invested: 100,
      pnlPercent: 35.19,
      pnlDollar: 35.19,
      date: SAMPLE_DATE,
      backgroundImage: '/pnl-backgrounds/mountain-valley.jpg',
    },
  });

  // Group 5: Price-as-dollars (> 100 cents)
  variants.push({
    group: 'Price in dollars',
    label: 'Entry > $1',
    props: {
      market: 'NIFTY 50 above 25,000 by Dec 2026?',
      position: 'YES',
      entryPrice: 135,
      currentPrice: 210,
      invested: 500,
      pnlPercent: 55.56,
      pnlDollar: 277.78,
      date: SAMPLE_DATE,
      backgroundImage: '/pnl-backgrounds/earth-glow.jpg',
    },
  });

  return variants;
}

const VARIANTS = makeVariants();

export default function GalleryContent() {
  const groups = Array.from(new Set(VARIANTS.map((v) => v.group)));

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#050505',
        color: '#fff',
        paddingBottom: 80,
        fontFamily: FONT_BRICOLAGE,
      }}
    >
      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'rgba(5,5,5,0.85)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '18px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>
            PnL Card Gallery
          </h1>
          <p
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              margin: '4px 0 0',
              fontFamily: FONT_MONO,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            internal · {VARIANTS.length} variants · noindex
          </p>
        </div>
        <span
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.4)',
            padding: '6px 10px',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            fontFamily: FONT_MONO,
          }}
        >
          /share/pnl/gallery
        </span>
      </header>

      {/* Sections */}
      {groups.map((group) => {
        const items = VARIANTS.filter((v) => v.group === group);
        return (
          <section key={group} style={{ padding: '32px 32px 8px' }}>
            <h2
              style={{
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'rgba(255,255,255,0.55)',
                margin: '0 0 20px',
                fontFamily: FONT_MONO,
              }}
            >
              {group} — {items.length}
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
                gap: 28,
                alignItems: 'start',
              }}
            >
              {items.map((v, i) => (
                <GalleryCell key={`${group}-${i}`} variant={v} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GalleryCell({ variant }: { variant: Variant }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'done' | 'fail'>('idle');

  const handleCopy = useCallback(async () => {
    if (!cardRef.current || copyState === 'copying') return;
    setCopyState('copying');
    try {
      const blob = await toBlob(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#0C0C0E',
      });
      if (!blob) throw new Error('no blob');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyState('done');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('fail');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }, [copyState]);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      const blob = await toBlob(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#0C0C0E',
      });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pnl-${variant.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    }
  }, [variant.label]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <PnLPositionCard ref={cardRef} {...variant.props} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <p
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: FONT_MONO,
            margin: 0,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={variant.label}
        >
          {variant.label}
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={handleCopy}
            disabled={copyState === 'copying'}
            style={{
              fontSize: 11,
              fontFamily: FONT_BRICOLAGE,
              fontWeight: 600,
              padding: '6px 10px',
              background:
                copyState === 'done'
                  ? 'rgba(74,222,128,0.15)'
                  : copyState === 'fail'
                    ? 'rgba(248,113,113,0.15)'
                    : 'rgba(255,255,255,0.08)',
              color:
                copyState === 'done'
                  ? '#4ADE80'
                  : copyState === 'fail'
                    ? '#F87171'
                    : 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              cursor: copyState === 'copying' ? 'wait' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {copyState === 'done'
              ? 'Copied'
              : copyState === 'fail'
                ? 'Failed'
                : copyState === 'copying'
                  ? 'Copying…'
                  : 'Copy image'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            style={{
              fontSize: 11,
              fontFamily: FONT_BRICOLAGE,
              fontWeight: 600,
              padding: '6px 10px',
              background: 'transparent',
              color: 'rgba(255,255,255,0.65)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
            title="Download as PNG"
          >
            ↓
          </button>
        </div>
      </div>
    </div>
  );
}
