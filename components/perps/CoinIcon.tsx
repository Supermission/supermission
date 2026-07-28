'use client';

import { useState, useEffect, memo } from 'react';

/**
 * Client-side coin icon — resolves icons automatically via CMC symbol map.
 * The full map is fetched once and cached in memory for the session.
 * Fallback chain: CMC CDN → CoinCap CDN → colored circle with initials.
 */

// ── Singleton: fetch the CMC map once for the entire app ─────────────────
let mapPromise: Promise<Record<string, string>> | null = null;
let mapCache: Record<string, string> | null = null;

function getCmcMap(): Promise<Record<string, string>> {
  if (mapCache) return Promise.resolve(mapCache);
  if (mapPromise) return mapPromise;
  mapPromise = fetch('/api/coin-icon')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((m: Record<string, string>) => {
      mapCache = m;
      return m;
    });
  return mapPromise;
}

/** Normalize Hyperliquid symbols: strip k-prefix, uppercase */
function normalize(s: string): string {
  return s.replace(/^k/, '').toUpperCase();
}

function coinColor(coin: string): string {
  let hash = 0;
  for (let i = 0; i < coin.length; i++) hash = coin.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 50%)`;
}

function coincapUrl(symbol: string): string {
  return `https://assets.coincap.io/assets/icons/${normalize(symbol).toLowerCase()}@2x.png`;
}

interface CoinIconProps {
  symbol: string;
  size?: number;
  className?: string;
}

export const CoinIcon = memo(function CoinIcon({ symbol, size = 32, className = '' }: CoinIconProps) {
  const [src, setSrc] = useState<string | null>(() => {
    // Sync init from cache if available
    if (mapCache) {
      return mapCache[normalize(symbol)] || null;
    }
    return null;
  });
  const [phase, setPhase] = useState<'loading' | 'cmc' | 'coincap' | 'fallback'>(() => {
    if (mapCache) {
      return mapCache[normalize(symbol)] ? 'cmc' : 'coincap';
    }
    return 'loading';
  });

  useEffect(() => {
    if (mapCache) {
      const url = mapCache[normalize(symbol)];
      if (url) {
        setSrc(url);
        setPhase('cmc');
      } else {
        setSrc(coincapUrl(symbol));
        setPhase('coincap');
      }
      return;
    }

    let cancelled = false;
    getCmcMap().then((map) => {
      if (cancelled) return;
      const url = map[normalize(symbol)];
      if (url) {
        setSrc(url);
        setPhase('cmc');
      } else {
        setSrc(coincapUrl(symbol));
        setPhase('coincap');
      }
    });
    return () => { cancelled = true; };
  }, [symbol]);

  if (phase === 'fallback' || (phase === 'loading' && !src)) {
    return (
      <div
        className={`rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-black text-white ${className}`}
        style={{ width: size, height: size, background: phase === 'loading' ? '#334155' : coinColor(symbol) }}
      >
        {phase === 'loading' ? '' : normalize(symbol).slice(0, 2)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src!}
      alt={symbol}
      width={size}
      height={size}
      className={`rounded-full object-cover flex-shrink-0 bg-[#f8fafc] ${className}`}
      referrerPolicy="no-referrer"
      onError={() => {
        if (phase === 'cmc') {
          setSrc(coincapUrl(symbol));
          setPhase('coincap');
        } else {
          setPhase('fallback');
        }
      }}
    />
  );
});
