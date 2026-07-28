'use client';

import React, { useMemo, forwardRef } from 'react';

export interface PerpsCardProps {
  coin: string;         // e.g. "BTC"
  direction: 'LONG' | 'SHORT';
  leverage: string;     // e.g. "10x"
  entryPrice: string;   // formatted, e.g. "$84,231.50"
  markPrice: string;    // formatted
  pnlPercent: number;
  pnlDollar: number;
  date: string;
  backgroundImage?: string;
}

const BACKGROUNDS = [
  '/pnl-backgrounds/mountain-valley.jpg',
  '/pnl-backgrounds/lake-cabin.jpg',
  '/pnl-backgrounds/earth-glow.jpg',
  '/pnl-backgrounds/alpine-meadow.jpg',
  '/pnl-backgrounds/field-rest.jpg',
  '/pnl-backgrounds/leaf-warrior.jpg',
  '/pnl-backgrounds/mountain-ride.jpg',
];

const FONT_BRICOLAGE = 'var(--font-bricolage), sans-serif';
const FONT_MONO = 'var(--font-jetbrains-mono), monospace';
const FONT_MONTSERRAT = "var(--font-montserrat), 'Montserrat', sans-serif";

export const PerpsPositionCard = forwardRef<HTMLDivElement, PerpsCardProps>(function PerpsPositionCard(
  { coin, direction, leverage, entryPrice, markPrice, pnlPercent, pnlDollar, date, backgroundImage },
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

  const dirColor = direction === 'LONG'
    ? { background: '#166534', color: '#4ADE80', border: '1px solid #22c55e' }
    : { background: '#991b1b', color: '#FCA5A5', border: '1px solid #ef4444' };

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
      {/* Background image */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 280, zIndex: 0, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(12,12,14,0.2) 0%, rgba(12,12,14,0.08) 35%, rgba(12,12,14,0.35) 65%, rgba(12,12,14,1) 100%)',
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/new-white.png" alt="Supermission" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain' }} />
            <span style={{
              fontFamily: FONT_BRICOLAGE, fontWeight: 800, fontSize: 16, color: '#fff',
              letterSpacing: '-0.01em', textShadow: '0 1px 8px rgba(0,0,0,0.5)',
            }}>
              Supermission
            </span>
          </div>
        </div>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

        {/* Hero PnL */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 0 32px' }}>
          <div style={{
            fontFamily: FONT_MONTSERRAT, fontSize: 78, fontWeight: 900, lineHeight: 1,
            letterSpacing: '-0.02em', color: accent,
            textShadow: glow + ', 0 2px 4px rgba(0,0,0,0.4)',
          }}>
            {sign}{Math.abs(pnlPercent).toFixed(2)}%
          </div>
          {/* Dollar PnL */}
          <div style={{
            fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700, color: accent,
            marginTop: 6, opacity: 0.8,
          }}>
            {isProfit ? '+' : '-'}${Math.abs(pnlDollar).toFixed(2)}
          </div>
        </div>

        {/* Data */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

          {/* Coin + direction + leverage */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 14 }}>
            <span style={{
              flexShrink: 0, padding: '4px 10px', borderRadius: 6,
              fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              ...dirColor,
            }}>
              {direction}
            </span>
            <span style={{
              flexShrink: 0, padding: '4px 10px', borderRadius: 6,
              fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
            }}>
              {leverage}
            </span>
            <span style={{
              fontFamily: FONT_BRICOLAGE, fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)',
            }}>
              {coin}/USDC
            </span>
          </div>

          {/* Stats — Entry, Mark, Date */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
            <div>
              <div style={{
                fontFamily: FONT_BRICOLAGE, fontSize: 9, fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                color: 'rgba(255,255,255,0.2)', marginBottom: 3,
              }}>
                Entry
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
                {entryPrice}
              </div>
            </div>
            <div style={{ textAlign: 'center' as const }}>
              <div style={{
                fontFamily: FONT_BRICOLAGE, fontSize: 9, fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                color: 'rgba(255,255,255,0.2)', marginBottom: 3,
              }}>
                Mark
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
                {markPrice}
              </div>
            </div>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{
                fontFamily: FONT_BRICOLAGE, fontSize: 9, fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                color: 'rgba(255,255,255,0.2)', marginBottom: 3,
              }}>
                Date
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
                {date}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{
              fontFamily: FONT_BRICOLAGE, fontSize: 11, fontWeight: 600,
              color: 'rgba(255,255,255,0.25)', letterSpacing: '0.02em',
            }}>
              supermission.fun/perps
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
