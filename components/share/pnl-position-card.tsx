'use client';

import React, { useMemo, forwardRef } from 'react';

export interface PnLCardProps {
  market: string;
  position: string;   // outcome label — "YES", "NO", "SRH", "CSK", etc.
  entryPrice: number;
  currentPrice: number;
  invested: number;
  pnlPercent: number;
  pnlDollar: number;
  date: string;
  backgroundImage?: string;
}

/* Removed bridge-rain.jpg (person on bridge) */
const BACKGROUNDS = [
  '/pnl-backgrounds/mountain-valley.jpg',
  '/pnl-backgrounds/lake-cabin.jpg',
  '/pnl-backgrounds/earth-glow.jpg',
  '/pnl-backgrounds/alpine-meadow.jpg',
  '/pnl-backgrounds/field-rest.jpg',
  '/pnl-backgrounds/leaf-warrior.jpg',
  '/pnl-backgrounds/mountain-ride.jpg',
];

const formatPrice = (cents: number) =>
  cents >= 100 ? `$${(cents / 100).toFixed(2)}` : `${cents}¢`;

/** Abbreviate long outcome labels to initials (e.g. "Chennai Super Kings" → "CSK") */
const abbreviateOutcome = (label: string): string => {
  if (label.length <= 5) return label;
  const words = label.trim().split(/\s+/);
  if (words.length < 2) return label;
  return words.map(w => w[0]).join('').toUpperCase();
};

const FONT_BRICOLAGE = 'var(--font-bricolage), sans-serif';
const FONT_MONO = 'var(--font-jetbrains-mono), monospace';
const FONT_MONTSERRAT = "var(--font-montserrat), 'Montserrat', sans-serif";

export const PnLPositionCard = forwardRef<HTMLDivElement, PnLCardProps>(function PnLPositionCard(
  {
    market,
    position,
    entryPrice,
    currentPrice,
    pnlPercent,
    date,
    backgroundImage,
  },
  ref,
) {
  const isProfit = pnlPercent >= 0;
  const sign = isProfit ? '+' : '-';
  const accent = isProfit ? '#4ADE80' : '#F87171';
  const glow = isProfit
    ? '0 0 50px rgba(34,197,94,0.45), 0 0 100px rgba(34,197,94,0.15)'
    : '0 0 50px rgba(239,68,68,0.45), 0 0 100px rgba(239,68,68,0.15)';

  const bg = useMemo(
    () => backgroundImage || BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)],
    [backgroundImage],
  );

  return (
    <div
      ref={ref}
      style={{
        width: 400,
        position: 'relative',
        borderRadius: 14,
        overflow: 'hidden',
        background: '#0C0C0E',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Background image — top portion, fades to dark */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 280,
          zIndex: 0,
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bg}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(12,12,14,0.2) 0%, rgba(12,12,14,0.08) 35%, rgba(12,12,14,0.35) 65%, rgba(12,12,14,1) 100%)',
          }}
        />
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 24px 20px',
        }}
      >
        {/* Header — logo prominent */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/new-white.png"
              alt="Supermission"
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                objectFit: 'contain',
              }}
            />
            <span
              style={{
                fontFamily: FONT_BRICOLAGE,
                fontWeight: 800,
                fontSize: 16,
                color: '#fff',
                letterSpacing: '-0.01em',
                textShadow: '0 1px 8px rgba(0,0,0,0.5)',
              }}
            >
              Supermission
            </span>
          </div>
        </div>

        {/* Separator */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

        {/* Hero PnL */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '36px 0 32px',
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONTSERRAT,
              fontSize: 78,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: '-0.02em',
              color: accent,
              textShadow: glow + ', 0 2px 4px rgba(0,0,0,0.4)',
            }}
          >
            {sign}{Math.abs(pnlPercent).toFixed(2)}%
          </div>
        </div>

        {/* Data */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Separator */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

          {/* Market + badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingTop: 14,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                padding: '4px 10px',
                borderRadius: 6,
                fontFamily: FONT_MONO,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                ...(() => {
                  const upper = position.toUpperCase();
                  if (upper === 'YES') return { background: '#166534', color: '#4ADE80', border: '1px solid #22c55e' };
                  if (upper === 'NO') return { background: '#991b1b', color: '#FCA5A5', border: '1px solid #ef4444' };
                  return { background: '#1e3a5f', color: '#60A5FA', border: '1px solid #3b82f6' };
                })(),
              }}
            >
              {abbreviateOutcome(position)}
            </span>
            <span
              style={{
                fontFamily: FONT_BRICOLAGE,
                fontSize: 13,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.5)',
                lineHeight: 1.3,
              }}
            >
              {market}
            </span>
          </div>

          {/* Stats — Entry, Date, Current */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0 2px',
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: FONT_BRICOLAGE,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const,
                  color: 'rgba(255,255,255,0.2)',
                  marginBottom: 3,
                }}
              >
                Entry
              </div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                {formatPrice(entryPrice)}
              </div>
            </div>
            <div style={{ textAlign: 'center' as const }}>
              <div
                style={{
                  fontFamily: FONT_BRICOLAGE,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const,
                  color: 'rgba(255,255,255,0.2)',
                  marginBottom: 3,
                }}
              >
                Date
              </div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                {date}
              </div>
            </div>
            <div style={{ textAlign: 'right' as const }}>
              <div
                style={{
                  fontFamily: FONT_BRICOLAGE,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const,
                  color: 'rgba(255,255,255,0.2)',
                  marginBottom: 3,
                }}
              >
                Current
              </div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                {formatPrice(currentPrice)}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingTop: 14,
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span
              style={{
                fontFamily: FONT_BRICOLAGE,
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.25)',
                letterSpacing: '0.02em',
              }}
            >
              supermission.fun/markets
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
