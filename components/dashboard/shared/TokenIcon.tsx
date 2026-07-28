'use client';

import Image from 'next/image';
import { useState } from 'react';
import { stableIconEntries } from '@/lib/tokens/registry';

/**
 * Known token icons — static assets in /public/tokens/.
 * Key format: `{lowercase_symbol}:{chainId}`
 *
 * Stablecoin icons (USDC variants, USDC.e, pUSD, USDG) are sourced from the
 * token registry (lib/tokens/registry.ts) — the single source of truth. The
 * non-stable + virtual-chain (Hyperliquid id 0) entries below stay local.
 */
const KNOWN_ICONS: Record<string, string> = {
  ...stableIconEntries(),
  // USDC on Hyperliquid (virtual chain id 0)
  'usdc:0': '/tokens/usdc-base.png',
  // ETH everywhere
  'eth:8453': '/tokens/eth.png',
  'eth:1': '/tokens/eth.png',
  'eth:137': '/tokens/eth.png',
  'eth:4663': '/tokens/eth.png', // native ETH on Robinhood Chain
  'weth:8453': '/tokens/eth.png',
  'weth:1': '/tokens/eth.png',
  'weth:137': '/tokens/eth.png',
  // POL/MATIC/WMATIC — use chain icon as token icon
  'pol:137': '/tokens/chain-polygon.png',
  'matic:137': '/tokens/chain-polygon.png',
  'wmatic:137': '/tokens/chain-polygon.png',
  // LSTs — reuse ETH icon (they track ETH price)
  'cbeth:8453': '/tokens/eth.png',
  'cbeth:1': '/tokens/eth.png',
  'wsteth:8453': '/tokens/eth.png',
  'wsteth:1': '/tokens/eth.png',
  'reth:1': '/tokens/eth.png',
  // DAI, USDT, WBTC, LINK, AAVE, UNI, BRETT, AERO — fall through to Uniswap dynamic icons
};

/** Chain icon images */
const CHAIN_ICONS: Record<number, string> = {
  8453: '/tokens/chain-base.png',
  137: '/tokens/chain-polygon.png',
  1: '/tokens/chain-ethereum.png',
  42161: '/tokens/chain-arbitrum.png',
  0: '/tokens/chain-hyperliquid.png', // Hyperliquid
  4663: '/tokens/chain-robinhood.png', // Robinhood Chain
};

/**
 * Dynamic icon URL fallback — tries Uniswap GitHub assets.
 */
function getDynamicIconUrl(tokenAddress: string, chainId: number): string {
  // Skip Uniswap lookup for native assets (zero address) — they have no contract on Uniswap
  if (tokenAddress === '0x0000000000000000000000000000000000000000') return '';
  const chainMap: Record<number, string> = {
    1: 'ethereum',
    8453: 'base',
    137: 'polygon',
  };
  const chain = chainMap[chainId];
  if (chain) {
    return `https://raw.githubusercontent.com/Uniswap/assets/master/blockchains/${chain}/assets/${tokenAddress}/logo.png`;
  }
  return '';
}

interface TokenIconProps {
  symbol: string;
  chainId: number;
  address?: string;
  logoURI?: string;
  size?: number;
  className?: string;
}

export function TokenIcon({ symbol, chainId, address, logoURI, size = 24, className }: TokenIconProps) {
  const [imgError, setImgError] = useState(false);

  const key = `${symbol.toLowerCase()}:${chainId}`;
  const knownSrc = KNOWN_ICONS[key];

  if (knownSrc && !imgError) {
    return (
      <Image
        src={knownSrc}
        alt={symbol}
        width={size}
        height={size}
        className={`rounded-full ${className || ''}`}
        onError={() => setImgError(true)}
        unoptimized
      />
    );
  }

  // Use logoURI from token list data
  if (logoURI && !imgError) {
    return (
      <DynamicTokenImg
        src={logoURI}
        symbol={symbol}
        size={size}
        className={className}
      />
    );
  }

  if (address && !imgError) {
    const dynamicSrc = getDynamicIconUrl(address, chainId);
    if (dynamicSrc) {
      return (
        <DynamicTokenImg
          src={dynamicSrc}
          symbol={symbol}
          size={size}
          className={className}
        />
      );
    }
  }

  // Fallback: colored circle with letter
  const colors: Record<number, string> = {
    8453: '#0052FF',
    137: '#8247E5',
    1: '#627EEA',
    42161: '#28A0F0',
    0: '#2775CA', // Hyperliquid/USDC blue
  };
  const bg = colors[chainId] || '#6b7280';

  return (
    <div
      style={{ width: size, height: size, backgroundColor: bg }}
      className={`rounded-full flex items-center justify-center text-white flex-shrink-0 ${className || ''}`}
    >
      <span style={{ fontSize: size * 0.4, fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }} className="font-semibold">
        {symbol.slice(0, 1).toUpperCase()}
      </span>
    </div>
  );
}

/**
 * Token icon WITH chain badge overlay — use this in lists where
 * multiple chains are shown side by side.
 */
interface TokenIconWithChainProps extends TokenIconProps {
  /** Size of the chain badge (default: size * 0.45) */
  badgeSize?: number;
}

export function TokenIconWithChain({ symbol, chainId, address, logoURI, size = 32, className, badgeSize }: TokenIconWithChainProps) {
  const badge = badgeSize ?? Math.round(size * 0.45);
  const chainSrc = CHAIN_ICONS[chainId];

  return (
    <div className={`relative flex-shrink-0 ${className || ''}`} style={{ width: size, height: size }}>
      <TokenIcon symbol={symbol} chainId={chainId} address={address} logoURI={logoURI} size={size} />
      {chainSrc && (
        <Image
          src={chainSrc}
          alt=""
          width={badge}
          height={badge}
          className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white"
          unoptimized
        />
      )}
    </div>
  );
}

/** Internal: img with error fallback for dynamic URLs */
function DynamicTokenImg({
  src,
  symbol,
  size,
  className,
}: {
  src: string;
  symbol: string;
  size: number;
  className?: string;
}) {
  const [err, setErr] = useState(false);

  if (err) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-full bg-[#6b7280] flex items-center justify-center text-white flex-shrink-0 ${className || ''}`}
      >
        <span style={{ fontSize: size * 0.4 }} className="font-semibold">
          {symbol.slice(0, 1).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={symbol}
      width={size}
      height={size}
      className={`rounded-full ${className || ''}`}
      onError={() => setErr(true)}
      unoptimized
    />
  );
}
